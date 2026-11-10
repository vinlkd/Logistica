export function buildCircuitRollerBridge(
  THREE,
  scene,
  { points, floorY, name, steel, frame },
) {
  const from = new THREE.Vector3(...points[0]);
  const to = new THREE.Vector3(...points.at(-1));
  const length = from.distanceTo(to);
  const center = from.clone().add(to).multiplyScalar(0.5);
  const direction = to.clone().sub(from).normalize();
  const group = new THREE.Group();
  group.name = name;
  group.position.set(center.x, 0, center.z);
  group.rotation.y = -Math.atan2(direction.z, direction.x);
  scene.add(group);

  function box(label, x, y, z, width, height, depth, material) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );
    mesh.name = label;
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const rollerCenterY = floorY + 1.145;
  for (const side of [-1, 1]) {
    box("Guia lateral dos roletes", 0, rollerCenterY + 0.15, side * 1.82,
      length, 0.2, 0.08, frame);
    box("Longarina dos roletes", 0, floorY + 0.88, side * 1.68,
      length, 0.1, 0.14, frame);
  }

  const count = Math.max(1, Math.floor(length / 0.3));
  const geometry = new THREE.CylinderGeometry(0.075, 0.075, 3.5, 12);
  const rollers = [];
  for (let index = 0; index < count; index++) {
    const progress = (index + 1) / (count + 1);
    const roller = new THREE.Mesh(geometry, steel);
    roller.name = "Rolete de ligação entre máquinas";
    roller.position.set(
      THREE.MathUtils.lerp(-length / 2, length / 2, progress),
      rollerCenterY,
      0,
    );
    roller.rotation.x = Math.PI / 2;
    roller.castShadow = roller.receiveShadow = true;
    group.add(roller);
    rollers.push(roller);
  }

  const supportCount = Math.max(1, Math.ceil(length / 1.2));
  for (let index = 0; index <= supportCount; index++) {
    const x = THREE.MathUtils.lerp(
      -length / 2,
      length / 2,
      index / supportCount,
    );
    for (const side of [-1, 1]) {
      const legHeight = rollerCenterY - 0.075 - floorY;
      box("Pé da ligação de roletes", x, floorY + legHeight / 2, side * 1.68,
        0.09, legHeight, 0.09, steel);
      box("Sapata da ligação de roletes", x, floorY + 0.025, side * 1.68,
        0.2, 0.05, 0.2, frame);
    }
    box("Travessa sob os roletes", x, floorY + 0.84, 0,
      0.1, 0.1, 3.35, frame);
  }

  const samples = [];
  const divisions = Math.max(1, Math.ceil(length / 0.055));
  for (let index = 0; index <= divisions; index++)
    samples.push(from.clone().lerp(to, index / divisions));

  return {
    group,
    samples,
    rollers,
    barriers: [],
    update(dt, running) {
      if (running)
        for (const roller of rollers) roller.rotateY(-dt * 4.2);
      return false;
    },
    reset() {},
  };
}
