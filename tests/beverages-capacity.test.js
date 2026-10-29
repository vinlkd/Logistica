import test from "node:test";
import assert from "node:assert/strict";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";
import { bottleCaseRecords } from "../src/simulator/industries/bottle-cases.js";
import {
  missionDefinition,
  createMission,
  missionEvidence,
} from "../src/simulator/missions.js";
import { validateProgressState } from "../src/progress-format.js";
function finish(session) {
  session.setSpeed(4);
  session.start();
  let state,
    resumed = false;
  for (let i = 0; i < 30000; i++) {
    session.tick(0.25);
    if (i % 20 === 0) {
      state = session.snapshot;
      if (!resumed && state.total > 100 && state.done >= 54) {
        session.pause();
        const saved = session.exportState();
        const copy = createIndustrySession(BEVERAGES);
        assert.equal(copy.importState(saved), true);
        assert.equal(copy.snapshot.done, state.done);
        assert.deepEqual(copy.snapshot.completedUnits, state.completedUnits);
        assert.equal(copy.snapshot.running, false);
        assert.equal(session.importState(saved), true);
        session.start();
        resumed = true;
      }
      if (state.phase === "complete") return state;
    }
  }
  assert.fail("Lote não concluiu");
}
test("Bebidas limita 108 unidades sem ampliar o limite dos outros ambientes", () => {
  const s = createIndustrySession(BEVERAGES);
  for (const [value, expected] of [
    [0, 1],
    [109, 108],
    [108.8, 108],
    [107, 107],
  ]) {
    s.setQuantity(value);
    assert.equal(s.snapshot.bottleTotal, expected);
  }
  const other = createIndustrySession(FURNITURE);
  other.setQuantity(108);
  assert.equal(other.snapshot.total, 30);
  const engine = createProcessSimulation(BEVERAGES, { quantity: 108.8 });
  assert.equal(engine.snapshot.total, 108);
  const invalid = s.exportState();
  invalid.quantity = 109;
  assert.equal(s.importState(invalid), false);
});
for (const qty of [107, 108])
  test(`${qty} garrafas reais distribuem em 12 caixas e preservam checkpoint completo`, () => {
    const s = createIndustrySession(BEVERAGES);
    s.setScope("line");
    s.setQuantity(qty);
    const initial = bottleCaseRecords(s.snapshot, s.snapshot.product);
    assert.equal(
      initial.cases.reduce((n, c) => n + c.units.length, 0),
      0,
    );
    const end = finish(s);
    assert.equal(end.done, qty);
    assert.equal(end.completedUnits.length, qty);
    const records = bottleCaseRecords(end, end.product).cases;
    assert.equal(records.length, 12);
    assert.deepEqual(
      records.map((c) => c.units.length),
      [...Array(11).fill(9), qty - 99],
    );
    assert.ok(records.every((c) => c.shipped && c.sealed && c.identified));
    for (const step of ["seal", "ship"])
      assert.equal(end.history.filter((h) => h.step === step).length, 12);
    assert.ok(
      end.completedUnits.every(
        (u) =>
          u.received &&
          u.washed &&
          u.volume === 500 &&
          u.capped &&
          u.labeled &&
          u.packed &&
          u.shipped,
      ),
    );
    const saved = s.exportState(),
      restored = createIndustrySession(BEVERAGES);
    assert.equal(restored.importState(saved), true);
    assert.equal(restored.snapshot.done, qty);
    assert.equal(restored.snapshot.running, false);
    let mission = null;
    if (qty === 108) {
      const d = missionDefinition("beverages", BEVERAGES.steps, 108),
        m = createMission(d);
      m.start("juice");
      m.observe(missionEvidence(end, d));
      assert.equal(m.snapshot.completed, true);
      assert.equal(m.snapshot.progress, 1);
      mission = m.exportState();
      const resumed = createMission(d);
      assert.equal(resumed.importState(mission, missionEvidence(end, d)), true);
    }
    assert.doesNotThrow(() =>
      validateProgressState("beverages", {
        version: 1,
        simulation: saved,
        mission,
        view: { selected: "ship", scope: "line" },
        results: [],
      }),
    );
  });
test("Lote antigo de 12 permanece compatível e caixas parciais retomam na bancada", () => {
  for (const qty of [12, 107, 108])
    for (const step of ["seal", "ship"]) {
      const s = createIndustrySession(BEVERAGES);
      s.setQuantity(qty);
      s.selectEnvironment(step);
      assert.equal(s.snapshot.total, Math.ceil(qty / 9));
      const end = finish(s);
      assert.equal(end.done, Math.ceil(qty / 9));
      assert.equal(end.unit.caseQuantity, qty % 9 || 9);
      const r = createIndustrySession(BEVERAGES);
      assert.equal(r.importState(s.exportState()), true);
      assert.equal(r.snapshot.bottleTotal, qty);
      assert.equal(r.snapshot.unit.caseQuantity, qty % 9 || 9);
    }
  assert.equal(
    missionDefinition("beverages", BEVERAGES.steps, 12).id,
    "beverages-order-12",
  );
});

test("Recebimento padrão retira as 108 garrafas sem encerrar em 12 ou 30", () => {
  const s = createIndustrySession(BEVERAGES);
  assert.equal(s.snapshot.bottleTotal, 108);
  assert.equal(createProcessSimulation(BEVERAGES).snapshot.total, 108);
  assert.equal(s.snapshot.step.id, "receive");
  assert.equal(missionDefinition("beverages", BEVERAGES.steps).target, 108);
  const end = finish(s);
  assert.equal(end.done, 108);
  assert.equal(end.history.length, 108);
  assert.equal(end.completedUnits.length, 108);
  assert.ok(end.completedUnits.every((u) => u.received));
  assert.equal(end.completedUnits.at(-1).id, "LOT-108");
  const r = createIndustrySession(BEVERAGES);
  assert.equal(r.importState(s.exportState()), true);
  assert.equal(r.snapshot.done, 108);
});

test("Recebimento antigo de 12 continua até108 sem repetir garrafas ou descartar histórico", () => {
  const s = createIndustrySession(BEVERAGES);
  s.setQuantity(12);
  const first = finish(s);
  const r = createIndustrySession(BEVERAGES);
  assert.equal(r.importState(s.exportState()), true);
  assert.equal(r.extendReceivingOrder(), true);
  assert.equal(r.snapshot.done, 12);
  assert.equal(r.snapshot.unit.id, "LOT-013");
  assert.deepEqual(r.snapshot.completedUnits, first.completedUnits);
  const end = finish(r);
  assert.equal(end.done, 108);
  assert.equal(end.history.length, 108);
  assert.equal(new Set(end.completedUnits.map((u) => u.id)).size, 108);
  const line = createIndustrySession(BEVERAGES);
  line.setScope("line");
  line.setQuantity(12);
  assert.equal(line.extendReceivingOrder(), false);
});
