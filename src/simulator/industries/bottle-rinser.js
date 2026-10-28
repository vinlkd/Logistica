import { bottleInnerRadius } from "./bottle-fluid.js";
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
export function getRinsePose(progress, operating = true) {
  const t = operating ? clamp(progress) : 0;
  const grip = ease(t / 0.12) * (1 - ease((t - 0.95) / 0.05));
  const stroke = 1.32 * ease((t - 0.12) / 0.15) * (1 - ease((t - 0.82) / 0.12));
  return {
    grip,
    lift: 0,
    angle: 0,
    nozzle: stroke,
    nozzleTip:
      2.55 -
      stroke +
      (t >= 0.3 && t <= 0.6
        ? 0.6 * Math.sin((Math.PI * (t - 0.3)) / 0.3) ** 2
        : 0),
    xOffset: 0,
    baseY: 1.2,
    mouthY: 2.2,
    spraying: operating && t >= 0.3 && t < 0.6,
    draining: operating && t >= 0.6 && t < 0.8,
    waterLevel:
      0.025 + 0.135 * ease((t - 0.3) / 0.2) * (1 - ease((t - 0.6) / 0.2)),
  };
}
export function buildBottleRinser({
  THREE,
  root,
  box,
  cyl,
  bar,
  materials: m,
  x,
}) {
  const group = new THREE.Group();
  group.name = "Lavadora interna com lança, enxágue e aspiração";
  group.position.x = x;
  root.add(group);
  const cradle = new THREE.Group();
  cradle.name = "Pinça rotativa da garrafa";
  group.add(cradle);
  box(cradle, 0, 0, -0.26, 0.5, 0.14, 0.08, m.steel);
  const jaws = [-1, 1].map((side) =>
    box(cradle, side * 0.42, 0, 0, 0.045, 0.16, 0.22, m.dark),
  );
  const slide = box(group, 0, 1.7, -1.1, 1.22, 0.12, 0.12, m.steel);
  for (const side of [-1, 1])
    for (const dx of [-0.075, 0.075])
      box(slide, side * 0.65 + dx, 0, 0, 0.03, 0.24, 0.16, m.white);
  const shaft = bar(group, [0, 1.7, -1.1], [0, 1.7, -0.3], 0.045, m.steel);
  const bearings = [-0.9, -0.4].map((z) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.063, 0.015, 8, 24),
      m.steel,
    );
    ring.position.set(0, 1.7, z);
    group.add(ring);
    return ring;
  });
  const nozzleBase = cyl(group, 0, 2.93, 0, 0.045, 0.58, m.steel);
  nozzleBase.name = "Corpo da lança de lavagem e aspiração";
  const nozzle = cyl(group, 0, 2.6, 0, 0.018, 0.1, m.steel);
  nozzle.name = "Lança fina dentro do gargalo aberto";
  nozzle.userData.insideBottle = true;
  const jets = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const jet = bar(
      group,
      [0, 1.26, 0],
      [Math.cos(angle) * 0.13, 1.3, Math.sin(angle) * 0.13],
      0.004,
      m.water,
    );
    jets.push(jet);
  }
  const drains = [
    bar(group, [0.24, 3.12, 0], [0.24, 3.12, -1.3], 0.012, m.water),
    bar(group, [0.24, 3.12, -1.3], [0.24, 0.73, -1.3], 0.012, m.water),
  ];
  const returnPipe = [
    bar(group, [0.24, 3.12, 0], [0.24, 3.12, -1.3], 0.024, m.glass ?? m.steel),
    bar(
      group,
      [0.24, 3.12, -1.3],
      [0.24, 0.73, -1.3],
      0.024,
      m.glass ?? m.steel,
    ),
  ];
  bar(group, [0, 3.22, 0], [0, 3.22, -1.1], 0.035, m.steel);
  bar(group, [0.24, 3.12, 0], [0, 3.12, 0], 0.025, m.steel);
  box(group, 0.24, 0.6, -1.3, 0.5, 0.26, 0.3, m.blue);
  for (const dx of [-0.2, 0.2])
    for (const dz of [-0.11, 0.11])
      box(group, 0.24 + dx, 0.235, -1.3 + dz, 0.04, 0.47, 0.04, m.steel);
  const basin = box(group, 0, 0.905, 0, 0.8, 0.05, 0.8, m.steel);
  basin.name = "Bacia de coleta abaixo dos roletes";
  for (const side of [-1, 1]) {
    box(group, side * 0.39, 0.97, 0, 0.02, 0.08, 0.8, m.steel);
    box(group, 0, 0.97, side * 0.39, 0.76, 0.08, 0.02, m.steel);
  }
  for (const dx of [-0.32, 0.32])
    for (const z of [-0.32, 0.32])
      box(group, dx, 0.44, z, 0.045, 0.88, 0.045, m.steel);
  bar(group, [0, 0.88, -0.25], [0, 0.62, -0.65], 0.025, m.steel);
  box(group, 0, 0.32, -0.8, 0.5, 0.64, 0.3, m.blue);
  return {
    group,
    cradle,
    jaws,
    nozzle,
    nozzleBase,
    jets,
    drains,
    update(snapshot) {
      const pose = getRinsePose(
        snapshot.progress,
        snapshot.phase === "operating" && snapshot.step?.id === "wash",
      );
      const centreY = 1.7 + pose.lift;
      cradle.position.set(0, centreY, 0);
      cradle.rotation.z = pose.angle;
      jaws.forEach(
        (jaw, i) =>
          (jaw.position.x = (i ? 1 : -1) * (0.42 - 0.2175 * pose.grip)),
      );
      slide.position.y = centreY;
      shaft.position.y = centreY;
      bearings.forEach((b) => (b.position.y = centreY));
      nozzle.position.y = (2.65 + pose.nozzleTip) / 2;
      nozzle.scale.y = (2.65 - pose.nozzleTip) / 0.1;
      const flow =
        snapshot.running && (!snapshot.outputs || snapshot.outputs.work);
      jets.forEach((jet, i) => {
        const angle = (i * Math.PI) / 3,
          bottom = pose.nozzleTip + 0.03,
          endY = bottom + 0.04;
        const radius = Math.max(0.02, bottleInnerRadius(endY - 1.2) - 0.006);
        const start = new THREE.Vector3(0, bottom, 0),
          end = new THREE.Vector3(
            Math.cos(angle) * radius,
            endY,
            Math.sin(angle) * radius,
          );
        const direction = end.clone().sub(start);
        jet.position.copy(start.add(end).multiplyScalar(0.5));
        jet.scale.y = direction.length() / jet.geometry.parameters.height;
        jet.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        );
        jet.visible = !!flow && pose.spraying;
      });
      drains.forEach((drain) => (drain.visible = !!flow && pose.draining));
      return pose;
    },
  };
}
