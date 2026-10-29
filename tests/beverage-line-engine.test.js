import test from "node:test";
import assert from "node:assert/strict";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { BEVERAGES } from "../src/simulator/industries/definitions.js";
const make = (quantity = 12, options = {}) => {
  const s = createIndustrySession(BEVERAGES, { onDemand: true, ...options });
  s.setQuantity(quantity);
  return s;
};
function until(s, predicate, max = 20000) {
  for (let i = 0; i < max; i++) {
    s.tick(0.1);
    if (predicate(s.snapshot)) return s.snapshot;
  }
  assert.fail("deadline");
}
test("segunda garrafa é retirada enquanto a primeira ainda está na lavagem", () => {
  const s = make();
  s.start();
  const v = until(s, (s) => s.issued === 2);
  assert.equal(v.pipeline, true);
  assert.equal(v.stations.receive.unit.id, "LOT-002");
  assert.equal(v.stations.wash.unit.id, "LOT-001");
  assert.equal(v.stations.wash.hasMaterial, true);
  assert.equal(v.stations.wash.phase, "operating");
  assert.equal(v.inventory.boxes.length, 0);
});
test("cada estação e passagem têm capacidade finita e IDs físicos únicos", () => {
  const s = make(12, { capacity: 1 });
  s.setSpeed(8);
  s.start();
  for (let i = 0; i < 1500; i++) {
    s.tick(0.1);
    const state = s.exportState().engine,
      ids = state.workers.filter((w) => w.unit).map((w) => w.unit.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length <= 7);
    for (let j = 0; j < state.workers.length; j++)
      if (state.workers[j].outgoing) {
        const from = state.workers[j],
          to = state.workers[j + 1];
        assert.equal(from.unit, null);
        assert.equal(from.outgoing.unit.id, to.unit.id);
        assert.ok(["moving", "ready"].includes(to.phase));
        if (to.phase === "ready") assert.equal(from.outgoing.progress, 0);
      }
  }
  assert.equal(s.snapshot.inventory.counts.occupied, 1);
  assert.equal(s.snapshot.inventory.counts.shipped, 0);
  assert.match(s.snapshot.fault, /Armazém cheio/);
});
test("pausa, emergência, 8x e reload conservam todas as estações em trânsito", () => {
  const s = make();
  s.start();
  until(s, (s) => s.issued === 3);
  s.pause();
  const saved = s.exportState();
  for (let i = 0; i < 5; i++) s.tick(0.25);
  assert.deepEqual(s.exportState(), saved);
  const restored = make();
  assert.equal(restored.importState(saved), true);
  assert.deepEqual(restored.exportState().engine, saved.engine);
  restored.emergencyStop();
  restored.start();
  restored.tick(0.25);
  assert.equal(restored.snapshot.running, false);
  restored.rearm();
  const a = make(),
    b = make();
  a.start();
  b.start();
  b.setSpeed(8);
  for (let i = 0; i < 100; i++) {
    a.tick(0.1);
    b.tick(0.0125);
  }
  assert.deepEqual(
    a.exportState().engine.workers,
    b.exportState().engine.workers,
  );
  const corrupt = structuredClone(saved);
  corrupt.engine.workers[0].unit.id = "LOT-099";
  assert.equal(make().importState(corrupt), false);
});
test("rota da caixa respeita o comprimento físico até o selador", () => {
  const s = make(9);
  s.setSpeed(8);
  s.start();
  let start = null,
    end = null,
    box = null;
  for (let i = 0; i < 10000; i++) {
    s.tick(0.0125);
    const v = s.snapshot,
      w = v.stations.seal;
    if (start === null && w.hasMaterial && w.phase === "moving") {
      start = v.elapsed;
      box = w.unit;
    }
    if (start !== null && w.phase === "operating") {
      end = v.elapsed;
      break;
    }
  }
  assert.ok(end > start);
  const step = BEVERAGES.steps.find((s) => s.id === "seal"),
    from = BEVERAGES.steps.find((s) => s.id === "pack");
  const expected =
    BEVERAGES.movementDistance({
      phase: "moving",
      unit: box,
      done: 8,
      total: 9,
      fromX: from.x,
      toX: step.x,
      step: "seal",
    }) / BEVERAGES.transportSpeed;
  assert.ok(
    Math.abs(end - start - expected) < 0.2,
    `${end - start} vs ${expected}`,
  );
});

