export const BOTTLE_FLUID_BOTTOM = 0.025,
  BOTTLE_FILL_LEVEL = 0.84;
export function bottleInnerRadius(y) {
  return y <= 0.65 ? 0.165 : y <= 0.85 ? 0.165 - (y - 0.65) * 0.55 : 0.055;
}
function volumeAt(top) {
  const pts = [
    [0.025, 0.165],
    [0.65, 0.165],
    [0.85, 0.055],
    [0.97, 0.055],
  ];
  let volume = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, ra] = pts[i - 1],
      [b, rb] = pts[i];
    if (top <= a) break;
    const end = Math.min(top, b),
      h = end - a,
      r = ra + ((rb - ra) * h) / (b - a);
    volume += (Math.PI * h * (ra * ra + ra * r + r * r)) / 3;
  }
  return volume;
}
export function bottleLiquidLevel(fraction) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (!f) return BOTTLE_FLUID_BOTTOM;
  let lo = BOTTLE_FLUID_BOTTOM,
    hi = BOTTLE_FILL_LEVEL;
  const target = volumeAt(hi) * f;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (volumeAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function getFillPose(progress, active = true) {
  const t = active ? Math.max(0, Math.min(1, progress)) : 0;
  const smooth = (v) => {
    v = Math.max(0, Math.min(1, v));
    return v * v * (3 - 2 * v);
  };
  const fraction = Math.max(0, Math.min(1, (t - 0.12) / 0.76));
  return {
    fraction,
    nozzleTip:
      2.55 - 0.325 * smooth(t / 0.12) + 0.325 * smooth((t - 0.9) / 0.1),
    flowing: active && t >= 0.12 && t < 0.88,
    level: bottleLiquidLevel(fraction),
  };
}
export function createBottleFluid(THREE, material, name = "bottle-liquid") {
  const group = new THREE.Group();
  group.name = name;
  const rings = 32,
    segments = 40;
  const points = [new THREE.Vector2(0, BOTTLE_FLUID_BOTTOM)];
  for (let i = 0; i <= rings; i++)
    points.push(
      new THREE.Vector2(
        0.165,
        BOTTLE_FLUID_BOTTOM +
          (i / rings) * (BOTTLE_FILL_LEVEL - BOTTLE_FLUID_BOTTOM),
      ),
    );
  points.push(new THREE.Vector2(0, BOTTLE_FILL_LEVEL));
  const volume = new THREE.Mesh(
    new THREE.LatheGeometry(points, segments),
    material,
  );
  volume.name = "internal-fluid-volume";
  group.add(volume);
  group.userData.fluidRings = rings;
  group.userData.fluidSegments = segments;
  setBottleFluidLevel(group, BOTTLE_FLUID_BOTTOM);
  return group;
}
export function setBottleFluidLevel(group, level) {
  const h = Math.max(BOTTLE_FLUID_BOTTOM, Math.min(BOTTLE_FILL_LEVEL, level));
  group.visible = h > BOTTLE_FLUID_BOTTOM + 0.001;
  if (
    Number.isFinite(group.userData.level) &&
    Math.abs(group.userData.level - h) < 1e-7
  )
    return;
  const mesh = group.getObjectByName("internal-fluid-volume"),
    a = mesh.geometry.attributes.position;
  const rings = group.userData.fluidRings,
    segments = group.userData.fluidSegments,
    count = rings + 3;
  for (let segment = 0; segment <= segments; segment++)
    for (let ring = 0; ring < count; ring++) {
      const y =
        ring === 0
          ? BOTTLE_FLUID_BOTTOM
          : ring === count - 1
            ? h
            : BOTTLE_FLUID_BOTTOM +
              ((h - BOTTLE_FLUID_BOTTOM) * (ring - 1)) / rings;
      const r = ring === 0 || ring === count - 1 ? 0 : bottleInnerRadius(y),
        angle = (segment / segments) * Math.PI * 2;
      a.setXYZ(
        segment * count + ring,
        r * Math.sin(angle),
        y,
        r * Math.cos(angle),
      );
    }
  a.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  group.userData.level = h;
}
export function setBottleFluidAmount(group, fraction) {
  setBottleFluidLevel(group, bottleLiquidLevel(fraction));
}
export function detachFluidGeometry(group) {
  group.getObjectByName("internal-fluid-volume").geometry = group
    .getObjectByName("internal-fluid-volume")
    .geometry.clone();
}
