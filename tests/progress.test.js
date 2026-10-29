import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createAuthServer } from "../server/app.js";
import { createProgressStore } from "../src/progress.js";
import {
  validateProgressState,
  MAX_PROGRESS_BYTES,
} from "../src/progress-format.js";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
import { validateSavedSimulation } from "../server/progress-validation.js";
import { createProgressRepository } from "../server/progress.js";
import {
  missionDefinition,
  missionEvidence,
} from "../src/simulator/missions.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { PARCELS } from "../src/simulator/industries/parcels.js";

const origin = "http://127.0.0.1:5173",
  password = "Senha de teste progresso 2026!";
const definitions = {
  beverages: BEVERAGES,
  furniture: FURNITURE,
  parcels: PARCELS,
};
function stateFor(environment, active = true) {
  const simulation =
    environment === "cookware"
      ? createSimulation(12, { scope: "bench", environment: "production" })
      : createIndustrySession(definitions[environment]);
  if (active) {
    simulation.start();
    for (let i = 0; i < 8; i++)
      environment === "cookware" ? simulation.step(0.1) : simulation.tick(0.1);
  }
  const snapshot = simulation.exportState();
  return {
    version: 1,
    simulation: snapshot,
    mission: null,
    view: {
      selected: snapshot.selected ?? snapshot.focus,
      scope: snapshot.scope,
      camera: "front",
    },
    results: [],
  };
}
function missionFor(environment) {
  const state = stateFor(environment),
    product = state.simulation.product;
  state.mission = {
    id: `${environment}-order-12`,
    version: 1,
    status: "active",
    state: {
      started: true,
      completed: false,
      product,
      target: 12,
      checkpoints: {},
      done: 0,
      elapsed: 0.8,
      faultsSeen: ["obstruction"],
      faultsResolved: [],
    },
  };
  return state;
}
async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), "logistica-progress-"));
  const config = {
    env: {},
    dataDir,
    mailer: { async send() {}, close() {} },
    logger: { error() {} },
  };
  let app;
  async function open() {
    app = await createAuthServer(config);
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
  }
  await open();
  const api = {
    dataDir,
    get url() {
      return `http://127.0.0.1:${app.server.address().port}`;
    },
    async request(
      path,
      { method = "GET", body, cookie, headers = {}, raw } = {},
    ) {
      const response = await fetch(`${api.url}${path}`, {
        method,
        headers: {
          Origin: origin,
          "X-Requested-With": "Logistica",
          ...(body !== undefined || raw !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body !== undefined || raw !== undefined
          ? { body: raw ?? JSON.stringify(body) }
          : {}),
      });
      const json = await response.json();
      return { status: response.status, body: json, headers: response.headers };
    },
    async register(n) {
      const r = await api.request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Aluno ${n}`,
          email: `progresso${n}@example.com`,
          enrollment: `000${n}01-SENAI`,
          password,
        },
      });
      assert.equal(r.status, 201);
      return {
        id: r.body.user.id,
        cookie: r.headers.get("set-cookie").split(";")[0],
        email: `progresso${n}@example.com`,
      };
    },
    async get(environment, account) {
      return api.request(`/api/progress/${environment}`, {
        cookie: account.cookie,
      });
    },
    async put(environment, account, state, overrides = {}) {
      const before = await api.get(environment, account);
      return api.request(`/api/progress/${environment}`, {
        method: "PUT",
        cookie: account.cookie,
        body: {
          owner: account.id,
          expectedRevision: before.body.revision,
          state,
          ...overrides,
        },
      });
    },
    async restart() {
      await app.close();
      await open();
    },
    fetchAs(accountRef) {
      return (path, options) =>
        fetch(`${api.url}${path}`, {
          ...options,
          headers: {
            ...options.headers,
            Origin: origin,
            Cookie: accountRef.current.cookie,
          },
        });
    },
  };
  t.after(async () => {
    await app.close();
    assert.equal(resolve(dirname(dataDir)), resolve(tmpdir()));
    assert.ok(basename(dataDir).startsWith("logistica-progress-"));
    await rm(dataDir, { recursive: true, force: true });
  });
  return api;
}

test("progresso autenticado: autorização, retomada, versões e concorrência", async (t) => {
  const f = await fixture(t),
    a = await f.register(1),
    b = await f.register(2);
  await t.test(
    "autenticação e origem são obrigatórias, sem seleção de outro aluno",
    async () => {
      assert.equal((await f.request("/api/progress/parcels")).status, 401);
      assert.equal(
        (
          await f.request("/api/progress/parcels", {
            cookie: a.cookie,
            headers: { Origin: "https://outro.example" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.request("/api/progress/parcels", {
            method: "PUT",
            cookie: a.cookie,
            body: {},
            headers: { "X-Requested-With": "errado" },
          })
        ).status,
        403,
      );
      assert.equal((await f.get("desconhecido", a)).status, 400);
      assert.equal(
        (
          await f.request("/api/progress/parcels", {
            method: "DELETE",
            cookie: a.cookie,
          })
        ).status,
        405,
      );
    },
  );
  await t.test(
    "salva os quatro ambientes e mantém as contas isoladas",
    async () => {
      for (const environment of [
        "cookware",
        "beverages",
        "parcels",
        "furniture",
      ]) {
        const state = missionFor(environment),
          save = await f.put(environment, a, state);
        assert.equal(save.status, 200, JSON.stringify(save.body));
        assert.equal(save.body.revision, 1);
        const restored = await f.get(environment, a);
        assert.deepEqual(restored.body.state, state);
        assert.equal(restored.headers.get("cache-control"), "no-store");
        const other = await f.get(environment, b);
        assert.equal(other.body.state, null);
        assert.equal(other.body.revision, 0);
        assert.equal(other.body.owner, b.id);
        const forged = await f.request(`/api/progress/${environment}`, {
          method: "PUT",
          cookie: b.cookie,
          body: { owner: a.id, expectedRevision: 0, state },
        });
        assert.equal(forged.status, 409);
        assert.equal(forged.body.code, "ACCOUNT_CHANGED");
      }
      const list = await f.request("/api/progress", { cookie: a.cookie });
      assert.equal(list.body.latest, "furniture");
      assert.equal(list.body.entries.length, 4);
      const listB = await f.request("/api/progress", { cookie: b.cookie });
      assert.deepEqual(listB.body.entries, []);
    },
  );
  await t.test("reiniciar o servidor mantém estados e sessões", async () => {
    const before = await f.get("parcels", a);
    await f.restart();
    const after = await f.get("parcels", a);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body, before.body);
  });
  await t.test(
    "retomada preserva peças, filas e emergência, importando em pausa",
    async () => {
      const simulation = createSimulation(12, { scope: "line" });
      simulation.start();
      simulation.step(0.2);
      simulation.emergencyStop();
      const state = {
        version: 1,
        simulation: simulation.exportState(),
        mission: null,
        view: {
          selected: simulation.snapshot.focus ?? "production",
          scope: "line",
        },
        results: [],
      };
      state.view.selected = state.simulation.focus;
      const save = await f.put("cookware", a, state, { replace: true });
      assert.equal(save.status, 200, JSON.stringify(save.body));
      const saved = (await f.get("cookware", a)).body.state,
        restored = createSimulation();
      assert.equal(restored.importState(saved.simulation), true);
      assert.equal(restored.snapshot.running, false);
      assert.equal(restored.snapshot.emergency, true);
      assert.deepEqual(
        restored.exportState().cells,
        saved.simulation.cells.map((c) => ({
          ...c,
          permit: null,
          commands: { motor: false, work: false, transfer: false },
        })),
      );
    },
  );
  await t.test(
    "estado inválido, peças duplicadas e versão incorreta não substituem o salvo",
    async () => {
      const before = await f.get("parcels", a),
        invalid = stateFor("parcels");
      invalid.simulation.engine.x = 100000;
      assert.equal((await f.put("parcels", a, invalid)).status, 422);
      const wrong = stateFor("parcels");
      wrong.version = 2;
      assert.equal((await f.put("parcels", a, wrong)).status, 422);
      const secret = stateFor("parcels");
      secret.password = "não salvar";
      assert.equal((await f.put("parcels", a, secret)).status, 422);
      const mismatch = stateFor("parcels");
      mismatch.view.selected = "load";
      assert.equal((await f.put("parcels", a, mismatch)).status, 422);
      const fake = missionFor("parcels");
      fake.mission.status = "completed";
      fake.mission.state.completed = true;
      fake.mission.state.done = 12;
      fake.mission.state.checkpoints = Object.fromEntries(
        PARCELS.steps.map((step) => [step.id, 12]),
      );
      assert.equal((await f.put("parcels", a, fake)).status, 422);
      const duplicate = stateFor("cookware");
      const cell = duplicate.simulation.cells.find((c) => c.stock.length);
      cell.stock.push(structuredClone(cell.stock[0]));
      assert.equal((await f.put("cookware", a, duplicate)).status, 422);
      assert.deepEqual((await f.get("parcels", a)).body, before.body);
    },
  );
  await t.test(
    "não substitui uma retomada por estado vazio sem novo início explícito",
    async () => {
      const before = await f.get("parcels", a),
        empty = stateFor("parcels", false);
      const denied = await f.put("parcels", a, empty);
      assert.equal(denied.status, 409);
      assert.equal(denied.body.code, "PROGRESS_RESET_REQUIRED");
      assert.deepEqual((await f.get("parcels", a)).body, before.body);
      assert.equal(
        (await f.put("parcels", a, empty, { replace: true })).status,
        200,
      );
    },
  );
  await t.test(
    "duas abas com a mesma revisão não perdem atualizações",
    async () => {
      const current = await f.get("beverages", a),
        request = {
          owner: a.id,
          expectedRevision: current.body.revision,
          state: current.body.state,
        };
      const replies = await Promise.all([
        f.request("/api/progress/beverages", {
          method: "PUT",
          cookie: a.cookie,
          body: request,
        }),
        f.request("/api/progress/beverages", {
          method: "PUT",
          cookie: a.cookie,
          body: request,
        }),
      ]);
      assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        replies.find((r) => r.status === 409).body.code,
        "PROGRESS_CONFLICT",
      );
    },
  );
  await t.test(
    "progresso antigo é preservado até reinício confirmado",
    async () => {
      const db = new DatabaseSync(join(f.dataDir, "auth.sqlite")),
        legacy = JSON.stringify({ version: 2, retained: "progresso antigo" });
      db.prepare(
        "UPDATE student_progress SET format_version=2,state_json=? WHERE user_id=? AND environment='furniture'",
      ).run(legacy, a.id);
      db.close();
      const record = await f.get("furniture", a);
      assert.equal(record.body.compatible, false);
      assert.equal(record.body.state, null);
      const store = createProgressStore("furniture", {
        fetch: f.fetchAs({ current: a }),
      });
      await assert.rejects(
        store.load(),
        (e) => e.code === "INCOMPATIBLE_PROGRESS",
      );
      await assert.rejects(
        store.save(stateFor("furniture")),
        (e) => e.code === "INCOMPATIBLE_PROGRESS",
      );
      const denied = await f.put("furniture", a, stateFor("furniture"));
      assert.equal(denied.body.code, "INCOMPATIBLE_PROGRESS");
      const check = new DatabaseSync(join(f.dataDir, "auth.sqlite"));
      assert.equal(
        check
          .prepare(
            "SELECT state_json FROM student_progress WHERE user_id=? AND environment='furniture'",
          )
          .get(a.id).state_json,
        legacy,
      );
      check.close();
      const replaced = await store.save(stateFor("furniture", false), {
        replace: true,
      });
      assert.equal(replaced.revision, record.body.revision + 1);
    },
  );
  await t.test(
    "limites de tamanho e tipo de conteúdo são aplicados",
    async () => {
      assert.equal(
        (
          await f.request("/api/progress/parcels", {
            method: "PUT",
            cookie: a.cookie,
            raw: "{}",
            headers: { "Content-Type": "text/plain" },
          })
        ).status,
        415,
      );
      assert.equal(
        (
          await f.request("/api/progress/parcels", {
            method: "PUT",
            cookie: a.cookie,
            raw: "x".repeat(MAX_PROGRESS_BYTES + 4096),
          })
        ).status,
        413,
      );
    },
  );
  await t.test(
    "cliente exige carregar, serializa revisões e detecta troca de conta",
    async () => {
      const account = { current: a },
        trap = {
          getItem() {
            assert.fail("Conta real não deve ler localStorage");
          },
          setItem() {
            assert.fail("Conta real não deve escrever localStorage");
          },
        };
      const store = createProgressStore("parcels", {
        fetch: f.fetchAs(account),
        storage: trap,
      });
      await assert.rejects(
        store.save(stateFor("parcels")),
        (e) => e.code === "NOT_LOADED",
      );
      await store.load();
      const start = store.getMetadata().revision;
      await Promise.all([
        store.save(stateFor("parcels")),
        store.save(stateFor("parcels")),
      ]);
      await store.flush();
      assert.equal(store.getMetadata().revision, start + 2);
      account.current = b;
      await assert.rejects(
        store.save(stateFor("parcels")),
        (e) => e.code === "ACCOUNT_CHANGED",
      );
      assert.equal((await f.get("parcels", b)).body.state, null);
    },
  );
  await t.test(
    "sair revoga acesso e entrar novamente recupera a própria retomada",
    async () => {
      const before = await f.get("parcels", a);
      assert.equal(
        (
          await f.request("/api/auth/logout", {
            method: "POST",
            cookie: a.cookie,
            body: {},
          })
        ).status,
        200,
      );
      assert.equal((await f.get("parcels", a)).status, 401);
      const login = await f.request("/api/auth/login", {
        method: "POST",
        body: { email: a.email, password },
      });
      assert.equal(login.status, 200);
      const after = await f.get("parcels", {
        cookie: login.headers.get("set-cookie").split(";")[0],
      });
      assert.deepEqual(after.body.state, before.body.state);
    },
  );
});

test("demonstração: armazenamento local separado, conflitos e formato antigo", async () => {
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    };
  const options = {
    demo: true,
    storage,
    fetch() {
      assert.fail("Demonstração não pode enviar progresso ao servidor");
    },
  };
  const a = createProgressStore("parcels", options),
    b = createProgressStore("parcels", options);
  assert.equal(await a.load(), null);
  assert.equal(await b.load(), null);
  await a.save(stateFor("parcels"));
  assert.deepEqual([...map.keys()], ["logistica:demo-progress:v1:parcels"]);
  await assert.rejects(
    b.save(stateFor("parcels")),
    (e) => e.code === "PROGRESS_CONFLICT",
  );
  const restored = createProgressStore("parcels", options);
  assert.deepEqual(await restored.load(), stateFor("parcels"));
  await assert.rejects(
    restored.save(stateFor("parcels", false)),
    (e) => e.code === "PROGRESS_RESET_REQUIRED",
  );
  await restored.save(stateFor("parcels", false), { replace: true });
  await restored.dispose();
  await assert.rejects(
    restored.save(stateFor("parcels")),
    (e) => e.code === "STORE_CLOSED",
  );
  map.set(
    "logistica:demo-progress:v1:furniture",
    '{"version":0,"revision":4,"retained":true}',
  );
  const old = createProgressStore("furniture", options);
  await assert.rejects(old.load(), (e) => e.code === "INCOMPATIBLE_PROGRESS");
  assert.equal(
    map.get("logistica:demo-progress:v1:furniture"),
    '{"version":0,"revision":4,"retained":true}',
  );
  await old.save(stateFor("furniture", false), { replace: true });
  assert.equal(old.getMetadata().revision, 5);
});

test("formato: missão/resultados e dados da conta não podem ser contraditórios", () => {
  const good = missionFor("parcels");
  assert.deepEqual(validateProgressState("parcels", good), good);
  const bad = structuredClone(good);
  bad.mission.state.faultsResolved = ["never-seen"];
  assert.throws(() => validateProgressState("parcels", bad));
  bad.mission.state.faultsResolved = [];
  bad.mission.state.done = 13;
  assert.throws(() => validateProgressState("parcels", bad));
  const secret = structuredClone(good);
  secret.simulation.credentials = "proibido";
  assert.throws(() => validateProgressState("parcels", secret));
});
test("retomada: navegar na linha de panelas e preservar uma missão interrompida são válidos", () => {
  const simulation = createSimulation(12, {
    scope: "line",
    environment: "receiving",
  });
  simulation.start();
  simulation.step(0.1);
  const state = {
    version: 1,
    simulation: simulation.exportState(),
    mission: null,
    view: { selected: "shipping", scope: "line", camera: "overview" },
    results: [],
  };
  validateProgressState("cookware", state);
  assert.doesNotThrow(() =>
    validateSavedSimulation("cookware", state.simulation, state),
  );
  const interrupted = missionFor("furniture"),
    changed = createIndustrySession(FURNITURE);
  changed.setProduct("side-table");
  interrupted.simulation = changed.exportState();
  interrupted.mission.status = "interrupted";
  validateProgressState("furniture", interrupted);
  assert.doesNotThrow(() =>
    validateSavedSimulation("furniture", interrupted.simulation, interrupted),
  );
});
for (const environment of ["cookware", "beverages", "parcels", "furniture"]) {
  test(`servidor: conclusão de missão exige evidência do fluxo completo de ${environment}`, () => {
    const simulation =
      environment === "cookware"
        ? createSimulation(12, { scope: "line" })
        : createIndustrySession(definitions[environment]);
    if (environment !== "cookware") simulation.setScope("line");
    simulation.setSpeed(4);
    simulation.start();
    let ticks = 0;
    while (simulation.snapshot.done < 12 && ticks++ < 20000)
      environment === "cookware" ? simulation.step(0.1) : simulation.tick(0.25);
    assert.equal(simulation.snapshot.done, 12);
    const snapshot = simulation.exportState(),
      def = missionDefinition(
        environment,
        environment === "cookware"
          ? ENVIRONMENTS
          : definitions[environment].steps,
        12,
      ),
      evidence = missionEvidence(simulation.snapshot, def);
    const state = {
      version: 1,
      simulation: snapshot,
      view: { selected: snapshot.selected ?? snapshot.focus, scope: "line" },
      results: [],
      mission: {
        id: def.id,
        version: 1,
        status: "completed",
        state: {
          started: true,
          completed: true,
          product: evidence.product,
          target: 12,
          checkpoints: evidence.checkpoints,
          done: 12,
          elapsed: evidence.elapsed,
          faultsSeen: [],
          faultsResolved: [],
        },
      },
    };
    validateProgressState(environment, state);
    assert.doesNotThrow(() =>
      validateSavedSimulation(environment, snapshot, state),
    );
    const fake = missionFor(environment);
    fake.mission.status = "completed";
    fake.mission.state.completed = true;
    fake.mission.state.done = 12;
    fake.mission.state.checkpoints = Object.fromEntries(
      def.steps.map((s) => [s.id, 12]),
    );
    assert.throws(() =>
      validateSavedSimulation(environment, fake.simulation, fake),
    );
  });
}
test("missão concluída: emergência posterior salva e retoma sem invalidar as entregas", () => {
  const simulation = createIndustrySession(PARCELS);
  simulation.setScope("line");
  simulation.setSpeed(4);
  simulation.start();
  for (let i = 0; i < 20000 && simulation.snapshot.done < 12; i++)
    simulation.tick(0.25);
  assert.equal(simulation.snapshot.done, 12);
  const def = missionDefinition("parcels", PARCELS.steps),
    evidence = missionEvidence(simulation.snapshot, def);
  const state = {
    version: 1,
    simulation: simulation.exportState(),
    view: { selected: simulation.snapshot.selected, scope: "line" },
    results: [],
    mission: {
      id: def.id,
      version: 1,
      status: "completed",
      state: {
        started: true,
        completed: true,
        product: evidence.product,
        target: 12,
        checkpoints: evidence.checkpoints,
        done: 12,
        elapsed: evidence.elapsed,
        faultsSeen: [],
        faultsResolved: [],
      },
    },
  };
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES('student');",
    );
    const repository = createProgressRepository({
      db,
      validateSimulation: validateSavedSimulation,
    });
    repository.save("student", "parcels", {
      owner: "student",
      expectedRevision: 0,
      state,
    });
    simulation.emergencyStop();
    state.simulation = simulation.exportState();
    const saved = repository.save("student", "parcels", {
      owner: "student",
      expectedRevision: 1,
      state,
    });
    assert.equal(saved.revision, 2);
    const loaded = repository.load("student", "parcels");
    assert.equal(loaded.compatible, true);
    assert.equal(loaded.state.mission.status, "completed");
    const resumed = createIndustrySession(PARCELS);
    assert.equal(resumed.importState(loaded.state.simulation), true);
    assert.equal(resumed.snapshot.emergency, true);
    assert.equal(resumed.snapshot.running, false);
    assert.equal(resumed.snapshot.done, 12);
  } finally {
    db.close();
  }
});
