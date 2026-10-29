import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/simulator/simulation.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { BEVERAGES } from "../src/simulator/industries/definitions.js";
import { readFileSync } from "node:fs";
test("Seletor compartilhado de panelas e garrafas oferece 8×", () => {
  const shell = readFileSync(
    new URL("../src/simulator/lab-shell.js", import.meta.url),
    "utf8",
  );
  assert.match(shell, /<option value="8">8×<\/option>/);
});
for (const environment of ["cookware", "beverages"])
  test(`${environment}: 8× avança oito vezes, preserva etapas e restaura pausado`, () => {
    const make = () =>
      environment === "cookware"
        ? createSimulation(1, { scope: "bench", environment: "production" })
        : createIndustrySession(BEVERAGES);
    const fast = make(),
      normal = make();
    if (environment === "beverages") {
      fast.setQuantity(1);
      normal.setQuantity(1);
    }
    fast.setSpeed(8);
    normal.setSpeed(1);
    fast.start();
    normal.start();
    const tick = (s, dt) =>
      environment === "cookware" ? s.step(dt) : s.tick(dt);
    for (let i = 0; i < 20; i++) {
      tick(fast, 0.1);
      for (let j = 0; j < 8; j++) tick(normal, 0.1);
    }
    const a = fast.snapshot,
      b = normal.snapshot;
    assert.ok(Math.abs((a.time ?? a.elapsed) - (b.time ?? b.elapsed)) < 1e-8);
    if (environment === "cookware") {
      for (let i = 0; i < a.cells.length; i++) {
        assert.equal(a.cells[i].phase, b.cells[i].phase);
        assert.ok(Math.abs(a.cells[i].progress - b.cells[i].progress) < 1e-8);
        assert.deepEqual(
          a.cells[i].unit?.history.map((h) => h.step),
          b.cells[i].unit?.history.map((h) => h.step),
        );
      }
    } else {
      assert.equal(a.phase, b.phase);
      assert.ok(Math.abs(a.progress - b.progress) < 1e-8);
      assert.deepEqual(
        a.history.map((h) => h.step),
        b.history.map((h) => h.step),
      );
    }
    const restored = make();
    assert.equal(restored.importState(fast.exportState()), true);
    assert.equal(restored.exportState().speed, 8);
    assert.equal(restored.snapshot.running, false);
    const paused = restored.exportState();
    tick(restored, 0.1);
    assert.deepEqual(restored.exportState(), paused);
  });
