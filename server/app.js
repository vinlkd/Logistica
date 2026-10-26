import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  hashPassword,
  verifyPassword,
  digest,
  token,
  signJwt,
  verifyJwt,
  validateEmail,
  validPassword,
  validateEnrollment,
} from "./security.js";
import { createMailer } from "./mailer.js";
import { createProgressRepository, progressError } from "./progress.js";
import { MAX_PROGRESS_BYTES } from "../src/progress-format.js";
import { validateSavedSimulation } from "./progress-validation.js";

const SESSION_SECONDS = 8 * 60 * 60;
const RESET_SECONDS = 20 * 60;
const COOKIE = "logistica_session";
const genericRecovery = {
  message:
    "Se houver uma conta com esse e-mail, você receberá as instruções para redefinir a senha.",
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  enrollment: user.enrollment ?? null,
});

async function readJson(req, limit = 8192) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? ""))
    throw fail(415, "Envie os dados em JSON.");
  if (Number(req.headers["content-length"]) > limit) {
    req.resume();
    throw fail(413, "Solicitação muito grande.");
  }
  let chunks = [],
    bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw fail(413, "Solicitação muito grande.");
    chunks.push(Buffer.from(chunk));
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail(400, "Dados inválidos.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw fail(400, "Dados inválidos.");
  return result;
}

