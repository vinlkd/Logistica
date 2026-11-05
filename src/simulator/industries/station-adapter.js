import { stationPresentation } from "./station-presentation.js";

function batchStraightRollers(THREE, base) {
  const { rollers } = base;
  const first = rollers[0];
  if (!first || rollers.some((roller) => roller.children.length !== 1)) return null;

  const group = new THREE.Group();
  const meshes = [first, first.children[0]].map((source) => {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, rollers.length);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  });
  base.root.add(group);
  for (const roller of rollers) roller.removeFromParent();
  const markerMatrix = new THREE.Matrix4();
  function sync() {
    let index = 0;
    for (const roller of rollers) {
      if (!roller.visible) continue;
      const marker = roller.children[0];
      roller.updateMatrix();
      marker.updateMatrix();
      meshes[0].setMatrixAt(index, roller.matrix);
      meshes[1].setMatrixAt(index, markerMatrix.multiplyMatrices(roller.matrix, marker.matrix));
      index++;
    }
    for (const mesh of meshes) {
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  sync();
  for (const mesh of meshes) mesh.computeBoundingSphere();
  return {
    sync,
    dispose() {
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      const geometries = new Set(rollers.flatMap((roller) => [
        roller.geometry, roller.children[0].geometry,
      ]));
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

export function buildIndustryStation({
  THREE,
  base,
  materials,
  definition,
  product,
  build,
  circuit = false,
}) {
  circuit = circuit && definition.id === "beverages";
  const root = new THREE.Group();
  const baseOriginX = base.root.position.x;
  base.root.add(root);
  const water = new THREE.MeshStandardMaterial({
    color: "#50b9dc",
    roughness: 0.3,
  });
  const m = {
    ...materials,
    accent: materials.blue,
    water,
    floor: materials.white,
  };
  function box(g, x, y, z, w, h, d, material = m.steel) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  }
  function cyl(g, x, y, z, r, h, material = m.steel) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  }
  function bar(g, a, b, r, material = m.steel) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av);
    const o = cyl(
      g,
      ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
      r,
      v.length(),
      material,
    );
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return o;
  }
  const model = build({
    THREE,
    root,
    materials: m,
    definition,
    product,
    box,
    cyl,
    bar,
    stationView: true,
    circuit,
  });
  const seam = circuit
    ? bar(base.root, [5, 1.12, -2.1], [5, 1.12, 1.45], 0.075, m.steel)
    : null;
  if (seam) {
    seam.name = "Rolete de união entre estações";
    for (const object of base.root.children) {
      const size = object.geometry?.parameters;
      if (object.name === "sector-floor" || (size?.width === 15.6 && size.height === 0.002))
        object.visible = false;
    }
  }
  const moving = new Set([model.bottle, model.piece, model.parcel]);
  const rollerBatch = circuit ? batchStraightRollers(THREE, base) : null;
  const splitRollers = new THREE.Group();
  base.root.add(splitRollers);
  let stageId = definition.steps[0].id,
    lastCuts = "",
    lastReceivingTransport = null,
    lastReceiverSupport,
    lastCircuitVisual,
    lastBeltPosition = null;
  function visible(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  function clearSegments() {
    splitRollers.traverse((o) => o.geometry?.dispose());
    splitRollers.clear();
  }
  // Cut only the occupied portions of the original rollers. Keeping the rest
  // of each roller supports the product even beside a tool or cap-feed tray.
  function fitRollers() {
    base.root.updateMatrixWorld(true);
    const inverse = base.root.matrixWorld.clone().invert(),
      obstacles = [];
    root.traverseVisible((o) => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== root; p = p.parent) if (moving.has(p)) return;
      // Matrices were updated once above. setFromObject would walk parents
      // again for every mesh, including every bottle in the parked cases.
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = new THREE.Box3()
        .copy(o.geometry.boundingBox)
        .applyMatrix4(o.matrixWorld)
        .applyMatrix4(inverse);
      if (b.min.y < 1.194 && b.max.y > 1.046) obstacles.push(b);
    });
    const cuts = base.rollers.map((roller) => {
      const x = roller.position.x;
      return obstacles
        .filter((b) => b.min.x < x + 0.074 && b.max.x > x - 0.074)
        .map((b) => [
          Math.max(-2.1, b.min.z - 0.006),
          Math.min(1.45, b.max.z + 0.006),
        ])
        .filter(([a, b]) => a < b)
        .sort((a, b) => a[0] - b[0]);
    });
    const key = JSON.stringify(
      cuts.map((c) => c.map((v) => v.map((n) => Math.round(n * 1000) / 1000))),
    );
    if (key === lastCuts) return;
    lastCuts = key;
    clearSegments();
    base.rollers.forEach((roller, i) => {
      const occupied = cuts[i];
      roller.visible = !occupied.length;
      if (!occupied.length) return;
      let start = -2.1;
      for (const [a, b] of [...occupied, [1.45, 1.45]]) {
        if (a - start > 0.035)
          bar(
            splitRollers,
            [roller.position.x, 1.12, start],
            [roller.position.x, 1.12, a],
            0.075,
            m.steel,
          );
        start = Math.max(start, b);
      }
    });
    rollerBatch?.sync();
  }
  function selectStage(id) {
    stageId = id;
    const stage =
      definition.steps.find((s) => s.id === id) ?? definition.steps[0];
    const caseStage =
      definition.id === "beverages" && ["pack", "seal", "ship"].includes(id);
    const conveyorStage = caseStage
      ? definition.steps.find((step) => step.id === "pack")
      : stage;
    // Keep the same packing conveyor in every case view. Moving only the
    // machinery puts the sealer's table back over a freshly centred belt.
    base.root.position.x = baseOriginX + conveyorStage.x - stage.x;
    root.position.x = -conveyorStage.x;
    if (seam) seam.visible = ["receive", "wash", "fill", "label"].includes(id);
    model.selectStage(id);
    fitRollers();
    lastReceiverSupport = undefined;
    lastCircuitVisual = undefined;
  }
  selectStage(stageId);
  return {
    get stageId() {
      return stageId;
    },
    model,
    root,
    splitRollers,
    selectStage,
    update(snapshot, dt, beverageTransfer) {
      const continuous = circuit && snapshot.scope === "line";
      const presentation = stationPresentation(snapshot, definition, stageId, { circuit: continuous });
      const state = presentation.state;
      if (continuous) {
        const incomingCase = stageId === "pack" ? state.caseTransfer : undefined;
        const visual = JSON.stringify([
          state.phase, state.progress, state.done, state.bottleTotal ?? state.total,
          state.unit, state.hasMaterial, state.position, state.running,
          state.emergency, state.fault, state.outputs, state.settings,
          stageId === "pack" ? state.completedUnits?.length : undefined,
          stageId === "pack" ? state.inventory?.lotId : undefined,
          stageId === "pack" ? state.inventory?.boxes?.length : undefined,
          incomingCase?.phase, incomingCase?.progress, incomingCase?.unit,
          incomingCase?.hasMaterial, incomingCase?.outputs,
        ]);
        if (visual === lastCircuitVisual) return;
        lastCircuitVisual = visual;
      } else lastCircuitVisual = undefined;
      if (beverageTransfer && model.bottle) model.bottle.rotation.set(0, 0, 0);
      model.update(state, dt);
      if (continuous && presentation.visible && model.bottle && Number.isFinite(state.position.z))
        model.bottle.position.z = state.position.z;
      const handoff = presentation.visible && model.bottle && beverageTransfer?.(stageId, state);
      if (handoff) {
        const parent = model.bottle.parent;
        model.bottle.position.copy(parent.worldToLocal(handoff.point));
        const inverse = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        model.bottle.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), handoff.normal.applyQuaternion(inverse),
        );
      }
      const receiving = model.receiver?.state;
      const packing = model.output?.packingState;
      const receivingTravel =
        stageId === "receive" && receiving
          ? {
              index: `receive/${receiving.index}`,
              distance: receiving.conveyorTravel,
            }
          : stageId === "pack" && packing
            ? {
                index: `pack/${packing.index}`,
                distance: packing.conveyorTravel,
              }
            : null;
      const conveyorDelta =
        receivingTravel &&
        lastReceivingTransport?.index === receivingTravel.index &&
        state.running &&
        state.outputs?.work
          ? Math.max(
              0,
              receivingTravel.distance - lastReceivingTransport.distance,
            )
          : 0;
      lastReceivingTransport = receivingTravel;
      const position = {
        id: state.unit?.id,
        x: state.position.x,
        travel: handoff ? handoff.distance : state.position.travel,
        visible: presentation.visible || (continuous && state.phase === "outgoing" && state.hasMaterial && !state.unit?.packed),
      };
      const beltDelta =
        stageId !== "receive" &&
        state.running &&
        (state.outputs?.motor || state.outputs?.transfer) &&
        position.visible &&
        lastBeltPosition?.visible &&
        lastBeltPosition.id === position.id
          ? Math.max(0, Number.isFinite(position.travel) && Number.isFinite(lastBeltPosition.travel)
            ? position.travel - lastBeltPosition.travel : position.x - lastBeltPosition.x)
          : 0;
      lastBeltPosition = position;
      if (!presentation.visible)
        for (const part of [model.bottle, model.piece, model.parcel])
          if (part) part.visible = false;
      // The connected stations share a fixed roller profile. Only the dock
      // lift can enter that profile after the initial fit in selectStage.
      if (!continuous) fitRollers();
      else if (stageId === "receive" && receiving?.liftSupport !== lastReceiverSupport) {
        fitRollers();
        lastReceiverSupport = receiving?.liftSupport;
      }
      for (const [key, lamp] of Object.entries(base.lamps))
        lamp.material.emissiveIntensity = (
          key === "red"
            ? state.emergency || !!state.fault
            : key === "green"
              ? state.running
              : !state.running
        )
          ? 0.8
          : 0.04;
      const travel = conveyorDelta > 0 ? conveyorDelta : beltDelta;
      if (travel > 0)
        for (const roller of base.rollers) roller.rotateY(-travel / 0.075);
        rollerBatch?.sync();
      if (seam?.visible && travel > 0) seam.rotateY(-travel / 0.075);
    },
    dispose() {
      rollerBatch?.dispose();
      model.dispose?.();
      root.traverse((o) => o.geometry?.dispose());
      clearSegments();
      water.dispose();
      root.removeFromParent();
      splitRollers.removeFromParent();
    },
  };
}
