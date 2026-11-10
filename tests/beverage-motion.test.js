import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";
import { BEVERAGES } from "../src/simulator/industries/definitions.js";
import { buildBeveragesModel } from "../src/simulator/industries/factory-models.js";
import { getRinsePose } from "../src/simulator/industries/bottle-rinser.js";
import {
  bottleTransferPose,
  bottleOutputSlot,
} from "../src/simulator/industries/bottle-output.js";
import { receivingPickupPose } from "../src/simulator/receiving-pickup.js";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";
function fixture() {
  const root = new THREE.Group(),
    m = Object.fromEntries(
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
      ].map((k) => [k, new THREE.MeshStandardMaterial()]),
    );
  const box = (g, x, y, z, w, h, d, mat) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const cyl = (g, x, y, z, r, h, mat) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const bar = (g, a, b, r, mat) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av),
      o = cyl(
        g,
        ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
        r,
        v.length(),
        mat,
      );
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return o;
  };
  const model = buildBeveragesModel({
    THREE,
    root,
    box,
    cyl,
    bar,
    materials: m,
    definition: BEVERAGES,
    product: BEVERAGES.products[0],
    stationView: true,
  });
  return { root, m, model };
}
function visible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
test("troca de estação oculta a doca antes do ajuste dos roletes", () => {
  const f = fixture();
  f.model.selectStage("wash");
  assert.equal(f.model.receiver.group.visible, false);
  f.model.selectStage("fill");
  assert.equal(f.model.receiver.group.visible, false);
  f.model.selectStage("receive");
  assert.equal(f.model.receiver.group.visible, true);
  f.model.dispose();
});
function obb(o) {
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
  const b = new OBB().fromBox3(o.geometry.boundingBox);
  b.halfSize.addScalar(-0.0005);
  return b.applyMatrix4(o.matrixWorld);
}
test("lavagem: garrafa segura antes de elevar, bico abaixo do gargalo e retorno contínuo", () => {
  let previous;
  for (let i = 0; i <= 2000; i++) {
    const p = getRinsePose(i / 2000);
    assert.equal(p.angle, 0);
    assert.equal(p.lift, 0);
    if (p.nozzleTip < 2.2) assert.ok(p.grip > 0.999);
    if (p.spraying || p.draining) {
      assert.ok(p.nozzleTip < 2.0);
      assert.ok(p.waterLevel >= 0.025);
    }
    if (p.nozzleTip > 2.3 && i > 1000) assert.ok(p.waterLevel < 0.026);
    if (previous) {
      assert.ok(Math.abs(p.baseY - previous.baseY) < 0.025);
      assert.ok(Math.abs(p.angle - previous.angle) < 0.025);
    }
    previous = p;
  }
  const start = getRinsePose(0),
    end = getRinsePose(1);
  assert.deepEqual(end, start);
});
test("lavagem: sólidos da pinça e do bico não atravessam a garrafa em 201 poses", () => {
  const f = fixture(),
    u = {
      id: "LOT-001",
      product: "juice",
      ...BEVERAGES.initialize(BEVERAGES.products[0]),
    };
  f.model.selectStage("wash");
  for (let i = 0; i <= 200; i++) {
    f.model.update({
      phase: "operating",
      step: BEVERAGES.steps[1],
      progress: i / 200,
      unit: u,
      settings: { missingCap: false },
      position: { x: -4 },
      running: true,
      outputs: { work: true },
      scope: "bench",
      done: 0,
      total: 1,
      completedUnits: [],
    });
    f.root.updateMatrixWorld(true);
    const product = f.model.bottle.children.filter(
      (o) => o.isMesh && visible(o) && o.name !== "bottle-liquid",
    );
    const tools = [];
    f.model.rinser.group.traverse((o) => {
      if (
        o.isMesh &&
        visible(o) &&
        o.material !== f.m.water &&
        !o.userData.insideBottle
      )
        tools.push(o);
    });
    for (const piece of product)
      for (const tool of tools)
        assert.equal(
          obb(piece).intersectsOBB(obb(tool)),
          false,
          `colisão lavagem t=${i / 200} peça=${piece.name || piece.geometry.type} ferramenta=${tool.name || tool.geometry.type}`,
        );
  }
});
test("saída bebidas: 30 endereços separados e garfos mantêm distância dos volumes já guardados", () => {
  const slots = Array.from({ length: 30 }, (_, i) => bottleOutputSlot(i));
  const size = new THREE.Vector3(0.69, 1.14, 0.73),
    boxes = slots.map((s) =>
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(s.x, s.y + 0.57, s.z),
        size,
      ),
    );
  for (let i = 0; i < 30; i++)
    for (let j = 0; j < i; j++)
      assert.equal(boxes[i].intersectsBox(boxes[j]), false);
  for (let unit = 0; unit < 30; unit++) {
    let last;
    for (let i = 0; i <= 200; i++) {
      const p = bottleTransferPose(i / 200, unit),
        bounds = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(p.x, p.y + 0.57, p.z),
          size,
        );
      for (let older = 0; older < unit; older++)
        assert.equal(
          bounds.intersectsBox(boxes[older]),
          false,
          `volume ${unit} cruza ${older} em ${i / 200}`,
        );
      if (last)
        assert.ok(Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 0.7);
      last = p;
    }
  }
});
test("encaixotamento: garrafa não atravessa caixas, apoios ou garra em 6030 poses", () => {
  const f = fixture();
  f.model.selectStage("pack");
  const unit = {
    id: "LOT-001",
    product: "juice",
    ...BEVERAGES.initialize(BEVERAGES.products[0]),
    capped: true,
    volume: 500,
    labeled: true,
    packed: false,
  };
  for (let index = 0; index < 30; index++)
    for (let i = 0; i <= 200; i++) {
      f.model.update({
        phase: "operating",
        step: BEVERAGES.steps.find((s) => s.id === "pack"),
        progress: i / 200,
        unit,
        settings: { missingCap: false },
        position: { x: 4 },
        running: true,
        scope: "bench",
        done: index,
        total: 30,
        completedUnits: [],
      });
      f.root.updateMatrixWorld(true);
      const body = obb(f.model.body);
      f.model.output.group.traverse((o) => {
        if (!o.isMesh || !visible(o)) return;
        assert.equal(
          body.intersectsOBB(obb(o)),
          false,
          `corpo/estrutura ${index}:${i / 200} ${o.position.toArray()}`,
        );
      });
    }
});
test("disco recebido: captura começa no topo da pilha e a pose não salta ao pousar", () => {
  for (const queue of [0, 11, 49]) {
    let last;
    for (let i = 0; i <= 1000; i++) {
      const p = receivingPickupPose({
        phase: "feeding",
        part: true,
        progress: i / 2000,
        queue,
      });
      if (last)
        assert.ok(
          Math.hypot(
            p.x - last.x,
            p.support - last.support,
            p.magnetX - last.magnetX,
            p.magnetY - last.magnetY,
          ) < 0.12,
        );
      last = p;
    }
    assert.ok(Math.abs(last.x) < 1e-9);
    assert.ok(Math.abs(last.support - 1.195) < 1e-9);
  }
});
test("unidades concluídas preservam identidade e conteúdo ao avançar e retomar", () => {
  const s = createProcessSimulation(BEVERAGES, { quantity: 2, mode: "auto" });
  s.setSpeed(4);
  s.start();
  for (let i = 0; i < 3000 && s.snapshot.done < 2; i++) s.tick(0.1);
  assert.equal(s.snapshot.completedUnits.length, 2);
  assert.deepEqual(
    s.snapshot.completedUnits.map((u) => u.id),
    ["LOT-001", "LOT-002"],
  );
  const resumed = createProcessSimulation(BEVERAGES);
  assert.equal(resumed.importState(s.exportState()), true);
  assert.deepEqual(resumed.snapshot.completedUnits, s.snapshot.completedUnits);
});

