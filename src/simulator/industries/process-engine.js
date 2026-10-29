import {
  safeData,
  numberIn,
  integerIn,
  validSettings,
} from "../state-validation.js";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function createProcessSimulation(definition, options = {}) {
  const maxQuantity = definition.maxQuantity ?? 30;
  let product =
    definition.products.find((p) => p.id === options.product) ??
    definition.products[0];
  let total = clamp(
      Math.floor(Number(options.quantity ?? definition.defaultQuantity) || 4),
      1,
      maxQuantity,
    ),
    mode = options.mode ?? "guided",
    speed = 1;
  let settings = Object.fromEntries(
    (definition.controls ?? []).map((c) => [c.id, c.value]),
  );
  let running = false,
    emergency = false,
    phase,
    stepIndex,
    progress,
    done,
    unit,
    x,
    fromX,
    toX,
    fault,
    history,
    completedSteps,
    completedUnits,
    elapsed;
  function nextUnit() {
    unit = {
      id: `LOT-${String(done + 1).padStart(3, "0")}`,
      product: product.id,
      ...(definition.initialize?.(product, settings, {
        id: `LOT-${String(done + 1).padStart(3, "0")}`,
      }) ?? {}),
    };
    stepIndex = 0;
    progress = 0;
    x = definition.entryX ?? -8;
    fromX = x;
    toX = x;
    phase = "ready";
    completedSteps = [];
  }
  function reset() {
    running = false;
    emergency = false;
    done = 0;
    fault = "";
    history = [];
    completedUnits = [];
    elapsed = 0;
    nextUnit();
  }
  const currentStep = () => definition.steps[stepIndex];
  function validate() {
    return definition.validate?.(currentStep()?.id, settings, unit) ?? null;
  }
  function authorize() {
    if (emergency || phase !== "ready") return false;
    while (
      definition.shouldRun?.(currentStep().id, unit, {
        done,
        total,
        completedUnits,
        settings,
      }) === false
    ) {
      completedSteps.push(currentStep().id);
      if (stepIndex === definition.steps.length - 1) {
        phase = "outgoing";
        fromX = x;
        toX = definition.exitX ?? 8;
        progress = 0;
        return true;
      }
      stepIndex++;
    }
    options.onAuthorize?.(currentStep().id,unit,{done,total});
    const error = validate();
    if (error) {
      fault = error;
      running = false;
      return false;
    }
    fault = "";
    running = true;
    fromX = x;
    toX = currentStep().x;
    progress = 0;
    phase = Math.abs(toX - fromX) < 0.0001 ? "operating" : "moving";
    return true;
  }
  function start() {
    if (emergency || phase === "complete") return;
    running = true;
    if (phase === "ready" && mode === "auto") authorize();
  }
  function tick(dt) {
    if (!running || emergency || phase === "complete") return;
    let remain = Math.max(0, Math.min(0.25, dt)) * speed;
    elapsed += remain;
    while (remain > 1e-9 && running) {
      if (phase === "ready") {
        if (mode === "auto") {
          if (!authorize()) break;
        } else {
          running = false;
          break;
        }
      }
      if (phase === "operating") {
        const error = validate();
        if (error) {
          fault = error;
          running = false;
          break;
        }
      }
      const distance =
        definition.movementDistance?.({
          phase,
          unit,
          done,
          total,
          fromX,
          toX,
          step: currentStep().id,
          benchStage: definition.benchStage,
        }) ?? Math.abs(toX - fromX);
      const duration =
        phase === "operating"
          ? (definition.operationDuration?.(currentStep().id, unit, {
              done,
              total,
              completedUnits,
              settings,
            }) ?? currentStep().duration)
          : phase === "outgoing" && Number.isFinite(definition.outgoingDuration)
            ? definition.outgoingDuration
            : definition.transportSpeed
              ? (definition.movementDistance
                  ? distance
                  : (definition.transportDistance ?? distance)) /
                definition.transportSpeed
              : Math.max(
                  0.65,
                  phase === "outgoing" ? (definition.transferDuration ?? 0) : 0,
                  distance / 2,
                );
      const portion = Math.min(remain, (1 - progress) * duration);
      progress = duration > 0 ? progress + portion / duration : 1;
      remain -= portion;
      if (phase !== "operating") {
        const t = definition.transportSpeed
          ? progress
          : progress * progress * (3 - 2 * progress);
        x = fromX + (toX - fromX) * t;
      }
      if (progress < 1 - 1e-8) break;
      progress = 0;
      if (phase === "moving") {
        x = toX;
        phase = "operating";
      } else if (phase === "outgoing") {
        x = toX;
        completedUnits.push(structuredClone(unit));
        done++;
        if (done === total) {
          phase = "complete";
          running = false;
        } else {
          nextUnit();
          if (mode !== "auto") running = false;
        }
      } else {
        const op = currentStep();
        definition.apply?.(op.id, unit, settings, {
          done,
          total,
          completedUnits,
          settings,
        });
        completedSteps.push(op.id);
        history.push({ unit: unit.id, step: op.id, time: elapsed });
        options.onStepComplete?.(op.id,unit,{done,total,completedUnits,history,elapsed});
        if (stepIndex === definition.steps.length - 1 || options.stopAfterStep===op.id) {
          phase = "outgoing";
          fromX = x;
          toX = definition.exitX ?? 8;
        } else {
          stepIndex++;
          phase = "ready";
          if (mode !== "auto") running = false;
        }
      }
    }
  }
  reset();
  function exportState() {
    return structuredClone({
      version: 1,
      environment: definition.id,
      ...(definition.layoutVersion?{layoutVersion:definition.layoutVersion}:{}),
      steps: definition.steps.map((s) => s.id),
      product: product.id,
      total,
      mode,
      speed,
      settings,
      running,
      emergency,
      phase,
      stepIndex,
      progress,
      done,
      unit,
      x,
      fromX,
      toX,
      fault,
      history,
      completedSteps,
      completedUnits,
      elapsed,
    });
  }
  function importState(value, { paused = true } = {}) {
    try {
      if (
        !safeData(value) ||
        value.version !== 1 ||
        value.environment !== definition.id
      )
        return false;
      const next = structuredClone(value),
        p = definition.products.find((p) => p.id === next.product);
      const beverageMigration = definition.id === "beverages" && definition.layoutVersion === 3 &&
        (next.layoutVersion === undefined || next.layoutVersion === 2);
      if (definition.layoutVersion && next.layoutVersion !== undefined &&
        next.layoutVersion !== definition.layoutVersion && !beverageMigration) return false;
      if (beverageMigration) {
        const old = { receive: -6, wash: -4, fill: -2, cap: 0, label: 2, pack: 4,
          seal: next.layoutVersion === 2 ? 15.2 : 6, ship: next.layoutVersion === 2 ? 17.2 : 8 };
        const oldExit = next.layoutVersion === 2 ? 20.2 : 11;
        if (definition.benchStage) {
          const delta = definition.steps[0].x - old[definition.benchStage];
          for (const key of ["x", "fromX", "toX"]) if (typeof next[key] === "number") next[key] += delta;
        } else {
          const anchors = [[-8, definition.entryX ?? -8],
            ...definition.steps.map(step => [old[step.id], step.x]),
            [oldExit, definition.exitX ?? oldExit]].sort((a,b) => a[0]-b[0]);
          const remap = x => {
            for (let i=1;i<anchors.length;i++) if (x<=anchors[i][0]) {
              const [from,to]=[anchors[i-1],anchors[i]];
              return from[1]+(to[1]-from[1])*(x-from[0])/(to[0]-from[0]);
            }
            return anchors.at(-1)[1];
          };
          for (const key of ["x", "fromX", "toX"]) if (typeof next[key] === "number") next[key] = remap(next[key]);
          // A transfer can cross several anchors; preserve its normalized progress
          // on the remapped segment rather than introducing a nonlinear position.
          if (["moving","outgoing"].includes(next.phase) && typeof next.progress === "number") {
            const t = definition.transportSpeed ? next.progress : next.progress*next.progress*(3-2*next.progress);
            next.x=next.fromX+(next.toX-next.fromX)*t;
          }
        }
      }
      if (
        !p ||
        JSON.stringify(next.steps) !==
          JSON.stringify(definition.steps.map((s) => s.id)) ||
        !integerIn(next.total, 1, maxQuantity) ||
        !integerIn(next.done, 0, next.total) ||
        !integerIn(next.stepIndex, 0, definition.steps.length - 1) ||
        !numberIn(next.progress, 0, 1) ||
        !numberIn(next.elapsed, 0, 1e8) ||
        !numberIn(next.speed, 0.5, 8) ||
        !["auto", "guided"].includes(next.mode) ||
        typeof next.emergency !== "boolean" ||
        typeof next.running !== "boolean" ||
        !validSettings(definition, next.settings)
      )
        return false;
      if (
        !["ready", "moving", "operating", "outgoing", "complete"].includes(
          next.phase,
        ) ||
        typeof next.fault !== "string" ||
        next.fault.length > 500 ||
        !Array.isArray(next.history) ||
        next.history.length > next.total * (definition.steps.length + 10) ||
        !Array.isArray(next.completedSteps)
      )
        return false;
      if ((next.phase === "complete") !== (next.done === next.total))
        return false;
      const count =
        next.phase === "outgoing" || next.phase === "complete"
          ? options.stopAfterStep ? definition.steps.findIndex(step=>step.id===options.stopAfterStep)+1 : definition.steps.length
          : next.stepIndex;
      if (
        JSON.stringify(next.completedSteps) !==
        JSON.stringify(definition.steps.slice(0, count).map((s) => s.id))
      )
        return false;
      const min = (definition.entryX ?? -8) - 0.001,
        max = (definition.exitX ?? 9) + 0.001;
      if (![next.x, next.fromX, next.toX].every((v) => numberIn(v, min, max)))
        return false;
      if (
        next.phase === "operating" &&
        Math.abs(next.x - definition.steps[next.stepIndex].x) > 0.001
      )
        return false;
      if (
        next.phase === "moving" &&
        Math.abs(next.toX - definition.steps[next.stepIndex].x) > 0.001
      )
        return false;
      if (
        next.phase === "outgoing" &&
        Math.abs(next.toX - (definition.exitX ?? 8)) > 0.001
      )
        return false;
      if (["moving", "outgoing"].includes(next.phase)) {
        const t = definition.transportSpeed
          ? next.progress
          : next.progress * next.progress * (3 - 2 * next.progress);
        if (
          Math.abs(next.x - (next.fromX + (next.toX - next.fromX) * t)) > 0.001
        )
          return false;
      }
      if (
        !next.unit ||
        next.unit.product !== p.id ||
        !/^LOT-\d{3}$/.test(next.unit.id) ||
        !next.history.every(
          (h) =>
            typeof h.unit === "string" &&
            definition.steps.some((s) => s.id === h.step) &&
            numberIn(h.time, 0, next.elapsed + 0.001),
        )
      )
        return false;
      for (const [key, value] of Object.entries(
        definition.initialize(p, next.settings),
      )) {
        if (typeof next.unit[key] !== typeof value) return false;
      }
      const archived =
        next.completedUnits ??
        Array.from({ length: next.done }, (_, i) => {
          const item = {
            id: `LOT-${String(i + 1).padStart(3, "0")}`,
            product: p.id,
            ...definition.initialize(p, next.settings, {
              id: `LOT-${String(i + 1).padStart(3, "0")}`,
            }),
          };
          for (const step of definition.steps)
            definition.apply?.(step.id, item, next.settings);
          return next.phase === "complete" && i === next.done - 1
            ? structuredClone(next.unit)
            : item;
        });
      if (
        !Array.isArray(archived) ||
        archived.length !== next.done ||
        !archived.every(
          (item, i) =>
            item.product === p.id &&
            item.id === `LOT-${String(i + 1).padStart(3, "0")}`,
        )
      )
        return false;
      completedUnits = archived;
      product = p;
      total = next.total;
      mode = next.mode;
      speed = next.speed;
      settings = next.settings;
      emergency = next.emergency;
      phase = next.phase;
      stepIndex = next.stepIndex;
      progress = next.progress;
      done = next.done;
      unit = next.unit;
      x = next.x;
      fromX = next.fromX;
      toX = next.toX;
      fault = next.fault;
      history = next.history;
      completedSteps = next.completedSteps;
      elapsed = next.elapsed;
      running = paused ? false : next.running;
      return true;
    } catch {
      return false;
    }
  }
  return {
    exportState,
    importState,
    tick,
    start,
    authorize,
    retryPrevious() {
      if (
        definition.id === "beverages" &&
        phase === "ready" &&
        currentStep().id === "label" &&
        !unit.capped
      ) {
        stepIndex--;
        progress = 0;
        completedSteps = completedSteps.filter((id) => id !== "cap");
        fault = "";
        running = false;
      }
    },
    pause() {
      running = false;
    },
    reset,
    setMode(value) {
      if (["guided", "auto"].includes(value)) mode = value;
    },
    setSpeed(value) {
      speed = clamp(Number(value) || 1, 0.5, 8);
    },
    setSetting(id, value) {
      if (!definition.controls?.some((c) => c.id === id)) return;
      settings[id] = value;
      fault = validate() ?? "";
    },
    emergencyStop() {
      emergency = true;
      running = false;
    },
    rearm() {
      emergency = false;
      fault = validate() ?? "";
    },
    setProduct(id) {
      product = definition.products.find((p) => p.id === id) ?? product;
      reset();
    },
    extendQuantity(value) {
      const next = Math.floor(Number(value));
      if (!Number.isFinite(next) || next <= total || next > maxQuantity)
        return false;
      total = next;
      if (phase === "complete") nextUnit();
      return true;
    },
    setQuantity(value) {
      total = clamp(Math.floor(Number(value) || 1), 1, maxQuantity);
      reset();
    },
    get status() {
      return { phase, running, emergency, step: currentStep() };
    },
    get snapshot() {
      return structuredClone({
        phase,
        stepIndex,
        step: {
          ...currentStep(),
          duration:
            definition.operationDuration?.(currentStep().id, unit, {
              done,
              total,
              completedUnits,
              settings,
            }) ?? currentStep().duration,
        },
        progress,
        running,
        mode,
        unit,
        done,
        total,
        settings,
        fault,
        emergency,
        product,
        completedSteps,
        completedUnits,
        elapsed,
        history,
        position: { x, fromX, toX },
      });
    },
  };
}
