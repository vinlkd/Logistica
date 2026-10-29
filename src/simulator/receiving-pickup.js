import { cookwareReceivingStateFromCell } from "./cookware-receiving-flow.js";
import { CONVEYOR_TOP, CLEARANCE } from "./kinematics.js";
export function receivingPickupPose(cell) {
  const p = cookwareReceivingStateFromCell(cell);
  return {
    x: p.material.x,
    z: p.material.z,
    support: p.material.y - CLEARANCE,
    magnetX: p.head.x,
    magnetY: p.head.y + 0.025,
    magnetZ: p.head.z,
    caught: p.gripping,
  };
}

export function buildReceivingPickup({ root, THREE, box, cyl, bar, m }) {
  const group = new THREE.Group();
  root.add(group);
  group.name = "Coletor do disco na doca";
  box(group, -5.3375, CONVEYOR_TOP - 0.05, 0, 0.925, 0.1, 1.45, m.steel);
  for (const x of [-5.4, -5.0])
    for (const z of [-0.55, 0.55]) {
      box(
        group,
        x,
        (CONVEYOR_TOP - 0.1) / 2,
        z,
        0.06,
        CONVEYOR_TOP - 0.1,
        0.06,
        m.steel,
      );
    }

  for (const x of [-6.65, -3.85])
    box(group, x, 1.65, -2.5, 0.13, 3.3, 0.13, m.blue);
  bar(group, [-6.65, 3.3, -2.5], [-3.85, 3.3, -2.5], 0.065, m.steel);
  const carriage = new THREE.Group();
  group.add(carriage);
  carriage.position.x = -5.65;
  box(carriage, 0, 3.3, -2.5, 0.32, 0.18, 0.2, m.dark);
  bar(carriage, [0, 3.3, -2.5], [0, 3.3, 0], 0.055, m.steel);
  const magnet = cyl(carriage, 0, 1.8, 0, 0.25, 0.05, m.dark);
  const rod = cyl(carriage, 0, 2.5, 0, 0.04, 1, m.steel);
  return {
    group,
    carriage,
    magnet,
    rod,
    update(cell) {
      const p = receivingPickupPose(cell);
      carriage.position.x = p.magnetX;
      magnet.position.y = p.magnetY;
      rod.position.y = (p.magnetY + 0.025 + 3.3) / 2;
      rod.scale.y = 3.3 - p.magnetY - 0.025;
    },
  };
}
