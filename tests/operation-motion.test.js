import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildLabModel, updateLabModel } from "../src/simulator/lab-model.js";
import { createSimulation } from "../src/simulator/simulation.js";
import { PRODUCTS } from "../src/simulator/products.js";
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const materials = () =>
  Object.fromEntries(
    [
      "blue",
      "white",
      "steel",
      "dark",
      "belt",
      "yellow",
      "box",
      "tape",
      "wood",
      "glass",
      "green",
    ].map((k) => [k, new THREE.MeshStandardMaterial()]),
  );
function transforms(group) {
  const values = [];
  group.traverse((o) =>
    values.push([
      o.uuid,
      ...o.position.toArray(),
      ...o.quaternion.toArray(),
      ...o.scale.toArray(),
    ]),
  );
  return values;
}
for (const product of PRODUCTS)
  test(`${product.id}: polidora imóvel durante montagem das alças e repouso`, () => {
    const model = buildLabModel({ id: "finishing", product, m: materials() });
    const sim = createSimulation(1, {
      scope: "bench",
      environment: "finishing",
      product: product.id,
    });
    let cell = sim.snapshot.cells.find((c) => c.id === "finishing");
    updateLabModel(model, cell, product, 0.1, false, false);
    const ready = transforms(model.root);
    for (let i = 0; i < 5; i++)
      updateLabModel(model, cell, product, 0.1, false, false);
    assert.deepEqual(transforms(model.root), ready);
    const operating = {
      ...cell,
      part: true,
      phase: "processing",
      unit: { id: "UT-001", product: product.id, material: "polished-pot" },
      outputs: { motor: false, work: true, transfer: false },
      stage: { id: "handles", progress: 0 },
    };
    updateLabModel(model, operating, product, 0.1, true, false);
    const parked = transforms(model.workstation.finishing.tool);
    for (let i = 1; i <= 20; i++) {
      operating.stage.progress = i / 20;
      updateLabModel(model, operating, product, 0.1, true, false);
      assert.deepEqual(transforms(model.workstation.finishing.tool), parked);
    }
    const paused = transforms(model.root);
    for (let i = 0; i < 5; i++)
      updateLabModel(
        model,
        {
          ...operating,
          outputs: { motor: false, work: false, transfer: false },
        },
        product,
        0.1,
        false,
        false,
      );
    assert.deepEqual(transforms(model.root), paused);
    const mechanisms = [model.workstation.group, model.assembler.group];
    const before = mechanisms.map(transforms);
    updateLabModel(
      model,
      { ...cell, done: 1, phase: "idle", part: false },
      product,
      0.1,
      true,
      false,
    );
    assert.deepEqual(mechanisms.map(transforms), before);
  });
import { BEVERAGES } from "../src/simulator/industries/definitions.js";
import { buildBeveragesModel } from "../src/simulator/industries/factory-models.js";
import { buildIndustryStation } from "../src/simulator/industries/station-adapter.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
test("Bebidas8×: roletes parados sem transporte e mecanismo preservado na pausa", () => {
  const m = materials(),
    base = buildLabModel({ id: "industry", product: PRODUCTS[0], m });
  const station = buildIndustryStation({
    THREE,
    base,
    materials: m,
    definition: BEVERAGES,
    product: BEVERAGES.products[0],
    build: buildBeveragesModel,
  });
  const session = createIndustrySession(BEVERAGES);
  session.setQuantity(1);
  session.selectEnvironment("wash");
  session.setSpeed(8);
  station.selectStage("wash");
  station.update(session.snapshot, 0.1);
  const ready = transforms(base.root);
  for (let i = 0; i < 3; i++) station.update(session.snapshot, 0.1);
  assert.deepEqual(transforms(base.root), ready);
  session.start();
  for (let i = 0; i < 200; i++) {
    session.tick(0.025);
    if (
      session.snapshot.phase === "operating" &&
      session.snapshot.progress > 0.4
    )
      break;
  }
  session.pause();
  station.update(session.snapshot, 0.1);
  const paused = transforms(base.root);
  for (let i = 0; i < 3; i++) {
    session.tick(0.1);
    station.update(session.snapshot, 0.1);
  }
  assert.deepEqual(transforms(base.root), paused);
  const rollers = base.rollers.map((r) => r.quaternion.toArray());
  station.update(
    {
      ...session.snapshot,
      running: true,
      outputs: { motor: false, work: true, transfer: false },
    },
    0.1,
  );
  assert.deepEqual(
    base.rollers.map((r) => r.quaternion.toArray()),
    rollers,
  );
  station.update(
    {
      ...session.snapshot,
      running: true,
      outputs: { motor: true, work: false, transfer: false },
    },
    0.1,
  );
  assert.notDeepEqual(
    base.rollers.map((r) => r.quaternion.toArray()),
    rollers,
  );
  station.dispose();
});