test("expedição selecionada e teste aninhado preservam o checkpoint de todas as estações", async () => {
  const { validateProgressState } = await import("../src/progress-format.js");
  const { validateSavedSimulation } = await import(
    "../server/progress-validation.js"
  );
  const s = make();
  s.start();
  until(s, (s) => s.issued === 2);
  s.pause();
  s.selectEnvironment("ship");
  const saved = s.exportState(),
    next = make();
  assert.equal(next.importState(saved), true);
  assert.equal(next.snapshot.selected, "ship");
  assert.equal(next.enterBench("fill"), true);
  const practice = next.exportState();
  const state = {
    version: 1,
    simulation: practice,
    mission: null,
    results: [],
    view: { selected: "fill", scope: "bench" },
  };
  assert.doesNotThrow(() => validateProgressState("beverages", state));
  assert.doesNotThrow(() =>
    validateSavedSimulation("beverages", practice, state),
  );
  const restored = make();
  assert.equal(restored.importState(practice), true);
  assert.equal(restored.returnLine(), true);
  assert.deepEqual(restored.exportState().engine, saved.engine);
});
test("atuadores desativados no modo manual não avançam mecanismos concorrentes", () => {
  const s = make();
  s.setMode("manual");
  s.start();
  const initial = s.exportState().engine.workers;
  for (let i = 0; i < 20; i++) s.tick(0.1);
  assert.deepEqual(s.exportState().engine.workers, initial);
  s.toggleCommand("motor");
  s.tick(0.1);
  assert.notDeepEqual(s.exportState().engine.workers, initial);
});

test("caixa em transferência reserva a embalagem até o carro parar no selador", () => {
  const s = make(18);
  s.setSpeed(8);
  s.start();
  let transferFrames = 0,
    resumedPacking = false,
    seenTransfer = false;
  for (let i = 0; i < 12000; i++) {
    s.tick(0.05);
    const state = s.exportState().engine;
    const pack = state.workers.find((w) => w.id === "pack"),
      seal = state.workers.find((w) => w.id === "seal");
    if (seal.phase === "moving" && seal.unit) {
      transferFrames++;
      seenTransfer = true;
      assert.equal(
        pack.unit,
        null,
        "nenhuma nova garrafa entra no encaixotamento durante a passagem do carro",
      );
      assert.equal(pack.outgoing?.unit.id, seal.unit.id);
      assert.equal(
        pack.outgoing.unit.packed,
        true,
        "a representação de saída é a caixa concluída",
      );
      assert.equal(pack.outgoing.progress, seal.progress);
    }
    if (seenTransfer && pack.unit && seal.phase !== "moving") {
      resumedPacking = true;
      break;
    }
  }
  assert.ok(
    transferFrames > 0,
    "o teste deve percorrer o transporte real da caixa",
  );
  assert.equal(
    resumedPacking,
    true,
    "a embalagem volta a admitir garrafas quando o corredor está livre",
  );
});

test("navegação de câmera não altera a linha concorrente em modo manual", () => {
  const source = make(12);
  source.setMode("manual");
  source.toggleCommand("motor");
  source.toggleCommand("work");
  source.toggleCommand("transfer");
  source.start();
  const saved = source.exportState();
  const sessions = ["receive", "seal", "ship"].map((stage) => {
    const session = make(12);
    assert.equal(session.importState(saved), true);
    session.selectEnvironment(stage);
    for (const key of ["motor", "work", "transfer"])
      if (!session.snapshot.commands[key]) session.toggleCommand(key);
    session.start();
    return session;
  });
  for (let i = 0; i < 1000; i++)
    for (const session of sessions) session.tick(0.1);
  for (const session of sessions.slice(1)) {
    assert.deepEqual(
      session.exportState().engine.workers,
      sessions[0].exportState().engine.workers,
    );
    assert.deepEqual(session.snapshot.history, sessions[0].snapshot.history);
  }
  assert.ok(
    sessions[0].snapshot.history.some((event) => event.step === "wash"),
  );
});
