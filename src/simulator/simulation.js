import { cookwareReceivingDuration } from "./cookware-receiving-flow.js";
import {
  cookwarePackingCartonDuration,
  cookwarePackingFeedDuration,
  cookwarePackingUnloadDuration,
} from "./cookware-packing.js";
import { safeData, numberIn, integerIn } from "./state-validation.js";
import { getProduct } from "./products.js";
import { createWarehouseInventory } from "./inventory-orders.js";
export const MATERIALS = {
  disc: "Disco de inox",
  "checked-disc": "Disco conferido",
  "sorted-disc": "Disco separado",
  "formed-pot": "Panela conformada",
  "polished-pot": "Panela polida",
  "approved-pot": "Panela aprovada",
  "boxed-pot": "Panela embalada",
  "picked-box": "Caixa separada",
  "shipped-box": "Volume expedido",
};
const step = (id, label, duration, explanation, material = null) => ({
  id,
  label,
  duration,
  explanation,
  material,
});
export const ENVIRONMENTS = [
  {
    id: "receiving",
    name: "Recebimento",
    short: "Recebimento",
    machine: "Doca de recebimento e conferência",
    input: "disc",
    output: "checked-disc",
    description:
      "O fornecedor entrega discos de inox. A conferência libera cada disco para o estoque.",
    exercise:
      "Acompanhe a identificação e a conferência antes da liberação do material.",
    recipe: [
      step(
        "identify",
        "Identificar",
        0.9,
        "O leitor registra a unidade que chegou do fornecedor.",
      ),
      step(
        "check",
        "Pesar e conferir",
        1.1,
        "A balança estabiliza a massa simulada e confere o material antes da liberação.",
      ),
      step(
        "release",
        "Liberar",
        0.7,
        "O disco conferido é liberado para a armazenagem.",
        "checked-disc",
      ),
    ],
  },
  {
    id: "raw",
    name: "Armazém de matéria-prima",
    short: "Armazém MP",
    machine: "Estoque e retirada de discos",
    input: "checked-disc",
    output: "sorted-disc",
    description:
      "O p\u00f3rtico leva o disco recebido da pilha ao endere\u00e7o de estoque. Depois, os garfos retiram a unidade para abastecer a produ\u00e7\u00e3o.",
    exercise:
      "Observe o disco apoiado na prateleira: os garfos sobem vazios, entram sob a unidade e s\u00f3 ent\u00e3o a retiram.",
    recipe: [
      step(
        "locate",
        "Localizar disco",
        1.8,
        "O endere\u00e7o do disco armazenado \u00e9 reservado para abastecer a produ\u00e7\u00e3o.",
      ),
      step(
        "raise",
        "Posicionar garfos",
        1.6,
        "Os garfos sobem vazios e avan\u00e7am sob o disco, que permanece apoiado na prateleira.",
      ),
      step(
        "retrieve",
        "Retirar do endere\u00e7o",
        1.8,
        "Os garfos elevam o disco do apoio e recuam com o material.",
      ),
      step(
        "lower",
        "Abastecer produ\u00e7\u00e3o",
        1.2,
        "O disco desce com os garfos at\u00e9 o n\u00edvel dos roletes para seguir \u00e0 conforma\u00e7\u00e3o.",
        "sorted-disc",
      ),
    ],
  },
  {
    id: "production",
    name: "Produção de utensílios",
    short: "Produção",
    machine: "Prensa hidráulica · conformação de panela",
    input: "sorted-disc",
    output: "formed-pot",
    description:
      "Um disco plano é fixado na matriz e conformado gradualmente em uma panela. A saída só é liberada depois do retorno do punção.",
    exercise:
      "Abra a proteção durante o ciclo. Observe a parada, feche a proteção e retome a operação.",
    recipe: [
      step(
        "clamp",
        "Fixar disco",
        0.8,
        "O prensa-chapas fixa o disco na matriz.",
      ),
      step(
        "down",
        "Aproximar",
        1.1,
        "O punção desce até alcançar o disco, sem deformá-lo ainda.",
      ),
      step(
        "draw",
        "Conformar",
        1.7,
        "O punção repuxa o disco; a chapa ganha paredes e fundo de panela.",
        "formed-pot",
      ),
      step(
        "up",
        "Retornar",
        1.1,
        "O punção sobe. A panela permanece apoiada na matriz.",
      ),
      step(
        "eject",
        "Ejetar corpo",
        1.2,
        "O apoio sobe até o nível dos roletes com o punção já recolhido.",
      ),
    ],
  },
  {
    id: "finishing",
    name: "Acabamento",
    short: "Acabamento",
    machine: "Célula de polimento superficial",
    input: "formed-pot",
    output: "polished-pot",
    description:
      "A panela conformada passa por fixação e polimento antes da inspeção.",
    exercise:
      "Compare a superfície antes e depois do contato com a roda de polimento.",
    recipe: [
      step("clamp", "Fixar", 0.6, "A panela é apoiada e fixada."),
      step(
        "polish",
        "Polir",
        4,
        "A roda gira em contato com a superfície; o acabamento fica uniforme.",
        "polished-pot",
      ),
      step(
        "handles",
        "Montar cabo ou al\u00e7as",
        3.2,
        "O alimentador apresenta o cabo ou as al\u00e7as; a garra leva e fixa as pe\u00e7as no corpo j\u00e1 polido.",
      ),
      step(
        "release",
        "Soltar",
        0.6,
        "A fixação é aberta para encaminhar a panela à inspeção.",
      ),
    ],
  },
  {
    id: "quality",
    name: "Controle de qualidade",
    short: "Qualidade",
    machine: "Pórtico de inspeção da panela",
    input: "polished-pot",
    output: "approved-pot",
    description: "A inspeção verifica a peça antes de autorizar a embalagem.",
    exercise:
      "Obstrua a saída e observe que a peça não é transferida mesmo após a inspeção.",
    recipe: [
      step(
        "scan",
        "Medir panela",
        2.4,
        "O paquímetro e a sonda se aproximam para conferir diâmetro e profundidade.",
      ),
      step(
        "check",
        "Conferir e recolher",
        1.5,
        "As medidas nominais são comparadas e as sondas retornam à posição segura.",
      ),
      step(
        "approve",
        "Aprovar",
        0.6,
        "A aprovação autoriza a entrada na embalagem.",
        "approved-pot",
      ),
    ],
  },
  {
    id: "packing",
    name: "Centro de embalagem",
    short: "Embalagem",
    machine: "Montagem, fechamento e identificação de caixa",
    input: "approved-pot",
    output: "boxed-pot",
    description:
      "A panela aprovada recebe uma caixa, proteção, fechamento e identificação.",
    exercise:
      "Acompanhe as abas da caixa e a aplicação da fita antes da transferência.",
    recipe: [
      step(
        "carton",
        "Montar caixa e inserir panela",
        9,
        "A caixa é montada na bancada; a pinça retira a panela da esteira e a acomoda por cima, dentro da caixa.",
      ),
      step(
        "protect",
        "Proteger",
        0.9,
        "A proteção mantém a panela acomodada dentro da caixa.",
      ),
      step(
        "close",
        "Fechar abas",
        1.2,
        "As abas superiores se fecham sobre o produto.",
      ),
      step(
        "label",
        "Selar e identificar",
        1.1,
        "A fita e a etiqueta identificam o volume pronto.",
        "boxed-pot",
      ),
    ],
  },
  {
    id: "finished",
    name: "Armazém de produtos acabados",
    short: "Armazém final",
    machine: "Armazenagem e separação do pedido",
    input: "boxed-pot",
    output: "picked-box",
    description:
      "A caixa real ocupa seu endereço no armazém e é retirada para a expedição.",
    exercise:
      "Observe a caixa subir com o elevador e retornar à posição de saída.",
    recipe: [
      step(
        "identify",
        "Identificar caixa",
        0.7,
        "O volume e seu destino são identificados.",
      ),
      step(
        "raise",
        "Armazenar",
        4.5,
        "O elevador posiciona a caixa na altura de armazenagem.",
      ),
      step(
        "store",
        "Guardar caixa",
        5,
        "Os garfos depositam a caixa no endereço reservado e recuam.",
      ),
      step(
        "retrieve",
        "Atender pedido",
        5,
        "Os garfos recolhem a caixa para o pedido de expedição.",
      ),
      step(
        "lower",
        "Separar pedido",
        4.5,
        "A caixa retorna ao nível da linha para atender ao pedido.",
        "picked-box",
      ),
    ],
  },
  {
    id: "shipping",
    name: "Expedição",
    short: "Expedição",
    machine: "Conferência e carregamento do pedido",
    input: "picked-box",
    output: "shipped-box",
    description:
      "O volume é conferido e transportado até o interior do caminhão.",
    exercise:
      "Confira as caixas no caminhão e o contador de volumes expedidos.",
    recipe: [
      step(
        "check",
        "Conferir pedido",
        1,
        "A caixa é comparada com o pedido a ser expedido.",
      ),
      step(
        "release",
        "Autorizar carga",
        0.8,
        "A conferência libera o volume para a doca.",
        "shipped-box",
      ),
    ],
  },
];
for (const e of ENVIRONMENTS) {
  e.cycle = e.recipe.reduce((n, s) => n + s.duration, 0);
  e.process = e.recipe[0].label;
}
export function getProcessStep(c, e) {
  if (c.phase !== "processing") return null;
  let start = 0;
  for (let i = 0; i < e.recipe.length; i++) {
    const s = e.recipe[i];
    if (c.processing < start + s.duration - 1e-7 || i === e.recipe.length - 1)
      return {
        ...s,
        index: i,
        progress: Math.max(0, Math.min(1, (c.processing - start) / s.duration)),
      };
    start += s.duration;
  }
  return null;
}
export function createSimulation(initialBatch = 12, options = {}) {
  if (!Number.isInteger(initialBatch) || initialBatch < 1 || initialBatch > 50)
    throw new Error("Lote: entre 1 e 50 unidades.");
  let batch = initialBatch,
    time = 0,
    running = false,
    emergency = false,
    speed = 1,
    eventId = 0,
    scope = options.scope === "bench" ? "bench" : "line",
    focus = ENVIRONMENTS.some((e) => e.id === options.environment)
      ? options.environment
      : "production",
    cells = [],
    events = [],
    completedUnits = [],
    product = getProduct(options.product).id;
  let onDemand = options.onDemand === true;
  const demandEnvironments = ENVIRONMENTS.map((environment) =>
    environment.id === "finished"
      ? {
          ...environment,
          recipe: environment.recipe.map((step, index) => ({
            ...step,
            duration: [0.7, 8, 7, 0.6, 8][index],
            ...(step.id === "retrieve"
              ? {
                  label: "Registrar estoque",
                  explanation:
                    "A caixa permanece apoiada no endereço aguardando pedido.",
                }
              : step.id === "lower"
                ? {
                    label: "Retornar garfos vazios",
                    explanation:
                      "O carro retorna vazio para receber outra caixa.",
                  }
                : {}),
          })),
          cycle: 24.3,
        }
      : environment,
  );
  const cellEnvironment = (index, demand = onDemand, productId = product) => {
    const environment = (demand ? demandEnvironments : ENVIRONMENTS)[index];
    if (environment.id !== "packing") return environment;
    const recipe = environment.recipe.map((step) =>
      step.id === "carton"
        ? {
            ...step,
            duration: cookwarePackingCartonDuration(getProduct(productId)),
          }
        : step,
    );
    return {
      ...environment,
      recipe,
      cycle: recipe.reduce((sum, step) => sum + step.duration, 0),
    };
  };
  const inventory = createWarehouseInventory({
    environment: "cookware",
    accountKey: options.accountKey,
    capacity: options.capacity,
    products: ["saucepan", "casserole", "frying-pan"],
  });
  let lotId = inventory.snapshot.lotId;
  let fulfillment = null;
  let practice = false,
    lineCheckpoint = null;
  const shippingPending = () => !!fulfillment;
  const workInProgress = () =>
    cells.some(
      (c, i) =>
        i < 7 &&
        (c.unit ||
          (i !==
            (scope === "bench"
              ? ENVIRONMENTS.findIndex((e) => e.id === focus)
              : 0) &&
            c.stock.length)),
    );
  const log = (message, type = "info", id = null) => {
    events.unshift({ id: ++eventId, time, message, type, environment: id });
    events = events.slice(0, 120);
  };
  function createCells() {
    cells = ENVIRONMENTS.map((e) => ({
      id: e.id,
      mode: options.mode === "guided" ? "guided" : "auto",
      permit: null,
      stock: [],
      unit: null,
      lastUnitId: null,
      phase: "idle",
      progress: 0,
      processing: 0,
      done: 0,
      guard: true,
      fault: false,
      committed: 0,
      lastStage: -1,
      commands: { motor: false, work: false, transfer: false },
    }));
    const i =
      scope === "bench" ? ENVIRONMENTS.findIndex((e) => e.id === focus) : 0;
    cells[i].stock =
      onDemand && i === 7
        ? []
        : Array.from({ length: batch }, (_, n) => ({
            id: `UT-${String(n + 1).padStart(3, "0")}`,
            material: ENVIRONMENTS[i].input,
            product,
            history: [],
          }));
    completedUnits = [];
  }
  const getCell = (id) => {
    const c = cells.find((c) => c.id === id);
    if (!c) throw new Error("Ambiente desconhecido");
    return c;
  };
  const terminal = () =>
      scope === "bench" ? getCell(focus) : cells[onDemand ? 6 : 7],
    safe = () => !emergency && cells.every((c) => c.guard && !c.fault);
  const actionId = (c) =>
    c.phase === "idle" || c.phase === "feeding"
      ? "feed"
      : c.phase === "unloading"
        ? "transfer"
        : getProcessStep(
            c,
            cellEnvironment(ENVIRONMENTS.findIndex((e) => e.id === c.id)),
          )?.id;
  function outputs(c) {
    const enabled = running && !emergency && c.guard && !c.fault;
    return {
      motor:
        enabled &&
        !!c.unit &&
        ["feeding", "unloading"].includes(c.phase) &&
        (c.mode === "auto" ||
          (c.mode === "guided" && c.permit === actionId(c)) ||
          c.commands.motor),
      work:
        enabled &&
        c.phase === "processing" &&
        (c.mode === "auto" ||
          (c.mode === "guided" && c.permit === actionId(c)) ||
          c.commands.work),
      transfer:
        enabled &&
        c.phase === "unloading" &&
        c.progress >= 0.9 &&
        (c.mode === "auto" ||
          (c.mode === "guided" && c.permit === actionId(c)) ||
          c.commands.transfer),
    };
  }
  function reset(nextBatch = batch) {
    if (!Number.isInteger(nextBatch) || nextBatch < 1 || nextBatch > 50)
      throw new Error("Lote: entre 1 e 50 unidades.");
    if (onDemand && workInProgress()) {
      log(
        "Conclua as peças em processo antes de preparar outro lote.",
        "warning",
      );
      return false;
    }
    if (onDemand) lotId = inventory.beginLot();
    batch = nextBatch;
    if (!onDemand) time = 0;
    running = false;
    emergency = false;
    events = [];
    eventId = 0;
    createCells();
    log(
      `Lote preparado: ${batch} panelas. ${scope === "bench" ? "Bancada individual." : "Fluxo integrado."}`,
    );
    return true;
  }
  createCells();
  log("Lote preparado. Inicie para acompanhar a transformação da unidade.");
  function start() {
    if (!safe()) {
      log("Confira emergência, proteções e obstruções.", "warning");
      return false;
    }
    if (terminal().done >= batch && !(onDemand && shippingPending())) {
      log("Lote concluído. Prepare um novo lote.");
      return false;
    }
    running = true;
    log("Ciclo iniciado.", "success");
    return true;
  }
  function stop() {
    running = false;
    for (const c of cells) {
      c.permit = null;
      c.commands = { motor: false, work: false, transfer: false };
    }
    log("Ciclo pausado; posição da peça preservada.");
  }
  function tick(dt, force = false) {
    if (!Number.isFinite(dt) || dt <= 0 || (!running && !force) || !safe())
      return;
    const wasRunning = running;
    if (force) running = true;
    const total = Math.min(dt, 0.5) * speed,
      steps = Math.max(1, Math.ceil(total / 0.025)),
      delta = total / steps;
    for (let s = 0; s < steps; s++) {
      time += delta;
      for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i],
          e = cellEnvironment(i);
        if (onDemand && fulfillment && i === 6 && !c.unit) continue;
        if (
          !c.unit &&
          c.stock.length &&
          (!onDemand ||
            (c.id !== "shipping" &&
              inventory.canReceiveBox() &&
              (i === 0 || !cells[i].unit))) &&
          (c.mode === "auto" ||
            (c.mode === "guided" && c.permit === actionId(c)) ||
            c.commands.motor)
        ) {
          c.unit = c.stock.shift();
          if (onDemand && c.id === "finished")
            c.unit.warehouseAddress = inventory.getFreeAddress();
          c.lastUnitId = c.unit.id;
          c.phase = "feeding";
          c.progress = 0;
          c.processing = 0;
          c.committed = 0;
          c.lastStage = -1;
          log(
            `${c.unit.id} · ${e.short}: entrada de ${MATERIALS[c.unit.material].toLowerCase()}.`,
            "info",
            c.id,
          );
        }
        const out = outputs(c);
        if (c.phase === "feeding" && out.motor) {
          c.progress = Math.min(
            0.5,
            c.progress +
              delta *
                (c.id === "receiving"
                  ? 0.5 /
                    cookwareReceivingDuration(
                      c.done,
                      c.done + c.stock.length + (c.unit ? 1 : 0),
                    )
                  : c.id === "raw"
                    ? 0.12
                    : c.id === "packing"
                      ? 0.5 / cookwarePackingFeedDuration()
                      : 0.24),
          );
          if (c.progress >= 0.5) {
            c.phase = "processing";
            if (c.mode === "guided") c.permit = null;
            log(`${c.unit.id} · Unidade posicionada.`, "info", c.id);
          }
        } else if (c.phase === "processing" && out.work) {
          const boundary =
            c.mode === "guided"
              ? e.recipe
                  .slice(0, (getProcessStep(c, e)?.index ?? 0) + 1)
                  .reduce((sum, r) => sum + r.duration, 0)
              : e.cycle;
          c.processing = Math.min(boundary, c.processing + delta);
          if (c.mode === "guided" && c.processing >= boundary - 1e-7)
            c.permit = null;
          const active = getProcessStep(c, e);
          if (active && active.index !== c.lastStage) {
            c.lastStage = active.index;
            log(
              `${c.unit.id} · ${active.label}: ${active.explanation}`,
              "info",
              c.id,
            );
          }
          let end = 0;
          for (let j = 0; j < e.recipe.length; j++) {
            end += e.recipe[j].duration;
            if (c.processing >= end - 1e-7 && c.committed <= j) {
              if (e.recipe[j].material) c.unit.material = e.recipe[j].material;
              c.unit.history.push({
                environment: c.id,
                step: e.recipe[j].id,
                time,
              });
              c.committed = j + 1;
            }
          }
          if (c.processing >= e.cycle - 1e-7) {
            c.processing = e.cycle;
            c.unit.material = e.output;
            c.phase = "unloading";
            c.commands.work = false;
            log(
              `${c.unit.id} · ${MATERIALS[e.output]} liberada para saída.`,
              "success",
              c.id,
            );
          }
        } else if (c.phase === "unloading") {
          if (c.progress < 0.9 && out.motor)
            c.progress = Math.min(
              0.9,
              c.progress +
                delta *
                  (c.id === "packing"
                    ? 0.5 / cookwarePackingUnloadDuration()
                    : 0.24),
            );
          else if (c.progress >= 0.9 && out.transfer) {
            if (
              onDemand &&
              scope === "line" &&
              i < 6 &&
              cells[i + 1].stock.length >= 1
            )
              continue;
            c.progress = Math.min(
              1,
              c.progress +
                delta *
                  (c.id === "packing"
                    ? 0.5 / cookwarePackingUnloadDuration()
                    : 0.2),
            );
            if (c.progress >= 1) {
              const unit = c.unit;
              if (onDemand && scope === "line" && c.id === "finished") {
                if (
                  !unit.history.some(
                    (h) => h.environment === "production" && h.step === "draw",
                  ) ||
                  !unit.history.some(
                    (h) => h.environment === "packing" && h.step === "label",
                  )
                ) {
                  running = false;
                  c.fault = true;
                  log(
                    "Caixa sem histórico de produção e embalagem: entrada no estoque bloqueada.",
                    "error",
                    c.id,
                  );
                  continue;
                }
                const stored = inventory.receiveBox({
                  id: unit.id,
                  product: unit.product,
                  quantity: 1,
                  unit: { ...unit, material: "boxed-pot" },
                  address: unit.warehouseAddress,
                  lotId,
                });
                if (!stored.ok) {
                  c.progress = 1;
                  continue;
                }
                unit.inventoryId = stored.box.id;
                unit.material = "boxed-pot";
              }
              c.done++;
              c.permit = null;
              c.unit = null;
              c.phase = "idle";
              c.progress = 0;
              c.processing = 0;
              c.commands.transfer = false;
              if (scope === "line" && i < (onDemand ? 6 : cells.length - 1))
                cells[i + 1].stock.push(unit);
              else if (!onDemand || c.id !== "shipping")
                completedUnits.push(unit);
              log(
                `${unit.id} · ${e.short}: transferência concluída.`,
                "success",
                c.id,
              );
            }
          }
        }
      }
      if (onDemand && fulfillment && !cells[6].unit) {
        const box = inventory.getBox(fulfillment.boxIds[fulfillment.index]);
        const duration =
          options.fulfillmentDuration?.(
            fulfillment.action,
            box,
            fulfillment.index,
          ) ?? 8;
        if (!Number.isFinite(duration) || duration <= 0) {
          running = false;
          log("Trajeto de separação inválido.", "error");
          break;
        }
        fulfillment.progress = Math.min(
          1,
          fulfillment.progress + delta / duration,
        );
        if (fulfillment.progress >= 1 - 1e-9) {
          const result =
            fulfillment.action === "pick"
              ? inventory.completePickBox(fulfillment.orderId, box.id)
              : inventory.completeShipmentBox(fulfillment.orderId, box.id);
          if (!result.ok) {
            running = false;
            log(result.message, "error");
            break;
          }
          fulfillment.index++;
          fulfillment.progress = 0;
          if (fulfillment.index === fulfillment.boxIds.length) {
            log(
              `${fulfillment.orderId}: ${fulfillment.action === "pick" ? "separação" : "expedição"} concluída.`,
              "success",
            );
            fulfillment = null;
          }
        }
      }
      if (terminal().done >= batch && !(onDemand && shippingPending())) {
        running = false;
        log(
          scope === "bench"
            ? "Lote da bancada concluído."
            : onDemand
              ? "Produção concluída. As caixas permanecem no armazém aguardando pedido."
              : "Pedido concluído: todas as panelas embaladas e expedidas.",
          "success",
        );
        break;
      }
    }
    if (force && !wasRunning) running = false;
  }
  function exportState() {
    return structuredClone({
      version: 1,
      environment: "cookware",
      packingLayoutVersion: 2,
      product,
      batch,
      time,
      running,
      emergency,
      speed,
      eventId,
      scope,
      focus,
      cells,
      events,
      completedUnits,
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
      if (
        !safeData(value) ||
        value.version !== 1 ||
        value.environment !== "cookware" ||
        getProduct(value.product).id !== value.product ||
        !integerIn(value.batch, 1, 50) ||
        !numberIn(value.time, 0, 1e8) ||
        ![0.5, 1, 2, 4, 8].includes(value.speed) ||
        typeof value.emergency !== "boolean" ||
        !["bench", "line"].includes(value.scope) ||
        !ENVIRONMENTS.some((e) => e.id === value.focus) ||
        !Array.isArray(value.cells) ||
        value.cells.length !== ENVIRONMENTS.length ||
        !Array.isArray(value.completedUnits) ||
        !Array.isArray(value.events) ||
        value.events.length > 120 ||
        !integerIn(value.eventId, 0, 1e9)
      )
        return false;
      const next = structuredClone(value),
        seen = new Set();
      if (next.packingLayoutVersion !== 2) {
        const packing = next.cells.find((cell) => cell.id === "packing");
        const old = [1.2, 0.9, 1.2, 1.1],
          updated = [
            cookwarePackingCartonDuration(getProduct(next.product)),
            0.9,
            1.2,
            1.1,
          ];
        if (
          packing &&
          numberIn(
            packing.processing,
            0,
            old.reduce((a, b) => a + b, 0) + 0.00001,
          )
        ) {
          let before = 0,
            after = 0;
          for (let index = 0; index < old.length; index++) {
            if (packing.processing <= before + old[index] + 1e-7) {
              packing.processing =
                after +
                updated[index] *
                  Math.min(
                    1,
                    Math.max(0, (packing.processing - before) / old[index]),
                  );
              break;
            }
            before += old[index];
            after += updated[index];
          }
        }
      }
      const storedMode = next.onDemand === true;
      if (next.practice !== undefined && typeof next.practice !== "boolean")
        return false;
      if (next.practice) {
        if (
          next.scope !== "bench" ||
          storedMode ||
          !next.lineCheckpoint ||
          next.lineCheckpoint.practice ||
          Object.hasOwn(next.lineCheckpoint, "lineCheckpoint")
        )
          return false;
        const pausedLine = createSimulation(1, options);
        if (!pausedLine.importState(next.lineCheckpoint)) return false;
      }
      const candidateInventory = createWarehouseInventory({
        environment: "cookware",
        accountKey: options.accountKey,
        capacity: options.capacity,
        products: ["saucepan", "casserole", "frying-pan"],
      });
      if (
        storedMode &&
        (!candidateInventory.importState(next.inventory) ||
          next.lotId !== candidateInventory.snapshot.lotId)
      )
        return false;
      if (
        !storedMode &&
        options.onDemand === true &&
        !next.practice &&
        (next.cells[7].stock.length ||
          next.cells[7].unit ||
          inventory.snapshot.boxes.length)
      )
        return false;
      if (storedMode) {
        const task = next.fulfillment,
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
      }
      function validUnit(unit) {
        if (
          !unit ||
          unit.product !== next.product ||
          !/^UT-\d{3}$/.test(unit.id) ||
          !integerIn(Number(unit.id.slice(3)), 1, next.batch) ||
          seen.has(unit.id) ||
          !Object.hasOwn(MATERIALS, unit.material) ||
          !Array.isArray(unit.history) ||
          unit.history.length > 100
        )
          return false;
        seen.add(unit.id);
        return unit.history.every(
          (h) =>
            ENVIRONMENTS.some(
              (e) =>
                e.id === h.environment && e.recipe.some((r) => r.id === h.step),
            ) && numberIn(h.time, 0, next.time + 0.001),
        );
      }
      for (const [i, cell] of next.cells.entries()) {
        const e = cellEnvironment(i, storedMode, next.product);
        if (
          cell.id !== e.id ||
          !["auto", "guided", "manual"].includes(cell.mode) ||
          !["idle", "feeding", "processing", "unloading"].includes(
            cell.phase,
          ) ||
          !numberIn(cell.progress, 0, 1) ||
          !numberIn(cell.processing, 0, e.cycle + 0.00001) ||
          !integerIn(cell.done, 0, next.batch) ||
          !integerIn(cell.committed, 0, e.recipe.length) ||
          !integerIn(cell.lastStage, -1, e.recipe.length) ||
          typeof cell.guard !== "boolean" ||
          typeof cell.fault !== "boolean" ||
          !Array.isArray(cell.stock) ||
          cell.stock.length > next.batch ||
          !cell.commands ||
          !["motor", "work", "transfer"].every(
            (k) => typeof cell.commands[k] === "boolean",
          )
        )
          return false;
        if (
          (cell.phase === "idle") !== !cell.unit ||
          !cell.stock.every(validUnit) ||
          (cell.unit && !validUnit(cell.unit))
        )
          return false;
        if (
          (cell.phase === "feeding" && cell.progress > 0.5) ||
          (cell.phase === "processing" &&
            Math.abs(cell.progress - 0.5) > 0.00001) ||
          (cell.phase === "unloading" && cell.progress < 0.5)
        )
          return false;
        cell.permit = null;
        cell.commands = { motor: false, work: false, transfer: false };
      }
      if (!next.completedUnits.every(validUnit) || seen.size !== next.batch)
        if (
          !(
            storedMode &&
            next.scope === "bench" &&
            next.focus === "shipping" &&
            seen.size === 0 &&
            next.completedUnits.length === 0
          )
        )
          return false;
      if (
        storedMode &&
        (next.cells[7].stock.length || next.cells[7].unit || next.cells[7].done)
      )
        return false;
      const terminalIndex =
        next.scope === "line"
          ? storedMode
            ? 6
            : 7
          : ENVIRONMENTS.findIndex((e) => e.id === next.focus);
      if (
        !(storedMode && terminalIndex === 7) &&
        next.cells[terminalIndex].done !== next.completedUnits.length
      )
        return false;
      if (next.scope === "line")
        for (let i = 0; i < (storedMode ? 6 : 7); i++) {
          const following = next.cells[i + 1];
          if (
            next.cells[i].done !==
            following.done + following.stock.length + (following.unit ? 1 : 0)
          )
            return false;
        }
      else if (
        next.cells.some(
          (c, i) =>
            i !== terminalIndex &&
            !(storedMode && i === 7) &&
            (c.done || c.unit || c.stock.length),
        )
      )
        return false;
      if (
        !next.events.every(
          (e) =>
            integerIn(e.id, 1, next.eventId) &&
            numberIn(e.time, 0, next.time + 0.001) &&
            typeof e.message === "string",
        )
      )
        return false;
      product = next.product;
      batch = next.batch;
      time = next.time;
      emergency = next.emergency;
      speed = next.speed;
      eventId = next.eventId;
      scope = next.scope;
      focus = next.focus;
      cells = next.cells;
      if (!storedMode && options.onDemand === true && !next.practice)
        Object.assign(cells[7], {
          stock: [],
          unit: null,
          lastUnitId: null,
          phase: "idle",
          progress: 0,
          processing: 0,
          done: 0,
          committed: 0,
          lastStage: -1,
          permit: null,
          commands: { motor: false, work: false, transfer: false },
        });
      events = next.events;
      completedUnits = next.completedUnits;
      if (storedMode) {
        inventory.importState(next.inventory);
        lotId = next.lotId;
        fulfillment = next.fulfillment;
      }
      onDemand = next.practice
        ? false
        : storedMode || options.onDemand === true;
      practice = next.practice === true;
      lineCheckpoint = practice ? structuredClone(next.lineCheckpoint) : null;
      if (practice) fulfillment = null;
      running = false;
      return true;
    } catch {
      return false;
    }
  }
  function enterBench(id, { quantity = 1 } = {}) {
    if (
      !ENVIRONMENTS.some((environment) => environment.id === id) ||
      !integerIn(quantity, 1, 50)
    )
      return false;
    if (!practice) {
      stop();
      lineCheckpoint = exportState();
    }
    practice = true;
    onDemand = false;
    fulfillment = null;
    scope = "bench";
    focus = id;
    reset(quantity);
    cells.forEach((cell) => (cell.mode = "auto"));
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
          message:
            "Conclua ou retome o movimento atual antes de separar outro pedido.",
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
          code: "UNAVAILABLE",
          message:
            "Conclua o movimento atual e rearme o ambiente antes de expedir.",
        };
      const result = inventory.dispatchOrder(id);
      if (!result.ok) return result;
      fulfillment = {
        action: "ship",
        orderId: id,
        boxIds: result.order.boxIds,
        index: 0,
        progress: 0,
      };
      log(
        `${id}: expedição autorizada para ${result.boxes.length} caixas.`,
        "success",
        "shipping",
      );
      return result;
    },
    exportState,
    importState,
    start,
    stop,
    step: tick,
    reset,
    haltMotion(id, reason) {
      const c = getCell(id);
      if (c.fault) return;
      running = false;
      c.fault = true;
      log(
        `Movimento bloqueado para evitar contato com ${reason}. Rearme após verificar a passagem.`,
        "error",
        id,
      );
    },
    setProduct(id) {
      if (getProduct(id).id !== id) return false;
      if (onDemand && workInProgress()) return false;
      product = id;
      reset();
      return true;
    },
    setScope(next, id = focus) {
      if (practice && next === "line") return returnLine();
      if (
        !["bench", "line"].includes(next) ||
        !ENVIRONMENTS.some((e) => e.id === id)
      )
        return false;
      if (onDemand && workInProgress()) return false;
      scope = next;
      focus = id;
      reset();
      return true;
    },
    setSpeed(value) {
      if (![0.5, 1, 2, 4, 8].includes(value)) return false;
      speed = value;
      return true;
    },
    setMode(id, mode) {
      if (!["auto", "manual", "guided"].includes(mode)) return false;
      const c = getCell(id);
      c.mode = mode;
      c.permit = null;
      c.commands = { motor: false, work: false, transfer: false };
      log(
        `Modo ${mode === "auto" ? "automático" : mode === "guided" ? "interativo" : "manual"} selecionado.`,
        "info",
        id,
      );
      return true;
    },
    performNext(id) {
      const c = getCell(id);
      if (
        c.mode !== "guided" ||
        !safe() ||
        c.permit ||
        (!c.unit && !c.stock.length)
      )
        return false;
      if (!running && !start()) return false;
      c.permit = actionId(c);
      log(`Operador autorizou: ${c.permit}.`, "info", id);
      return true;
    },
    command(id, key, value) {
      const c = getCell(id);
      if (c.mode !== "manual" || !(key in c.commands) || !safe()) return false;
      if (value && key === "work" && c.phase !== "processing") {
        log("Posicione a unidade antes de acionar o ciclo.", "warning", id);
        return false;
      }
      if (
        value &&
        key === "transfer" &&
        !(c.phase === "unloading" && c.progress >= 0.9)
      ) {
        log("Aguarde o sensor de saída antes de transferir.", "warning", id);
        return false;
      }
      c.commands[key] = !!value;
      return true;
    },
    emergencyStop() {
      emergency = true;
      running = false;
      for (const c of cells) {
        c.permit = null;
        c.commands = { motor: false, work: false, transfer: false };
      }
      log(
        "Emergência: movimento interrompido, peça e etapa preservadas.",
        "error",
      );
    },
    acknowledge() {
      if (cells.some((c) => !c.guard || c.fault)) {
        log("Elimine as falhas antes de rearmar.", "warning");
        return false;
      }
      emergency = false;
      log(
        "Segurança rearmada. Inicie para continuar da etapa interrompida.",
        "success",
      );
      return true;
    },
    setGuard(id, value) {
      const c = getCell(id);
      c.guard = !!value;
      if (!value) {
        running = false;
        c.permit = null;
        c.commands = { motor: false, work: false, transfer: false };
        log("Proteção aberta: equipamento interrompido.", "error", id);
      } else log("Proteção fechada.", "info", id);
    },
    setFault(id, value) {
      const c = getCell(id);
      c.fault = !!value;
      if (value) {
        running = false;
        c.permit = null;
        log("Saída obstruída: transferência bloqueada.", "error", id);
      } else log("Saída desobstruída.", "info", id);
    },
    get snapshot() {
      const inventoryState = onDemand ? inventory.snapshot : null;
      return {
        onDemand,
        practice,
        hasPausedLine: practice && !!lineCheckpoint,
        ...(onDemand ? { inventory: inventoryState } : {}),
        ...(onDemand
          ? {
              fulfillment: fulfillment
                ? {
                    ...structuredClone(fulfillment),
                    boxId: fulfillment.boxIds[fulfillment.index],
                    total: fulfillment.boxIds.length,
                    box: inventoryState.boxes.find(
                      (b) => b.id === fulfillment.boxIds[fulfillment.index],
                    ),
                  }
                : null,
            }
          : {}),
        product,
        batch,
        time,
        running,
        emergency,
        speed,
        scope,
        focus,
        ready: safe(),
        done: terminal().done,
        completedUnits: completedUnits.map((u) => ({
          ...u,
          history: u.history.map((h) => ({ ...h })),
        })),
        cells: cells.map((c, i) => {
          const e = cellEnvironment(i),
            active = getProcessStep(c, e),
            part = !!c.unit;
          const stage =
            c.phase === "feeding"
              ? {
                  id: "feed",
                  label:
                    c.id === "raw"
                      ? "Abastecer endere\u00e7o do estoque"
                      : "Alimentar equipamento",
                  explanation:
                    c.id === "raw"
                      ? `${c.unit.id} sai do topo da pilha recebida e \u00e9 levado pelo p\u00f3rtico at\u00e9 o endere\u00e7o de estoque.`
                      : `${c.unit.id} entra como ${MATERIALS[c.unit.material].toLowerCase()}.`,
                  progress: c.progress / 0.5,
                  ...(c.id === "receiving"
                    ? {
                        duration: cookwareReceivingDuration(
                          c.done,
                          c.done + c.stock.length + (c.unit ? 1 : 0),
                        ),
                      }
                    : c.id === "packing"
                      ? { duration: cookwarePackingFeedDuration() }
                      : {}),
                }
              : c.phase === "unloading"
                ? {
                    id: "transfer",
                    label: "Transferir unidade",
                    explanation: `${MATERIALS[e.output]} segue ${scope === "line" && i < 7 ? `para ${ENVIRONMENTS[i + 1].short.toLowerCase()}` : "para a saída da bancada"}.`,
                    progress: (c.progress - 0.5) / 0.5,
                  }
                : active;
          const processSteps = [
              {
                id: "feed",
                label: c.id === "raw" ? "Abastecer endere\u00e7o" : "Alimentar",
              },
              ...e.recipe.map((r) => ({ id: r.id, label: r.label })),
              { id: "transfer", label: "Transferir" },
            ],
            stageIndex = stage
              ? processSteps.findIndex((s) => s.id === stage.id)
              : -1;
          const nextId = actionId(c),
            nextLabel =
              nextId === "feed"
                ? c.id === "raw"
                  ? "Abastecer endere\u00e7o do estoque"
                  : "Inserir e posicionar unidade"
                : nextId === "transfer"
                  ? "Transferir para a saída"
                  : e.recipe.find((r) => r.id === nextId)?.label;
          return {
            ...(onDemand ? { onDemand: true } : {}),
            id: c.id,
            lastUnitId: c.lastUnitId,
            mode: c.mode,
            awaitingAction: c.mode === "guided" && !c.permit,
            actionLabel: nextLabel,
            actionAvailable: !!(c.unit || c.stock.length),
            queue: c.stock.length,
            stockIds: c.stock.map((u) => u.id),
            part,
            unit: c.unit
              ? { ...c.unit, history: c.unit.history.map((h) => ({ ...h })) }
              : null,
            phase: c.phase,
            progress: c.progress,
            processing: c.processing,
            processRatio: c.processing / e.cycle,
            done: c.done,
            guard: c.guard,
            fault: c.fault,
            commands: { ...c.commands },
            stage,
            stageIndex,
            processSteps,
            inputMaterial: MATERIALS[e.input],
            outputMaterial: MATERIALS[e.output],
            status:
              c.mode === "guided" && !c.permit && (c.unit || c.stock.length)
                ? `Sua vez · ${nextLabel}`
                : !c.guard
                  ? "Proteção aberta"
                  : c.fault
                    ? "Saída obstruída"
                    : (stage?.label ??
                      (c.stock.length
                        ? "Pronto para alimentar"
                        : c.done
                          ? "Unidades concluídas"
                          : "Aguardando material")),
            inputs: {
              entry: part && c.progress < 0.17,
              positioned: part && c.phase === "processing",
              exit: c.fault || (part && c.progress >= 0.87),
              guard: c.guard,
              stroke: active?.id === "draw",
            },
            outputs: outputs(c),
          };
        }),
        events: events.map((e) => ({ ...e })),
      };
    },
  };
}
