import {
  BEVERAGE_CORNER_ARC,
  BEVERAGE_CORNER_LENGTH,
  BEVERAGE_CORNER_RADIUS,
  beverageCornerPoint,
  beverageCircuitTransition,
} from "./beverage-circuit-layout.js";

export function buildBeverageCorner(THREE) {
  const group = new THREE.Group();
  group.name = "Esteira curva entre tampagem e rotulagem";
  const frame = new THREE.MeshStandardMaterial({ color: "#25323e", metalness: 0.45, roughness: 0.48 });
  const steel = new THREE.MeshStandardMaterial({ color: "#aebdc9", metalness: 0.84, roughness: 0.25 });
  const mark = new THREE.LineBasicMaterial({ color: "#526374" });
  const railSteps = 24;
  for (const lateral of [-2.15, 1.5]) {
    const edge = (offset) => [
      ...Array.from({ length: railSteps + 1 }, (_, i) => beverageCornerPoint(BEVERAGE_CORNER_ARC * i / railSteps, offset)),
      beverageCornerPoint(BEVERAGE_CORNER_LENGTH, offset),
    ];
    const outline = [...edge(lateral - 0.06), ...edge(lateral + 0.06).reverse()];
    const shape = new THREE.Shape(outline.map(({ x, z }) => new THREE.Vector2(x, z)));
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.27, bevelEnabled: false }), frame);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.005;
    rail.receiveShadow = true;
    group.add(rail);
    for (const t of [0.13, 0.51, 0.89]) {
      const at = beverageCornerPoint(BEVERAGE_CORNER_ARC * t, lateral);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.735, 0.1), steel);
      leg.position.set(at.x, 0.3675, at.z);
      group.add(leg);
    }
  }

  const rollers = [];
  const count = Math.ceil(BEVERAGE_CORNER_ARC / 0.26);
  const outerRadius = 0.075;
  // The rollers taper towards the centre of the bend so they cannot overlap.
  // Tilt each axle by the difference in radii to keep the top datum level.
  const innerRadius = outerRadius * (BEVERAGE_CORNER_RADIUS - 1.45) / (BEVERAGE_CORNER_RADIUS + 2.1);
  for (let i = 0; i <= count; i++) {
    const along = BEVERAGE_CORNER_ARC * i / count;
    const outside = beverageCornerPoint(along, -2.1);
    const inside = beverageCornerPoint(along, 1.45);
    const a = new THREE.Vector3(outside.x, 1.195 - outerRadius, outside.z);
    const b = new THREE.Vector3(inside.x, 1.195 - innerRadius, inside.z);
    const axis = b.clone().sub(a), length = axis.length();
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(innerRadius, outerRadius, length, 16), steel);
    roller.name = "Rolete cônico da curva";
    roller.position.copy(a).lerp(b, 0.5);
    roller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    const stripe = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(outerRadius + 0.0003, -length / 2, 0),
      new THREE.Vector3(innerRadius + 0.0003, length / 2, 0),
    ]);
    roller.add(new THREE.Line(stripe, mark));
    group.add(roller);
    rollers.push(roller);
  }

  let previous;
  group.userData.update = (snapshot) => {
    const label = snapshot.stations?.label ?? (snapshot.step?.id === "label" ? snapshot : null);
    if (snapshot.scope !== "line" || label?.phase !== "moving" || label.hasMaterial === false) {
      previous = undefined;
      return;
    }
    const { travel } = beverageCircuitTransition("label", label.progress);
    const position = Math.max(0, Math.min(BEVERAGE_CORNER_ARC, travel - 5));
    if (previous && previous.id === label.unit?.id && label.running && label.outputs?.motor) {
      const delta = Math.max(0, position - previous.position);
      if (delta > 0) for (const roller of rollers) roller.rotateY(-delta / 0.043);
    }
    previous = { id: label.unit?.id, position };
  };
  return group;
}