export async function createAuthServer(options = {}) {
  const env = options.env ?? process.env;
  const production = env.NODE_ENV === "production";
  const dataDir = resolve(
    options.dataDir ?? env.AUTH_DATA_DIR ?? ".local/auth",
  );
  const now = () => Math.floor((options.clock?.() ?? Date.now()) / 1000);
  const appUrl = new URL(env.APP_ORIGIN ?? "http://127.0.0.1:5173");
  if (
    !["http:", "https:"].includes(appUrl.protocol) ||
    appUrl.username ||
    appUrl.password ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash
  )
    throw new Error("APP_ORIGIN deve conter somente a origem do aplicativo.");
  if (production && appUrl.protocol !== "https:")
    throw new Error("APP_ORIGIN precisa usar HTTPS em produção.");
  const origins = new Set([appUrl.origin]);
  if (!production && !env.APP_ORIGIN) {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }
  const secureCookie = production || appUrl.protocol === "https:";
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  let secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    if (production)
      throw new Error(
        "Configure AUTH_JWT_SECRET com pelo menos 32 bytes aleatórios em produção.",
      );
    const secretPath = join(dataDir, "jwt-secret");
    try {
      secret = (await readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const generated = token() + token();
      try {
        await writeFile(secretPath, generated, { flag: "wx", mode: 0o600 });
        secret = generated;
      } catch (writeError) {
        if (writeError.code !== "EEXIST") throw writeError;
        secret = (await readFile(secretPath, "utf8")).trim();
      }
    }
  }
  if (Buffer.byteLength(secret) < 32)
    throw new Error("AUTH_JWT_SECRET precisa ter pelo menos 32 bytes.");
  const mailer =
    options.mailer ?? (await createMailer({ env, dataDir, production }));
  const dbPath = join(dataDir, "auth.sqlite");
  const db = new DatabaseSync(dbPath);
  await chmod(dbPath, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, enrollment TEXT,
      password_hash TEXT NOT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
  `);
  // Additive migration: legacy accounts keep NULL; no fabricated student identifiers.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db
        .prepare("PRAGMA table_info(users)")
        .all()
        .some((column) => column.name === "enrollment")
    ) {
      db.exec("ALTER TABLE users ADD COLUMN enrollment TEXT");
    }
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_enrollment_unique ON users(enrollment COLLATE NOCASE) WHERE enrollment IS NOT NULL",
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  // Perform the same expensive password work for a nonexistent account.
  const dummyHash = await hashPassword(token());
  const limits = new Map();
  let nextCleanup = 0;
  function cleanup() {
    const time = now();
    if (time < nextCleanup) return;
    nextCleanup = time + 60;
    for (const [key, entry] of limits)
      if (entry.until <= time) limits.delete(key);
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(time);
    db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(time);
  }
  function rateLimit(key, max, seconds) {
    const time = now();
    let entry = limits.get(key);
    if (!entry || entry.until <= time) {
      entry = { count: 0, until: time + seconds };
      limits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max)
      throw Object.assign(
        fail(
          429,
          "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        ),
        { retry: Math.max(1, entry.until - time) },
      );
  }
  function cookie(value, seconds = SESSION_SECONDS) {
    return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${seconds}${secureCookie ? "; Secure" : ""}`;
  }
  function readCookie(req) {
    const matches = String(req.headers.cookie ?? "")
      .split(";")
      .map((piece) => piece.trim())
      .filter((piece) => piece.startsWith(`${COOKIE}=`));
    return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : "";
  }
  async function sessionUser(req) {
    const claims = await verifyJwt(readCookie(req), secret, now());
    if (!claims) return null;
    const user = db
      .prepare(
        `SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=? AND u.session_version=? AND s.token_hash=? AND s.expires_at>?`,
      )
      .get(claims.sub, claims.ver, digest(claims.jti), now());
    return user ? { user, claims } : null;
  }
  async function issueSession(res, user) {
    const issued = now(),
      jti = token();
    const value = await signJwt(
      {
        iss: "logistica-auth",
        aud: "logistica",
        sub: user.id,
        jti,
        ver: user.session_version,
        iat: issued,
        exp: issued + SESSION_SECONDS,
      },
      secret,
    );
    // A password reset may complete while the JWT library is signing.
    const current = db
      .prepare("SELECT session_version FROM users WHERE id=?")
      .get(user.id);
    if (!current || current.session_version !== user.session_version)
      throw fail(401, "Sua senha foi alterada. Entre novamente.");
    db.prepare(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
    ).run(digest(jti), user.id, issued + SESSION_SECONDS);
    res.setHeader("Set-Cookie", cookie(value));
  }
  function send(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(body));
  }
  const progress = createProgressRepository({ db, clock: () => options.clock?.() ?? Date.now(), validateSimulation: validateSavedSimulation });
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    try {
      cleanup();
      const url = new URL(req.url, "http://local.invalid");
      const path = url.pathname;
      if (path === "/api/progress" || path.startsWith("/api/progress/")) {
        const peer = req.socket.remoteAddress ?? "unknown";
        if (req.headers["sec-fetch-site"] === "cross-site" || req.headers.origin && !origins.has(req.headers.origin)) throw progressError(403, "FORBIDDEN_ORIGIN", "Origem da solicitação não permitida.");
        if (!["GET", "PUT"].includes(req.method)) return send(res, 405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
        if (req.method === "PUT" && (!origins.has(req.headers.origin) || req.headers["x-requested-with"] !== "Logistica")) throw progressError(403, "FORBIDDEN_ORIGIN", "Solicitação não autorizada. Recarregue a página.");
        const session = await sessionUser(req);
        if (!session) { rateLimit(`progress-unauthenticated:${peer}`, 60, 60); throw progressError(401, "UNAUTHENTICATED", "Entre novamente para salvar ou retomar seu progresso."); }
        const owner = session.user.id;
        rateLimit(`progress-user:${owner}`, 120, 60);
        if (path === "/api/progress") {
          if (req.method !== "GET") return send(res, 405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
          return send(res, 200, { owner, ...progress.list(owner) });
        }
        const environment = path.slice("/api/progress/".length);
        if (req.method === "GET") return send(res, 200, { owner, ...progress.load(owner, environment) });
        const body = await readJson(req, MAX_PROGRESS_BYTES + 2048);
        return send(res, 200, { owner, ...progress.save(owner, environment, body) });
      }
      if (!path.startsWith("/api/auth/"))
        return send(res, 404, { error: "Rota não encontrada." });
      // Forwarded IPs are intentionally ignored; only the trusted local peer is used.
      const peer = req.socket.remoteAddress ?? "unknown";
      rateLimit(`all:${peer}`, 180, 60);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw fail(403, "Origem da solicitação não permitida.");
      if (req.headers.origin && !origins.has(req.headers.origin))
        throw fail(403, "Origem da solicitação não permitida.");
      if (req.method === "GET" && path === "/api/auth/me") {
        const session = await sessionUser(req);
        if (!session) {
          res.setHeader("Set-Cookie", cookie("", 0));
          throw fail(401, "Entre para acessar o simulador.");
        }
        return send(res, 200, { user: publicUser(session.user) });
      }
      const routes = [
        "register",
        "login",
        "logout",
        "forgot-password",
        "reset-password",
      ];
      if (
        req.method !== "POST" ||
        !routes.some((route) => path === `/api/auth/${route}`)
      )
        return send(res, 404, { error: "Rota não encontrada." });
      if (
        !origins.has(req.headers.origin) ||
        req.headers["x-requested-with"] !== "Logistica"
      )
        throw fail(403, "Solicitação não autorizada. Recarregue a página.");
      rateLimit(`post:${peer}`, 45, 60);
      if (path.endsWith("/logout")) {
        const session = await sessionUser(req);
        if (session)
          db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
            digest(session.claims.jti),
          );
        res.setHeader("Set-Cookie", cookie("", 0));
        return send(res, 200, { message: "Você saiu da conta." });
      }
      const body = await readJson(req);
      const email = validateEmail(body.email);
      if (path.endsWith("/register")) {
        rateLimit(`register:${peer}`, 5, 15 * 60);
        const name =
          typeof body.name === "string"
            ? body.name.trim().replace(/\s+/g, " ")
            : "";
        if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name))
          throw fail(400, "Informe um nome com até 80 caracteres.");
        if (!email) throw fail(400, "Informe um e-mail válido.");
        if (!validPassword(body.password))
          throw fail(400, "Use uma senha de 8 a 128 caracteres.");
        const enrollment = validateEnrollment(body.enrollment);
        if (!enrollment)
          throw fail(
            400,
            "Informe a matr\u00edcula com 3 a 30 caracteres: letras, n\u00fameros ou h\u00edfen.",
          );
        const passwordHash = await hashPassword(body.password);
        const user = {
          id: randomUUID(),
          name,
          email,
          enrollment,
          session_version: 0,
        };
        try {
          db.prepare(
            "INSERT INTO users(id,name,email,enrollment,password_hash,created_at) VALUES(?,?,?,?,?,?)",
          ).run(user.id, name, email, enrollment, passwordHash, now());
        } catch (error) {
          if (error.code?.startsWith("ERR_SQLITE")) {
            if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
              throw fail(
                409,
                "N\u00e3o foi poss\u00edvel cadastrar este e-mail. Tente entrar ou recuperar sua senha.",
              );
            if (
              db
                .prepare(
                  "SELECT id FROM users WHERE enrollment=? COLLATE NOCASE",
                )
                .get(enrollment)
            )
              throw fail(
                409,
                "N\u00e3o foi poss\u00edvel cadastrar esta matr\u00edcula. Confira os dados ou entre na conta existente.",
              );
          }
          throw error;
        }
        await issueSession(res, user);
        return send(res, 201, { user: publicUser(user) });
      }
      if (path.endsWith("/login")) {
        rateLimit(`login-ip:${peer}`, 20, 15 * 60);
        if (email) rateLimit(`login-email:${digest(email)}`, 10, 15 * 60);
        if (
          !email ||
          typeof body.password !== "string" ||
          body.password.length > 128
        )
          throw fail(401, "E-mail ou senha incorretos.");
        const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        const valid = await verifyPassword(
          body.password,
          user?.password_hash ?? dummyHash,
        );
        if (!user || !valid) throw fail(401, "E-mail ou senha incorretos.");
        // Guard against a concurrent reset that finishes during password verification.
        const current = db
          .prepare("SELECT session_version FROM users WHERE id=?")
          .get(user.id);
        if (!current || current.session_version !== user.session_version)
          throw fail(401, "E-mail ou senha incorretos.");
        await issueSession(res, user);
        return send(res, 200, { user: publicUser(user) });
      }
      if (path.endsWith("/forgot-password")) {
        rateLimit(`forgot:${peer}`, 10, 15 * 60);
        // Same public response for unknown, malformed and recently requested addresses.
        const started = Date.now();
        const user = email
          ? db.prepare("SELECT id FROM users WHERE email=?").get(email)
          : null;
        if (user) {
          const current = db
            .prepare("SELECT expires_at FROM password_resets WHERE user_id=?")
            .get(user.id);
          if (!current || current.expires_at <= now() + RESET_SECONDS - 60) {
            const raw = token(),
              hashed = digest(raw),
              expires = now() + RESET_SECONDS;
            db.prepare(
              `INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at`,
            ).run(hashed, user.id, expires);
            const link = new URL("/", appUrl);
            link.searchParams.set("resetToken", raw);
            try {
              await mailer.send({ email, url: link.href });
            } catch {
              db.prepare("DELETE FROM password_resets WHERE token_hash=?").run(
                hashed,
              );
              // Do not log the message, email address, URL or token.
              (options.logger ?? console).error(
                "Falha no envio da recuperação de senha. Verifique a configuração de e-mail.",
              );
            }
          }
        }
        await delay(Math.max(0, 350 - (Date.now() - started)));
        return send(res, 200, genericRecovery);
      }
      if (path.endsWith("/reset-password")) {
        rateLimit(`reset:${peer}`, 12, 15 * 60);
        if (!validPassword(body.password))
          throw fail(400, "Use uma senha de 8 a 128 caracteres.");
        if (
          typeof body.token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.token)
        )
          throw fail(
            400,
            "Link inválido ou expirado. Solicite uma nova recuperação.",
          );
        const hashed = digest(body.token);
        const valid = db
          .prepare(
            "SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?",
          )
          .get(hashed, now());
        if (!valid)
          throw fail(
            400,
            "Link inválido ou expirado. Solicite uma nova recuperação.",
          );
        const passwordHash = await hashPassword(body.password);
        db.exec("BEGIN IMMEDIATE");
        try {
          const reset = db
            .prepare(
              "DELETE FROM password_resets WHERE token_hash=? AND expires_at>? RETURNING user_id",
            )
            .get(hashed, now());
          if (!reset)
            throw fail(
              400,
              "Link inválido ou expirado. Solicite uma nova recuperação.",
            );
          db.prepare(
            "UPDATE users SET password_hash=?, session_version=session_version+1 WHERE id=?",
          ).run(passwordHash, reset.user_id);
          db.prepare("DELETE FROM sessions WHERE user_id=?").run(reset.user_id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        res.setHeader("Set-Cookie", cookie("", 0));
        return send(res, 200, {
          message: "Senha alterada. Entre novamente com sua nova senha.",
        });
      }
    } catch (error) {
      if (res.writableEnded || res.destroyed) return;
      if (error.retry) res.setHeader("Retry-After", String(error.retry));
      const status = error.status ?? 500;
      if (status === 500)
        (options.logger ?? console).error(
          "Falha interna no serviço de autenticação.",
        );
      send(res, status, {
        ...(error.publicCode ? { code: error.publicCode } : {}),
        error:
          status === 500
            ? "Não foi possível concluir. Tente novamente."
            : error.message,
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  return {
    server,
    dataDir,
    async close() {
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      mailer.close?.();
      db.close();
    },
  };
}
