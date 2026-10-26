import test from "node:test";
import assert from "node:assert/strict";
import {
  createMission,
  missionDefinition,
  missionEvidence,
  diagnose,
} from "../src/simulator/missions.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { PARCELS } from "../src/simulator/industries/parcels.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
import { validateProgressState } from "../src/progress-format.js";
for (const d of [BEVERAGES, FURNITURE, PARCELS])
  test(`${d.id}: mission succeeds only after 12 real complete deliveries`, () => {
    const s = createIndustrySession(d);
    s.setScope("line");
    s.setQuantity(12);
    s.setSpeed(4);
    const definition = missionDefinition(d.id, d.steps),
      m = createMission(definition);
    m.start(s.snapshot.product.id);
    m.observe(missionEvidence(s.snapshot, definition));
    assert.equal(m.snapshot.completed, false);
    assert.equal(m.snapshot.progress, 0);
    s.start();
    for (let i = 0; i < 5000 && s.snapshot.done < 12; i++) {
      s.tick(0.25);
      m.observe(missionEvidence(s.snapshot, definition));
    }
    assert.equal(s.snapshot.done, 12, s.snapshot.fault);
    assert.equal(m.snapshot.completed, true);
    assert.equal(m.snapshot.progress, 1);
    validateProgressState(d.id, {
      version: 1,
      simulation: s.exportState(),
      mission: m.exportState(),
      view: { selected: d.steps[0].id, scope: "line" },
      results: [],
    });
  });
test("cookware: mission counts the eight real sectors and final dispatched units", () => {
  const s = createSimulation(12, { scope: "line" });
  s.setSpeed(4);
  const d = missionDefinition("cookware", ENVIRONMENTS),
    m = createMission(d);
  m.start(s.snapshot.product);
  s.start();
  for (let i = 0; i < 5000 && s.snapshot.done < 12; i++) {
    s.step(0.25);
    m.observe(missionEvidence(s.snapshot, d));
  }
  assert.equal(s.snapshot.done, 12);
  assert.equal(m.snapshot.completed, true);
  assert.equal(Object.keys(m.snapshot.checkpoints).length, 8);
});
test("partial stages, clicks and a changed product cannot complete a mission", () => {
  const d = missionDefinition("beverages", BEVERAGES.steps),
    m = createMission(d);
  m.start("juice");
  m.observe({
    product: "juice",
    scope: "line",
    quantity: 12,
    done: 12,
    elapsed: 1,
    checkpoints: { receive: 12 },
    fault: "",
  });
  assert.equal(m.snapshot.completed, false);
  m.observe({
    product: "water",
    scope: "line",
    quantity: 12,
    done: 12,
    elapsed: 1,
    checkpoints: Object.fromEntries(d.steps.map((s) => [s.id, 12])),
    fault: "",
  });
  assert.equal(m.snapshot.status, "interrupted");
  assert.equal(m.snapshot.completed, false);
});
test("illegible barcode is diagnosed and recovered on the same parcel", () => {
  const s = createIndustrySession(PARCELS);
  s.setScope("line");
  s.setQuantity(1);
  s.setSetting("barcodeReadable", false);
  s.start();
  for (let i = 0; i < 200 && !s.snapshot.fault; i++) s.tick(0.1);
  const id = s.snapshot.unit.id;
  assert.equal(diagnose("parcels", s.snapshot).code, "barcode");
  assert.equal(s.snapshot.done, 0);
  s.setSetting("barcodeReadable", true);
  s.start();
  for (let i = 0; i < 1000 && s.snapshot.done < 1; i++) s.tick(0.1);
  assert.equal(s.snapshot.unit.id, id);
  assert.equal(s.snapshot.done, 1);
});
test("missing cap is corrected by repeating tamping without replacing the bottle", () => {
  const s = createIndustrySession(BEVERAGES);
  s.setScope("line");
  s.setQuantity(1);
  s.setSetting("missingCap", true);
  s.start();
  for (let i = 0; i < 500 && !s.snapshot.fault; i++) s.tick(0.1);
  const id = s.snapshot.unit.id;
  assert.equal(diagnose("beverages", s.snapshot).code, "cap");
  s.setSetting("missingCap", false);
  s.start();
  for (let i = 0; i < 1000 && s.snapshot.done < 1; i++) s.tick(0.1);
  assert.equal(s.snapshot.done, 1);
  assert.equal(s.snapshot.unit.id, id);
  assert.equal(s.snapshot.unit.capped, true);
});
test("incorrect cut size blocks the tool and permits correction on the same piece", () => {
  const s = createIndustrySession(FURNITURE);
  s.setScope("line");
  s.setQuantity(1);
  s.setSetting("cutLength", 110);
  s.start();
  for (let i = 0; i < 300 && !s.snapshot.fault; i++) s.tick(0.1);
  const id = s.snapshot.unit.id;
  assert.equal(diagnose("furniture", s.snapshot).code, "length");
  assert.equal(s.snapshot.unit.cut, false);
  s.setSetting("cutLength", 120);
  s.start();
  for (let i = 0; i < 1000 && s.snapshot.done < 1; i++) s.tick(0.1);
  assert.equal(s.snapshot.done, 1);
  assert.equal(s.snapshot.unit.id, id);
});
