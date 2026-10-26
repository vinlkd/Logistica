import { PROGRESS_ENVIRONMENTS, validateProgressState, wouldResetProgress } from "./progress-format.js";

export class ProgressError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = "ProgressError"; this.code = code; this.status = status; }
}
const copy = (v) => v === null || v === undefined ? v : structuredClone(v);
const error = (code, message, status) => new ProgressError(code, message, status);
const demoPrefix = "logistica:demo-progress:v1:";

export function createProgressStore(environment, options = {}) {
  if (!PROGRESS_ENVIRONMENTS.includes(environment)) throw error("UNKNOWN_ENVIRONMENT", "Ambiente desconhecido.");
  const demo = import.meta.env?.MODE === "pages" || options.demo === true;
  const fetcher = options.fetch ?? globalThis.fetch;
  const storage = () => options.storage ?? globalThis.localStorage;
  const key = `${demoPrefix}${environment}`;
  let owner = null, revision = 0, loaded = false, compatible = true, closed = false, blocked = null, metadata = null;
  let pending = Promise.resolve(null), loading = null;
  const open = () => { if (closed) throw error("STORE_CLOSED", "O salvamento deste ambiente já foi encerrado."); };
  async function request(method, body) {
    let response;
    try {
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      response = await fetcher(`/api/progress/${environment}`, { method, credentials: "include", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Requested-With": "Logistica" }, body: serialized, ...(serialized === undefined ? {} : { keepalive: new TextEncoder().encode(serialized).byteLength < 60000 }) });
    } catch { throw error("NETWORK_ERROR", "Não foi possível salvar ou carregar. Seu progresso anterior foi preservado no servidor."); }
    let result; try { result = await response.json(); } catch { throw error("INVALID_RESPONSE", "O servidor retornou uma resposta inválida."); }
    if (!response.ok) throw error(result.code ?? (response.status === 401 ? "UNAUTHENTICATED" : "SAVE_FAILED"), result.error ?? "Não foi possível salvar o progresso.", response.status);
    return result;
  }
  function readDemo() {
    try {
      const raw = storage().getItem(key);
      if (raw === null) return { owner: "pages-demo", revision: 0, state: null, compatible: true, metadata: null };
      let record; try { record = JSON.parse(raw); } catch { return { owner: "pages-demo", revision: 0, state: null, compatible: false, metadata: null }; }
      const validRevision = Number.isSafeInteger(record?.revision) && record.revision > 0 ? record.revision : 0;
      const validHeader = record?.version === 1 && record.environment === environment && record.owner === "pages-demo";
      let state = null; try { if (validHeader) state = validateProgressState(environment, record.state); } catch {}
      return { owner: "pages-demo", revision: validRevision, state, compatible: !!state, metadata: record?.metadata ?? null };
    } catch { throw error("STORAGE_UNAVAILABLE", "O navegador não permitiu acessar o progresso local da demonstração."); }
  }
  async function writeDemo(state, replace) {
    const commit = async () => {
      const current = readDemo();
      if (current.revision !== revision) throw error("PROGRESS_CONFLICT", "A demonstração foi atualizada em outra aba. Recarregue antes de continuar.", 409);
      if (!replace && !current.compatible) throw error("INCOMPATIBLE_PROGRESS", "O progresso antigo da demonstração foi preservado. Reinicie explicitamente para substituí-lo.", 409);
      if (!replace && current.state && wouldResetProgress(current.state, state)) throw error("PROGRESS_RESET_REQUIRED", "Há uma retomada salva. Confirme um novo início antes de substituí-la.", 409);
      const next = { environment, revision: revision + 1, version: 1, updatedAt: new Date().toISOString() };
      try { storage().setItem(key, JSON.stringify({ version: 1, owner: "pages-demo", environment, revision: next.revision, state, metadata: next })); }
      catch { throw error("STORAGE_UNAVAILABLE", "Não foi possível salvar a demonstração neste navegador. O progresso anterior foi preservado."); }
      return { owner: "pages-demo", revision: next.revision, metadata: next };
    };
    if (globalThis.navigator?.locks) return globalThis.navigator.locks.request(key, commit);
    return commit();
  }
  function bind(record) {
    if (typeof record?.owner !== "string" || !Number.isSafeInteger(record.revision) || record.revision < 0) throw error("INVALID_RESPONSE", "O servidor retornou um progresso inválido.");
    if (owner !== null && owner !== record.owner) throw error("ACCOUNT_CHANGED", "A conta conectada mudou. Reabra o ambiente para continuar.", 409);
    owner = record.owner; revision = record.revision; metadata = copy(record.metadata ?? null); compatible = record.compatible !== false; loaded = true;
  }
  return {
    async load() {
      open();
      if (loading) return loading;
      loading = (async () => {
        await pending.catch(() => {});
        const record = demo ? readDemo() : await request("GET"); bind(record); blocked = null;
        if (!compatible) throw error("INCOMPATIBLE_PROGRESS", record.error ?? "Há um progresso salvo em formato antigo ou incompatível. Ele foi preservado. Reinicie explicitamente para substituí-lo.", 409);
        if (record.state === null) return null;
        try { return validateProgressState(environment, record.state); }
        catch { compatible = false; throw error("INCOMPATIBLE_PROGRESS", "O progresso salvo é incompatível e foi preservado.", 409); }
      })();
      try { return copy(await loading); } finally { loading = null; }
    },
    async save(value, saveOptions = {}) {
      open();
      if (!loaded) throw error("NOT_LOADED", "Carregue o progresso salvo antes de iniciar um novo salvamento.");
      if (blocked) throw blocked;
      if (!compatible && saveOptions.replace !== true) throw error("INCOMPATIBLE_PROGRESS", "O progresso antigo foi preservado. Confirme um novo início antes de substituí-lo.", 409);
      const state = validateProgressState(environment, value), replace = saveOptions.replace === true;
      const write = async () => {
        if (blocked) throw blocked;
        try {
          const record = demo ? await writeDemo(state, replace) : await request("PUT", { owner, expectedRevision: revision, state, replace });
          if (record.owner !== owner || !Number.isSafeInteger(record.revision) || record.revision !== revision + 1) throw error("INVALID_RESPONSE", "Não foi possível confirmar o salvamento. Recarregue o progresso antes de continuar.");
          revision = record.revision; metadata = copy(record.metadata); compatible = true;
          return copy(metadata);
        } catch (e) {
          if (["PROGRESS_CONFLICT", "ACCOUNT_CHANGED", "UNAUTHENTICATED", "INVALID_RESPONSE"].includes(e.code)) blocked = e;
          if (e.code === "INCOMPATIBLE_PROGRESS") compatible = false;
          throw e;
        }
      };
      pending = pending.then(write, write);
      return pending;
    },
    async flush() { return copy(await pending); },
    async dispose() { try { return await pending; } finally { closed = true; } },
    getMetadata() { return { environment, mode: demo ? "demo-local" : "authenticated-server", loaded, compatible, revision, ...copy(metadata ?? {}) }; },
  };
}
