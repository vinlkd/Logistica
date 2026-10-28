export const ease = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function foldingCarton(THREE, parent, box, m, width, depth, height) {
  const group = new THREE.Group();
  parent.add(group);
  const walls = [];
  for (const side of [-1, 1]) {
    const a = new THREE.Group();
    a.position.x = (side * width) / 2;
    group.add(a);
    box(a, 0, height / 2, 0, 0.03, height, depth, m.box);
    walls.push({ hinge: a, axis: "z", open: (-side * Math.PI) / 2 });
    const b = new THREE.Group();
    b.position.z = (side * depth) / 2;
    group.add(b);
    box(b, 0, height / 2, 0, width, height, 0.03, m.box);
    walls.push({ hinge: b, axis: "x", open: (side * Math.PI) / 2 });
  }
  const lid = new THREE.Group();
  lid.position.set(0, height + 0.025, -depth / 2);
  group.add(lid);
  box(lid, 0, 0, depth / 2, width + 0.03, 0.035, depth, m.box);
  box(group, 0, -0.015, 0, width + 0.03, 0.03, depth + 0.03, m.box);
  return {
    group,
    walls,
    lid,
    update(progress) {
      const folded = ease((progress - 0.15) / 0.65);
      walls.forEach((w) => (w.hinge.rotation[w.axis] = w.open * (1 - folded)));
      lid.visible = progress >= 0.8;
      lid.rotation.x = (-Math.PI / 2) * (1 - ease((progress - 0.8) / 0.2));
    },
  };
}
export function buildIndustryBase(args) {
  if (args.stationView) return;
  const { THREE, root, box, cyl, bar, materials: m, definition } = args;
  const start = definition.entryX ?? -8,
    end = definition.exitX ?? 9;
  const floor = box(
    root,
    (start + end) / 2,
    -0.04,
    0,
    end - start + 6,
    0.08,
    10,
    m.floor ?? m.white,
  );
  floor.name = "Piso da indústria";
  for (const z of [-4.8, 4.8])
    box(
      root,
      (start + end) / 2,
      0.001,
      z,
      end - start + 5.6,
      0.002,
      0.05,
      m.yellow,
    );
  for (const z of [-0.65, 0.65]) {
    box(root, (start + end) / 2, 0.8, z, end - start, 0.16, 0.1, m.dark);
    for (let x = start + 0.4; x < end; x += 2)
      box(root, x, 0.36, z, 0.08, 0.72, 0.08, m.steel);
  }
  for (let x = start; x <= end; x += 0.22) {
    if (
      definition.id === "furniture" &&
      Math.abs(x - definition.steps.find((s) => s.id === "assemble").x) < 0.82
    )
      continue;
    if (
      definition.id === "furniture" &&
      Math.abs(
        x -
          (definition.steps.find((s) => s.id === "cut").x -
            0.95 +
            (args.product.length / 100) * 1.25),
      ) < 0.12
    )
      continue;
    const roller = cyl(root, x, 1.14, 0, 0.06, 1.25, m.steel);
    roller.rotation.x = Math.PI / 2;
    for (const z of [-0.65, 0.65])
      box(root, x, 1.01, z, 0.1, 0.26, 0.1, m.dark);
  }
  for (const step of definition.steps) {
    const plate = box(root, step.x, 0.04, -2.8, 0.3, 0.08, 0.3, m.dark);
    bar(root, [step.x, 0.08, -2.8], [step.x, 2.8, -2.8], 0.025, m.steel);
    const canvas = globalThis.document?.createElement("canvas");
    if (canvas) {
      canvas.width = 512;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#f5f8fb";
        ctx.fillRect(0, 0, 512, 160);
        ctx.fillStyle = "#164193";
        ctx.font = "600 28px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText(step.label, 256, 92);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sign = box(root, step.x, 2.8, -2.8, 1.4, 0.4, 0.035, material);
        sign.userData.ownedTexture = texture;
      }
    }
    plate.name = `Apoio da placa ${step.label}`;
  }
}
// In the original laboratory, only the selected operation owns the equipment.
// Preserve animation visibility separately from stage visibility so revisiting
// a stage restores tools without resurrecting consumed caps or offcuts.
export function stationModel(args, model) {
  if (!args.stationView) return model;
  const { THREE, root, definition, product } = args;
  const settings = Object.fromEntries(
    definition.controls.map((c) => [c.id, c.value]),
  );
  model.update(
    {
      phase: "ready",
      step: definition.steps[0],
      progress: 0,
      running: false,
      unit: definition.initialize(product, settings),
      settings,
      position: { x: definition.entryX },
      fault: "",
    },
    0,
  );
  const moving = new Set([
    model.bottle,
    model.piece,
    ...(model.alwaysVisible ?? []),
  ]);
  const explicit = new Map([
    [model.saw, "cut"],
    [model.drillHead, "drill"],
    [model.capTool, "cap"],
  ]);
  const ownership = new Map(),
    visible = new Map();
  for (const child of root.children) {
    visible.set(child, child.visible);
    if (moving.has(child)) continue;
    const center = new THREE.Box3()
      .setFromObject(child)
      .getCenter(new THREE.Vector3());
    ownership.set(
      child,
      explicit.get(child) ??
        child.userData.stageId ??
        definition.steps.reduce((a, b) =>
          Math.abs(a.x - center.x) <= Math.abs(b.x - center.x) ? a : b,
        ).id,
    );
  }
  let selected = definition.steps[0].id;
  const filter = () =>
    root.children.forEach((child) => {
      child.visible =
        visible.get(child) !== false &&
        (moving.has(child) || ownership.get(child) === selected);
    });
  const animate = model.update.bind(model);
  model.selectStage = (id) => {
    selected = id;
    model.onSelectStage?.(id);
    filter();
  };
  model.update = (snapshot, dt) => {
    for (const child of root.children)
      child.visible = visible.get(child) !== false;
    animate(snapshot, dt);
    for (const child of root.children) visible.set(child, child.visible);
    filter();
  };
  model.selectStage(selected);
  return model;
}
