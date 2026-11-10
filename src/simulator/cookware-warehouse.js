import { demandStoragePose } from "./warehouse-logistics.js";
import { buildWarehouseRack } from "./warehouse.js";
import { getLayout, CONVEYOR_TOP, CLEARANCE, smooth } from "./kinematics.js";
const part = (t, a, b) => smooth((t - a) / (b - a));
export function cookwareWarehouseAddress(id, product) {
  const p = getLayout(
    typeof product === "string" ? product : product.id,
  ).package;
  const ordinal = Math.max(
    1,
    Number(String(id ?? "UT-001").replace(/\D/g, "")) || 1,
  );
  const index = (ordinal - 1) % 6,
    column = index % 3,
    level = Math.floor(index / 3);
  return {
    index,
    label: `PA-${String(index + 1).padStart(2, "0")}`,
    x: (column - 1) * (p.width + 0.8),
    z: -3.6,
    y: CONVEYOR_TOP + 1.6 + level * (p.height + 0.45),
    package: p,
  };
}
export function cookwareWarehousePose(cell, product) {
  if (cell.onDemand) return demandStoragePose(cell, product);
  if (cell.id !== "finished" || cell.phase !== "processing") return null;
  const slot = cookwareWarehouseAddress(cell.unit?.id, product),
    t = cell.stage?.progress ?? 0;
  const belt = CONVEYOR_TOP + CLEARANCE,
    high = slot.y + 0.04,
    park = CONVEYOR_TOP - 0.04;
  let x = 0,
    z = 0,
    base = belt,
    fx = 0,
    fz = 0,
    fy = park;
  switch (cell.stage?.id) {
    case "raise": {
      const rise = part(t, 0.1, 0.5),
        across = part(t, 0.5, 1);
      base = belt + (high - belt) * rise;
      x = slot.x * across;
      fx = x;
      fy = park + (belt - park) * part(t, 0, 0.1) + (high - belt) * rise;
      break;
    }
    case "store": {
      x = fx = slot.x;
      z = slot.z * part(t, 0, 0.4);
      base = high - 0.04 * part(t, 0.4, 0.55);
      fy = high - 0.04 * part(t, 0.4, 0.55) - 0.04 * part(t, 0.55, 0.65);
      fz = slot.z * (part(t, 0, 0.4) - part(t, 0.65, 1));
      break;
    }
    case "retrieve": {
      x = fx = slot.x;
      base = slot.y + 0.04 * part(t, 0.5, 0.6);
      fy = slot.y - 0.04 + 0.04 * part(t, 0.4, 0.5) + 0.04 * part(t, 0.5, 0.6);
      fz = slot.z * (part(t, 0, 0.4) - part(t, 0.6, 1));
      z = slot.z * (1 - part(t, 0.6, 1));
      break;
    }
    case "lower": {
      x = fx = slot.x * (1 - part(t, 0, 0.45));
      base = high + (belt - high) * part(t, 0.45, 0.9);
      fy = base + (park - belt) * part(t, 0.9, 1);
      break;
    }
  }
  return {
    x,
    z,
    support: base - CLEARANCE,
    y: base + 0.18,
    lift: base - belt,
    forkZ: fz,
    forkLift: fy - CONVEYOR_TOP,
    warehouseX: fx,
    warehouseZ: fz,
    warehouseForkY: fy,
    warehouseAddress: slot.label,
  };
}
export function buildCookwareWarehouse({
  THREE,
  root,
  box,
  cyl,
  materials: m,
  product,
  solid,
}) {
  const group = new THREE.Group();
  group.name = "Armazém de panelas • seis endereços reais";
  root.add(group);
  const spec = getLayout(product.id).package,
    pitch = spec.width + 0.8;
  const rear = -3.6 + spec.centerZ,
    depth = spec.depth + 0.3;
  const top = CONVEYOR_TOP + 1.6 + spec.height + 0.45 + spec.height + 0.35;
  const fixed = [];
  function structure(x, y, z, w, h, d, material = m.blue) {
    const mesh = solid
      ? solid(x, y, z, w, h, d, material)
      : box(group, x, y, z, w, h, d, material);
    mesh.name = "Estrutura fixa do armazém";
    mesh.userData.warehouseFixed = true;
    fixed.push(mesh);
    return mesh;
  }
  const slots = Array.from({ length: 6 }, (_, index) =>
    cookwareWarehouseAddress(`UT-${index + 1}`, product),
  );
  const rack = buildWarehouseRack(
    { THREE, root: group, box, materials: m, solid, footplates: false },
    slots.map((slot) => ({
      id: slot.label,
      x: slot.x,
      y: slot.y,
      z: rear,
      width: spec.width + 0.5,
      depth,
      height: spec.height + 0.4,
      forkClearance: true,
    })),
  );
  fixed.push(...rack.fixed);
  for (const z of [1.73, 2.17])
    structure(0, 0.08, z, pitch * 3 + 0.4, 0.12, 0.08, m.steel);
  const carriage = new THREE.Group();
  group.add(carriage);
  carriage.name = "Carro de armazenagem acionado sobre trilhos";
  box(carriage, 0, 0.21, 1.95, 1.5, 0.2, 0.6, m.blue);
  for (const x of [-0.6, 0.6])
    for (const z of [1.73, 2.17]) {
      const wheel = cyl(carriage, x, 0.15, z, 0.07, 0.07, m.dark);
      wheel.rotation.x = Math.PI / 2;
    }
  const mastTop = top + 0.15;
  for (const x of [-0.66, 0.66])
    box(carriage, x, mastTop / 2, 1.95, 0.1, mastTop, 0.1, m.blue);
  box(carriage, 0, mastTop, 1.95, 1.5, 0.12, 0.2, m.steel);
  const lift = new THREE.Group();
  carriage.add(lift);
  lift.name = "Garfos de apoio da caixa";
  box(lift, 0, -0.1, 1.95, 1.2, 0.15, 0.3, m.blue);
  const tines = [-0.15, 0.15].map((x) =>
    box(lift, x, -0.03, spec.centerZ, 0.13, 0.06, spec.depth + 0.12, m.steel),
  );
  const guides = [-0.15, 0.15].map((x) =>
    box(lift, x, -0.1, 0.8, 0.08, 0.07, 2.3, m.steel),
  );
  const ram = cyl(carriage, 0.52, 2, 1.95, 0.035, 1, m.steel);
  lift.position.y = CONVEYOR_TOP - 0.04;
  return {
    group,
    slots,
    fixed,
    carriage,
    lift,
    tines,
    update(pose, cell) {
      const x = pose.warehouseX ?? 0,
        y = pose.warehouseForkY ?? CONVEYOR_TOP - 0.04,
        z = pose.warehouseZ ?? 0;
      const occupied =
        cell?.part &&
        cell.phase === "processing" &&
        ((cell.stage?.id === "store" && cell.stage.progress >= 0.55) ||
          (cell.stage?.id === "retrieve" && cell.stage.progress < 0.5));
      group.userData.stock = occupied
        ? [{ id: cell.unit.id, address: pose.warehouseAddress, quantity: 1 }]
        : [];
      group.userData.quantity = occupied ? 1 : 0;
      carriage.position.x = x;
      lift.position.y = y;
      tines.forEach((tine) => (tine.position.z = spec.centerZ + z));
      const rearEnd = spec.centerZ + z + spec.depth / 2 + 0.06;
      guides.forEach((guide) => {
        guide.position.z = (1.95 + rearEnd) / 2;
        guide.scale.z = Math.max(0.001, (1.95 - rearEnd) / 2.3);
      });
      const bottom = 0.32,
        upper = Math.max(bottom + 0.02, y - 0.18);
      ram.position.y = (bottom + upper) / 2;
      ram.scale.y = upper - bottom;
    },
    dispose() {
      rack.dispose();
    },
  };
}

