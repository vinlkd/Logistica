import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PARCELS, PARCEL_ROUTES, PARCEL_DIMENSIONS, buildParcelsModel, parcelPose } from "../src/simulator/industries/parcels.js";
import { createProcessSimulation } from "../src/simulator/industries/process-engine.js";

function settingsFor(route) {
  const values = Object.fromEntries(PARCELS.controls.map((c) => [c.id, c.value]));
  return { ...values, destination: route.id, route: route.id, address: route.address };
}
function completeThrough(unit, settings, last) {
  for (const step of PARCELS.steps) {
    assert.equal(PARCELS.validate(step.id, settings, unit), null, step.id);
    PARCELS.apply(step.id, unit, settings);
    if (step.id === last) break;
  }
}
for (const route of PARCEL_ROUTES) {
  test(`encomendas: manifesto correto na rota ${route.name}`, () => {
    const unit = { id: "LOT-001", ...PARCELS.initialize({ id: route.id }) }, settings = settingsFor(route);
    completeThrough(unit, settings, "load");
    assert.deepEqual(unit.manifest, { barcode: "EC-00001", route: route.id, quantity: 1, weight: route.mass, address: route.address });
    assert.equal(unit.lane, route.z);
    assert.equal(PARCELS.readings({ unit }).at(-1).value, "1 volume · manifesto liberado");
  });
  test(`encomendas: valida destino, endereço, quantidade e rota ${route.name}`, () => {
    const unit = { id: 4, ...PARCELS.initialize({ id: route.id }) }, s = settingsFor(route);
    assert.match(PARCELS.validate("load", s, unit), /Descarregue/);
    completeThrough(unit, s, "weigh");
    assert.match(PARCELS.validate("sort", { ...s, destination: "errado" }, unit), /Destino incorreto/);
    PARCELS.apply("sort", unit, s);
    assert.match(PARCELS.validate("store", { ...s, address: "errado" }, unit), /Endereço incorreto/);
    assert.match(PARCELS.validate("store", { ...s, aisleClear: false }, unit), /obstruído/);
    PARCELS.apply("store", unit, s);
    assert.match(PARCELS.validate("load", { ...s, route: "errado" }, unit), /Rota divergente/);
    for (const quantity of [0, 2, NaN, "texto", 1.2]) assert.match(PARCELS.validate("load", { ...s, quantity }, unit), /Quantidade divergente/);
    assert.equal(unit.loaded, false);
    assert.equal(PARCELS.validate("load", s, unit), null);
  });
}
test("encomendas: leitura e pesagem bloqueiam sem consumir ou alterar a unidade", () => {
  const unit = { id: 1, ...PARCELS.initialize(PARCELS.products[0]) }, s = settingsFor(PARCEL_ROUTES[0]);
  PARCELS.apply("unload", unit, s);
  const before = structuredClone(unit);
  assert.match(PARCELS.validate("scan", { ...s, barcodeReadable: false }, unit), /ilegível/);
  assert.deepEqual(unit, before);
  PARCELS.apply("scan", unit, s);
  assert.match(PARCELS.validate("weigh", { ...s, scaleCalibrated: false }, unit), /Calibre/);
  for (const weightOffset of [-1, 1, NaN, "texto"]) assert.match(PARCELS.validate("weigh", { ...s, weightOffset }, unit), /Massa divergente/);
  assert.equal(unit.weighed, false);
  assert.equal(PARCELS.validate("weigh", s, unit), null);
});

