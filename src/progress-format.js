import {createWarehouseInventory} from './simulator/inventory-orders.js';
export const PROGRESS_VERSION = 1;
export const MAX_PROGRESS_BYTES = 512 * 1024;
export const PROGRESS_ENVIRONMENTS = [
  "cookware",
  "beverages",
  "parcels",
  "furniture",
];
const products = {
  cookware: ["saucepan", "casserole", "frying-pan"],
  beverages: ["juice", "water"],
  parcels: ["norte", "sul", "serra"],
  furniture: ["desk", "side-table"],
};
const stages = {
  cookware: [
    "receiving",
    "raw",
    "production",
    "finishing",
    "quality",
    "packing",
    "finished",
    "shipping",
  ],
  beverages: [
    "receive",
    "wash",
    "fill",
    "cap",
    "label",
    "pack",
    "seal",
    "ship",
  ],
  parcels: ["unload", "scan", "weigh", "sort", "store", "load"],
  furniture: ["receive", "cut", "drill", "assemble", "inspect", "pack"],
};
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const invalid = (message = "Progresso inválido.") =>
  Object.assign(new Error(message), {
    status: 422,
    publicCode: "INVALID_PROGRESS",
  });
const requireValue = (condition, message) => {
  if (!condition) throw invalid(message);
};
const integer = (v, max = 1000000) =>
  Number.isSafeInteger(v) && v >= 0 && v <= max;
