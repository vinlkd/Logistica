import {
  safeData,
  numberIn,
  integerIn,
  validSettings,
} from "../state-validation.js";
import { createProcessSimulation } from "./process-engine.js";
import { createBeverageLineSimulation } from "./beverage-line-engine.js";
import { createWarehouseInventory } from "../inventory-orders.js";
import { beverageCircuitMovementDistance } from "./beverage-circuit-layout.js";

// The original laboratory has independent benches as well as an integrated line.
// Prepare each bench's incoming material in its expected state, without changing
// the operator's actual settings for the operation being practiced.
export function createIndustrySession(definition, options = {}) {
  const maxQuantity = definition.maxQuantity ?? 30;
  let onDemand = options.onDemand === true && definition.id === "beverages";
  const makeInventory = () =>
    createWarehouseInventory({
      environment: definition.id,
      accountKey: options.accountKey,
      capacity: options.capacity,
      products: definition.products.map((p) => p.id),
    });
  const inventory = makeInventory();
  let lotId = inventory.snapshot.lotId,
    fulfillment = null,
    fulfillmentRunning = false;
  let practice = false,
    lineCheckpoint = null,
    legacyLine = false;
  let selected = definition.steps[0].id,
    scope = onDemand ? "line" : "bench",
    mode = "auto";
  let product = definition.products[0],
    quantity = definition.defaultQuantity ?? 12,
    speed = 1;
  let guard = true,
    obstruction = false,
    engine;
  const settings = Object.fromEntries(
    definition.controls.map((c) => [c.id, c.value]),
  );
  const commands = { motor: false, work: false, transfer: false };
  const hasWorkInProgress = () => {
    if (!engine) return false;
    const s = engine.snapshot;
    return (
      s.phase !== "complete" &&
      ((s.pipeline && s.issued > 0) ||
        s.phase !== "ready" ||
        s.completedSteps.length > 0 ||
        s.completedUnits.some((unit) => unit.packed && !unit.caseSealed))
    );
  };
  function rebuild() {
    let process = definition;
    if (scope === "bench") {
      const index = definition.steps.findIndex((s) => s.id === selected),
        step = definition.steps[index];

      process = {
        ...definition,
        shouldRun: () => true,
        benchStage: selected,
        outgoingDuration:
          definition.id === "beverages" &&
          !["pack", "seal", "ship"].includes(selected)
            ? definition.transportDistance / definition.transportSpeed
            : definition.id === "beverages" && selected === "seal"
              ? undefined
              : definition.outgoingDuration,
        steps: [step],
        entryX:
          definition.id === "parcels" && step.id === "store"
            ? 0.6
            : step.x - (definition.transportDistance ?? 4.2),
        exitX: step.x + (definition.transportDistance ?? 4.2),
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
          if (
            definition.id === "beverages" &&
            ["seal", "ship"].includes(selected)
          ) {
            const caseIndex = Number(context?.id?.slice(4) ?? 1) - 1;
            unit.caseIndex = caseIndex;
            unit.caseQuantity = Math.min(9, quantity - caseIndex * 9);
          }
          return unit;
        },
      };
    }
    if (onDemand) {
      const previousValidate = process.validate;
      const previousDuration = process.operationDuration;
      const previousMovement = process.movementDistance;
      process = {
        ...process,
        operationDuration(id, unit, context) {
          return id === "seal"
            ? (options.storageDuration ?? 34.1)
            : previousDuration?.(id, unit, context);
        },
        movementDistance(context) {
          return options.movementDistance?.(context)
            ?? (options.circuit ? beverageCircuitMovementDistance(context) : undefined)
            ?? previousMovement?.(context);
        },
        validate(id, values, unit) {
          if (id === "ship")
            return "Gere, separe e confira um pedido para autorizar a expedição.";
          if (
            id === "seal" &&
            fulfillment &&
            (engine?.status.stations?.seal ?? engine?.status)?.phase === "ready"
          )
            return "O armazém está atendendo um pedido. Aguarde a conclusão do movimento.";
          if (!inventory.canReceiveBox())
            return "Armazém cheio. Atenda um pedido para liberar um endereço.";
          return previousValidate?.(id, values, unit) ?? null;
        },
      };
    }
    const createEngine =
      onDemand && scope === "line" && !legacyLine
        ? createBeverageLineSimulation
        : createProcessSimulation;
    engine = createEngine(process, {
      product: product.id,
      quantity:
        definition.id === "beverages" &&
        scope === "bench" &&
        ["seal", "ship"].includes(selected)
          ? Math.ceil(quantity / 9)
          : quantity,
      mode: mode === "auto" ? "auto" : "guided",
      stopAfterStep: onDemand && scope === "line" ? "seal" : undefined,
      onAuthorize(id, unit) {
        if (onDemand && id === "seal")
          unit.warehouseAddress = inventory.getFreeAddress();
      },
      onStepComplete(id, unit, context) {
        if (!onDemand || scope !== "line" || id !== "seal") return;
        const index = unit.caseIndex ?? Math.floor(context.done / 9),
          members =
            context.caseMembers ??
            (scope === "line"
              ? [...context.completedUnits.slice(index * 9), unit]
              : [unit]);
        const count = scope === "line" ? members.length : unit.caseQuantity;
        const boxUnit = {
          id: `CASE-${String(index + 1).padStart(2, "0")}`,
          product: unit.product,
          caseIndex: index,
          caseQuantity: count,
          caseSealed: true,
          caseTaped: true,
          caseIdentified: true,
          packed: true,
          warehouseAddress: unit.warehouseAddress,
          units: structuredClone(members),
          history: structuredClone(
            context.history.filter((h) => members.some((u) => u.id === h.unit)),
          ),
        };
        const received = inventory.receiveBox({
          id: boxUnit.id,
          product: unit.product,
          quantity: count,
          unit: boxUnit,
          address: unit.warehouseAddress,
          lotId,
        });
        if (!received.ok) throw new Error(received.message);
      },
    });
    for (const [key, value] of Object.entries(settings))
      engine.setSetting(key, value);
    engine.setSpeed(speed);
    engine.setViewStage?.(selected);
    Object.keys(commands).forEach((key) => (commands[key] = false));
  }
  const safe = () => guard && !obstruction && !engine.status.emergency;
  function perform() {
    if (!safe()) return false;
    if (onDemand && selected === "ship") return false;
    const s = engine.snapshot;
    if (
      scope === "line" &&
      definition.id === "beverages" &&
      s.step.id === "label" &&
      s.hasMaterial !== false &&
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
      ...(onDemand
        ? {
            onDemand: true,
            inventory: inventory.exportState(),
            lotId,
            fulfillment,
          }
        : {}),
      ...(practice ? { practice: true, lineCheckpoint } : {}),
    });
  }
  function importState(value) {
    try {
      if (value?.practice !== undefined && typeof value.practice !== "boolean")
        return false;
      if (value?.practice) {
        if (
          value.scope !== "bench" ||
          value.onDemand === true ||
          !value.lineCheckpoint ||
          value.lineCheckpoint.practice ||
          Object.hasOwn(value.lineCheckpoint, "lineCheckpoint")
        )
          return false;
        const pausedLine = createIndustrySession(definition, options);
        if (!pausedLine.importState(value.lineCheckpoint)) return false;
      }
      const candidateInventory = makeInventory();
      if (value?.onDemand === true) {
        if (
          !candidateInventory.importState(value.inventory) ||
          value.lotId !== candidateInventory.snapshot.lotId
        )
          return false;
        const task = value.fulfillment,
          active = candidateInventory.snapshot.boxes.filter((b) =>
            ["picking", "shipping"].includes(b.status),
          );
        if (task !== null) {
          const order = candidateInventory.snapshot.orders.find(
            (o) => o.id === task?.orderId,
          );
          if (
            !order ||
            !["pick", "ship"].includes(task.action) ||
            order.status !==
              (task.action === "pick" ? "picking" : "shipping") ||
            JSON.stringify(task.boxIds) !== JSON.stringify(order.boxIds) ||
            !integerIn(task.index, 0, task.boxIds.length - 1) ||
            !numberIn(task.progress, 0, 1)
          )
            return false;
          const pending = task.boxIds.slice(task.index);
          if (
            active.length !== pending.length ||
            !active.every(
              (b) => b.orderId === order.id && pending.includes(b.id),
            )
          )
            return false;
        } else if (active.length) return false;
      } else if (onDemand && !value.practice && inventory.snapshot.boxes.length)
        return false;
      if (
        !safeData(value) ||
        value.version !== 1 ||
        value.environment !== definition.id ||
        !definition.steps.some((s) => s.id === value.selected) ||
        !["bench", "line"].includes(value.scope) ||
        !["auto", "guided", "manual"].includes(value.mode) ||
        !definition.products.some((p) => p.id === value.product) ||
        !integerIn(value.quantity, 1, maxQuantity) ||
        !numberIn(value.speed, 0.5, 8) ||
        typeof value.guard !== "boolean" ||
        typeof value.obstruction !== "boolean" ||
        !validSettings(definition, value.settings) ||
        value.engine?.product !== value.product ||
        value.engine?.total !==
          (definition.id === "beverages" &&
          value.scope === "bench" &&
          ["seal", "ship"].includes(value.selected)
            ? Math.ceil(value.quantity / 9)
            : value.quantity) ||
        JSON.stringify(value.engine?.settings) !==
          JSON.stringify(value.settings)
      )
        return false;
      const previous = exportState();
      const previousLegacyLine = legacyLine;
      const previousOnDemand = onDemand;
      onDemand = value.practice
        ? false
        : value.onDemand === true ||
          (options.onDemand === true && definition.id === "beverages");
      legacyLine =
        value.scope === "line" && value.engine?.kind !== "beverage-line";
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
      const engineValue = structuredClone(value.engine);
      if (
        onDemand &&
        value.onDemand !== true &&
        scope === "line" &&
        (engineValue.phase === "complete" ||
          (engineValue.phase === "outgoing" && engineValue.unit?.shipped))
      ) {
        const end = definition.steps.findIndex((step) => step.id === "seal");
        engineValue.stepIndex = end;
        engineValue.completedSteps = engineValue.steps.slice(0, end + 1);
      }
      if (!engine.importState(engineValue)) {
        onDemand = previousOnDemand;
        legacyLine = previousLegacyLine;
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
      if (value.onDemand === true) {
        inventory.importState(value.inventory);
        lotId = value.lotId;
        fulfillment = structuredClone(value.fulfillment);
        fulfillmentRunning = false;
      }
      practice = value.practice === true;
      lineCheckpoint = practice ? structuredClone(value.lineCheckpoint) : null;
      if (practice) {
        fulfillment = null;
        fulfillmentRunning = false;
      }
      return true;
    } catch {
      return false;
    }
  }
  function enterBench(id, { quantity: benchQuantity = 1 } = {}) {
    if (
      !definition.steps.some((step) => step.id === id) ||
      !integerIn(benchQuantity, 1, maxQuantity)
    )
      return false;
    if (!practice) {
      engine.pause();
      fulfillmentRunning = false;
      lineCheckpoint = exportState();
    }
    practice = true;
    onDemand = false;
    fulfillment = null;
    fulfillmentRunning = false;
    selected = id;
    scope = "bench";
    quantity = benchQuantity;
    mode = "auto";
    guard = true;
    obstruction = false;
    for (const control of definition.controls)
      settings[control.id] = control.value;
    if (definition.id === "beverages") {
      settings.volume = product.volume;
      settings.missingCap = false;
    }
    rebuild();
    return true;
  }
  function returnLine() {
    if (!practice || !lineCheckpoint) return false;
    return importState(structuredClone(lineCheckpoint));
  }
  const practiceBlocked = () => ({
    ok: false,
    code: "PRACTICE_MODE",
    message:
      "O teste de bancada não altera o estoque real. Volte à linha para atender pedidos.",
  });
  return {
    enterBench,
    returnLine,
    resumeLine: returnLine,
    generateOrder: (args) =>
      practice
        ? practiceBlocked()
        : inventory.generateOrder({ ...args, maxBoxes: 3 }),
    reserveOrder: (id) =>
      practice ? practiceBlocked() : inventory.reserveOrder(id),
    pickOrder(id, ids) {
      if (!onDemand || !safe() || fulfillment)
        return {
          ok: false,
          code: "BUSY",
          message: "Conclua o movimento atual antes de separar outro pedido.",
        };
      if (
        inventory.snapshot.orders.some(
          (order) =>
            order.id !== id &&
            ["picking", "picked", "checked", "shipping"].includes(order.status),
        )
      )
        return {
          ok: false,
          code: "STAGING_FULL",
          message:
            "Expeda o pedido da área de separação antes de retirar outro.",
        };
      const result = inventory.pickOrder(id, ids);
      if (result.ok)
        fulfillment = {
          action: "pick",
          orderId: id,
          boxIds: result.order.boxIds,
          index: 0,
          progress: 0,
        };
      return result;
    },
    checkOrder: (id, values) =>
      practice ? practiceBlocked() : inventory.checkOrder(id, values),
    dispatchOrder(id) {
      if (!onDemand || !safe() || fulfillment)
        return {
          ok: false,
          code: "BUSY",
          message: "Conclua o movimento atual antes de expedir.",
        };
      const result = inventory.dispatchOrder(id);
      if (result.ok)
        fulfillment = {
          action: "ship",
          orderId: id,
          boxIds: result.order.boxIds,
          index: 0,
          progress: 0,
        };
      return result;
    },
    exportState,
    importState,
    selectEnvironment(id) {
      if (!definition.steps.some((s) => s.id === id)) return;
      if (options.circuit && mode === "manual" && selected !== id)
        for (const key of Object.keys(commands)) commands[key] = false;
      selected = id;
      engine.setViewStage?.(id);
      if (onDemand) return true;
      if (scope === "bench") rebuild();
    },
    setScope(value) {
      if (practice && value === "line") return returnLine();
      if (!["bench", "line"].includes(value)) return;
      if (onDemand && hasWorkInProgress()) return false;
      scope = value;
      legacyLine = false;
      if (onDemand) lotId = inventory.beginLot();
      rebuild();
      return true;
    },
    setMode(value) {
      if (!["guided", "auto", "manual"].includes(value)) return;
      mode = value;
      engine.setMode(value === "auto" ? "auto" : "guided");
    },
    setProduct(id) {
      if (onDemand && hasWorkInProgress()) return false;
      product = definition.products.find((p) => p.id === id) ?? product;
      if (onDemand) lotId = inventory.beginLot();
      rebuild();
      return true;
    },
    extendReceivingOrder(value = 108) {
      if (
        definition.id !== "beverages" ||
        scope !== "bench" ||
        selected !== "receive"
      )
        return false;
      if (!engine.extendQuantity(value)) return false;
      quantity = Math.floor(Number(value));
      return true;
    },
    setQuantity(value) {
      if (onDemand && hasWorkInProgress()) return false;
      legacyLine = false;
      quantity = Math.max(
        1,
        Math.min(maxQuantity, Math.floor(Number(value) || 1)),
      );
      rebuild();
      if (onDemand) lotId = inventory.beginLot();
      return true;
    },
    setSetting(id, value) {
      if (!(id in settings)) return;
      settings[id] = value;
      engine.setSetting(id, value);
    },
    setSpeed(value) {
      speed = Math.max(0.5, Math.min(8, Number(value) || 1));
      engine.setSpeed(speed);
    },
    setGuard(value) {
      guard = !!value;
      if (!guard) {
        engine.pause();
        fulfillmentRunning = false;
      }
    },
    setObstruction(value) {
      obstruction = !!value;
      if (obstruction) {
        engine.pause();
        fulfillmentRunning = false;
      }
    },
    toggleCommand(id) {
      if (id in commands && mode === "manual" && safe())
        commands[id] = !commands[id];
    },
    start() {
      if (!safe()) return;
      if (onDemand && fulfillment) {
        fulfillmentRunning = true;
        engine.start();
        return true;
      }
      if (onDemand && selected === "ship" && !engine.status.stations)
        return false;
      const s = engine.snapshot;
      if (
        mode === "guided" ||
        (scope === "line" &&
          definition.id === "beverages" &&
          s.step.id === "label" &&
          s.hasMaterial !== false &&
          !s.unit.capped)
      )
        perform();
      else engine.start();
    },
    perform,
    pause() {
      engine.pause();
      fulfillmentRunning = false;
    },
    reset() {
      if (onDemand && hasWorkInProgress()) return false;
      if (onDemand) lotId = inventory.beginLot();
      legacyLine = false;
      rebuild();
      return true;
    },
    emergencyStop() {
      engine.emergencyStop();
      fulfillmentRunning = false;
    },
    rearm() {
      if (guard && !obstruction) engine.rearm();
    },
    tick(dt) {
      if (!safe()) return;
      if (onDemand && fulfillment && fulfillmentRunning) {
        const current = engine.status,
          seal = current.stations?.seal;
        if (
          seal
            ? !seal.hasMaterial || ["ready", "complete"].includes(seal.phase)
            : current.step.id !== "seal" ||
              ["ready", "complete"].includes(current.phase)
        ) {
          const box = inventory.getBox(fulfillment.boxIds[fulfillment.index]),
            duration =
              options.fulfillmentDuration?.(
                fulfillment.action,
                box,
                fulfillment.index,
              ) ?? 8;
          if (!Number.isFinite(duration) || duration <= 0) {
            fulfillmentRunning = false;
            return;
          }
          fulfillment.progress = Math.min(
            1,
            fulfillment.progress +
              (Math.max(0, Math.min(0.25, Number(dt) || 0)) * speed) / duration,
          );
          if (fulfillment.progress >= 1 - 1e-9) {
            const result =
              fulfillment.action === "pick"
                ? inventory.completePickBox(fulfillment.orderId, box.id)
                : inventory.completeShipmentBox(fulfillment.orderId, box.id);
            if (!result.ok) {
              fulfillmentRunning = false;
              return;
            }
            fulfillment.index++;
            fulfillment.progress = 0;
            if (fulfillment.index === fulfillment.boxIds.length) {
              fulfillment = null;
              fulfillmentRunning = false;
            }
          }
        }
      }
      engine.setManualCommands?.(
        mode === "manual" ? commands : null,
        options.circuit ? selected : null,
      );
      let s = engine.status;
      if (mode === "manual" && !s.stations) {
        if (!s.running) return;
        if (s.phase === "ready") {
          if (!commands.motor || !perform()) return;
          s = engine.status;
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
      if (onDemand && fulfillment) {
        fulfillmentRunning = true;
        this.tick(dt);
        this.pause();
        return;
      }
      if (engine.status.stations) engine.start();
      else if (engine.snapshot.phase === "ready") perform();
      else engine.start();
      if (options.circuit && mode === "manual") {
        this.tick(dt);
        this.pause();
        return;
      }
      engine.setManualCommands?.(null);
      engine.tick(dt);
      engine.pause();
    },
    get snapshot() {
      const inventoryState = onDemand ? inventory.snapshot : null;
      const s = engine.snapshot,
        ready = safe();
      const outputs = {
        motor:
          ready &&
          s.running &&
          !s.fault &&
          s.hasMaterial !== false &&
          s.phase === "moving" &&
          (mode !== "manual" || commands.motor),
        work:
          ready &&
          s.running &&
          !s.fault &&
          !s.blocked &&
          s.hasMaterial !== false &&
          s.phase === "operating" &&
          (mode !== "manual" || commands.work),
        transfer:
          ready &&
          s.running &&
          !s.fault &&
          s.hasMaterial !== false &&
          s.phase === "outgoing" &&
          (mode !== "manual" || commands.transfer),
      };
      return {
        ...s,
        onDemand,
        practice,
        hasPausedLine: practice && !!lineCheckpoint,
        ...(onDemand
          ? {
              inventory: inventoryState,
              fulfillment: fulfillment
                ? {
                    ...structuredClone(fulfillment),
                    boxId: fulfillment.boxIds[fulfillment.index],
                    total: fulfillment.boxIds.length,
                    box: inventoryState.boxes.find(
                      (b) => b.id === fulfillment.boxIds[fulfillment.index],
                    ),
                    running: fulfillmentRunning,
                  }
                : null,
              running: s.running || fulfillmentRunning,
            }
          : {}),
        bottleTotal: quantity,
        activeCaseIndex:
          scope === "bench" && ["seal", "ship"].includes(selected)
            ? s.done
            : Math.floor(s.done / 9),
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
