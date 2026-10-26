import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { applyCookwareFinish } from "../src/simulator/cookware-finish.js";
import { buildLabModel, updateLabModel } from "../src/simulator/lab-model.js";
import { getPresentation } from "../src/simulator/presentation.js";
import { createSimulation } from "../src/simulator/simulation.js";
import { PRODUCTS } from "../src/simulator/products.js";
THREE.TextureLoader.prototype.load = function () {
  return new THREE.Texture();
};
function fixture(product, id) {
  const m = Object.fromEntries(
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
  return buildLabModel({ id, product, m });
}
test("acabamento reduz rugosidade progressivamente sem perder comportamento metálico", () => {
  const material = new THREE.MeshStandardMaterial();
  let previous = 1;
  for (let i = 0; i <= 100; i++) {
    applyCookwareFinish(material, i / 100);
    assert.ok(material.roughness <= previous);
    assert.ok(material.metalness >= 0.76);
    assert.ok(material.color.r <= 0.68 + 1e-9);
    previous = material.roughness;
  }
  assert.ok(material.roughness < 0.16);
  assert.ok(material.metalness > 0.98);
});
for (const product of PRODUCTS)
  test(`${product.id}: brilho acompanha o polimento e permanece ao chegar à qualidade`, () => {
    const model = fixture(product, "finishing"),
      sim = createSimulation(1, {
        scope: "bench",
        environment: "finishing",
        product: product.id,
      });
    const base = sim.snapshot.cells.find((c) => c.id === "finishing");
    const geometry = model.cookware.body.geometry;
    const rough = [];
    for (const progress of [0, 0.5, 1]) {
      const cell = {
        ...base,
        part: true,
        phase: "processing",
        stage: { id: "polish", progress },
        unit: { id: "TEST", product: product.id, material: "formed-pot" },
        outputs: {},
      };
      updateLabModel(model, cell, product, 0, false, false);
      rough.push(model.cookware.metal.roughness);
      assert.equal(model.cookware.body.geometry, geometry);
    }
    assert.ok(rough[0] > rough[1] && rough[1] > rough[2]);
    assert.ok(rough[0] / rough[2] > 5.5);
    const line = createSimulation(1, {
      scope: "line",
      product: product.id,
      mode: "auto",
    });
    line.start();
    let quality;
    for (let i = 0; i < 20000; i++) {
      line.step(0.05);
      quality = line.snapshot.cells.find((c) => c.id === "quality");
      if (quality.part) break;
    }
    const subsequent = new Set();
    for (let i = 0; i < 20000; i++) {
      for (const cell of line.snapshot.cells)
        if (
          ["quality", "packing", "finished", "shipping"].includes(cell.id) &&
          cell.part
        ) {
          assert.equal(getPresentation(cell, product.id).polish, 1, cell.id);
          subsequent.add(cell.id);
        }
      if (line.snapshot.done === 1) break;
      line.step(0.05);
    }
    assert.deepEqual(
      [...subsequent],
      ["quality", "packing", "finished", "shipping"],
    );
    assert.ok(quality.part);
    assert.equal(getPresentation(quality, product.id).polish, 1);
    const next = fixture(product, "quality");
    updateLabModel(next, quality, product, 0, false, false);
    assert.equal(next.cookware.metal.roughness, rough[2]);
    assert.deepEqual(
      next.cookware.metal.color.toArray(),
      model.cookware.metal.color.toArray(),
    );
  });
