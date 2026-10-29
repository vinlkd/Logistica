import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";
import {
  cookwareReceivingDuration,
  discReceivingState,
  cookwareReceivingStateFromCell,
  cookwareSourceSlot,
  cookwareEmptySlot,
} from "../src/simulator/cookware-receiving-flow.js";
import { buildCookwareReceiving } from "../src/simulator/industries/cookware-receiving.js";
import { receivingPickupPose } from "../src/simulator/receiving-pickup.js";
const fixture = () => {
  const root = new THREE.Group(),
    materials = Object.fromEntries(
      [
        "blue",
        "accent",
        "white",
        "steel",
        "dark",
        "yellow",
        "box",
        "tape",
        "belt",
        "wood",
        "glass",
        "green",
      ].map((k) => [k, new THREE.MeshStandardMaterial()]),
    );
  const box = (g, x, y, z, w, h, d, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const cyl = (g, x, y, z, r, h, m) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  return { THREE, root, materials, box, cyl };
};
const same = (a, b) =>
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-8);
function meshes(root) {
  const result = [];
  root.traverseVisible((o) => {
    if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const obb = new OBB().fromBox3(o.geometry.boundingBox);
      obb.halfSize.subScalar(1e-6);
      obb.applyMatrix4(o.matrixWorld);
      result.push({ mesh: o, obb });
    }
  });
  return result;
}
for (const total of [1, 12, 24, 50])
  test(`discos ${total}: duração física, sequência contínua, apoio e fonte finita`, () => {
    for (let index = 0; index < total; index++) {
      const duration = cookwareReceivingDuration(index, total);
      assert.ok(duration > 7);
      let previous = discReceivingState(0, index, total);
      for (let sample = 1; sample <= 800; sample++) {
        const state = discReceivingState(sample / 800, index, total),
          dt = duration / 800;
        for (const key of ["crate", "head", "carrier", "material"])
          assert.ok(
            Math.hypot(
              state[key].x - previous[key].x,
              state[key].y - previous[key].y,
              state[key].z - previous[key].z,
            ) <=
              2.088 * dt + 1e-7,
            `${index}/${state.stage}/${key} saltou`,
          );
        if (state.stage === "feedDisc") {
          assert.equal(state.material.y, 1.207);
          assert.equal(state.material.z, 0);
          assert.equal(state.grip, 0);
        }
        if (state.gripping)
          assert.ok(
            state.major === 1 && state.minor === 1,
            "extraiu antes de abrir",
          );
        if (state.stage === "lowerEmpty") {
          assert.equal(state.carrier.x, -4.1);
          assert.equal(state.carrier.z, 0);
        }
        previous = state;
      }
      same(previous.material, { x: 0, y: 1.207, z: 0 });
      if (index % 12 === 0)
        same(
          discReceivingState(0, index, total).crate,
          cookwareSourceSlot(Math.floor(index / 12)),
        );
    }
  });
