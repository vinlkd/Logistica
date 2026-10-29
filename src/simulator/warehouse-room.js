// Static architectural shell shared by warehouse views. All measurements are
// local to root; both longitudinal ends remain open for the actual transport.
export function buildWarehouseRoom({ THREE, root }, options = {}) {
  const minX = options.minX ?? -12;
  const maxX = options.maxX ?? 8;
  const wallZ = options.wallZ ?? 9.6;
  const roofY = options.roofY ?? 8.4; // Clear underside, above the 6.2 m stacker.
  if (
    ![minX, maxX, wallZ, roofY].every(Number.isFinite) ||
    minX >= maxX ||
    wallZ < 7.8 ||
    roofY < 7.4
  )
    throw new Error("Dimensões insuficientes para o corredor do armazém.");
  const floorBounds = {
    minX: -14.5,
    maxX: 30.5,
    minZ: -Math.max(10.5, wallZ + 0.7),
    maxZ: Math.max(10.5, wallZ + 0.7),
    topY: 0,
    ...options.floorBounds,
  };
  if (
    ![
      floorBounds.minX,
      floorBounds.maxX,
      floorBounds.minZ,
      floorBounds.maxZ,
      floorBounds.topY,
    ].every(Number.isFinite) ||
    floorBounds.minX >= floorBounds.maxX ||
    floorBounds.minZ >= floorBounds.maxZ
  )
    throw new Error("Limites inválidos para o piso do armazém.");
  const topY = floorBounds.topY;
  if (roofY - topY < 7.4)
    throw new Error(
      "A cobertura deve ficar acima dos equipamentos do armazém.",
    );
  const group = new THREE.Group();
  group.name = "Galpão cinza • corredor longitudinal aberto";
  group.userData.warehouseRoom = {
    minX,
    maxX,
    wallZ,
    roofY,
    floorBounds: { ...floorBounds },
  };
  root.add(group);
  const walls = new THREE.Group();
  walls.name = "Paredes laterais • extremos abertos";
  group.add(walls);
  const roof = new THREE.Group();
  roof.name = "Cobertura corrugada e iluminação superior";
  group.add(roof);
  const geometryPool = new Map(),
    ownedMaterials = new Set(),
    solids = [],
    columns = [],
    lights = [];
  const material = (parameters) => {
    const value = new THREE.MeshStandardMaterial(parameters);
    ownedMaterials.add(value);
    return value;
  };
  const palette = {
    floor: material({ color: "#a5abad", metalness: 0.12, roughness: 0.42 }),
    joint: material({ color: "#80898c", metalness: 0.08, roughness: 0.7 }),
    wall: material({ color: "#b9c0c4", metalness: 0.16, roughness: 0.72 }),
    roof: material({ color: "#98a2a9", metalness: 0.4, roughness: 0.57 }),
    structure: material({ color: "#6d7982", metalness: 0.57, roughness: 0.38 }),
    housing: material({ color: "#69777f", metalness: 0.45, roughness: 0.43 }),
    led: material({
      color: "#f5f7f2",
      emissive: "#f5f7f2",
      emissiveIntensity: 2.4,
      roughness: 0.25,
    }),
  };
  const geometry = (w, h, d) => {
    const key = `${w}/${h}/${d}`;
    if (!geometryPool.has(key))
      geometryPool.set(key, new THREE.BoxGeometry(w, h, d));
    return geometryPool.get(key);
  };
  function box(parent, name, x, y, z, w, h, d, mat, solid = true) {
    const mesh = new THREE.Mesh(geometry(w, h, d), mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = mat !== palette.led;
    mesh.receiveShadow = mat !== palette.led;
    parent.add(mesh);
    if (solid) {
      solids.push(mesh);
      mesh.userData.warehouseArchitecture = true;
    }
    return mesh;
  }
  function bar(parent, name, from, to, width = 0.055) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to),
      delta = b.clone().sub(a);
    const mesh = box(
      parent,
      name,
      ...a.clone().add(b).multiplyScalar(0.5).toArray(),
      width,
      delta.length(),
      width,
      palette.structure,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }
  let floor = null;
  if (options.includeFloor !== false) {
    const f = floorBounds;
    floor = box(
      group,
      "Piso industrial cinza acetinado",
      (f.minX + f.maxX) / 2,
      f.topY - 0.04,
      (f.minZ + f.maxZ) / 2,
      f.maxX - f.minX,
      0.08,
      f.maxZ - f.minZ,
      palette.floor,
      false,
    );
    floor.castShadow = false;
    // Thin sealant joints are above the slab, never coplanar with its surface.
    for (let x = Math.ceil(f.minX / 4) * 4; x < f.maxX; x += 4)
      box(
        group,
        "Junta do piso",
        x,
        f.topY + 0.002,
        (f.minZ + f.maxZ) / 2,
        0.012,
        0.001,
        f.maxZ - f.minZ,
        palette.joint,
        false,
      ).castShadow = false;
    for (let z = Math.ceil(f.minZ / 4) * 4; z < f.maxZ; z += 4)
      box(
        group,
        "Junta do piso",
        (f.minX + f.maxX) / 2,
        f.topY + 0.002,
        z,
        f.maxX - f.minX,
        0.001,
        0.012,
        palette.joint,
        false,
      ).castShadow = false;
  }
  const length = maxX - minX,
    centerX = (minX + maxX) / 2;
  const clearColumnTop = roofY - 0.345,
    wallTop = roofY - 0.55;
  for (const side of [-1, 1]) {
    box(
      walls,
      "Fechamento lateral cinza",
      centerX,
      topY + (wallTop - topY) / 2,
      side * wallZ,
      length,
      wallTop - topY,
      0.12,
      palette.wall,
    );
    box(
      walls,
      "Rodapé de concreto",
      centerX,
      topY + 0.16,
      side * (wallZ - 0.07),
      length,
      0.32,
      0.12,
      palette.wall,
    );
  }
  const spanZ = wallZ + 0.24;
  const count = Math.max(2, Math.ceil(length / 4) + 1);
  const frameXs = Array.from(
    { length: count },
    (_, i) => minX + 0.3 + (i * (length - 0.6)) / (count - 1),
  );
  for (const x of frameXs) {
    for (const side of [-1, 1]) {
      columns.push(
        box(
          group,
          "Coluna lateral fora do trajeto",
          x,
          topY + (clearColumnTop - topY) / 2,
          side * spanZ,
          0.22,
          clearColumnTop - topY,
          0.22,
          palette.structure,
        ),
      );
      box(
        group,
        "Chapa de base da coluna",
        x,
        topY + 0.025,
        side * spanZ,
        0.48,
        0.05,
        0.48,
        palette.structure,
      );
    }
    box(
      roof,
      "Travessa superior",
      x,
      roofY - 0.285,
      0,
      0.16,
      0.12,
      spanZ * 2 + 0.22,
      palette.structure,
    );
    const low = roofY - 0.75,
      high = roofY - 0.345;
    box(
      roof,
      "Banzo inferior da tesoura",
      x,
      low,
      0,
      0.06,
      0.06,
      spanZ * 2,
      palette.structure,
    );
    const webs = 6;
    for (let j = 0; j < webs; j++) {
      const za = -spanZ + (j * spanZ * 2) / webs,
        zb = -spanZ + ((j + 1) * spanZ * 2) / webs;
      bar(
        roof,
        "Diagonal da tesoura acima do equipamento",
        [x, j % 2 ? high : low, za],
        [x, j % 2 ? low : high, zb],
        0.035,
      );
    }
  }
  for (let z = -wallZ; z <= wallZ + 0.001; z += wallZ / 3)
    box(
      roof,
      "Terça longitudinal da cobertura",
      centerX,
      roofY - 0.125,
      z,
      length + 0.4,
      0.2,
      0.08,
      palette.structure,
    );
  box(
    roof,
    "Chapa do telhado",
    centerX,
    roofY + 0.04,
    0,
    length + 0.6,
    0.08,
    (wallZ + 0.5) * 2,
    palette.roof,
  );
  const ribs = Math.ceil((length + 0.6) / 0.45);
  const ribGeometry = geometry(0.09, 0.045, (wallZ + 0.5) * 2);
  const corrugation = new THREE.InstancedMesh(ribGeometry, palette.roof, ribs);
  corrugation.name = "Nervuras da cobertura corrugada";
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < ribs; i++) {
    matrix.makeTranslation(
      minX - 0.3 + (i * (length + 0.6)) / Math.max(1, ribs - 1),
      roofY + 0.1025,
      0,
    );
    corrugation.setMatrixAt(i, matrix);
  }
  corrugation.instanceMatrix.needsUpdate = true;
  corrugation.castShadow = corrugation.receiveShadow = true;
  roof.add(corrugation);
  const underside = new THREE.InstancedMesh(
    geometry(0.09, 0.025, (wallZ + 0.5) * 2),
    palette.roof,
    ribs,
  );
  underside.name = "Ondas visíveis pelo lado interno do telhado";
  for (let i = 0; i < ribs; i++) {
    matrix.makeTranslation(
      minX - 0.3 + (i * (length + 0.6)) / Math.max(1, ribs - 1),
      roofY - 0.0125,
      0,
    );
    underside.setMatrixAt(i, matrix);
  }
  underside.instanceMatrix.needsUpdate = true;
  underside.castShadow = underside.receiveShadow = true;
  roof.add(underside);
  const fixtureCount = Math.max(2, Math.floor(length / 6));
  for (let i = 0; i < fixtureCount; i++) {
    const x = minX + 3 + (i * (length - 6)) / Math.max(1, fixtureCount - 1);
    const y = roofY - 0.83;
    box(roof, "Calha da luminária", x, y, 0, 2.5, 0.09, 0.22, palette.housing);
    box(
      roof,
      "LED linear do corredor",
      x,
      y - 0.049,
      0,
      2.4,
      0.008,
      0.15,
      palette.led,
      false,
    );
    for (const end of [-1, 1])
      bar(
        roof,
        "Suspensão da luminária",
        [x + end * 1.05, y + 0.045, 0],
        [x + end * 1.05, roofY - 0.225, 0],
        0.018,
      );
  }
  if (options.addLights !== false) {
    for (const x of [minX + length * 0.25, minX + length * 0.75]) {
      const light = new THREE.PointLight("#f1f4f3", 18, 24, 2);
      light.name = "Luz fixa do corredor sem sombra";
      light.position.set(x, roofY - 0.95, 0);
      light.castShadow = false;
      roof.add(light);
      lights.push(light);
    }
  }
  return {
    group,
    floor,
    roof,
    walls,
    columns,
    solids,
    lights,
    palette,
    setCutaway(enabled) {
      roof.visible = walls.visible = !enabled;
      columns.forEach(column=>{column.visible=!enabled;});
      group.children.filter(child=>child.name==='Chapa de base da coluna').forEach(plate=>{plate.visible=!enabled;});
    },
    dispose() {
      group.removeFromParent();
      for (const geo of geometryPool.values()) geo.dispose();
      for (const mat of ownedMaterials) mat.dispose();
      for (const light of lights) light.dispose?.();
    },
  };
}
