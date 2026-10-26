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

function fixture(definition, product) {
  const root = new THREE.Group();
  const materials = Object.fromEntries(
    [
      "steel",
      "dark",
      "blue",
      "white",
      "yellow",
      "wood",
      "glass",
      "green",
      "accent",
      "box",
      "water",
    ].map((k) => [k, new THREE.MeshStandardMaterial({ color: "#164193" })]),
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
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from),
      mid = from.clone().add(to).multiplyScalar(0.5);
    const o = cyl(g, ...mid.toArray(), r, delta.length(), m);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return o;
  };
  const model = (
    definition.id === "beverages" ? buildBeveragesModel : buildFurnitureModel
  )({ THREE, root, box, cyl, bar, materials, definition, product });
  const settings = Object.fromEntries(
    definition.controls.map((c) => [c.id, c.value]),
  );
  const unit = {
    id: "LOT-001",
    product: product.id,
    ...definition.initialize(product, settings),
  };
  return {
    root,
    model,
    settings,
    unit,
    dispose() {
      model.dispose?.();
      root.traverse((o) => o.geometry?.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
function snapshot(
  definition,
  id,
  progress,
  unit,
  settings,
  phase = "operating",
) {
  const step = definition.steps.find((s) => s.id === id);
  return {
    step,
    progress,
    unit,
    settings,
    phase,
    running: true,
    position: { x: step.x },
  };
}
for (const product of BEVERAGES.products) {
  test(`modelos: tampa percorre alimentação, garrafa e retorno sem desaparecer (${product.id})`, () => {
    const f = fixture(BEVERAGES, product),
      { model, unit, settings } = f;
    const toolCap = model.capTool.children[0];
    const feed = f.root.children.find(
      (o) =>
        o.isMesh &&
        Math.abs(o.position.y - 1.235) < 1e-8 &&
        Math.abs(o.position.z + 1.4) < 1e-8,
    );
    assert.ok(feed, "Tampa deve partir do alimentador apoiado");
    let previous;
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000;
      model.update(snapshot(BEVERAGES, "cap", t, unit, settings));
      f.root.updateMatrixWorld(true);
      const position = model.capTool.position.clone();
      if (previous)
        assert.ok(
          position.distanceTo(previous) < 0.04,
          `Pinça salta em t=${t}`,
        );
      previous = position;
      assert.equal(
        [toolCap, model.cap, feed].filter((o) => o.visible).length,
        1,
        `A tampa deve existir uma única vez em t=${t}`,
      );
      if (t <= 0.1 || t >= 0.999)
        assert.ok(
          position.distanceTo(new THREE.Vector3(0, 1.235, -1.4)) < 0.001,
        );
      if (t >= 0.3 && t <= 0.5)
        assert.ok(
          position.y > 2.64,
          "Travessia horizontal deve passar acima da garrafa",
        );
      if (t >= 0.5 && t <= 0.7)
        assert.ok(
          Math.abs(position.z) < 1e-8,
          "Descida precisa estar centrada no gargalo",
        );
      if (i === 700)
        assert.ok(
          position.distanceTo(model.cap.getWorldPosition(new THREE.Vector3())) <
            1e-7,
          "Entrega da tampa precisa coincidir com o gargalo",
        );
    }
    unit.capped = true;
    model.update(snapshot(BEVERAGES, "label", 0, unit, settings, "ready"));
    assert.equal(model.cap.visible, true);
    assert.equal(toolCap.visible, false);
    f.dispose();
  });
}
for (const product of FURNITURE.products) {
  test(`modelos: furadeira retrai antes de mudar de furo (${product.id})`, () => {
    const f = fixture(FURNITURE, product),
      { model, unit, settings } = f;
    unit.cut = true;
    let previous,
      minimumTip = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000;
      model.update(snapshot(FURNITURE, "drill", t, unit, settings));
      f.root.updateMatrixWorld(true);
      const tip = new THREE.Box3().setFromObject(
        model.drillHead.children.find(
          (o) => o.geometry?.type === "CylinderGeometry",
        ),
      ).min.y;
      const p = model.drillHead.position.clone();
      minimumTip = Math.min(minimumTip, tip);
      if (previous && Math.hypot(p.x - previous.x, p.z - previous.z) > 1e-7)
        assert.ok(
          tip > 1.34 + 0.08,
          `Movimento lateral com broca baixa em t=${t}`,
        );
      assert.ok(
        tip >= 1.327 - 1e-6,
        "Broca não pode ultrapassar a profundidade programada ou atravessar o painel",
      );
      previous = p;
    }
    assert.ok(
      minimumTip <= 1.33,
      "Broca deve penetrar cerca de 12 mm na face em y=1.34",
    );
    f.dispose();
  });
}
test("modelos: embalagens dobram por dobradiças sem diminuir a espessura das paredes", () => {
  for (const definition of [BEVERAGES, FURNITURE]) {
    const f = fixture(definition, definition.products[0]),
      { model, unit, settings } = f;
    if (definition.id === "beverages") {
      unit.volume = unit.target;
      unit.capped = true;
      unit.labeled = true;
    } else {
      unit.cut = true;
      unit.drilled = true;
      unit.assembled = true;
    }
    const carton = model.carton ?? model.piece.children.find((o) => o.isGroup);
    assert.ok(carton);
    const hinges = carton.children.filter((o) => o.isGroup);
    assert.equal(hinges.length, 5);
    const geometry = hinges.map((h) => h.children[0].geometry);
    let initialAngles;
    for (const t of [0.15, 0.25, 0.5, 0.8, 0.9, 1]) {
      model.update(snapshot(definition, "pack", t, unit, settings));
      hinges.forEach((h, i) => {
        assert.deepEqual(h.scale.toArray(), [1, 1, 1]);
        assert.deepEqual(h.children[0].scale.toArray(), [1, 1, 1]);
        assert.equal(h.children[0].geometry, geometry[i]);
      });
      if (t === 0.15)
        initialAngles = hinges
          .slice(0, 4)
          .map((h) => Math.abs(h.rotation.x) + Math.abs(h.rotation.z));
      if (t === 1)
        hinges.slice(0, 4).forEach((h, i) => {
          assert.ok(initialAngles[i] > 1);
          assert.ok(Math.abs(h.rotation.x) + Math.abs(h.rotation.z) < 1e-8);
        });
    }
    f.dispose();
  }
});
