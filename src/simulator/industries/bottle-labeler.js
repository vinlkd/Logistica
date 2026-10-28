import { ease } from "./factory-helpers.js";
export function bottleLabelPose(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    labelX: 0.65 * (1 - ease(t / 0.12)),
    toolX: 0.65 * (1 - ease(t / 0.12)) + 0.65 * ease((t - 0.7) / 0.25),
    labelZ: 0.8 * (1 - ease((t - 0.12) / 0.43)),
    toolZ: 0.8 * (1 - ease((t - 0.12) / 0.43)) + 0.8 * ease((t - 0.7) / 0.25),
    applied: t >= 0.65,
  };
}
export function createBottleLabel(THREE, product) {
  let texture;
  const canvas = globalThis.document?.createElement("canvas");
  if (canvas) {
    canvas.width = 512;
    canvas.height = 512;
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff9e9";
    c.fillRect(0, 0, 512, 512);
    c.fillStyle = product.id === "water" ? "#087f82" : "#ed8b23";
    c.fillRect(0, 0, 512, 80);
    c.fillRect(0, 420, 512, 92);
    c.textAlign = "center";
    c.fillStyle = "#164193";
    c.font = "bold 48px sans-serif";
    c.fillText("SERRA", 256, 155);
    c.font = "bold 38px sans-serif";
    c.fillText(
      product.id === "water" ? "ÁGUA MINERAL" : "SUCO DE LARANJA",
      256,
      230,
    );
    c.font = "30px sans-serif";
    c.fillText(`${product.volume} mL`, 256, 285);
    c.font = "22px sans-serif";
    c.fillText("LOTE DIDÁTICO • SENAI", 256, 345);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const material = new THREE.MeshBasicMaterial({
    color: texture ? "#ffffff" : product.color,
    ...(texture ? { map: texture } : {}),
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.183, 0.183, 0.3, 40, 1, true, -0.95, 1.9),
    material,
  );
  mesh.position.y = 0.38;
  mesh.name = "bottle-label";
  return {
    mesh,
    dispose() {
      texture?.dispose();
      material.dispose();
    },
  };
}
export function buildBottleLabeler({
  THREE,
  root,
  box,
  cyl,
  materials: m,
  definition,
  product,
}) {
  const group = new THREE.Group();
  group.name = "Aplicador de rótulo impresso";
  const x = definition.steps.find((s) => s.id === "label").x;
  group.position.x = x;
  root.add(group);
  for (const dx of [-0.75, 0.75])
    box(group, dx, 0.65, 1.15, 0.09, 1.3, 0.09, m.steel);
  box(group, 0, 1.34, 1.15, 1.8, 0.08, 0.8, m.steel);
  const reel = cyl(group, -0.45, 1.8, 1.3, 0.25, 0.15, m.white);
  reel.rotation.x = Math.PI / 2;
  const slide = new THREE.Group();
  group.add(slide);
  box(slide, 0, 1.68, 0.33, 0.42, 0.38, 0.12, m.dark);
  box(slide, 0, 1.58, 0.2265, 0.1, 0.2, 0.087, m.white);
  box(group, 0, 1.42, 0.825, 1.5, 0.08, 1.11, m.steel);
  box(slide, 0, 1.475, 0.33, 0.12, 0.03, 0.12, m.steel);
  const consumable = createBottleLabel(THREE, product);
  consumable.mesh.position.y += 1.2;
  group.add(consumable.mesh);
  return {
    group,
    update(s) {
      const active = s.step.id === "label" && s.phase === "operating";
      const p = bottleLabelPose(active ? s.progress : 0);
      slide.position.set(p.toolX, 0, p.toolZ);
      consumable.mesh.position.x = p.labelX;
      consumable.mesh.position.z = p.labelZ;
      consumable.mesh.visible = !active || !p.applied;
      return p;
    },
    dispose: consumable.dispose,
  };
}
