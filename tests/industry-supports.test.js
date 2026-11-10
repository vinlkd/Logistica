import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import {
  buildBeveragesModel,
  buildFurnitureModel,
} from "../src/simulator/industries/factory-models.js";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";
function fixture(definition, product) {
  const root = new THREE.Group(),
    materials = Object.fromEntries(
      [
        "steel",
        "dark",
        "blue",
        "white",
        "accent",
        "yellow",
        "water",
        "wood",
        "box",
        "floor",
      ].map((k) => [k, new THREE.MeshStandardMaterial()]),
    );
  materials.glass = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.12,
  });
  const box = (g, x, y, z, w, h, d, m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const cyl = (g, x, y, z, r, h, m) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const bar = (g, a, b, r, m) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av),
      o = cyl(
        g,
        ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
        r,
        v.length(),
        m,
      );
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return o;
  };
  const model = (
    definition.id === "beverages" ? buildBeveragesModel : buildFurnitureModel
  )({ THREE, root, box, cyl, bar, materials, definition, product });
  return {
    root,
    model,
    dispose() {
      model.dispose();
      root.traverse((o) => o.geometry?.dispose());
      for (const m of Object.values(materials)) m.dispose();
    },
  };
}
function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
for (const definition of [BEVERAGES, FURNITURE])
  for (const product of definition.products) {
    test(`${definition.id}/${product.id}: meshes respeitam o piso em todo o ciclo`, () => {
      const f = fixture(definition, product),
        sim = createProcessSimulation(definition, {
          product: product.id,
          quantity: 1,
          mode: "auto",
        });
      if (definition.id === "beverages")
        sim.setSetting("volume", product.volume);
      else sim.setSetting("cutLength", product.length);
      sim.setSpeed(4);
      sim.start();
      try {
        for (let i = 0; i < 3000 && sim.snapshot.done < 1; i++) {
          sim.tick(0.025);
          f.model.update(sim.snapshot, 0.025);
          f.root.updateMatrixWorld(true);
          if (i % 8 === 0)
            f.root.traverse((o) => {
              if (!o.isMesh || !isVisible(o) || o.name === "Piso da indústria")
                return;
              o.geometry.computeBoundingBox();
              const b = o.geometry.boundingBox
                .clone()
                .applyMatrix4(o.matrixWorld);
              assert.ok(
                b.min.y >= -0.0001,
                `${o.geometry.type} abaixo do piso: ${b.min.y}`,
              );
            });
        }
        assert.equal(sim.snapshot.done, 1);
      } finally {
        f.dispose();
      }
    });
    if (definition.id === "furniture")
      test(`${product.id}: quatro montantes apoiam o tampo sem atravessá-lo`, () => {
        const f = fixture(definition, product),
          unit = {
            id: "LOT-001",
            ...definition.initialize(product),
            cut: true,
            drilled: true,
            assembled: true,
          };
        f.model.update(
          {
            phase: "ready",
            step: definition.steps[4],
            progress: 0,
            unit,
            settings: { guardClosed: true },
            position: { x: 3.6 },
          },
          0,
        );
        f.root.updateMatrixWorld(true);
        const board = new THREE.Box3().setFromObject(f.model.board);
        for (const leg of f.model.legs) {
          const b = new THREE.Box3().setFromObject(leg);
          assert.ok(Math.abs(b.max.y - board.min.y) < 1e-6);
          assert.ok(b.min.x > board.min.x && b.max.x < board.max.x);
          assert.ok(Math.abs(b.min.y - 1.2) < 1e-6);
        }
        f.dispose();
      });
  }
