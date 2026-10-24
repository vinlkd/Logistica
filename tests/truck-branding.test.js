import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PRODUCTS } from "../src/simulator/products.js";
import { getLayout } from "../src/simulator/kinematics.js";
import { buildTruck } from "../src/simulator/trucks.js";

for (const product of PRODUCTS)
  for (const shipping of [false, true]) {
    test(`${product.id}/${shipping ? "shipping" : "receiving"}: truck has no SENAI logo mesh or texture request`, () => {
      const root = new THREE.Group(),
        requests = [];
      const materials = Object.fromEntries(
        ["dark", "steel", "white", "yellow"].map((name) => [
          name,
          new THREE.MeshStandardMaterial(),
        ]),
      );
      const box = (group, x, y, z, w, h, d, material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
      };
      const cyl = (group, x, y, z, r, h, material = materials.steel) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, h, 16),
          material,
        );
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
      };
      const bar = (group, a, b, radius, material = materials.steel) => {
        const start = new THREE.Vector3(...a),
          end = new THREE.Vector3(...b),
          delta = end.clone().sub(start);
        const mesh = cyl(
          group,
          ...start.clone().add(end).multiplyScalar(0.5).toArray(),
          radius,
          delta.length(),
          material,
        );
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.normalize(),
        );
        return mesh;
      };
      const testingThree = {
        ...THREE,
        TextureLoader: class {
          load(url) {
            requests.push(String(url));
            return new THREE.Texture();
          }
        },
      };
      const model = buildTruck({
        root,
        THREE: testingThree,
        box,
        cyl,
        bar,
        m: materials,
        shipping,
        layout: getLayout(product.id),
      });
      try {
        assert.equal(
          requests.some((url) => /senai/i.test(url)),
          false,
          "Truck must not request the SENAI image",
        );
        model.truck.traverse((object) =>
          assert.doesNotMatch(object.name, /senai.*logo|logo.*senai/i),
        );
      } finally {
        root.traverse((object) => object.geometry?.dispose());
        for (const material of model.materials ?? []) material.dispose();
        for (const material of Object.values(materials)) material.dispose();
        for (const texture of model.textures ?? []) texture.dispose();
      }
    });
  }
