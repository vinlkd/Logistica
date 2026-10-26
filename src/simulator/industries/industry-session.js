import {
  safeData,
  numberIn,
  integerIn,
  validSettings,
} from "../state-validation.js";
import { createProcessSimulation } from "./process-engine.js";

// The original laboratory has independent benches as well as an integrated line.
// Prepare each bench's incoming material in its expected state, without changing
// the operator's actual settings for the operation being practiced.
export function createIndustrySession(definition) {
  let selected = definition.steps[0].id,
    scope = "bench",
    mode = "auto";
  let product = definition.products[0],
    quantity = 12,
    speed = 1;
  let guard = true,
    obstruction = false,
    engine;
  const settings = Object.fromEntries(
    definition.controls.map((c) => [c.id, c.value]),
  );
  const commands = { motor: false, work: false, transfer: false };
  function rebuild() {
    let process = definition;
    if (scope === "bench") {
      const index = definition.steps.findIndex((s) => s.id === selected),
        step = definition.steps[index];

      process = {
        ...definition,
        steps: [step],
        entryX:
          definition.id === "parcels" && step.id === "store"
            ? 0.6
            : step.x - 4.2,
        exitX: step.x + 4.2,
        initialize(p, values, context) {
          const unit = {
            id: context?.id ?? "LOT-001",
            ...definition.initialize(p, values),
          };
          const nominal = {
            ...values,
            volume: p.volume ?? values.volume,
            missingCap: false,
            cutLength: p.length ?? values.cutLength,
            drillDepth: 12,
            weightOffset: 0,
            barcodeReadable: true,
            scaleCalibrated: true,
            destination: unit.destination,
            address: unit.expectedAddress,
            route: unit.destination,
            quantity: 1,
            aisleClear: true,
          };
          for (const previous of definition.steps.slice(0, index))
            definition.apply(previous.id, unit, nominal);
          return unit;
        },
      };
    }
    engine = createProcessSimulation(process, {
      product: product.id,
      quantity,
      mode: mode === "auto" ? "auto" : "guided",
    });
    for (const [key, value] of Object.entries(settings))
      engine.setSetting(key, value);
    engine.setSpeed(speed);
    Object.keys(commands).forEach((key) => (commands[key] = false));
  }
  const safe = () => guard && !obstruction && !engine.snapshot.emergency;
  function perform() {
    if (!safe()) return false;
    const s = engine.snapshot;
    if (
      scope === "line" &&
      definition.id === "beverages" &&
      s.step.id === "label" &&
      !s.unit.capped
    ) {
      engine.retryPrevious();
      selected = "cap";
    }
    return engine.authorize();
  }
  rebuild();
  function exportState() {
    return structuredClone({
      version: 1,
      environment: definition.id,
      selected,
      scope,
      mode,
      product: product.id,
      quantity,
      speed,
      guard,
      obstruction,
      settings,
      commands,
      engine: engine.exportState(),
    });
  }
  function importState(value) {
    try {
      if (
        !safeData(value) ||
        value.version !== 1 ||
        value.environment !== definition.id ||
        !definition.steps.some((s) => s.id === value.selected) ||
        !["bench", "line"].includes(value.scope) ||
        !["auto", "guided", "manual"].includes(value.mode) ||
        !definition.products.some((p) => p.id === value.product) ||
        !integerIn(value.quantity, 1, 30) ||
        !numberIn(value.speed, 0.5, 4) ||
        typeof value.guard !== "boolean" ||
        typeof value.obstruction !== "boolean" ||
        !validSettings(definition, value.settings) ||
        value.engine?.product !== value.product ||
        value.engine?.total !== value.quantity ||
        JSON.stringify(value.engine?.settings) !==
          JSON.stringify(value.settings)
      )
        return false;
      const previous = exportState();
      selected = value.selected;
      scope = value.scope;
      mode = value.mode;
      product = definition.products.find((p) => p.id === value.product);
      quantity = value.quantity;
      speed = value.speed;
      guard = value.guard;
      obstruction = value.obstruction;
      Object.assign(settings, structuredClone(value.settings));
      rebuild();
      if (!engine.importState(value.engine)) {
        selected = previous.selected;
        scope = previous.scope;
        mode = previous.mode;
        product = definition.products.find((p) => p.id === previous.product);
        quantity = previous.quantity;
        speed = previous.speed;
        guard = previous.guard;
        obstruction = previous.obstruction;
        Object.assign(settings, previous.settings);
        rebuild();
        engine.importState(previous.engine, { paused: false });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  return {
    exportState,
    importState,
    selectEnvironment(id) {
      if (!definition.steps.some((s) => s.id === id)) return;
      selected = id;
      if (scope === "bench") rebuild();
    },
    setScope(value) {
      if (!["bench", "line"].includes(value)) return;
      scope = value;
      rebuild();
    },
    setMode(value) {
      if (!["guided", "auto", "manual"].includes(value)) return;
      mode = value;
      engine.setMode(value === "auto" ? "auto" : "guided");
    },
    setProduct(id) {
      product = definition.products.find((p) => p.id === id) ?? product;
      rebuild();
    },
    setQuantity(value) {
      quantity = Math.max(1, Math.min(30, Math.floor(Number(value) || 1)));
      rebuild();
    },
    setSetting(id, value) {
      if (!(id in settings)) return;
      settings[id] = value;
      engine.setSetting(id, value);
    },
    setSpeed(value) {
      speed = Number(value) || 1;
      engine.setSpeed(speed);
    },
    setGuard(value) {
      guard = !!value;
      if (!guard) engine.pause();
    },
    setObstruction(value) {
      obstruction = !!value;
      if (obstruction) engine.pause();
    },
    toggleCommand(id) {
      if (id in commands && mode === "manual" && safe())
        commands[id] = !commands[id];
    },
    start() {
      if (!safe()) return;
      const s = engine.snapshot;
      if (
        mode === "guided" ||
        (scope === "line" &&
          definition.id === "beverages" &&
          s.step.id === "label" &&
          !s.unit.capped)
      )
        perform();
      else engine.start();
    },
    perform,
    pause() {
      engine.pause();
    },
    reset() {
      rebuild();
    },
    emergencyStop() {
      engine.emergencyStop();
    },
    rearm() {
      if (guard && !obstruction) engine.rearm();
    },
    tick(dt) {
      if (!safe()) return;
      let s = engine.snapshot;
      if (mode === "manual") {
        if (!s.running) return;
        if (s.phase === "ready") {
          if (!commands.motor || !perform()) return;
          s = engine.snapshot;
        }
        const key =
          s.phase === "moving"
            ? "motor"
            : s.phase === "operating"
              ? "work"
              : "transfer";
        if (!commands[key]) return;
      }
      engine.tick(dt);
    },
    advance(dt = 0.1) {
      if (!safe()) return;
      if (engine.snapshot.phase === "ready") perform();
      else engine.start();
      engine.tick(dt);
      engine.pause();
    },
    get snapshot() {
      const s = engine.snapshot,
        ready = safe();
      const outputs = {
        motor:
          ready &&
          s.running &&
          s.phase === "moving" &&
          (mode !== "manual" || commands.motor),
        work:
          ready &&
          s.running &&
          s.phase === "operating" &&
          (mode !== "manual" || commands.work),
        transfer:
          ready &&
          s.running &&
          s.phase === "outgoing" &&
          (mode !== "manual" || commands.transfer),
      };
      return {
        ...s,
        selected,
        scope,
        mode,
        guard,
        obstruction,
        ready,
        commands: { ...commands },
        outputs,
        inputs: {
          entry: s.phase === "ready" || s.phase === "moving",
          positioned: s.phase === "operating",
          exit: s.phase === "outgoing",
          guard,
          stroke: s.progress > 0.95,
        },
        fault: !guard
          ? "Feche a proteção para continuar."
          : obstruction
            ? "Libere a saída antes de continuar."
            : s.fault,
      };
    },
  };
}