test("recebimento bebidas: garrafa atravessa somente a abertura do caminhão", () => {
  const f = fixture();
  f.model.selectStage("receive");
  const unit = {
    id: "LOT-001",
    product: "juice",
    ...BEVERAGES.initialize(BEVERAGES.products[0]),
  };
  for (let index = 0; index < 30; index++)
    for (const phase of ["moving", "operating"])
      for (let k = 0; k <= 100; k++) {
        f.model.update({
          phase,
          step: BEVERAGES.steps[0],
          progress: k / 100,
          unit,
          settings: {},
          position: { x: -6 },
          running: true,
          scope: "bench",
          done: index,
          total: 30,
          completedUnits: [],
        });
        f.root.updateMatrixWorld(true);
        const body = obb(f.model.body);
        const dock = f.model.receiver.dock.group;
        dock.traverse((o) => {
          if (!o.isMesh || !visible(o)) return;
          assert.equal(
            body.intersectsOBB(obb(o)),
            false,
            `recebimento ${index}:${k / 100} ${o.position.toArray()}`,
          );
        });
      }
});

test("caixas preservam o lote e a retomada, mas esvaziam no reinício", () => {
  const f = fixture();
  f.model.selectStage("pack");
  const units = Array.from({ length: 12 }, (_, i) => ({
    id: `LOT-${i + 1}`,
    product: "juice",
    ...BEVERAGES.initialize(BEVERAGES.products[0]),
    volume: 500,
    capped: true,
    labeled: true,
    packed: true,
  }));
  const state = {
    phase: "complete",
    step: BEVERAGES.steps.find((s) => s.id === "pack"),
    progress: 0,
    unit: units.at(-1),
    settings: {},
    position: { x: 4 },
    running: false,
    scope: "bench",
    done: 12,
    total: 12,
    completedUnits: units,
  };
  const stored = () => {
    const copies = [];
    f.model.output.group.traverse((o) => {
      if (o.name.startsWith("Garrafa encaixotada")) copies.push(o);
    });
    return copies;
  };
  f.model.update(state);
  assert.equal(stored().length, 12);
  assert.ok(stored().every((o) => o.visible));
  const positions = stored().map((o) => o.position.toArray());
  f.model.update(structuredClone(state));
  assert.deepEqual(
    stored().map((o) => o.position.toArray()),
    positions,
  );
  f.model.update({
    ...state,
    phase: "ready",
    done: 0,
    unit: { ...units[0], packed: false },
    completedUnits: [],
  });
  assert.equal(stored().length, 0);
});