test("ready mostra caixas fechadas e discos reais; pausa conserva todos os mecanismos", () => {
  const args = fixture(),
    model = buildCookwareReceiving(args);
  const base = {
    done: 0,
    queue: 24,
    part: false,
    phase: "idle",
    progress: 0,
    guard: true,
    outputs: { motor: false, work: false, transfer: false },
  };
  model.update(base);
  assert.equal(model.crates.filter((c) => c.visible).length, 2);
  assert.equal([...model.copies.values()].filter((c) => c.visible).length, 24);
  assert.ok(
    model.sourceCases[0].flaps.every((f) => f.group.rotation[f.axis] === 0),
  );
  const active = {
    ...base,
    queue: 23,
    part: true,
    unit: { id: "UT-001", product: "saucepan" },
    phase: "feeding",
    progress: 0.3,
    outputs: { motor: true },
  };
  model.update(active);
  const transforms = () => {
    const result = [];
    model.group.traverse((o) =>
      result.push([
        ...o.position.toArray(),
        ...o.quaternion.toArray(),
        ...o.scale.toArray(),
        o.visible,
      ]),
    );
    return result;
  };
  const held = transforms();
  model.update({ ...active, progress: 0.4, outputs: { motor: false } });
  assert.deepEqual(transforms(), held);
  const rebuilt = buildCookwareReceiving(fixture());
  rebuilt.update({ ...active, outputs: { motor: false } });
  same(rebuilt.state.material, model.state.material);
  model.dispose();
  rebuilt.dispose();
});
test("disco e eletroímã não cruzam paredes, abas ou outros discos nos 50 destinos", () => {
  const args = fixture(),
    model = buildCookwareReceiving(args);
  const material = args.cyl(
    args.root,
    0,
    0,
    0,
    0.62,
    0.002,
    args.materials.steel,
  );
  for (let index = 0; index < 50; index++) {
    const duration = cookwareReceivingDuration(index, 50),
      samples = new Set(Array.from({ length: 101 }, (_, i) => i / 100));
    for (let time = 0; time < duration; time += 0.8)
      samples.add(time / duration);
    for (const progress of [...samples].sort((a, b) => a - b)) {
      const sample = progress;
      const cell = {
        done: index,
        queue: 49 - index,
        part: true,
        phase: "feeding",
        progress: 0.5 * progress,
        guard: true,
        outputs: { motor: true },
        unit: { id: `UT-${index + 1}`, product: "saucepan" },
      };
      model.update(cell);
      const state = model.state;
      material.position.set(
        state.material.x,
        state.material.y - 0.001,
        state.material.z,
      );
      args.root.updateMatrixWorld(true);
      const moving = meshes(material),
        magnet = meshes(model.head),
        obstacles = model.sourceCases
          .filter((c) => c.group.visible)
          .flatMap((c) => meshes(c.group));
      for (const item of [...moving, ...magnet])
        for (const obstacle of obstacles)
          assert.equal(
            item.obb.intersectsOBB(obstacle.obb, 1e-10),
            false,
            `${index}/${sample}/${state.stage}: ${item.mesh.name} cruza ${obstacle.mesh.name}`,
          );
      const pure = receivingPickupPose(cell);
      assert.ok(Math.abs(pure.x - state.material.x) < 1e-8);
      assert.ok(Math.abs(pure.support + 0.012 - state.material.y) < 1e-8);
    }
  }
  same(discReceivingState(1, 49, 50).crate, cookwareEmptySlot(4));
  model.dispose();
});

test("caixas carregadas e vazias respeitam o baú e os volumes anteriores durante a transferência", () => {
  const args = fixture(),
    model = buildCookwareReceiving(args);
  for (const index of [0, 11, 12, 23, 24, 35, 36, 47, 48, 49])
    for (let sample = 0; sample <= 150; sample++) {
      model.update({
        done: index,
        queue: 49 - index,
        part: true,
        phase: "feeding",
        progress: (0.5 * sample) / 150,
        guard: true,
        outputs: { motor: true },
        unit: { id: `UT-${index + 1}`, product: "saucepan" },
      });
      args.root.updateMatrixWorld(true);
      const current = model.state.caseIndex;
      const active = meshes(model.sourceCases[current].group);
      const obstacles = [
        ...meshes(model.dock.truck),
        ...model.sourceCases
          .filter((item, i) => i !== current && item.group.visible)
          .flatMap((item) => meshes(item.group)),
      ];
      for (const a of active)
        for (const b of obstacles)
          assert.equal(
            a.obb.intersectsOBB(b.obb, 1e-10),
            false,
            `${index}/${sample}/${model.state.stage}: caixa cruza ${b.mesh.name}`,
          );
      const hoist = [
        ...meshes(model.dock.transfer),
        ...meshes(model.dock.hoist),
      ];
      const cartons = model.sourceCases
        .filter((item) => item.group.visible)
        .flatMap((item) => meshes(item.group));
      for (const a of hoist)
        for (const b of cartons)
          assert.equal(
            a.obb.intersectsOBB(b.obb, 1e-10),
            false,
            `${index}/${sample}/${model.state.stage}: garfo cruza ${b.mesh.name}`,
          );
    }
  model.dispose();
});
