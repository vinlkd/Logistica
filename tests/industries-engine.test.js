import test from "node:test";
import assert from "node:assert/strict";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { PARCELS, PARCEL_ROUTES } from "../src/simulator/industries/parcels.js";

function advanceUntil(sim, predicate, limit = 6000) {
  for (let n = 0; n < limit; n++) {
    if (predicate(sim.snapshot)) return sim.snapshot;
    sim.tick(0.05);
  }
  assert.fail(`Não atingiu a condição; estado ${JSON.stringify(sim.snapshot)}`);
}
const correct = (definition, product, sim) => {
  if (definition.id === "beverages") sim.setSetting("volume", product.volume);
  if (definition.id === "furniture")
    sim.setSetting("cutLength", product.length);
  if (definition.id === "parcels") {
    const r = PARCEL_ROUTES.find((route) => route.id === product.id);
    sim.setSetting("destination", r.id);
    sim.setSetting("address", r.address);
    sim.setSetting("route", r.id);
  }
};
for (const definition of [BEVERAGES, FURNITURE, PARCELS]) {
  for (const product of definition.products) {
    test(`indústrias: ${definition.id}/${product.id} conclui lote com histórico sem duplicação`, () => {
      const sim = createProcessSimulation(definition, {
        product: product.id,
        quantity: 3,
        mode: "auto",
      });
      correct(definition, product, sim);
      sim.start();
      const final = advanceUntil(sim, (s) => s.phase === "complete");
      assert.equal(final.done, 3);
      assert.equal(final.fault, "");
      assert.equal(final.running, false);
      assert.equal(final.history.length, definition.id === "beverages" ? 6 * 3 + 2 : definition.steps.length * 3);
      for (const id of ["LOT-001", "LOT-002", "LOT-003"])
        assert.deepEqual(
          final.history.filter((e) => e.unit === id).map((e) => e.step),
          definition.steps.filter((s) => definition.id !== "beverages" || id === "LOT-003" || !["seal", "ship"].includes(s.id)).map((s) => s.id),
        );
      assert.equal(final.position.x, definition.exitX);
      const snapshot = sim.snapshot;
      snapshot.unit.id = "alterado";
      snapshot.settings.foreign = true;
      assert.equal(sim.snapshot.unit.id, "LOT-003");
      assert.equal(sim.snapshot.settings.foreign, undefined);
    });
  }
  test(`indústrias: ${definition.id} guiado exige autorização e pausa congela estado`, () => {
    const sim = createProcessSimulation(definition, {
      quantity: 1,
      mode: "guided",
    });
    correct(definition, definition.products[0], sim);
    sim.start();
    sim.tick(0.2);
    assert.equal(sim.snapshot.phase, "ready");
    assert.equal(sim.snapshot.position.x, definition.entryX);
    assert.equal(sim.authorize(), true);
    sim.tick(0.1);
    sim.pause();
    const frozen = sim.snapshot;
    sim.tick(0.25);
    assert.deepEqual(sim.snapshot, frozen);
    sim.start();
    const next = advanceUntil(sim, (s) => s.phase === "ready");
    assert.equal(next.stepIndex, 1);
    assert.deepEqual(next.completedSteps, [definition.steps[0].id]);
    sim.emergencyStop();
    const stopped = sim.snapshot;
    assert.equal(sim.authorize(), false);
    sim.start();
    sim.tick(0.2);
    assert.deepEqual(sim.snapshot, stopped);
    sim.rearm();
    assert.equal(sim.authorize(), true);
  });
}
test("indústrias: erro de envase bloqueia e permite corrigir a mesma garrafa", () => {
  const sim = createProcessSimulation(BEVERAGES, { quantity: 1, mode: "auto" });
  sim.setSetting("volume", 300);
  sim.start();
  const blocked = advanceUntil(sim, (s) => !!s.fault);
  assert.equal(blocked.step.id, "fill");
  assert.equal(blocked.done, 0);
  assert.equal(blocked.unit.volume, 0);
  sim.setSetting("volume", 500);
  sim.start();
  const end = advanceUntil(sim, (s) => s.phase === "complete");
  assert.equal(end.unit.id, blocked.unit.id);
  assert.equal(end.unit.volume, 500);
  assert.equal(end.unit.capped, true);
  assert.equal(end.done, 1);
});
test("indústrias: segurança da serra e profundidade de furo permitem corrigir a mesma madeira", () => {
  const sim = createProcessSimulation(FURNITURE, { quantity: 1, mode: "auto" });
  sim.setSetting("guardClosed", false);
  sim.start();
  const saw = advanceUntil(sim, (s) => !!s.fault);
  assert.equal(saw.step.id, "cut");
  assert.equal(saw.unit.cut, false);
  sim.setSetting("guardClosed", true);
  sim.setSetting("drillDepth", 22);
  sim.start();
  const drill = advanceUntil(sim, (s) => !!s.fault);
  assert.equal(drill.step.id, "drill");
  assert.equal(drill.unit.cut, true);
  assert.equal(drill.unit.drilled, false);
  sim.setSetting("drillDepth", 12);
  sim.start();
  const end = advanceUntil(sim, (s) => s.phase === "complete");
  assert.equal(end.unit.id, saw.unit.id);
  assert.equal(end.unit.approved, true);
  assert.equal(end.unit.packed, true);
});
test("indústrias: nova escolha de produto e lote elimina processo anterior", () => {
  const sim = createProcessSimulation(BEVERAGES, { quantity: 2, mode: "auto" });
  sim.start();
  sim.tick(0.2);
  sim.emergencyStop();
  sim.setProduct("water");
  const fresh = sim.snapshot;
  assert.equal(fresh.product.id, "water");
  assert.equal(fresh.unit.target, 350);
  assert.equal(fresh.emergency, false);
  assert.equal(fresh.phase, "ready");
  assert.equal(fresh.running, false);
  assert.deepEqual(fresh.history, []);
  sim.setSetting("volume", 350);
  sim.setQuantity(1);
  sim.start();
  const end = advanceUntil(sim, (s) => s.phase === "complete");
  assert.equal(end.done, 1);
});
test("indústrias: tampa ausente permite repetir tampagem na mesma garrafa sem salto", () => {
  const sim = createProcessSimulation(BEVERAGES, { quantity: 1, mode: "auto" });
  sim.setSetting("missingCap", true);
  sim.start();
  const rejected = advanceUntil(sim, (s) => !!s.fault);
  assert.equal(rejected.step.id, "label");
  assert.equal(rejected.unit.capped, false);
  assert.equal(rejected.done, 0);
  sim.setSetting("missingCap", false);
  const previousX = sim.snapshot.position.x;
  sim.retryPrevious();
  assert.equal(sim.snapshot.step.id, "cap");
  assert.equal(sim.snapshot.unit.id, rejected.unit.id);
  assert.equal(sim.snapshot.position.x, previousX);
  assert.equal(sim.snapshot.completedSteps.includes("cap"), false);
  sim.start();
  const end = advanceUntil(sim, (s) => s.phase === "complete");
  assert.equal(end.done, 1);
  assert.equal(end.unit.capped, true);
  assert.equal(end.unit.labeled, true);
  assert.equal(end.unit.id, rejected.unit.id);
  assert.equal(end.history.filter((e) => e.step === "cap").length, 2);
});
