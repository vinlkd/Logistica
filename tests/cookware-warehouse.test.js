import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PRODUCTS } from "../src/simulator/products.js";
import {
  cookwareWarehouseAddress,
  cookwareWarehousePose,
} from "../src/simulator/cookware-warehouse.js";
import { getPresentation } from "../src/simulator/presentation.js";
import { boundsForPose, overlaps } from "../src/simulator/kinematics.js";
import { buildLabModel, updateLabModel } from "../src/simulator/lab-model.js";
import { createSimulation } from "../src/simulator/simulation.js";
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
for (const product of PRODUCTS)
  test(`${product.id}: seis endereços acessíveis sem cruzar prateleiras ou montantes`, () => {
    const model = buildLabModel({ id: "finished", product, m: materials() });
    assert.equal(model.warehouse.slots.length, 6);
    assert.equal(model.cargo.length, 0);
    assert.equal(model.outputs.length, 0);
    const stages = ["identify", "raise", "store", "retrieve", "lower"];
    for (let index = 1; index <= 6; index++) {
      const id = `UT-${String(index).padStart(3, "0")}`,
        slot = cookwareWarehouseAddress(id, product);
      let previous;
      for (const step of stages)
        for (let k = 0; k <= 100; k++) {
          const cell = {
            id: "finished",
            phase: "processing",
            part: true,
            unit: { id, product: product.id, material: "boxed-pot" },
            stage: { id: step, progress: k / 100 },
            done: index - 1,
            queue: 6 - index,
            outputs: { work: true, motor: false, transfer: false },
            inputs: {},
            guard: true,
          };
          const pose = getPresentation(cell, product.id),
            bounds = boundsForPose(pose, product.id);
          for (const fixed of model.solids)
            assert.equal(
              overlaps(bounds, fixed, 0.001),
              false,
              `${slot.label}/${step}/${k} atravessou ${JSON.stringify(fixed)}`,
            );
          if (previous && step !== "identify")
            assert.ok(
              Math.hypot(
                pose.x - previous.x,
                pose.z - previous.z,
                pose.support - previous.support,
              ) < 0.19,
              "salto na trajetória",
            );
          previous = pose;
        }
      const stored = cookwareWarehousePose(
        {
          id: "finished",
          phase: "processing",
          unit: { id },
          stage: { id: "store", progress: 1 },
        },
        product,
      );
      assert.equal(stored.x, slot.x);
      assert.equal(stored.z, slot.z);
      assert.ok(Math.abs(stored.support + 0.012 - slot.y) < 1e-8);
    }
  });
test("Armazém mantém progresso e endereço na pausa e conclui as caixas reais", () => {
  const product = PRODUCTS[0],
    model = buildLabModel({ id: "finished", product, m: materials() });
  const sim = createSimulation(6, {
    scope: "bench",
    environment: "finished",
    product: product.id,
  });
  sim.setSpeed(8);
  sim.start();
  let checked = false;
  for (let i = 0; i < 4000; i++) {
    sim.step(0.025);
    const cell = sim.snapshot.cells.find((c) => c.id === "finished");
    updateLabModel(
      model,
      cell,
      product,
      0,
      sim.snapshot.running,
      false,
      "bench",
      () => assert.fail("colisão detectada pelo modelo"),
    );
    if (!checked && cell.stage?.id === "store" && cell.stage.progress > 0.7) {
      sim.stop();
      const position = model.packed.position.toArray(),
        fork = model.warehouse.lift.position.toArray();
      sim.step(0.1);
      updateLabModel(
        model,
        sim.snapshot.cells.find((c) => c.id === "finished"),
        product,
        0.1,
        false,
        false,
      );
      assert.deepEqual(model.packed.position.toArray(), position);
      assert.deepEqual(model.warehouse.lift.position.toArray(), fork);
      const copy = createSimulation();
      assert.equal(copy.importState(sim.exportState()), true);
      assert.deepEqual(
        getPresentation(
          copy.snapshot.cells.find((c) => c.id === "finished"),
          product.id,
        ),
        getPresentation(
          sim.snapshot.cells.find((c) => c.id === "finished"),
          product.id,
        ),
      );
      sim.start();
      checked = true;
    }
    if (sim.snapshot.done === 6) break;
  }
  assert.equal(checked, true);
  assert.equal(sim.snapshot.done, 6);
  assert.equal(new Set(sim.snapshot.completedUnits.map((u) => u.id)).size, 6);
});

test("Armazém MP mantém só as pilhas reais e deixa a rota do ímã livre", () => {
  const product = PRODUCTS[0],
    model = buildLabModel({ id: "raw", product, m: materials() });
  const sim = createSimulation(4, {
    scope: "bench",
    environment: "raw",
    product: product.id,
  });
  sim.setSpeed(8);
  sim.start();
  assert.equal(model.warehouse.slots.length, 4);
  for (let i = 0; i < 2000; i++) {
    sim.step(0.01);
    const cell = sim.snapshot.cells.find((c) => c.id === "raw");
    updateLabModel(
      model,
      cell,
      product,
      0,
      sim.snapshot.running,
      false,
      "bench",
      () => assert.fail("Colisão na rota das pilhas"),
    );
    if (sim.snapshot.done === 4) break;
  }
  assert.equal(sim.snapshot.done, 4);
  assert.equal(model.inputs.filter((o) => o.visible).length, 0);
});
