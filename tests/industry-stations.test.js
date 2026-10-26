import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildLabModel } from "../src/simulator/lab-model.js";
import { getProduct } from "../src/simulator/products.js";
import {
  BEVERAGES,
  FURNITURE,
} from "../src/simulator/industries/definitions.js";
import {
  PARCELS,
  buildParcelsModel,
} from "../src/simulator/industries/parcels.js";
import {
  buildBeveragesModel,
  buildFurnitureModel,
} from "../src/simulator/industries/factory-models.js";
import { buildIndustryStation } from "../src/simulator/industries/station-adapter.js";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";
function fixture(definition, build) {
  const materials = Object.fromEntries(
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
  const base = buildLabModel({
    id: "industry",
    product: getProduct("saucepan"),
    m: materials,
  });
  base.active.visible = base.packed.visible = base.blank.group.visible = false;
  const station = buildIndustryStation({
    THREE,
    base,
    materials,
    definition,
    product: definition.products[0],
    build,
  });
  return {
    base,
    station,
    dispose() {
      station.dispose();
      base.root.traverse((o) => o.geometry?.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
for (const [definition, build] of [
  [BEVERAGES, buildBeveragesModel],
  [FURNITURE, buildFurnitureModel],
  [PARCELS, buildParcelsModel],
]) {
  test(`${definition.id}: original base stays fixed and station visibility survives revisits`, () => {
    const f = fixture(definition, build);
    try {
      const floor = f.base.root.children.find((o) => o.name === "sector-floor");
      assert.equal(floor.geometry.parameters.width, 16);
      const signatures = [];
      for (let cycle = 0; cycle < 2; cycle++) {
        const counts = [];
        for (const step of definition.steps) {
          f.station.selectStage(step.id);
          f.base.root.updateMatrixWorld(true);
          assert.equal(f.station.root.position.x, -step.x);
          let n = 0;
          f.station.root.traverse((o) => {
            if (o.isMesh && o.visible && o.parent.visible) n++;
          });
          counts.push(n);
          assert.ok(
            !f.station.root.children.some(
              (o) => o.name === "Piso da indústria",
            ),
          );
        }
        signatures.push(counts);
      }
      assert.deepEqual(signatures[0], signatures[1]);
      if (definition === FURNITURE) {
        f.station.selectStage("cut");
        assert.equal(f.station.model.saw.visible, true);
        assert.equal(f.station.model.drillHead.visible, false);
        f.station.selectStage("drill");
        assert.equal(f.station.model.drillHead.visible, true);
        assert.equal(f.station.model.saw.visible, false);
      }
    } finally {
      f.dispose();
    }
  });
  test(`${definition.id}: automatic batch completes using the original station adapter`, () => {
    const f = fixture(definition, build),
      sim = createProcessSimulation(definition, { quantity: 1, mode: "auto" });
    sim.start();
    try {
      for (let n = 0; n < 4000 && sim.snapshot.done < 1; n++) {
        sim.tick(0.05);
        const s = sim.snapshot;
        f.station.selectStage(s.step.id);
        f.station.update(s, 0.05);
        assert.ok(Number.isFinite(f.station.root.position.x));
      }
      assert.equal(sim.snapshot.done, 1, sim.snapshot.fault);
    } finally {
      f.dispose();
    }
  });
}
test("cap feed replaces occupied roller portions while the bottle remains supported", () => {
  const f = fixture(BEVERAGES, buildBeveragesModel);
  try {
    f.station.selectStage("cap");
    f.base.root.updateMatrixWorld(true);
    const tray = f.station.root.children.find(
      (o) =>
        o.isMesh &&
        Math.abs(o.position.y - 1.16) < 1e-6 &&
        Math.abs(o.position.z + 1.4) < 1e-6,
    );
    assert.ok(tray);
    const occupied = new THREE.Box3()
      .setFromObject(tray)
      .expandByScalar(-0.001);
    const rollers = [
      ...f.base.rollers.filter((o) => o.visible),
      ...f.station.splitRollers.children,
    ];
    for (const roller of rollers)
      assert.equal(
        new THREE.Box3().setFromObject(roller).intersectsBox(occupied),
        false,
      );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 1.3, 0),
      new THREE.Vector3(0, -1, 0),
      0,
      0.15,
    );
    const support = ray.intersectObjects(rollers, false)[0];
    assert.ok(support, "garrafa sem apoio sob o centro");
    assert.ok(support.point.y > 1.21 && support.point.y < 1.23);
  } finally {
    f.dispose();
  }
});
