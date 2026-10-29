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
    ].map((key) => [key, new THREE.MeshStandardMaterial()]),
  );
function visible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}
for (const quantity of [1, 12, 24])
  test(`recebimento pronto: ${quantity} discos aparecem no baú antes de iniciar`, () => {
    const product = PRODUCTS[0];
    const model = buildLabModel({ id: "receiving", product, m: materials() });
    const sim = createSimulation(quantity, { onDemand: true });
    const cell = sim.snapshot.cells[0];
    // An initially empty preview must update when the real saved queue is loaded.
    updateLabModel(
      model,
      { ...cell, queue: 0 },
      product,
      0,
      false,
      false,
      "line",
    );
    updateLabModel(model, cell, product, 0, false, false, "line");
    const receiving = model.receivingPickup;
    assert.equal(
      receiving.crates.filter((c) => c.visible).length,
      Math.ceil(quantity / 12),
    );
    assert.equal(
      [...receiving.copies.values()].filter((c) => c.visible).length,
      quantity,
    );
    model.root.updateMatrixWorld(true);
    const camera = new THREE.Vector3(-5, 10, 20);
    // The front camera must see the first actual cargo crate instead of a folded door.
    const target = receiving.crates[0]
      .getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, 0.2, 0));
    const ray = new THREE.Raycaster(
      camera,
      target.clone().sub(camera).normalize(),
    );
    const hit = ray
      .intersectObject(model.root, true)
      .find((h) => visible(h.object));
    assert.ok(hit, "cargo must be rendered");
    let cargo = hit.object;
    while (cargo && !receiving.crates.includes(cargo)) cargo = cargo.parent;
    assert.ok(cargo && cargo.visible, `cargo hidden by ${hit.object.name}`);
  });

test("recebimento: a doca não cobre nem atravessa os roletes originais", () => {
  const product = PRODUCTS[0];
  const model = buildLabModel({ id: "receiving", product, m: materials() });
  const cell = createSimulation(12, { onDemand: true }).snapshot.cells[0];
  updateLabModel(model, cell, product, 0, false, false, "line");
  model.root.updateMatrixWorld(true);
  const fixed = [];
  model.receivingPickup.group.traverseVisible((object) => {
    if (object.isMesh) fixed.push(new THREE.Box3().setFromObject(object));
  });
  for (const roller of model.rollers) {
    const bounds = new THREE.Box3().setFromObject(roller);
    for (const obstacle of fixed)
      assert.equal(
        ["x", "y", "z"].every(
          (axis) =>
            Math.min(bounds.max[axis], obstacle.max[axis]) -
              Math.max(bounds.min[axis], obstacle.min[axis]) >
            1e-5,
        ),
        false,
        "estrutura da doca dentro do transportador",
      );
  }
});