export function buildCookwareRawAddresses({
  THREE,
  root,
  box,
  materials: m,
  layout,
  positions,
  solid,
}) {
  const group = new THREE.Group();
  root.add(group);
  group.name = "Armazém de matéria-prima • pilhas endereçadas";
  const owned = [];
  const slots = positions.map((x, i) => ({
    id: `MP-${String(i + 1).padStart(2, "0")}`,
    x,
    z: -3.6 + layout.package.centerZ,
  }));
  for (const slot of slots) {
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const x = slot.x + side * 0.72,
          z = slot.z + end * 0.82;
        const post = solid
          ? solid(x, 0.8, z, 0.07, 1.6, 0.07, m.blue)
          : box(group, x, 0.8, z, 0.07, 1.6, 0.07, m.blue);
        post.name = `Montante fixo ${slot.id}`;
      }
    for (const side of [-1, 1])
      box(group, slot.x, 1.6, slot.z + side * 0.82, 1.34, 0.07, 0.07, m.steel);
    const z = slot.z + 1.05;
    const post = solid
      ? solid(slot.x, 0.55, z, 0.04, 1.1, 0.04, m.steel)
      : box(group, slot.x, 0.55, z, 0.04, 1.1, 0.04, m.steel);
    post.name = `Identificação fixa ${slot.id}`;
    const plate = box(group, slot.x, 1.18, z, 0.44, 0.2, 0.025, m.white);
    plate.name = `Estoque real ${slot.id}`;
    const canvas = globalThis.document?.createElement("canvas");
    if (canvas) {
      canvas.width = 256;
      canvas.height = 128;
      const c = canvas.getContext("2d");
      if (c) {
        c.fillStyle = "#edf2f6";
        c.fillRect(0, 0, 256, 128);
        c.fillStyle = "#164193";
        c.font = "bold 55px Segoe UI";
        c.textAlign = "center";
        c.fillText(slot.id, 128, 84);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: texture });
        plate.material = mat;
        owned.push(texture, mat);
      }
    }
  }
  return {
    group,
    slots,
    update() {},
    dispose() {
      owned.forEach((o) => o.dispose());
    },
  };
}
