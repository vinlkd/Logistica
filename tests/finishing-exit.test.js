import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";
import { buildLabModel, updateLabModel } from "../src/simulator/lab-model.js";
import { createSimulation } from "../src/simulator/simulation.js";
import { PRODUCTS } from "../src/simulator/products.js";
THREE.TextureLoader.prototype.load = function () {
  return new THREE.Texture();
};
const isVisible = (o) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};
function obb(o) {
  o.geometry.computeBoundingBox();
  const b = new OBB().fromBox3(o.geometry.boundingBox);
  b.halfSize.addScalar(-0.001);
  return b.applyMatrix4(o.matrixWorld);
}
for (const product of PRODUCTS)
  test(`${product.id}: saída do polimento inclui corpo, borda e cabos sem cruzar estrutura`, () => {
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
    const model = buildLabModel({ id: "finishing", product, m });
    const sim = createSimulation(1, {
      scope: "bench",
      environment: "finishing",
      product: product.id,
      mode: "auto",
    });
    sim.start();
    let samples = 0,
      paused = false;
    const previous = new Map();
    for (let i = 0; i < 3000; i++) {
      sim.step(0.01);
      const cell = sim.snapshot.cells.find((c) => c.id === "finishing");
      updateLabModel(model, cell, product, 0, false, false);
      model.root.updateMatrixWorld(true);
      if (sim.snapshot.done === 1) break;
      if (!model.assembler.mounted || !cell.part) continue;
      if (!paused && cell.phase === "unloading" && cell.progress > 0.56) {
        sim.stop();
        const point = model.active.position.toArray();
        const stage = structuredClone(cell.stage);
        sim.step(0.2);
        const frozen = sim.snapshot.cells.find((c) => c.id === "finishing");
        updateLabModel(model, frozen, product, 0, false, false);
        assert.deepEqual(model.active.position.toArray(), point);
        assert.deepEqual(frozen.stage, stage);
        const restored = createSimulation();
        assert.equal(restored.importState(sim.exportState()), true);
        assert.equal(restored.snapshot.running, false);
        assert.deepEqual(
          restored.snapshot.cells.find((c) => c.id === "finishing").stage,
          stage,
        );
        sim.start();
        paused = true;
      }
      samples++;
      const moving = [];
      for (const parent of [model.active, model.assembler.handles])
        parent.traverse((o) => {
          if (o.isMesh && isVisible(o)) moving.push(o);
        });
      const obstacles = [];
      model.workstation.group.traverse((o) => {
        if (o.isMesh && isVisible(o)) {
          const b = new THREE.Box3().setFromObject(o);
          if (b.max.y > 1.23) obstacles.push(o);
        }
      });
      for (const part of moving) {
        const bounds = new THREE.Box3()
          .setFromObject(part)
          .expandByScalar(-0.001);
        const swept = bounds.clone();
        if (previous.has(part)) swept.union(previous.get(part));
        const envelope = new OBB().fromBox3(swept);
        for (const obstacle of obstacles) {
          assert.equal(
            obb(part).intersectsOBB(obb(obstacle)),
            false,
            `${cell.phase}/${cell.stage?.id}: peça/estrutura`,
          );
          assert.equal(
            envelope.intersectsOBB(obb(obstacle)),
            false,
            `${cell.phase}/${cell.stage?.id}: volume varrido incluindo cabos`,
          );
        }
        previous.set(part, bounds);
      }
      if (sim.snapshot.done === 1) break;
    }
    assert.ok(samples > 100);
    assert.ok(paused);
  });
