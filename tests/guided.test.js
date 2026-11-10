import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
const advance = (s) => {
  for (let i = 0; i < 160; i++) s.step(0.1);
};
test("interactive operations require authorization at every recipe boundary", () => {
  for (const e of ENVIRONMENTS) {
    const s = createSimulation(2, {
      scope: "bench",
      environment: e.id,
      mode: "guided",
    });
    s.setSpeed(4);
    const cell = () => s.snapshot.cells.find((c) => c.id === e.id);
    s.start();
    advance(s);
    assert.equal(cell().part, false);
    for (const id of ["feed", ...e.recipe.map((r) => r.id), "transfer"]) {
      assert.ok(s.performNext(e.id), `${e.id}/${id}`);
      advance(s);
      assert.equal(cell().awaitingAction, true);
      const before = JSON.stringify({
        done: cell().done,
        progress: cell().progress,
        processing: cell().processing,
        queue: cell().queue,
      });
      advance(s);
      assert.equal(
        JSON.stringify({
          done: cell().done,
          progress: cell().progress,
          processing: cell().processing,
          queue: cell().queue,
        }),
        before,
      );
    }
    assert.equal(cell().done, 1);
    assert.equal(cell().queue, 1);
    assert.equal(s.snapshot.completedUnits[0].material, e.output);
  }
});
test("interactive safety stops retain the piece and allow a fresh authorization", () => {
  const s = createSimulation(1, {
    scope: "bench",
    environment: "production",
    mode: "guided",
  });
  s.performNext("production");
  s.step(0.3);
  s.emergencyStop();
  assert.equal(s.performNext("production"), false);
  s.acknowledge();
  assert.equal(s.performNext("production"), true);
  advance(s);
  assert.equal(s.snapshot.cells[2].phase, "processing");
});
