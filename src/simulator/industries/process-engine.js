import {
  safeData,
  numberIn,
  integerIn,
  validSettings,
} from "../state-validation.js";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function createProcessSimulation(definition, options = {}) {
  let product =
    definition.products.find((p) => p.id === options.product) ??
    definition.products[0];
  let total = clamp(Number(options.quantity) || 4, 1, 30),
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
    elapsed = 0;
    nextUnit();
  }
  const currentStep = () => definition.steps[stepIndex];
  function validate() {
    return definition.validate?.(currentStep()?.id, settings, unit) ?? null;
  }
  function authorize() {
    if (emergency || phase !== "ready") return false;
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
      const duration =
        phase === "operating"
          ? currentStep().duration
          : Math.max(0.65, Math.abs(toX - fromX) / 2);
      const portion = Math.min(remain, (1 - progress) * duration);
      progress += portion / duration;
      remain -= portion;
      if (phase !== "operating") {
        const t = progress * progress * (3 - 2 * progress);
        x = fromX + (toX - fromX) * t;
      }
      if (progress < 1 - 1e-8) break;
      progress = 0;
      if (phase === "moving") {
        x = toX;
        phase = "operating";
      } else if (phase === "outgoing") {
        x = toX;
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
        definition.apply?.(op.id, unit, settings);
        completedSteps.push(op.id);
        history.push({ unit: unit.id, step: op.id, time: elapsed });
        if (stepIndex === definition.steps.length - 1) {
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
      if (
        !p ||
        JSON.stringify(next.steps) !==
          JSON.stringify(definition.steps.map((s) => s.id)) ||
        !integerIn(next.total, 1, 30) ||
        !integerIn(next.done, 0, next.total) ||
        !integerIn(next.stepIndex, 0, definition.steps.length - 1) ||
        !numberIn(next.progress, 0, 1) ||
        !numberIn(next.elapsed, 0, 1e8) ||
        !numberIn(next.speed, 0.5, 4) ||
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
          ? definition.steps.length
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
        const t = next.progress * next.progress * (3 - 2 * next.progress);
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
      speed = clamp(Number(value) || 1, 0.5, 4);
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
    setQuantity(value) {
      total = clamp(Math.floor(Number(value) || 1), 1, 30);
      reset();
    },
    get snapshot() {
      return structuredClone({
        phase,
        stepIndex,
        step: currentStep(),
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
        elapsed,
        history,
        position: { x, fromX, toX },
      });
    },
  };
}