function horizontalContains(box, x, z) { return x >= box.min.x - 1e-7 && x <= box.max.x + 1e-7 && z >= box.min.z - 1e-7 && z <= box.max.z + 1e-7; }
function overlapsVolume(a, b) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 1e-6 && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 1e-6 && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 1e-6;
}
for (const route of PARCEL_ROUTES) {
  test(`encomendas: percurso apoiado sem colisões na rota ${route.name}`, () => {
    const root = new THREE.Group(), model = buildParcelsModel({ THREE, root, product: { id: route.id } });
    root.updateMatrixWorld(true);
    const supports = [], obstacles = [];
    model.root.traverse((o) => {
      if (!o.isMesh || o.parent === model.parcel) return;
      const bounds = new THREE.Box3().setFromObject(o);
      if (o.userData.support) supports.push(bounds);
      else if (o.name !== "Linha de leitura sobre a etiqueta") obstacles.push({ name: o.name, bounds });
    });
    const d = PARCEL_DIMENSIONS;
    function check(snapshot) {
      const pose = parcelPose(snapshot), aabb = new THREE.Box3(new THREE.Vector3(pose.x - d.width / 2, pose.y - d.height / 2, pose.z - d.depth / 2), new THREE.Vector3(pose.x + d.width / 2, pose.y + d.height / 2, pose.z + d.depth / 2));
      assert.ok(Math.abs(aabb.min.y - d.supportY - d.clearance) < 1e-9);
      // Sample the entire footprint, including transitions between adjacent support decks.
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const x = aabb.min.x + d.width * i / 4, z = aabb.min.z + d.depth * j / 4;
        assert.ok(supports.some((s) => Math.abs(s.max.y - d.supportY) < 1e-7 && horizontalContains(s, x, z)), `Sem apoio em ${x}, ${z} etapa ${snapshot.step.id}`);
      }
      for (const obstacle of obstacles) assert.equal(overlapsVolume(aabb, obstacle.bounds), false, `Colisão: ${obstacle.name}, ${snapshot.step.id}, x=${pose.x},z=${pose.z}`);
      model.update(snapshot, 0.016); root.updateMatrixWorld(true);
      assert.ok(model.parcel.position.distanceTo(new THREE.Vector3(pose.x, pose.y, pose.z)) < 1e-8);
    }
    let previousX = PARCELS.entryX;
    for (const step of PARCELS.steps) {
      check({ phase: "ready", step, progress: 0, position: { x: previousX }, unit: { destination: route.id } });
      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        check({ phase: "moving", step, progress, position: { x: previousX + (step.x - previousX) * progress, fromX: previousX, toX: step.x }, unit: { destination: route.id } });
      }
      check({ phase: "operating", step, progress: 0.5, position: { x: step.x }, unit: { destination: route.id } });
      previousX = step.x;
    }
    check({ phase: "moving", step: PARCELS.steps.at(-1), progress: 1, position: { x: PARCELS.exitX }, unit: { destination: route.id } });
    model.dispose(); assert.equal(root.children.length, 0);
  });
}
test("encomendas: superfícies de apoio não se sobrepõem, reset e descarte liberam recursos", () => {
  const root = new THREE.Group(), model = buildParcelsModel({ THREE, root, product: PARCELS.products[0] });
  root.updateMatrixWorld(true);
  const supports = [], resources = new Set();
  model.root.traverse((o) => { if (o.userData.support) supports.push(new THREE.Box3().setFromObject(o)); if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  for (let i = 0; i < supports.length; i++) for (let j = i + 1; j < supports.length; j++) assert.equal(overlapsVolume(supports[i], supports[j]), false, `Apoios sobrepostos ${i}/${j}`);
  let disposed = 0; for (const resource of resources) resource.addEventListener("dispose", () => disposed++);
  model.update({ phase: "complete", unit: { destination: "sul" } }); assert.equal(model.parcel.visible, false);
  model.update({ phase: "ready", position: { x: -8 }, unit: { destination: "norte" } }); assert.equal(model.parcel.visible, true); assert.equal(model.parcel.position.x, -8); assert.equal(model.parcel.position.z, 0);
  model.dispose(); assert.equal(disposed, resources.size); model.dispose(); assert.equal(disposed, resources.size);
});
test("encomendas: bancada individual usa a base original e mostra só os equipamentos da etapa", () => {
  const root = new THREE.Group(), model = buildParcelsModel({ THREE, root, product: PARCELS.products[0], stationView: true });
  const visibleNames = () => { const names = []; model.root.traverseVisible((o) => names.push(o.name)); return names; };
  assert.equal(model.root.getObjectByName("Piso do centro de distribuição"), undefined);
  assert.equal(model.root.getObjectByName("Faixa de circulação da doca"), undefined);
  for (const step of PARCELS.steps) {
    model.selectStage(step.id);
    model.update({ phase: "operating", step, progress: 0.5, position: { x: step.x }, unit: { destination: "norte" } });
    const visible = visibleNames();
    assert.equal(visible.includes("Encomenda em processo"), true);
    assert.equal(visible.includes("Pórtico do leitor"), step.id === "scan");
    assert.equal(visible.includes("Balança nivelada com a esteira"), step.id === "weigh");
    assert.equal(visible.includes("Montante do endereço"), step.id === "store");
    assert.equal(visible.some((name) => name.startsWith("Veículo da rota")), step.id === "load");
    assert.equal(visible.includes("Plataforma de recebimento"), step.id === "unload");
    assert.equal(visible.includes("Sinalizador do desviador"), step.id === "sort");
  }
  model.selectStage("store");
  model.update({ phase: "operating", step: PARCELS.steps[1], progress: 0.5, position: { x: -3.8 }, unit: { destination: "norte" } });
  assert.equal(visibleNames().includes("Linha de leitura sobre a etiqueta"), false);
  model.dispose(); assert.equal(root.children.length, 0);
});
for (const route of PARCEL_ROUTES) {
  test(`encomendas: bancada ${route.name} centraliza somente o rack e veículo em operação`, () => {
    const root = new THREE.Group(), model = buildParcelsModel({ THREE, root, product: { id: route.id }, stationView: true });
    for (const id of ["store", "load"]) {
      const step = PARCELS.steps.find((s) => s.id === id);
      model.selectStage(id);
      model.update({ phase: "operating", step, progress: 0.5, position: { x: step.x }, unit: { destination: route.id } });
      root.updateMatrixWorld(true);
      assert.ok(Math.abs(model.parcel.getWorldPosition(new THREE.Vector3()).z) < 1e-8);
      const trucks = [], posts = [];
      model.root.traverseVisible((o) => { if (o.name.startsWith("Veículo da rota")) trucks.push(o.name); if (o.name === "Montante do endereço") posts.push(o); });
      assert.deepEqual(trucks, id === "load" ? [`Veículo da rota ${route.name}`] : []);
      assert.equal(posts.length, id === "store" ? 4 : 0);
    }
    model.dispose();
  });
}
for (const route of PARCEL_ROUTES) {
  test(`encomendas: integração com motor, lote e retomada ${route.name}`, () => {
    const sim = createProcessSimulation(PARCELS, { product: route.id, quantity: 2, mode: "auto" });
    const settings = settingsFor(route);
    for (const [key, value] of Object.entries(settings)) sim.setSetting(key, value);
    sim.start();
    let count = 0;
    while (sim.snapshot.phase !== "complete" && count++ < 3000) {
      const before = sim.snapshot;
      assert.equal(before.fault, "");
      if (count === 20) {
        const beforePose = parcelPose(before); sim.emergencyStop(); sim.tick(0.2);
        assert.deepEqual(parcelPose(sim.snapshot), beforePose);
        sim.rearm(); sim.start();
      }
      sim.tick(0.05);
      const after = sim.snapshot;
      if (before.unit.id === after.unit.id) {
        const a = parcelPose(before), b = parcelPose(after);
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.55, `Salto de posição ${before.phase}/${before.step.id} -> ${after.phase}/${after.step.id}`);
      }
    }
    const end = sim.snapshot;
    assert.equal(end.phase, "complete"); assert.equal(end.done, 2);
    assert.equal(end.history.length, PARCELS.steps.length * 2);
    assert.equal(end.unit.manifest.route, route.id);
    sim.reset(); assert.equal(sim.snapshot.done, 0); assert.equal(sim.snapshot.unit.loaded, false);
    assert.deepEqual(parcelPose(sim.snapshot), { x: -8, y: 1.522, z: 0 });
  });
}
