// Geometry-only truck model: opening and cargo supports share the conveyor datum.
export function buildTruck({
  root,
  THREE,
  box,
  cyl,
  bar,
  m,
  shipping,
  layout,
}) {
  const direction = shipping ? 1 : -1,
    truck = new THREE.Group();
  truck.position.set(direction * 9.2, 0, layout.package.centerZ);
  root.add(truck);
  const body = new THREE.MeshStandardMaterial({
    color: "#dce3e8",
    metalness: 0.48,
    roughness: 0.36,
  });
  const paint = new THREE.MeshStandardMaterial({
    color: "#164193",
    metalness: 0.48,
    roughness: 0.28,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: "#172027",
    roughness: 0.94,
  });
  const windowMat = new THREE.MeshPhysicalMaterial({
    color: "#375c73",
    metalness: 0.15,
    roughness: 0.14,
    clearcoat: 1,
  });
  const lamps = new Map();
  const lamp = (color) => {
    if (!lamps.has(color))
      lamps.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.8,
        }),
      );
    return lamps.get(color);
  };
  const deck = layout.conveyorTop,
    halfDepth = Math.max(1.6, layout.package.depth / 2 + 0.35),
    roof = 4.55,
    wallTop = roof - 0.05;
  box(truck, 0, 0.83, 0, 6.8, 0.24, halfDepth * 2, m.dark, true);
  box(truck, 0, deck - 0.07, 0, 6.8, 0.14, halfDepth * 2, body);
  // A cutaway on the near side keeps loading visible; rear doors are opened away from the route.
  // Continuous roof covers the entire cargo body; the open side preserves visibility.
  const roofPanel = box(truck, 0, roof, 0, 6.8, 0.1, halfDepth * 2, body);
  roofPanel.name = "cargo-roof";

  truck.userData.cutaway = true;
  box(
    truck,
    0,
    (wallTop + deck) / 2,
    -halfDepth,
    6.6,
    wallTop - deck,
    0.07,
    body,
  );
  for (let x = -3.2; x < 3.4; x += 0.32)
    box(
      truck,
      x,
      (roof + deck) / 2,
      -halfDepth + 0.045,
      0.025,
      roof - deck - 0.12,
      0.015,
      m.white,
    );
  box(
    truck,
    direction * 3.35,
    (wallTop + deck) / 2,
    0,
    0.1,
    wallTop - deck,
    halfDepth * 2,
    body,
  );
  const doors = [];
  for (const z of [-halfDepth, halfDepth]) {
    if (z < 0)
      box(
        truck,
        -direction * 3.38,
        (wallTop + deck) / 2,
        z,
        0.16,
        wallTop - deck,
        0.1,
        m.steel,
      );
    const door = new THREE.Group();
    door.position.set(-direction * 3.44, deck, z + Math.sign(z) * 0.09);
    door.rotation.y = (z > 0 ? 1 : -1) * direction * Math.PI;
    truck.add(door);
    doors.push(door);
    const leaf = halfDepth - 0.06;
    box(
      door,
      (-direction * leaf) / 2,
      (roof - deck) / 2,
      0,
      leaf,
      roof - deck,
      0.07,
      body,
    );
    bar(
      door,
      [-direction * leaf * 0.75, 0.2, 0.055],
      [-direction * leaf * 0.75, roof - deck - 0.2, 0.055],
      0.024,
      m.steel,
    );
    for (const height of [0.3, (roof - deck) / 2, roof - deck - 0.3])
      box(door, -direction * 0.035, height, 0, 0.09, 0.09, 0.12, m.dark);
    box(
      door,
      -direction * leaf * 0.75,
      (roof - deck) * 0.42,
      0.085,
      0.19,
      0.06,
      0.05,
      m.dark,
    );
    box(
      truck,
      0,
      deck + 0.1,
      z < 0 ? z + 0.0625 : z,
      6.6,
      0.06,
      0.055,
      m.steel,
    );
    for (const x of [-2.8, -1.4, 0, 1.4, 2.8])
      box(truck, x, 0.98, z, 0.2, 0.06, 0.025, lamp("#e6a239"));
  }
  // Cab: sloped glass, roof, bumper, grille, lights, doors, mirrors and steps.
  const cab = new THREE.Group();
  cab.position.x = direction * 4.65;
  truck.add(cab);
  box(cab, 0, 2.13, 0, 2.35, 1.82, 2.85, paint, true);
  box(cab, -direction * 0.86, 0.98, 0, 0.57, 0.47, 2.85, paint, true);
  box(cab, 0, 3.115, 0, 2.2, 0.15, 2.9, paint, true);
  const windshield = box(
    cab,
    direction * 1.26,
    2.58,
    0,
    0.035,
    0.9,
    2.5,
    windowMat,
    true,
  );
  windshield.rotation.z = direction * 0.12;
  bar(
    cab,
    [direction * 1.35, 2.22, -0.96],
    [direction * 1.3, 2.72, -0.12],
    0.018,
    m.dark,
  );
  bar(
    cab,
    [direction * 1.35, 2.22, 0.24],
    [direction * 1.3, 2.72, 1.02],
    0.018,
    m.dark,
  );
  box(cab, direction * 1.22, 1.48, 0, 0.06, 0.62, 2.35, m.dark, true);
  for (let y = 1.25; y < 1.8; y += 0.1)
    box(cab, direction * 1.26, y, 0, 0.03, 0.026, 1.5, m.steel);
  box(cab, direction * 1.26, 0.99, 0, 0.14, 0.23, 2.8, m.steel, true);
  for (const z of [-1.08, 1.08]) {
    box(
      cab,
      direction * 1.295,
      1.36,
      z,
      0.07,
      0.28,
      0.45,
      lamp("#fff5cf"),
      true,
    );
    box(cab, direction * 1.29, 1.1, z, 0.06, 0.09, 0.25, lamp("#e6a239"));
    box(
      cab,
      -direction * 0.1,
      2.6,
      z > 0 ? 1.4525 : -1.4525,
      1.45,
      0.78,
      0.035,
      windowMat,
      true,
    );
    box(
      cab,
      -direction * 0.25,
      1.94,
      z > 0 ? 1.45 : -1.45,
      1.4,
      0.025,
      0.015,
      m.dark,
    );
    box(
      cab,
      -direction * 0.62,
      2.12,
      z > 0 ? 1.47 : -1.47,
      0.23,
      0.045,
      0.03,
      m.dark,
      true,
    );
    bar(
      cab,
      [direction * 0.9, 2.65, z > 0 ? 1.44 : -1.44],
      [direction * 0.9, 2.65, z > 0 ? 1.84 : -1.84],
      0.035,
      m.dark,
    );
    box(
      cab,
      direction * 0.88,
      2.47,
      z > 0 ? 1.86 : -1.86,
      0.21,
      0.45,
      0.13,
      m.dark,
      true,
    );
    box(
      cab,
      -direction * 0.75,
      0.8,
      z > 0 ? 1.6 : -1.6,
      0.55,
      0.08,
      0.35,
      m.steel,
    );
  }
  box(truck, direction * 2.2, 0.64, 0, 0.7, 0.45, 2.3, m.steel, true);
  const tank = cyl(truck, direction * 3.05, 0.6, 0, 0.29, 1.9, m.steel);
  tank.rotation.x = Math.PI / 2;
  for (const z of [-0.58, 0.58])
    box(truck, direction * 3.05, 0.6, z, 0.62, 0.49, 0.045, m.dark);
  // Reflective strips, side underrun guards and front identification lights.
  box(truck, 0, 1.84, -halfDepth - 0.041, 6.2, 0.09, 0.015, lamp("#e7490f"));
  box(truck, 0, 3.9, -halfDepth - 0.042, 6.2, 0.22, 0.015, paint);
  for (const side of [-1, 1]) {
    box(
      truck,
      direction * 0.9,
      0.58,
      side * (halfDepth - 0.07),
      2.6,
      0.09,
      0.06,
      m.steel,
    );
    box(
      truck,
      -direction * 2.92,
      0.32,
      side * halfDepth,
      0.08,
      0.44,
      0.42,
      rubber,
    );
  }
  for (const z of [-0.85, 0, 0.85])
    box(cab, direction * 0.95, 3.22, z, 0.14, 0.065, 0.11, lamp("#fff5cf"));
  box(cab, direction * 1.345, 1.03, 0, 0.018, 0.11, 0.38, m.dark);
  const wheels = [];
  for (const x of [-direction * 2.35, -direction * 0.95, direction * 4.8])
    for (const side of [-1, 1]) {
      const front = Math.abs(x - direction * 4.8) < 0.01,
        z = side * (front ? 1.39 : halfDepth);
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.54, z);
      truck.add(wheel);
      wheels.push(wheel);
      const tire = cyl(wheel, 0, 0, 0, 0.54, 0.34, rubber);
      tire.rotation.x = Math.PI / 2;
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.047, 8, 32, Math.PI),
        m.dark,
      );
      arch.position.set(0, 0, side * 0.06);
      wheel.add(arch);
      wheel.name = "Conjunto de roda";
      const hub = cyl(wheel, 0, 0, z > 0 ? 0.18 : -0.18, 0.3, 0.025, m.steel);
      hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) {
        const tread = box(
          wheel,
          Math.sin((i * Math.PI) / 6) * 0.515,
          Math.cos((i * Math.PI) / 6) * 0.515,
          0,
          0.08,
          0.025,
          0.36,
          rubber,
        );
        tread.rotation.z = (-i * Math.PI) / 6;
      }
      for (let i = 0; i < 6; i++) {
        const bolt = cyl(
          wheel,
          Math.sin((i * Math.PI) / 3) * 0.18,
          Math.cos((i * Math.PI) / 3) * 0.18,
          z > 0 ? 0.2 : -0.2,
          0.025,
          0.03,
          m.dark,
        );
        bolt.rotation.x = Math.PI / 2;
      }
    }
  box(truck, -direction * 3.5, 0.75, 0, 0.16, 0.16, halfDepth * 2, m.steel);
  for (const z of [-halfDepth + 0.18, halfDepth - 0.18])
    box(truck, -direction * 3.59, 0.93, z, 0.03, 0.16, 0.22, lamp("#c33f30"));
  const lift = new THREE.Group();
  root.add(lift);
  box(
    lift,
    direction * 4.1,
    deck - 0.07,
    layout.package.centerZ,
    3.4,
    0.14,
    layout.package.depth + 0.3,
    m.steel,
  );
  for (const z of [
    layout.package.centerZ - layout.package.depth / 2 - 0.12,
    layout.package.centerZ + layout.package.depth / 2 + 0.12,
  ])
    bar(
      root,
      [direction * 4.2, 0.1, z],
      [direction * 4.2, 3.5, z],
      0.055,
      m.steel,
    );
  // Visible internal cargo rails let the dock lift feed three levels without crossing earlier cargo.
  if (shipping)
    for (let tier = 1; tier < 3; tier++)
      for (const z of [-layout.package.width * 0.3, layout.package.width * 0.3])
        box(
          truck,
          0,
          deck + tier * (layout.package.height + 0.08) - 0.035,
          z,
          6.65,
          0.07,
          0.12,
          m.steel,
        );
  // Thin deck seams are below the product clearance; bollards sit outside its swept width.
  for (const sign of [-1, 1]) {
    const z = layout.package.centerZ + sign * (layout.package.depth / 2 + 0.38);
    box(root, direction * 5.35, 0.38, z, 0.13, 0.76, 0.13, m.yellow);
    for (const y of [0.2, 0.45, 0.65])
      box(root, direction * 5.35, y, z, 0.14, 0.045, 0.14, m.dark);
  }
  for (const x of [direction * 2.48, direction * 5.71])
    box(
      lift,
      x,
      deck + 0.002,
      layout.package.centerZ,
      0.025,
      0.004,
      layout.package.depth + 0.18,
      m.dark,
    );
  return {
    truck,
    lift,
    doors,
    wheels,
    materials: [body, paint, rubber, windowMat, ...lamps.values()],
  };
}
