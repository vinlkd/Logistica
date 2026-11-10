// Cartesian magnetic feeder: all axes are supported by a floor-mounted gantry.
export function buildRawLoader({ root, THREE, box, cyl, m, layout }) {
  const group = new THREE.Group();
  group.name = "Pórtico das quatro pilhas";
  root.add(group);
  const rear = -3.6 + layout.package.centerZ,
    z0 = rear - 0.85,
    z1 = -2.65,
    railY = 5.15;
  for (const x of [-5.4, 5.4])
    for (const z of [z0, z1]) {
      box(
        group,
        x,
        (0.025 + railY - 0.17) / 2,
        z,
        0.14,
        railY - 0.195,
        0.14,
        m.blue,
      );
    }
  for (const z of [z0, z1]) box(group, 0, railY, z, 10.95, 0.16, 0.16, m.steel);
  const bridge = new THREE.Group();
  group.add(bridge);
  box(
    bridge,
    0,
    railY + 0.28,
    (z0 + z1) / 2,
    0.2,
    0.16,
    z1 - z0 + 0.22,
    m.blue,
  );
  for (const z of [z0, z1])
    box(bridge, 0, railY + 0.14, z, 0.38, 0.12, 0.3, m.yellow);
  const saddle = box(group, 0, railY, -3.6, 0.35, 0.24, 0.35, m.yellow);
  const rod = cyl(group, 0, 3, -3.6, 0.045, 1, m.steel);
  const magnet = new THREE.Group();
  group.add(magnet);
  cyl(magnet, 0, 0.03, 0, 0.17, 0.06, m.dark);
  cyl(magnet, 0, 0.075, 0, 0.12, 0.03, m.yellow);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 12, 8),
    new THREE.MeshBasicMaterial({ color: "#5d7989" }),
  );
  led.position.set(0.14, 0.06, 0);
  magnet.add(led);
  return {
    group,
    bridge,
    saddle,
    rod,
    magnet,
    led,
    railY: railY + 0.28,
    dispose() {
      led.material.dispose();
    },
  };
}
export function updateRawLoader(model, pose) {
  if (!Number.isFinite(pose.loaderX)) return;
  const x = pose.loaderX,
    y = pose.loaderY,
    z = pose.loaderZ;
  model.bridge.position.x = x;
  model.saddle.position.set(x, model.railY, z);
  model.magnet.position.set(x, y, z);
  const lower = y + 0.09,
    upper = model.railY - 0.04;
  model.rod.position.set(x, (lower + upper) / 2, z);
  model.rod.scale.y = Math.max(0.01, upper - lower);
  model.led.material.color.set(
    pose.loaderCaught
      ? "#36bd8c"
      : pose.loaderReleasing
        ? "#e7490f"
        : "#5d7989",
  );
}
