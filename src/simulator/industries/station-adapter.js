export function buildIndustryStation({
  THREE,
  base,
  materials,
  definition,
  product,
  build,
}) {
  const root = new THREE.Group();
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
  });
  const moving = new Set([model.bottle, model.piece, model.parcel]);
  const splitRollers = new THREE.Group();
  base.root.add(splitRollers);
  let stageId = definition.steps[0].id,
    lastCuts = "";
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
    root.traverse((o) => {
      if (!o.isMesh || !visible(o)) return;
      for (let p = o; p && p !== root; p = p.parent) if (moving.has(p)) return;
      const b = new THREE.Box3().setFromObject(o).applyMatrix4(inverse);
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
  }
  function selectStage(id) {
    stageId = id;
    const stage =
      definition.steps.find((s) => s.id === id) ?? definition.steps[0];
    root.position.x = -stage.x;
    model.selectStage(id);
    fitRollers();
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
    update(snapshot, dt) {
      model.update(snapshot, dt);
      if (snapshot.scope === "line" && snapshot.step.id !== stageId)
        for (const part of [model.bottle, model.piece, model.parcel])
          if (part) part.visible = false;
      fitRollers();
      for (const [key, lamp] of Object.entries(base.lamps))
        lamp.material.emissiveIntensity = (
          key === "red"
            ? snapshot.emergency || !!snapshot.fault
            : key === "green"
              ? snapshot.running
              : !snapshot.running
        )
          ? 0.8
          : 0.04;
      for (const roller of base.rollers)
        if (snapshot.running) roller.rotateY(dt * 2);
    },
    dispose() {
      model.dispose?.();
      root.traverse((o) => o.geometry?.dispose());
      clearSegments();
      water.dispose();
      root.removeFromParent();
      splitRollers.removeFromParent();
    },
  };
}
