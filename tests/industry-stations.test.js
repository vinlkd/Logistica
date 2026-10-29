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
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
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
  test(`${definition.id}: station coordinates and visibility survive revisits`, () => {
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
          assert.ok(
            Math.abs(
              f.base.root.position.x + f.station.root.position.x + step.x,
            ) < 1e-9,
          );
          if (
            definition.id === "beverages" &&
            ["pack", "seal", "ship"].includes(step.id)
          )
            assert.ok(
              Math.abs(
                f.base.root.position.x -
                  (definition.steps.find((s) => s.id === "pack").x - step.x),
              ) < 1e-9,
            );
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

test("pipeline: cada estação mostra sua própria garrafa e não inventa peça na estação vazia", () => {
  const f = fixture(BEVERAGES, buildBeveragesModel);
  const settings = Object.fromEntries(
    BEVERAGES.controls.map((c) => [c.id, c.value]),
  );
  const wash = BEVERAGES.steps.find((s) => s.id === "wash");
  const fill = BEVERAGES.steps.find((s) => s.id === "fill");
  const station = {
    scope: "line",
    phase: "operating",
    step: wash,
    progress: 0.3,
    running: false,
    settings,
    done: 0,
    total: 108,
    unit: {
      ...BEVERAGES.initialize(BEVERAGES.products[0]),
      id: "LOT-001",
      received: true,
    },
    position: { x: wash.x },
    hasMaterial: true,
    outputs: { motor: false, work: false, transfer: false },
  };
  const state = {
    ...station,
    step: fill,
    unit: { ...station.unit, id: "LOT-002" },
    stations: { wash: station },
  };
  f.station.selectStage("wash");
  f.station.update(state, 0.1);
  assert.equal(f.station.model.bottle.visible, true);
  assert.equal(f.station.model.bottle.position.x, wash.x);
  f.station.update(
    { ...state, stations: { wash: { ...station, hasMaterial: false } } },
    0.1,
  );
  assert.equal(f.station.model.bottle.visible, false);
  f.station.update(state, 0.1);
  assert.equal(f.station.model.bottle.visible, true);
  f.dispose();
});

for (const stage of ["pack", "seal", "ship"])
  test(`bancada ${stage}: mesa completa fora dos roletes após trocar etapa e restaurar`, () => {
    const f = fixture(BEVERAGES, buildBeveragesModel);
    const session = createIndustrySession(BEVERAGES, { onDemand: true });
    session.enterBench(stage, { quantity: stage === "pack" ? 1 : 9 });
    const verify = (snapshot) => {
      f.station.selectStage("ship");
      f.station.selectStage(stage);
      f.station.update(snapshot, 0);
      f.base.root.updateMatrixWorld(true);
      const table = new THREE.Box3().setFromObject(
        f.station.model.output.handling,
      );
      const rollers = new THREE.Box3();
      for (const roller of f.base.rollers)
        rollers.union(new THREE.Box3().setFromObject(roller));
      assert.ok(
        table.min.x > rollers.max.x + 0.5,
        `mesa em ${table.min.x}; fim da esteira em ${rollers.max.x}`,
      );
      for (const carton of f.station.model.output.cases)
        assert.ok(
          new THREE.Box3().setFromObject(carton.group).min.x > rollers.max.x,
        );
    };
    verify(session.snapshot);
    session.start();
    session.tick(0.2);
    session.pause();
    verify(session.snapshot);
    const restored = createIndustrySession(BEVERAGES, { onDemand: true });
    assert.equal(restored.importState(session.exportState()), true);
    verify(restored.snapshot);
    f.dispose();
  });