const number = (v, max = 31536000) => Number.isFinite(v) && v >= 0 && v <= max;
const identifier = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(s);
function keys(value, allowed) {
  requireValue(
    object(value) && Object.keys(value).every((k) => allowed.includes(k)),
  );
}
function boundedJson(value) {
  let count = 0;
  const forbidden =
    /^(?:__proto__|prototype|constructor|password|password_hash|cookie|authorization|credentials|accessToken|refreshToken|jwt|email|enrollment|userId)$/i;
  function visit(v, depth) {
    requireValue(++count <= 100000 && depth <= 24, "Progresso muito complexo.");
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") {
      requireValue(Number.isFinite(v) && Math.abs(v) <= 1e12);
      return;
    }
    if (typeof v === "string") {
      requireValue(v.length <= 4000);
      return;
    }
    requireValue(typeof v === "object");
    if (Array.isArray(v)) {
      requireValue(v.length <= 2000);
      for (const item of v) visit(item, depth + 1);
    } else {
      requireValue(
        Object.getPrototypeOf(v) === Object.prototype ||
          Object.getPrototypeOf(v) === null,
      );
      const entries = Object.entries(v);
      requireValue(entries.length <= 1000);
      for (const [k, item] of entries) {
        requireValue(
          k.length <= 96 && !forbidden.test(k),
          "O progresso não pode conter dados da conta ou credenciais.",
        );
        visit(item, depth + 1);
      }
    }
  }
  visit(value, 0);
}
function faultList(value) {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(identifier) &&
    new Set(value).size === value.length
  );
}
export function validateProgressState(environment, value) {
  requireValue(
    PROGRESS_ENVIRONMENTS.includes(environment),
    "Ambiente desconhecido.",
  );
  keys(value, ["version", "simulation", "mission", "view", "results"]);
  requireValue(
    value.version === PROGRESS_VERSION,
    "Versão de progresso incompatível.",
  );
  boundedJson(value);
  requireValue(
    object(value.simulation) && Object.keys(value.simulation).length > 0,
    "Falta o estado da simulação.",
  );
  const inventorySource=value.simulation.practice?value.simulation.lineCheckpoint:value.simulation;
  if(inventorySource?.onDemand===true){
    const inventory=inventorySource.inventory;
    let valid=false;
    try{valid=createWarehouseInventory({environment,accountKey:inventory?.accountKey,capacity:inventory?.capacity,slots:inventory?.slots,products:products[environment]}).importState(inventory);}catch{}
    requireValue(valid,'Estoque ou pedidos inválidos.');
  }
  keys(value.view, ["selected", "scope", "camera"]);
  requireValue(
    stages[environment].includes(value.view.selected) &&
      ["bench", "line"].includes(value.view.scope),
    "Ambiente ou bancada inválidos.",
  );
  if (value.view.camera !== undefined)
    requireValue(
      ["iso", "front", "top", "overview"].includes(value.view.camera),
    );
  if (value.mission !== null && value.mission !== undefined) {
    const m = value.mission;
    keys(m, ["id", "version", "state", "status"]);
    requireValue(
      identifier(m.id) && m.id.startsWith(`${environment}-`) && m.version === 1,
    );
    requireValue(["active", "completed", "interrupted"].includes(m.status));
    const s = m.state;
    keys(s, [
      "started",
      "completed",
      "product",
      "target",
      "checkpoints",
      "done",
      "elapsed",
      "faultsSeen",
      "faultsResolved",
    ]);
    requireValue(
      typeof s.started === "boolean" &&
        typeof s.completed === "boolean" &&
        products[environment].includes(s.product),
    );
    requireValue(
      integer(s.target, environment === "beverages" ? 108 : 50) &&
        s.target > 0 &&
        integer(s.done, s.target) &&
        number(s.elapsed),
    );
    requireValue(
      object(s.checkpoints) &&
        Object.entries(s.checkpoints).every(
          ([key, n]) =>
            stages[environment].includes(key) && integer(n, s.target),
        ),
    );
    requireValue(
      faultList(s.faultsSeen) &&
        faultList(s.faultsResolved) &&
        s.faultsResolved.every((f) => s.faultsSeen.includes(f)),
    );
    requireValue(!s.completed || (s.started && s.done === s.target));
    requireValue((m.status === "completed") === s.completed);
    requireValue(
      s.started ||
        (s.done === 0 &&
          s.elapsed === 0 &&
          Object.values(s.checkpoints).every((n) => n === 0)),
    );
  }
  if (value.results !== undefined) {
    requireValue(Array.isArray(value.results) && value.results.length <= 100);
    for (const r of value.results) {
      keys(r, [
        "missionId",
        "status",
        "completedAt",
        "quantity",
        "product",
        "elapsed",
        "faultsResolved",
      ]);
      requireValue(
        identifier(r.missionId) &&
          r.missionId.startsWith(`${environment}-`) &&
          r.status === "completed",
      );
      requireValue(
        typeof r.completedAt === "string" &&
          /^\d{4}-\d{2}-\d{2}T/.test(r.completedAt) &&
          Number.isFinite(Date.parse(r.completedAt)),
      );
      requireValue(
        integer(r.quantity, environment === "beverages" ? 108 : 50) &&
          r.quantity > 0 &&
          products[environment].includes(r.product) &&
          number(r.elapsed) &&
          integer(r.faultsResolved, 100),
      );
    }
  }
  const serialized = JSON.stringify(value);
  requireValue(
    new TextEncoder().encode(serialized).byteLength <= MAX_PROGRESS_BYTES,
    "Progresso muito grande.",
  );
  return JSON.parse(serialized);
}
export function simulationHasProgress(value) {
  if (!object(value)) return false;
  for (const [key, v] of Object.entries(value)) {
    if (
      ["time", "elapsed", "done", "processing", "progress"].includes(key) &&
      typeof v === "number" &&
      v > 0
    )
      return true;
    if (
      key === "phase" &&
      [
        "moving",
        "operating",
        "outgoing",
        "feeding",
        "processing",
        "unloading",
        "complete",
      ].includes(v)
    )
      return true;
    if (key === "completedUnits" && Array.isArray(v) && v.length) return true;
    if ((key==='boxes'||key==='orders')&&Array.isArray(v)&&v.length)return true;
    if (
      typeof v === "object" &&
      v !== null &&
      (Array.isArray(v)
        ? v.some(simulationHasProgress)
        : simulationHasProgress(v))
    )
      return true;
  }
  return false;
}
export function wouldResetProgress(previous, next) {
  if (
    simulationHasProgress(previous.simulation) &&
    !simulationHasProgress(next.simulation)
  )
    return true;
  const old = previous.mission?.state,
    fresh = next.mission?.state;
  if (
    old?.started &&
    (!fresh?.started || previous.mission.id !== next.mission?.id)
  )
    return true;
  if (
    old &&
    fresh &&
    (fresh.done < old.done ||
      Object.entries(old.checkpoints).some(
        ([key, n]) => (fresh.checkpoints[key] ?? 0) < n,
      ))
  )
    return true;
  return (previous.results?.length ?? 0) > (next.results?.length ?? 0);
}
