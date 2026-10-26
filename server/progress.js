import { PROGRESS_VERSION, PROGRESS_ENVIRONMENTS, validateProgressState, wouldResetProgress } from "../src/progress-format.js";

export const progressError = (status, code, message) => Object.assign(new Error(message), { status, publicCode: code });
export function createProgressRepository({ db, clock = Date.now, validateSimulation = () => {} }) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    environment TEXT NOT NULL, revision INTEGER NOT NULL, format_version INTEGER NOT NULL,
    state_json TEXT NOT NULL, updated_at INTEGER NOT NULL, sequence INTEGER NOT NULL,
    PRIMARY KEY(user_id, environment)
  );`);
  const get = db.prepare("SELECT * FROM student_progress WHERE user_id=? AND environment=?");
  const environmentValid = (environment) => { if (!PROGRESS_ENVIRONMENTS.includes(environment)) throw progressError(400, "UNKNOWN_ENVIRONMENT", "Ambiente desconhecido."); };
  const metadata = (row) => ({ environment: row.environment, revision: row.revision, version: row.format_version, updatedAt: new Date(row.updated_at).toISOString() });
  function decode(row) {
    if (!row) return { revision: 0, state: null, compatible: true, metadata: null };
    try {
      if (row.format_version !== PROGRESS_VERSION) throw new Error("Versão antiga");
      const state = validateProgressState(row.environment, JSON.parse(row.state_json));
      validateSimulation(row.environment, state.simulation, state);
      return { revision: row.revision, state, compatible: true, metadata: metadata(row) };
    } catch { return { revision: row.revision, state: null, compatible: false, code: "INCOMPATIBLE_PROGRESS", metadata: metadata(row), error: "Há um progresso salvo em formato antigo ou incompatível. Ele foi preservado. Reinicie explicitamente para substituí-lo." }; }
  }
  return {
    list(userId) { const rows = db.prepare("SELECT * FROM student_progress WHERE user_id=? ORDER BY sequence DESC").all(userId); return { latest: rows[0]?.environment ?? null, entries: rows.map((r) => ({ ...metadata(r), compatible: decode(r).compatible })) }; },
    load(userId, environment) { environmentValid(environment); return decode(get.get(userId, environment)); },
    save(userId, environment, request) {
      environmentValid(environment);
      if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).some((key) => !["owner", "expectedRevision", "state", "replace"].includes(key))) throw progressError(400, "INVALID_REQUEST", "Solicitação de progresso inválida.");
      if (request.owner !== userId) throw progressError(409, "ACCOUNT_CHANGED", "A conta conectada mudou. Recarregue a página antes de salvar.");
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || request.replace !== undefined && typeof request.replace !== "boolean") throw progressError(400, "INVALID_REVISION", "Carregue o progresso atual antes de salvar.");
      const state = validateProgressState(environment, request.state);
      try { validateSimulation(environment, state.simulation, state); }
      catch { throw progressError(422, "INVALID_SIMULATION", "O estado da simulação é inválido ou incompatível."); }
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = get.get(userId, environment), revision = row?.revision ?? 0;
        if (revision !== request.expectedRevision) throw progressError(409, "PROGRESS_CONFLICT", "O progresso foi atualizado em outra aba ou dispositivo. Recarregue antes de continuar.");
        if (row && !request.replace) {
          const previous = decode(row);
          if (!previous.compatible) throw progressError(409, "INCOMPATIBLE_PROGRESS", "O progresso antigo foi preservado. Escolha reiniciar explicitamente para substituí-lo.");
          if (wouldResetProgress(previous.state, state)) throw progressError(409, "PROGRESS_RESET_REQUIRED", "Há uma retomada salva. Confirme um novo início antes de substituí-la.");
        }
        const sequence = db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next FROM student_progress WHERE user_id=?").get(userId).next;
        const updatedAt = Math.floor(clock());
        db.prepare(`INSERT INTO student_progress(user_id,environment,revision,format_version,state_json,updated_at,sequence) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(user_id,environment) DO UPDATE SET revision=excluded.revision,format_version=excluded.format_version,state_json=excluded.state_json,updated_at=excluded.updated_at,sequence=excluded.sequence`)
          .run(userId, environment, revision + 1, PROGRESS_VERSION, JSON.stringify(state), updatedAt, sequence);
        db.exec("COMMIT");
        return { revision: revision + 1, metadata: { environment, revision: revision + 1, version: PROGRESS_VERSION, updatedAt: new Date(updatedAt).toISOString() } };
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
