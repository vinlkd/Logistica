import test from "node:test";
import assert from "node:assert/strict";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { PARCELS } from "../src/simulator/industries/parcels.js";
import { createSimulation } from "../src/simulator/simulation.js";
for (const definition of [BEVERAGES, FURNITURE, PARCELS])
  for (const scope of ["bench", "line"]) {
    test(`${definition.id}/${scope}: checkpoint restores paused with identical unit, operation and position`, () => {
      const a = createIndustrySession(definition);
      a.setScope(scope);
      a.setQuantity(2);
      a.start();
      for (let i = 0; i < 37; i++) a.tick(0.1);
      const saved = a.exportState(),
        b = createIndustrySession(definition);
      assert.equal(b.importState(saved), true);
      assert.equal(b.snapshot.running, false);
      const expected = {
        ...saved,
        engine: { ...saved.engine, running: false },
      };
      assert.deepEqual(b.exportState(), expected);
      b.start();
      for (let i = 0; i < 5000 && b.snapshot.done < 2; i++) b.tick(0.1);
      assert.equal(b.snapshot.done, 2, b.snapshot.fault);
    });
  }
for (const scope of ["bench", "line"])
  test(`cookware/${scope}: queues, identifiers and recipe state survive restoration`, () => {
    const a = createSimulation(2, { scope, environment: "production" });
    a.start();
    for (let i = 0; i < 100; i++) a.step(0.1);
    const saved = a.exportState(),
      b = createSimulation();
    assert.equal(b.importState(saved), true);
    assert.equal(b.snapshot.running, false);
    assert.deepEqual(
      b.snapshot.cells.map((c) => ({
        id: c.id,
        unit: c.unit,
        stockIds: c.stockIds,
        progress: c.progress,
        processing: c.processing,
        done: c.done,
      })),
      a.snapshot.cells.map((c) => ({
        id: c.id,
        unit: c.unit,
        stockIds: c.stockIds,
        progress: c.progress,
        processing: c.processing,
        done: c.done,
      })),
    );
    b.start();
    for (let i = 0; i < 10000 && b.snapshot.done < 2; i++) b.step(0.1);
    assert.equal(b.snapshot.done, 2);
  });
test("invalid state cannot partially replace the current session", () => {
  const a = createIndustrySession(BEVERAGES);
  a.start();
  a.tick(0.2);
  const before = a.exportState(),
    bad = structuredClone(before);
  bad.engine.x = 999;
  assert.equal(a.importState(bad), false);
  assert.deepEqual(a.exportState(), before);
  const b = createSimulation(2);
  const old = b.exportState(),
    invalid = structuredClone(old);
  invalid.cells[0].stock.push(invalid.cells[0].stock[0]);
  assert.equal(b.importState(invalid), false);
  assert.deepEqual(b.exportState(), old);
});
test("emergency is preserved and does not resume after reload", () => {
  const a = createIndustrySession(FURNITURE);
  a.start();
  a.tick(0.5);
  a.emergencyStop();
  const b = createIndustrySession(FURNITURE);
  assert.equal(b.importState(a.exportState()), true);
  b.start();
  assert.equal(b.snapshot.running, false);
  assert.equal(b.snapshot.emergency, true);
});
