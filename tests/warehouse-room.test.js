import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildWarehouseRoom } from "../src/simulator/warehouse-room.js";
const overlap = (a, b) =>
  ["x", "y", "z"].every(
    (axis) =>
      Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) >
      1e-6,
  );

for (const wallZ of [9.6, 13])
  test(`galpão cinza ${wallZ}: passagem longitudinal livre e estrutura acima das máquinas`, () => {
    const root = new THREE.Group();
    const room = buildWarehouseRoom({ THREE, root }, { wallZ });
    root.updateMatrixWorld(true);
    const envelope = new THREE.Box3(
      new THREE.Vector3(-12.2, 0.2, -(wallZ - 1.1)),
      new THREE.Vector3(8.2, 6.4, wallZ - 1.1),
    );
    for (const mesh of room.solids) {
      assert.equal(
        overlap(envelope, new THREE.Box3().setFromObject(mesh)),
        false,
        mesh.name,
      );
    }
    // Both ends stay open at full transport height; there are no end walls.
    for (const x of [-12, 8]) {
      const opening = new THREE.Box3(
        new THREE.Vector3(x - 0.1, 0.1, -3),
        new THREE.Vector3(x + 0.1, 6.4, 3),
      );
      for (const mesh of room.solids)
        assert.equal(
          overlap(opening, new THREE.Box3().setFromObject(mesh)),
          false,
          mesh.name,
        );
    }
    assert.equal(room.lights.length, 2);
    assert.ok(room.lights.every((light) => !light.castShadow));
    for (const column of room.columns)
      assert.ok(Math.abs(column.position.z) > wallZ);
    assert.ok(
      room.group.children.every(
        (child) => !/caixa|palete|estoque/i.test(child.name),
      ),
    );
    assert.equal(room.floor.material.roughness, 0.42);
    room.dispose();
    assert.equal(root.children.length, 0);
  });

test("piso pode ser omitido para preservar a base existente sem planos coplanares", () => {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: "#164193" });
  let sharedDisposed = false;
  shared.addEventListener("dispose", () => {
    sharedDisposed = true;
  });
  const room = buildWarehouseRoom(
    { THREE, root, materials: { steel: shared } },
    { includeFloor: false, addLights: false },
  );
  assert.equal(room.floor, null);
  assert.equal(room.lights.length, 0);
  const original = room.columns.map((column) => column.position.toArray());
  room.setCutaway(true);
  assert.equal(room.roof.visible, false);
  assert.equal(room.walls.visible, false);
  assert.ok(room.columns.every(column=>!column.visible));
  assert.deepEqual(
    room.columns.map((column) => column.position.toArray()),
    original,
  );
  room.setCutaway(false);
  assert.equal(room.roof.visible, true);
  assert.equal(room.walls.visible, true);
  assert.ok(room.columns.every(column=>column.visible));
  room.dispose();
  assert.equal(sharedDisposed, false);
  assert.equal(shared.color.getHexString(), "164193");
  shared.dispose();
});

test("piso configurável suporta as colunas laterais e mantém o topo no datum indicado", () => {
  const root = new THREE.Group();
  const room = buildWarehouseRoom({ THREE, root }, { wallZ: 13 });
  root.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(room.floor);
  assert.equal(floor.min.x, -14.5);
  assert.equal(floor.max.x, 30.5);
  assert.ok(Math.abs(floor.max.y) < 1e-8);
  for (const column of room.columns) {
    const bounds = new THREE.Box3().setFromObject(column);
    assert.ok(bounds.min.z >= floor.min.z && bounds.max.z <= floor.max.z);
  }
  room.dispose();
});

test("rejeita cobertura ou paredes que invadiriam o espaço reservado aos equipamentos", () => {
  const root = new THREE.Group();
  for (const options of [
    { roofY: 6 },
    { wallZ: 6 },
    { floorBounds: { topY: 2 } },
  ])
    assert.throws(() => buildWarehouseRoom({ THREE, root }, options));
  assert.equal(root.children.length, 0);
});
