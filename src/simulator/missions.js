export const MISSION_VERSION = 1;
export function missionDefinition(environment, steps) {
  const objectives = {
    cookware:
      "Produzir, conferir, embalar e expedir 12 panelas pelo fluxo completo.",
    beverages:
      "Entregar 12 garrafas higienizadas, com volume correto, tampa e embalagem.",
    parcels:
      "Identificar, pesar e expedir 12 encomendas pelo endereço e pela rota do pedido.",
    furniture:
      "Cortar, furar, montar e embalar 12 móveis com as medidas do pedido.",
  };
  return {
    id: `${environment}-order-12`,
    version: 1,
    target: 12,
    objective: objectives[environment],
    steps: steps.map((s) => ({ id: s.id, label: s.label ?? s.short })),
  };
}
export function missionEvidence(snapshot, definition) {
  if (snapshot.cells)
    return {
      product: snapshot.product,
      scope: snapshot.scope,
      quantity: snapshot.batch,
      done: snapshot.done,
      elapsed: snapshot.time,
      checkpoints: Object.fromEntries(
        snapshot.cells.map((c) => [c.id, c.done]),
      ),
      fault: snapshot.emergency
        ? "emergency"
        : (snapshot.cells.find((c) => !c.guard || c.fault)?.id ?? ""),
    };
  return {
    product: snapshot.product.id,
    scope: snapshot.scope,
    quantity: snapshot.total,
    done: snapshot.done,
    elapsed: snapshot.elapsed,
    checkpoints: Object.fromEntries(
      definition.steps.map((step) => [
        step.id,
        new Set(
          snapshot.history.filter((h) => h.step === step.id).map((h) => h.unit),
        ).size,
      ]),
    ),
    fault: snapshot.fault || snapshot.emergency ? "operation" : "",
  };
}
export function createMission(definition) {
  let state = null,
    interrupted = false;
  function start(product) {
    interrupted = false;
    state = {
      started: true,
      completed: false,
      product,
      target: definition.target,
      checkpoints: Object.fromEntries(definition.steps.map((s) => [s.id, 0])),
      done: 0,
      elapsed: 0,
      faultsSeen: [],
      faultsResolved: [],
    };
  }
  function observe(evidence) {
    if (!state) return;
    if (
      evidence.product !== state.product ||
      evidence.scope !== "line" ||
      evidence.quantity !== definition.target ||
      evidence.elapsed < state.elapsed
    ) {
      interrupted = true;
      state.completed = false;
      return;
    }
    if (interrupted || state.completed) return;
    state.done = Math.min(definition.target, evidence.done);
    state.elapsed = evidence.elapsed;
    for (const step of definition.steps)
      state.checkpoints[step.id] = Math.min(
        definition.target,
        evidence.checkpoints[step.id] ?? 0,
      );
    if (evidence.fault && !state.faultsSeen.includes(evidence.fault))
      state.faultsSeen.push(evidence.fault);
    if (!evidence.fault)
      for (const fault of state.faultsSeen)
        if (!state.faultsResolved.includes(fault))
          state.faultsResolved.push(fault);
    state.completed =
      state.done === definition.target &&
      definition.steps.every(
        (s) => state.checkpoints[s.id] === definition.target,
      ) &&
      !evidence.fault;
  }
  return {
    start,
    observe,
    exportState() {
      return state
        ? {
            id: definition.id,
            version: 1,
            status: state.completed
              ? "completed"
              : interrupted
                ? "interrupted"
                : "active",
            state: structuredClone(state),
          }
        : null;
    },
    importState(saved, evidence) {
      if (saved === null) {
        state = null;
        interrupted = false;
        return true;
      }
      if (
        saved?.id !== definition.id ||
        saved.version !== 1 ||
        !saved.state ||
        saved.state.target !== definition.target ||
        !definition.steps.every(
          (s) =>
            Number.isInteger(saved.state.checkpoints?.[s.id]) &&
            saved.state.checkpoints[s.id] >= 0 &&
            saved.state.checkpoints[s.id] <= definition.target,
        )
      )
        return false;
      if (
        saved.status === "completed" &&
        evidence &&
        (evidence.scope !== "line" ||
          evidence.product !== saved.state.product ||
          evidence.quantity !== definition.target ||
          evidence.done < definition.target ||
          evidence.fault ||
          definition.steps.some(
            (s) => (evidence.checkpoints[s.id] ?? 0) < definition.target,
          ))
      )
        return false;
      state = structuredClone(saved.state);
      interrupted = saved.status === "interrupted";
      return true;
    },
    get snapshot() {
      if (!state) return null;
      return {
        ...structuredClone(state),
        status: state.completed
          ? "completed"
          : interrupted
            ? "interrupted"
            : "active",
        progress:
          (Object.values(state.checkpoints).reduce((a, b) => a + b, 0) +
            state.done) /
          (definition.target * (definition.steps.length + 1)),
      };
    },
  };
}
export function diagnose(environment, snapshot) {
  if (snapshot.cells) {
    const c = snapshot.cells.find((c) => !c.guard || c.fault);
    if (snapshot.emergency)
      return {
        code: "emergency",
        title: "Parada de emergência",
        cause: "emergency",
        choices: [
          ["emergency", "Emergência acionada"],
          ["measurement", "Medida fora da especificação"],
          ["supply", "Falta de matéria-prima"],
        ],
        hint: "Verifique a linha, elimine as condições inseguras e use Rearmar segurança antes de iniciar.",
      };
    if (c)
      return {
        code: `${c.id}-${c.fault ? "exit" : "guard"}`,
        title: `Sinal de segurança em ${c.id}`,
        cause: c.fault ? "exit" : "guard",
        choices: [
          ["exit", "Saída obstruída"],
          ["guard", "Proteção aberta"],
          ["supply", "Falta de matéria-prima"],
        ],
        hint: c.fault
          ? "Abra os controles do setor indicado, libere a saída e inicie novamente."
          : "Feche a proteção do setor indicado antes de retomar.",
      };
    return null;
  }
  if (snapshot.emergency)
    return {
      code: "emergency",
      title: "Parada de emergência",
      cause: "emergency",
      choices: [
        ["emergency", "Emergência acionada"],
        ["supply", "Falta de insumo"],
        ["measurement", "Medida incorreta"],
      ],
      hint: "Verifique as condições de segurança e rearme a linha. A peça permanece na mesma posição.",
    };
  if (!snapshot.guard || snapshot.obstruction)
    return {
      code: !snapshot.guard ? "guard" : "exit",
      title: "Intertravamento de segurança",
      cause: !snapshot.guard ? "guard" : "exit",
      choices: [
        ["guard", "Proteção aberta"],
        ["exit", "Saída obstruída"],
        ["measurement", "Medida incorreta"],
      ],
      hint: !snapshot.guard
        ? "Feche a proteção e retome."
        : "Libere a saída e retome.",
    };
  if (!snapshot.fault) return null;
  const step = snapshot.step.id;
  const code =
    environment === "beverages"
      ? step === "label" && !snapshot.unit.capped
        ? "cap"
        : "volume"
      : environment === "furniture"
        ? step === "drill"
          ? "depth"
          : !snapshot.settings.guardClosed
            ? "saw-guard"
            : "length"
        : ({
            scan: "barcode",
            weigh: "weight",
            sort: "destination",
            store: !snapshot.settings.aisleClear ? "aisle" : "address",
            load:
              snapshot.settings.route !== snapshot.unit.destination
                ? "route"
                : "quantity",
          }[step] ?? "flow");
  const hints = {
    cap: "Confira o sensor de tampa. Abasteça as tampas, desative a falta de tampa e use Repetir tampagem; a mesma garrafa volta à operação.",
    volume: `Compare o pedido com o volume programado: ${snapshot.unit.target} mL. Corrija o parâmetro e retome.`,
    depth:
      "Compare o desenho com a profundidade programada: os furos precisam ter 12 mm.",
    length: `Compare a medida pedida com a régua: ${snapshot.unit.targetLength} cm. Corrija o comprimento antes do corte.`,
    "saw-guard": "Feche a proteção da serra antes de executar o corte.",
    barcode:
      "Observe a etiqueta. Torne o código legível e repita a leitura do mesmo volume.",
    weight:
      "Confira a massa nominal, calibre a balança e zere o erro de medição.",
    destination: "Compare o destino da etiqueta com o destino da separação.",
    address:
      "Compare o endereço esperado na leitura com o endereço selecionado no estoque.",
    route: "Compare a rota da etiqueta com o veículo selecionado.",
    quantity: "Confira 1 volume por encomenda antes de liberar o manifesto.",
    aisle: "Libere o corredor de estoque sem remover o pedido em processo.",
    flow: "Verifique a operação anterior e o estado da unidade antes de liberar a próxima etapa.",
  };
  const labels = {
    cap: "Falta de tampa",
    volume: "Volume incorreto",
    depth: "Profundidade incorreta",
    length: "Comprimento incorreto",
    "saw-guard": "Proteção da serra aberta",
    barcode: "Etiqueta ilegível",
    weight: "Balança descalibrada",
    destination: "Destino incorreto",
    address: "Endereço incorreto",
    route: "Rota incorreta",
    quantity: "Quantidade incorreta",
    aisle: "Corredor obstruído",
    flow: "Etapa anterior pendente",
  };
  return {
    code,
    title: "A máquina bloqueou a liberação",
    cause: code,
    choices: [
      [code, labels[code]],
      ...Object.entries(labels)
        .filter(
          ([id]) =>
            id !== code &&
            (
              {
                beverages: ["cap", "volume", "barcode"],
                furniture: ["length", "depth", "saw-guard"],
                parcels: ["barcode", "weight", "destination"],
              }[environment] ?? []
            ).includes(id),
        )
        .slice(0, 2),
    ],
    hint: hints[code],
  };
}
