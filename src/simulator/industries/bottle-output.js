const ease = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
export function bottleOutputSlot(index) {
  return {
    x: 5.2 + (index % 3),
    z: -3.72 + Math.floor((index % 15) / 3) * 0.78,
    y: 1.2 + Math.floor(index / 15) * 1.65,
  };
}
export function bottleTransferPose(progress, index) {
  const t = Math.max(0, Math.min(1, progress)),
    target = bottleOutputSlot(index),
    high = target.y + 0.35;
  let x = 4.2 * ease(t / 0.18),
    z = 0,
    y = 1.2;
  if (t >= 0.18) x = 4.2;
  if (t >= 0.26) {
    y = 1.2 + (high - 1.2) * ease((t - 0.26) / 0.1);
    z = 0.3 * ease((t - 0.26) / 0.1);
  }
  if (t >= 0.36) {
    y = high;
    z = 0.3;
    x = 4.2 + (target.x - 4.2) * ease((t - 0.36) / 0.13);
  }
  if (t >= 0.49) {
    x = target.x;
    z = 0.3 + (target.z - 0.3) * ease((t - 0.49) / 0.15);
  }
  if (t >= 0.64) {
    z = target.z;
    y = high + (target.y - high) * ease((t - 0.64) / 0.1);
  }
  if (t >= 0.74) y = target.y;
  let toolX = t < 0.18 ? 4.2 : x,
    toolZ = z + 1.1 - 0.76 * ease((t - 0.18) / 0.08),
    toolY = y;
  if (t >= 0.74) toolZ = target.z + 0.34 + 0.76 * ease((t - 0.74) / 0.08);
  if (t >= 0.82) {
    toolZ = target.z + 1.1 + (1.9 - target.z - 1.1) * ease((t - 0.82) / 0.08);
  }
  if (t >= 0.9) {
    toolZ = 1.9;
    toolX = target.x + (4.2 - target.x) * ease((t - 0.9) / 0.06);
    toolY = target.y + (1.2 - target.y) * ease((t - 0.9) / 0.06);
  }
  if (t >= 0.96) toolZ = 1.9 - 0.8 * ease((t - 0.96) / 0.04);
  return { x, z, y, toolX, toolZ, toolY, target };
}
export function buildBottleOutput({
  THREE,
  root,
  box,
  cyl,
  bar,
  materials: m,
  definition,
  createCopy,
}) {
  const group = new THREE.Group();
  group.name = "Saída com garfo e posições apoiadas";
  root.add(group);
  let stageId = definition.steps.at(-1).id,
    stageX = definition.steps.at(-1).x;
  const copies = new Map(),
    upper = new THREE.Group();
  group.add(upper);
  const holes = [5.2, 6.2, 7.2]
    .flatMap((x) => [
      [x - 0.185, x - 0.115],
      [x - 0.07, x + 0.07],
      [x + 0.115, x + 0.185],
    ])
    .sort((a, b) => a[0] - b[0]);
  for (const [parent, top] of [
    [group, 1.2],
    [upper, 2.85],
  ]) {
    const front = parent === upper ? 0.55 : 1.1,
      depth = front + 4.3,
      centre = (front - 4.3) / 2;
    let edge = 4.7;
    for (const [a, b] of [...holes, [7.7, 7.7]]) {
      if (a > edge)
        box(
          parent,
          (edge + a) / 2,
          top - 0.04,
          centre,
          a - edge,
          0.08,
          depth,
          m.steel,
        );
      edge = b;
    }
    for (const z of parent === upper ? [-4.3] : [-4.3, 1.1])
      box(parent, 6.2, top - 0.12, z, 3.16, 0.08, 0.08, m.steel);
  }
  for (const x of [4.66, 7.74])
    for (const z of [-4.3, 1.1]) {
      const height = z > 0 ? 1.2 : 2.85;
      box(group, x, height / 2, z, 0.08, height, 0.08, m.blue);
    }
  for (const x of [3.75, 7.85])
    for (const z of [-4.3, 1.1]) box(group, x, 2.36, z, 0.1, 4.72, 0.1, m.blue);
  for (const z of [-4.3, 1.1])
    box(group, 5.8, 4.72, z, 4.2, 0.12, 0.12, m.steel);
  for (const x of [3.75, 7.85])
    box(group, x, 4.72, -1.6, 0.12, 0.12, 5.4, m.steel);
  const bridge = box(group, 4.2, 4.72, -1.6, 0.14, 0.14, 5.4, m.steel);
  const fork = new THREE.Group();
  fork.name = "Garfo de transferência";
  group.add(fork);
  for (const dx of [-0.15, 0.15])
    box(fork, dx, -0.02, -0.3, 0.05, 0.04, 0.76, m.steel);
  box(fork, 0, 0.2, 0.07, 0.42, 0.4, 0.06, m.blue);
  const rod = cyl(group, 4.2, 3, 1.53, 0.035, 1, m.steel);
  function placeTool(p) {
    fork.position.set(p.toolX, p.toolY, p.toolZ);
    bridge.position.x = p.toolX;
    const bottom = p.toolY + 0.4;
    rod.position.set(p.toolX, (bottom + 4.66) / 2, p.toolZ + 0.09);
    rod.scale.y = 4.66 - bottom;
  }
  function selectStage(id) {
    stageId = id;
    stageX = definition.steps.find((s) => s.id === id).x;
    group.position.x = stageX;
  }
  selectStage(stageId);
  placeTool({ toolX: 4.2, toolY: 1.2, toolZ: 1.1 });
  return {
    group,
    fork,
    upper,
    rod,
    bridge,
    selectStage,
    copies,
    update(s) {
      const enabled =
        s.scope === "bench" || stageId === definition.steps.at(-1).id;
      group.visible = enabled;
      if (!enabled) return null;
      upper.visible = (s.total ?? 1) > 15;
      const units =
          s.completedUnits ?? (s.phase === "complete" ? [s.unit] : []),
        ids = new Set(units.map((u) => u.id));
      for (const [id, copy] of copies)
        if (!ids.has(id)) {
          copy.removeFromParent();
          copies.delete(id);
        }
      units.forEach((unit, i) => {
        let copy = copies.get(unit.id);
        if (!copy) {
          copy = createCopy(unit);
          copy.name = `Saída ${unit.id}`;
          copies.set(unit.id, copy);
          group.add(copy);
        }
        const slot = bottleOutputSlot(i);
        copy.position.set(slot.x, slot.y + (unit.packed ? 0.03 : 0), slot.z);
      });
      if (s.phase === "outgoing") {
        const p = bottleTransferPose(s.progress, s.done ?? 0);
        placeTool(p);
        return { ...p, x: p.x + stageX };
      }
      placeTool({ toolX: 4.2, toolY: 1.2, toolZ: 1.1 });
      return null;
    },
  };
}
