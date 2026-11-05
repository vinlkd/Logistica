import {
  safeData,
  integerIn,
  numberIn,
  validSettings,
} from "../state-validation.js";
const copy = (value) => structuredClone(value);
const ordinal = (unit) => Number(unit.id.slice(4)) - 1;
// Each operation owns one physical position. A transfer reserves the following
// position until the bottle reaches it; the upstream station cannot feed over it.
export function createBeverageLineSimulation(definition, options = {}) {
  const steps = definition.steps.filter((step) => step.id !== "ship");
  let product =
    definition.products.find((p) => p.id === options.product) ??
    definition.products[0];
  let total = options.quantity ?? definition.defaultQuantity,
    speed = 1,
    mode = options.mode ?? "auto";
  let settings = Object.fromEntries(
    definition.controls.map((c) => [c.id, c.value]),
  );
  let running = false,
    emergency = false,
    elapsed = 0,
    issued = 0,
    selected = steps[0].id;
  let workers,
    history,
    completedUnits,
    sealedCases,
    manualCommands = null,
    manualStage = null;
  const durations = new Map();
  const blank = (step) => ({
    id: step.id,
    phase: "ready",
    progress: 0,
    unit: null,
    outgoing: null,
    fault: "",
    authorized: false,
  });
  function reset() {
    workers = steps.map(blank);
    history = [];
    completedUnits = [];
    sealedCases = [];
    running = false;
    emergency = false;
    elapsed = 0;
    issued = 0;
    durations.clear();
  }
  reset();
  const unitIndex = (unit) => (unit ? ordinal(unit) : 0);
  const membersOf = (unit) =>
    completedUnits.filter((u) => Math.floor(ordinal(u) / 9) === unit.caseIndex);
  const context = (unit) => ({
    done: ordinal(unit),
    total,
    completedUnits: completedUnits.filter((u) => ordinal(u) < ordinal(unit)),
    history,
    elapsed,
    caseMembers: membersOf(unit),
  });
  const complete = () =>
    sealedCases.length === Math.ceil(total / 9) &&
    workers.every((w) => !w.unit && !w.outgoing);
  const blocked = (w) => w.phase === "blocked";
  function validate(w) {
    return w.unit ? (definition.validate?.(w.id, settings, w.unit) ?? "") : "";
  }
  function begin(w) {
    if (!w.unit || w.phase !== "ready" || emergency) return false;
    options.onAuthorize?.(w.id, w.unit, context(w.unit));
    w.fault = validate(w);
    if (w.fault) return false;
    w.phase = "moving";
    w.progress = 0;
    w.authorized = true;
    return true;
  }
  function createIncoming() {
    const w = workers[0];
    if (issued >= total || w.unit || w.outgoing) return;
    const index = issued++;
    w.unit = {
      id: `LOT-${String(index + 1).padStart(3, "0")}`,
      product: product.id,
      ...definition.initialize(product, settings),
      caseIndex: Math.floor(index / 9),
      caseQuantity: Math.min(9, total - Math.floor(index / 9) * 9),
    };
    w.phase = "ready";
    w.progress = 0;
  }
  function transfer(index) {
    const w = workers[index],
      next = workers[index + 1];
    if (!w.unit || w.phase !== "blocked" || !next || next.unit || next.outgoing)
      return false;
    // Packing gathers actual members of a case. Only its last bottle travels to
    // the sealer, carrying that case's identity and exact (possibly partial) count.
    if (w.id === "pack") {
      const last = ordinal(w.unit) % 9 === w.unit.caseQuantity - 1;
      if (!last) {
        w.unit = null;
        w.phase = "ready";
        w.progress = 0;
        return true;
      }
    }
    const unit = w.unit;
    next.unit = unit;
    next.phase = "ready";
    next.progress = 0;
    next.fault = "";
    w.outgoing = { unit: copy(unit), progress: 0, target: next.id };
    w.unit = null;
    w.phase = "ready";
    w.progress = 0;
    if (mode === "auto") begin(next);
    return true;
  }
  function finishOperation(w, index) {
    const unit = w.unit,
      ctx = context(unit);
    if (w.id === "seal") {
      const members = membersOf(unit);
      for (const item of members) {
        item.caseSealed = true;
        item.caseTaped = true;
        item.caseIdentified = true;
        item.warehouseAddress = unit.warehouseAddress;
      }
      unit.caseSealed = unit.caseTaped = unit.caseIdentified = true;
    } else definition.apply?.(w.id, unit, settings, ctx);
    history.push({ unit: unit.id, step: w.id, time: elapsed });
    if (w.id === "pack" && !completedUnits.some((item) => item.id === unit.id))
      completedUnits.push(copy(unit));
    options.onStepComplete?.(w.id, unit, {
      ...context(unit),
      caseMembers: membersOf(unit),
    });
    if (w.id === "seal") {
      sealedCases.push(unit.caseIndex);
      w.unit = null;
      w.phase = "ready";
      w.progress = 0;
    } else {
      w.phase = "blocked";
      w.progress = 1;
      if (!manualStage || manualCommands?.transfer) transfer(index);
    }
  }
  function quantum(dt) {
    elapsed += dt;
    // Reverse order prevents a just-freed station from processing the next
    // bottle twice in the same time slice.
    for (let index = workers.length - 1; index >= 0; index--) {
      const w = workers[index];
      if (!w.unit) continue;
      if (manualStage && w.id !== manualStage) continue;
      if (blocked(w)) {
        if (!manualCommands || manualCommands.transfer) transfer(index);
        continue;
      }
      if (w.phase === "ready") {
        if ((mode !== "auto" && !manualCommands?.motor) || !begin(w)) continue;
      }
      if (w.phase === "operating") {
        w.fault = validate(w);
        if (w.fault) continue;
      }
      const movement = w.phase === "moving";
      if (manualCommands && !manualCommands[movement ? "motor" : "work"])
        continue;
      const durationKey = `${w.id}:${w.unit.id}:${movement ? "moving" : "operating"}`;
      let duration = durations.get(durationKey);
      if (duration === undefined) {
        duration = movement
          ? (definition.movementDistance?.({
              phase: "moving",
              unit: w.unit,
              done: ordinal(w.unit),
              total,
              fromX: steps[index - 1]?.x ?? definition.entryX,
              toX: steps[index].x,
              step: w.id,
            }) ??
              definition.transportDistance ??
              4.35) / definition.transportSpeed
          : (definition.operationDuration?.(w.id, w.unit, context(w.unit)) ??
            steps[index].duration);
        durations.set(durationKey, duration);
      }
      w.progress = Math.min(1, w.progress + dt / Math.max(0.001, duration));
      if (movement) {
        const previous = workers[index - 1];
        if (previous?.outgoing?.unit.id === w.unit.id)
          previous.outgoing.progress = w.progress;
      }
      if (w.progress >= 1 - 1e-10) {
        if (movement) {
          const previous = workers[index - 1];
          if (previous?.outgoing?.unit.id === w.unit.id)
            previous.outgoing = null;
          w.phase = "operating";
          w.progress = 0;
        } else finishOperation(w, index);
      }
    }
    createIncoming();
    if (complete()) running = false;
  }
  function tick(dt) {
    if (!running || emergency || complete()) return;
    let remain = Math.max(0, Math.min(0.25, Number(dt) || 0)) * speed;
    // Small deterministic simulation slices keep spacing and throughput invariant
    // under 8x, a dropped browser frame, or single stepping.
    while (remain > 1e-9) {
      const slice = Math.min(0.025, remain);
      quantum(slice);
      remain -= slice;
    }
  }
  function stationState(index, shared) {
    const w = workers[index],
      step = steps[index],
      outgoing = !w.unit && w.outgoing;
    const unit = w.unit ??
      outgoing?.unit ??
      completedUnits.at(-1) ?? {
        id: "LOT-001",
        product: product.id,
        ...definition.initialize(product, settings),
        caseIndex: 0,
        caseQuantity: Math.min(9, total),
      };
    const progress = outgoing ? outgoing.progress : w.progress;
    const phase = outgoing ? "outgoing" : blocked(w) ? "operating" : w.phase;
    const fromX = steps[index - 1]?.x ?? definition.entryX;
    const toX = steps[index + 1]?.x ?? definition.exitX;
    const x =
      phase === "ready" && w.unit
        ? fromX
        : phase === "moving"
          ? fromX + (step.x - fromX) * progress
          : phase === "outgoing"
            ? step.x + (toX - step.x) * progress
            : step.x;
    return {
      phase: complete() ? "complete" : phase,
      stepIndex: index,
      step: {
        ...step,
        duration:
          durations.get(`${step.id}:${unit.id}:operating`) ?? step.duration,
      },
      progress,
      running,
      mode,
      unit: copy(unit),
      hasMaterial: !!(w.unit || outgoing),
      blocked: blocked(w),
      done:
        w.unit || outgoing
          ? ordinal(unit)
          : step.id === "receive"
            ? issued
            : completedUnits.length,
      total,
      settings: shared.settings,
      fault: w.fault,
      emergency,
      product: shared.product,
      completedSteps: steps
        .slice(0, index + (blocked(w) ? 1 : 0))
        .map((s) => s.id),
      completedUnits: shared.completedUnits,
      elapsed,
      history: shared.history,
      position: {
        x,
        fromX: phase === "outgoing" ? step.x : fromX,
        toX: phase === "outgoing" ? toX : step.x,
      },
      outputs: {
        motor: running && !!w.unit && w.phase === "moving",
        work: running && !!w.unit && w.phase === "operating" && !w.fault,
        transfer: running && !!outgoing,
      },
    };
  }
  function snapshot() {
    const shared = {
      settings: copy(settings),
      product: copy(product),
      completedUnits: copy(completedUnits),
      history: copy(history),
    };
    const stations = Object.fromEntries(
      steps.map((step, i) => [step.id, stationState(i, shared)]),
    );
    const shipping = definition.steps.find((step) => step.id === "ship");
    if (shipping)
      stations.ship = {
        ...stations.seal,
        step: { ...shipping },
        phase: complete() ? "complete" : "ready",
        progress: 0,
        hasMaterial: false,
        blocked: false,
        outputs: { motor: false, work: false, transfer: false },
        position: { x: shipping.x, fromX: shipping.x, toX: shipping.x },
      };
    const view = stations[selected] ?? stations.seal;
    return {
      ...view,
      pipeline: true,
      lineDone: sealedCases.reduce(
        (sum, index) => sum + Math.min(9, total - index * 9),
        0,
      ),
      phase: complete() ? "complete" : view.phase,
      done: complete() ? total : view.done,
      stations,
      inFlight: workers.filter((w) => w.unit).length,
      issued,
      fault: workers.find((w) => w.fault)?.fault ?? "",
    };
  }
  function exportState() {
    return copy({
      version: 2,
      kind: "beverage-line",
      environment: definition.id,
      steps: definition.steps.map((s) => s.id),
      product: product.id,
      total,
      mode,
      speed,
      settings,
      running,
      emergency,
      elapsed,
      issued,
      selected,
      workers,
      history,
      completedUnits,
      sealedCases,
    });
  }
  function importState(value, { paused = true } = {}) {
    try {
      if (
        !safeData(value) ||
        value.kind !== "beverage-line" ||
        value.version !== 2 ||
        value.environment !== definition.id ||
        !definition.products.some((p) => p.id === value.product) ||
        !integerIn(value.total, 1, definition.maxQuantity) ||
        !integerIn(value.issued, 0, value.total) ||
        !numberIn(value.elapsed, 0, 1e8) ||
        !numberIn(value.speed, 0.5, 8) ||
        !["auto", "guided"].includes(value.mode) ||
        typeof value.running !== "boolean" ||
        typeof value.emergency !== "boolean" ||
        !validSettings(definition, value.settings) ||
        !Array.isArray(value.workers) ||
        value.workers.length !== steps.length ||
        !definition.steps.some((s) => s.id === value.selected) ||
        !Array.isArray(value.history) ||
        !Array.isArray(value.completedUnits) ||
        !Array.isArray(value.sealedCases)
      )
        return false;
      const validUnit = (unit) =>
        unit &&
        unit.product === value.product &&
        /^LOT-\d{3}$/.test(unit.id) &&
        integerIn(ordinal(unit), 0, value.issued - 1) &&
        unit.caseIndex === Math.floor(ordinal(unit) / 9) &&
        unit.caseQuantity === Math.min(9, value.total - unit.caseIndex * 9);
      const baseline = definition.initialize(
        definition.products.find((p) => p.id === value.product),
        value.settings,
      );
      const typedUnit = (unit) =>
        validUnit(unit) &&
        Object.entries(baseline).every(
          ([key, v]) => typeof unit[key] === typeof v,
        ) &&
        numberIn(unit.volume, 0, 600) &&
        unit.target ===
          definition.products.find((p) => p.id === value.product).volume;
      const owners = [];
      for (const [i, w] of value.workers.entries()) {
        if (
          w.id !== steps[i].id ||
          !["ready", "moving", "operating", "blocked"].includes(w.phase) ||
          !numberIn(w.progress, 0, 1) ||
          typeof w.fault !== "string" ||
          typeof w.authorized !== "boolean" ||
          (w.unit !== null && !typedUnit(w.unit)) ||
          (w.outgoing !== null &&
            (!typedUnit(w.outgoing.unit) ||
              !numberIn(w.outgoing.progress, 0, 1) ||
              w.outgoing.target !== steps[i + 1]?.id))
        )
          return false;
        if (w.unit) owners.push(w.unit.id);
        if (w.outgoing) {
          const target = value.workers[i + 1];
          if (
            !target?.unit ||
            target.unit.id !== w.outgoing.unit.id ||
            (target.phase !== "moving" && target.phase !== "ready") ||
            target.progress !== w.outgoing.progress
          )
            return false;
        }
      }
      if (
        new Set(owners).size !== owners.length ||
        !value.completedUnits.every(
          (unit, index) =>
            typedUnit(unit) && unit.packed && ordinal(unit) === index,
        ) ||
        new Set(value.completedUnits.map((u) => u.id)).size !==
          value.completedUnits.length ||
        !value.history.every(
          (h) =>
            typeof h.unit === "string" &&
            steps.some((s) => s.id === h.step) &&
            numberIn(h.time, 0, value.elapsed + 0.001),
        ) ||
        !value.sealedCases.every((index) =>
          integerIn(index, 0, Math.ceil(value.total / 9) - 1),
        ) ||
        new Set(value.sealedCases).size !== value.sealedCases.length
      )
        return false;
      const conserved = new Set([
        ...owners,
        ...value.completedUnits.map((unit) => unit.id),
      ]);
      if (
        conserved.size !== value.issued ||
        Array.from(
          { length: value.issued },
          (_, index) => `LOT-${String(index + 1).padStart(3, "0")}`,
        ).some((id) => !conserved.has(id))
      )
        return false;
      for (const index of value.sealedCases)
        if (
          value.completedUnits.filter(
            (u) => u.caseIndex === index && u.caseSealed,
          ).length !== Math.min(9, value.total - index * 9)
        )
          return false;
      product = definition.products.find((p) => p.id === value.product);
      total = value.total;
      mode = value.mode;
      speed = value.speed;
      settings = copy(value.settings);
      emergency = value.emergency;
      running = paused ? false : value.running;
      elapsed = value.elapsed;
      issued = value.issued;
      selected = value.selected;
      durations.clear();
      workers = copy(value.workers);
      history = copy(value.history);
      completedUnits = copy(value.completedUnits);
      sealedCases = copy(value.sealedCases);
      return true;
    } catch {
      return false;
    }
  }
  return {
    tick,
    exportState,
    importState,
    reset,
    setManualCommands(value, stage = null) {
      manualCommands = value ? copy(value) : null;
      manualStage = value ? stage : null;
    },
    setViewStage(id) {
      if (definition.steps.some((s) => s.id === id)) selected = id;
    },
    start() {
      if (!emergency && !complete()) {
        running = true;
        createIncoming();
      }
    },
    pause() {
      running = false;
    },
    authorize() {
      if (emergency) return false;
      running = true;
      createIncoming();
      const w = workers.find((w) => w.id === selected) ?? workers[0];
      return begin(w);
    },
    retryPrevious() {
      const w = workers.find((w) => w.id === "label");
      if (!w.unit || w.unit.capped) return;
      const cap = workers.find((w) => w.id === "cap");
      if (cap.unit || cap.outgoing) return;
      cap.unit = w.unit;
      cap.phase = "ready";
      cap.progress = 0;
      w.unit = null;
      w.phase = "ready";
      w.progress = 0;
      w.fault = "";
      running = false;
    },
    setMode(value) {
      if (["auto", "guided"].includes(value)) mode = value;
    },
    setSpeed(value) {
      speed = Math.max(0.5, Math.min(8, Number(value) || 1));
    },
    setSetting(id, value) {
      if (definition.controls.some((c) => c.id === id)) {
        settings[id] = value;
        for (const w of workers) if (w.unit) w.fault = validate(w);
      }
    },
    emergencyStop() {
      emergency = true;
      running = false;
    },
    rearm() {
      emergency = false;
    },
    extendQuantity() {
      return false;
    },
    get status() {
      const w = workers.find((w) => w.id === selected) ?? workers.at(-1),
        seal = workers.at(-1);
      return {
        phase: complete()
          ? "complete"
          : w.outgoing && !w.unit
            ? "outgoing"
            : blocked(w)
              ? "operating"
              : w.phase,
        running,
        emergency,
        step: steps.find((s) => s.id === w.id),
        stations: { seal: { phase: seal.phase, hasMaterial: !!seal.unit } },
      };
    },
    get snapshot() {
      return snapshot();
    },
  };
}
