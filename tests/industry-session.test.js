import test from "node:test";
import assert from "node:assert/strict";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import { PARCELS, PARCEL_ROUTES } from "../src/simulator/industries/parcels.js";

function finish(session) {
  for (let i = 0; i < 4000; i++) {
    const s = session.snapshot;
    if (s.phase === "complete") return s;
    assert.equal(s.fault, "");
    session.tick(0.1);
  }
  assert.fail(`Processo não terminou: ${JSON.stringify(session.snapshot)}`);
}
function configure(session, def, product) {
  session.setProduct(product.id);
  if (def.id === "beverages") session.setSetting("volume", product.volume);
  if (def.id === "furniture") session.setSetting("cutLength", product.length);
  if (def.id === "parcels") {
    const r = PARCEL_ROUTES.find((p) => p.id === product.id);
    for (const [k, v] of Object.entries({
      destination: r.id,
      address: r.address,
      route: r.id,
    }))
      session.setSetting(k, v);
  }
}
for (const def of [BEVERAGES, FURNITURE, PARCELS])
  for (const product of def.products) {
    test(`interface original: bancada de cada operação funciona em ${def.id}/${product.id}`, () => {
      const session = createIndustrySession(def);
      configure(session, def, product);
      session.setQuantity(2);
      for (const step of def.steps) {
        session.selectEnvironment(step.id);
        assert.equal(session.snapshot.step.id, step.id);
        assert.equal(session.snapshot.done, 0);
        session.start();
        const s = finish(session);
        const jobs =
          def.id === "beverages" && ["seal", "ship"].includes(step.id) ? 1 : 2;
        assert.equal(s.done, jobs);
        assert.deepEqual(
          s.history.map((e) => e.step),
          Array(jobs).fill(step.id),
        );
        assert.equal(s.unit.id, `LOT-${String(jobs).padStart(3, "0")}`);
        if (def.id === "parcels" && step.id !== "unload" && step.id !== "scan")
          assert.equal(s.unit.barcode, "EC-00002");
      }
    });
    test(`interface original: linha integrada conclui ${def.id}/${product.id}`, () => {
      const session = createIndustrySession(def);
      configure(session, def, product);
      session.setQuantity(1);
      session.setScope("line");
      session.start();
      const s = finish(session);
      assert.equal(s.done, 1);
      assert.deepEqual(
        s.history.map((e) => e.step),
        def.steps.map((p) => p.id),
      );
    });
  }
test("interface original: modo manual exige transporte, trabalho e transferência", () => {
  const s = createIndustrySession(PARCELS);
  s.setQuantity(1);
  s.setMode("manual");
  s.start();
  s.tick(0.2);
  assert.equal(s.snapshot.phase, "ready");
  s.toggleCommand("motor");
  for (let i = 0; i < 100 && s.snapshot.phase !== "operating"; i++) s.tick(0.1);
  assert.equal(s.snapshot.phase, "operating");
  const frozen = s.snapshot.progress;
  s.tick(0.2);
  assert.equal(s.snapshot.progress, frozen);
  s.toggleCommand("work");
  for (let i = 0; i < 1000 && s.snapshot.phase !== "outgoing"; i++) s.tick(0.1);
  assert.equal(s.snapshot.phase, "outgoing");
  const x = s.snapshot.position.x;
  s.tick(0.2);
  assert.equal(s.snapshot.position.x, x);
  s.toggleCommand("transfer");
  assert.equal(finish(s).done, 1);
});
test("interface original: proteção, obstrução e emergência congelam e permitem rearmar", () => {
  const s = createIndustrySession(PARCELS);
  s.setQuantity(1);
  s.start();
  s.tick(0.2);
  s.setGuard(false);
  const x = s.snapshot.position.x;
  s.tick(0.2);
  s.start();
  assert.equal(s.snapshot.position.x, x);
  assert.equal(s.snapshot.running, false);
  s.setGuard(true);
  s.setObstruction(true);
  s.start();
  assert.equal(s.snapshot.running, false);
  s.setObstruction(false);
  s.start();
  s.emergencyStop();
  const p = s.snapshot.position.x;
  s.tick(0.2);
  assert.equal(s.snapshot.position.x, p);
  s.rearm();
  s.start();
  assert.equal(finish(s).done, 1);
});
test("interface original: interativo espera autorização em cada bancada", () => {
  const s = createIndustrySession(FURNITURE);
  s.setQuantity(1);
  s.selectEnvironment("drill");
  s.setMode("guided");
  s.tick(0.2);
  assert.equal(s.snapshot.phase, "ready");
  s.perform();
  assert.equal(finish(s).unit.drilled, true);
});
test("interface original: Iniciar repete tampagem da mesma garrafa após corrigir a falha", () => {
  const s = createIndustrySession(BEVERAGES);
  s.setQuantity(1);
  s.setScope("line");
  s.setSetting("missingCap", true);
  s.start();
  for (let i = 0; i < 1000 && !s.snapshot.fault; i++) s.tick(0.1);
  const rejected = s.snapshot;
  assert.equal(rejected.step.id, "label");
  assert.equal(rejected.unit.capped, false);
  assert.equal(rejected.done, 0);
  s.setSetting("missingCap", false);
  s.start();
  assert.equal(s.snapshot.selected, "cap");
  assert.equal(s.snapshot.unit.id, rejected.unit.id);
  const end = finish(s);
  assert.equal(end.done, 1);
  assert.equal(end.unit.capped, true);
  assert.equal(end.history.filter((e) => e.step === "cap").length, 2);
});
