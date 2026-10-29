import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildLabModel } from "../src/simulator/lab-model.js";
import { getProduct } from "../src/simulator/products.js";
import {
  buildTruckDock,
  receivingDockPose,
} from "../src/simulator/industries/truck-dock.js";
import { FURNITURE } from "../src/simulator/industries/definitions.js";
import { buildFurnitureModel } from "../src/simulator/industries/furniture-model.js";
import {
  furnitureCargoSlot,
  furnitureInputSlot,
} from "../src/simulator/industries/furniture-trucks.js";
import {
  PARCELS,
  PARCEL_ROUTES,
  buildParcelsModel,
  parcelLoadingMotion,
  parcelInputSlot,
} from "../src/simulator/industries/parcels.js";
const overlap = (a, b) =>
  ["x", "y", "z"].every(
    (k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 1e-6,
  );
function fixture() {
  const root = new THREE.Group(),
    materials = Object.fromEntries(
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
        "accent",
        "water",
      ].map((k) => [k, new THREE.MeshStandardMaterial()]),
    );
  const box = (g, x, y, z, w, h, d, m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const cyl = (g, x, y, z, r, h, m) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), m);
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
  return { THREE, root, materials, box, cyl, bar };
}
function bounds(root) {
  root.updateWorldMatrix(true, true);
  const list = [];
  root.traverseVisible((o) => {
    if (o.isMesh)
      list.push({ name: o.name, bounds: new THREE.Box3().setFromObject(o) });
  });
  return list;
}
function cargoBounds(p, size) {
  const b = new THREE.Box3(
    new THREE.Vector3(-size[0] / 2, 0, -size[2] / 2),
    new THREE.Vector3(size[0] / 2, size[1], size[2] / 2),
  );
  return b
    .applyMatrix4(new THREE.Matrix4().makeRotationY(p.rotation ?? 0))
    .translate(new THREE.Vector3(p.x, p.y, p.z));
}
function signature(truck) {
  const result = [];
  truck.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.parameters;
    if (p?.width === 6.65 && p.height === 0.07) return;
    result.push({
      geometry: [...o.geometry.attributes.position.array],
      position: o.position.toArray(),
      rotation: o.quaternion.toArray(),
      scale: o.scale.toArray(),
      material: {
        type: o.material.type,
        color: o.material.color?.getHex(),
        metalness: o.material.metalness,
        roughness: o.material.roughness,
      },
    });
  });
  return result;
}
for (const shipping of [false, true])
  test(`caminhão ${shipping ? "expedição" : "recebimento"}: geometria e materiais iguais aos das panelas`, () => {
    const args = fixture(),
      canonical = buildLabModel({
        id: shipping ? "shipping" : "receiving",
        product: getProduct("saucepan"),
        m: args.materials,
      }),
      dock = buildTruckDock(args, {
        shipping,
        stageId: "test",
        outwardDoors: !shipping,
      });
    assert.deepEqual(signature(dock.truck), signature(canonical.truck.truck));
    assert.deepEqual(dock.truck.scale.toArray(), [1, 1, 1]);
    dock.dispose();
    canonical.root.traverse((o) => o.geometry?.dispose());
    Object.values(args.materials).forEach((m) => m.dispose());
  });
for (const product of FURNITURE.products)
  test(`móveis ${product.id}: 30 cargas passam pela traseira sem atravessar caminhão ou outras cargas`, () => {
    const args = fixture(),
      model = buildFurnitureModel({ ...args, definition: FURNITURE, product }),
      target = (product.length / 100) * 1.25,
      step = FURNITURE.steps.at(-1),
      settings = Object.fromEntries(
        FURNITURE.controls.map((c) => [c.id, c.value]),
      );
    const body = bounds(model.docks.outgoing.truck),
      stored = [];
    for (let done = 0; done < 30; done++) {
      const unit = {
        id: `LOT-${String(done + 1).padStart(3, "0")}`,
        cut: true,
        drilled: true,
        assembled: true,
        packed: true,
      };
      let previous;
      for (let i = 0; i <= 100; i++) {
        const state = {
            phase: "outgoing",
            scope: "bench",
            step,
            progress: i / 100,
            done,
            total: 30,
            unit,
            settings,
            position: { x: step.x },
          },
          p = model.docks.outputPose(state, target);
        // The closed carton extends .03 below the furniture origin and 1.0625 above it.
        const b = cargoBounds({ ...p, y: p.y - 0.03 }, [
          target + 0.25,
          1.0925,
          0.98,
        ]);
        for (const obstacle of body)
          assert.equal(
            overlap(b, obstacle.bounds),
            false,
            `Baú ${done}/${i}: ${obstacle.name}`,
          );
        for (const old of stored)
          assert.equal(overlap(b, old), false, `Carga anterior ${done}/${i}`);
        if (previous)
          assert.ok(
            new THREE.Vector3(p.x, p.y, p.z).distanceTo(previous) < 0.5,
          );
        previous = new THREE.Vector3(p.x, p.y, p.z);
      }
      const slot = furnitureCargoSlot(done, target, step.x);
      stored.push(
        cargoBounds({ ...slot, y: slot.y - 0.03 }, [
          target + 0.25,
          1.0925,
          0.98,
        ]),
      );
    }
    model.dispose();
    Object.values(args.materials).forEach((m) => m.dispose());
  });
for (const route of PARCEL_ROUTES)
  test(`encomendas ${route.name}: entrada e saída de 30 volumes respeitam teto, paredes e carga restante`, () => {
    const args = fixture(),
      model = buildParcelsModel({ ...args, product: { id: route.id } }),
      out = model.trucks.find((d) => d.group.userData.route === route.id),
      outputBody = bounds(out.truck),
      inputBody = bounds(model.incoming.truck),
      stored = [];
    for (let done = 0; done < 30; done++) {
      for (let i = 0; i <= 100; i++) {
        const p = parcelLoadingMotion({
            phase: "operating",
            step: PARCELS.steps.at(-1),
            progress: i / 100,
            done,
            unit: { destination: route.id },
          }).pose,
          b = cargoBounds({ ...p, y: p.y - 0.31 }, [0.72, 0.62, 0.58]);
        for (const obstacle of outputBody)
          assert.equal(
            overlap(b, obstacle.bounds),
            false,
            `Expedição ${done}/${i}: ${obstacle.name}`,
          );
        for (const old of stored)
          assert.equal(overlap(b, old), false, `Outra carga ${done}/${i}`);
        if (i === 100) stored.push(b);
        const slot = parcelInputSlot(29 - done),
          input = receivingDockPose(i / 100, slot, {
            x: -6,
            y: 1.522,
            raise: 0.65,
          }),
          incoming = cargoBounds(
            { ...input, y: input.y - 0.31 },
            [0.72, 0.62, 0.58],
          );
        for (const obstacle of inputBody)
          assert.equal(
            overlap(incoming, obstacle.bounds),
            false,
            `Recebimento ${done}/${i}: ${obstacle.name}`,
          );
        for (let index = 0; index < 29 - done; index++) {
          const old = parcelInputSlot(index);
          assert.equal(
            overlap(
              incoming,
              cargoBounds({ ...old, y: old.y - 0.31 }, [0.72, 0.62, 0.58]),
            ),
            false,
            `Carga recebida ${done}/${i}/${index}`,
          );
        }
      }
    }
    model.dispose();
    Object.values(args.materials).forEach((m) => m.dispose());
  });
