const ease = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
function foldingCarton(THREE, parent, box, m, width, depth, height) {
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
export function buildBeveragesModel(args) {
  const {
    THREE,
    root,
    box,
    cyl,
    bar,
    materials: m,
    definition,
    product,
  } = args;
  buildIndustryBase(args);
  const own = [];
  const mat = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, ...options });
    own.push(value);
    return value;
  };
  const glass = mat("#a9dfdf", {
      transparent: true,
      opacity: 0.25,
      roughness: 0.12,
      metalness: 0.12,
      depthWrite: false,
    }),
    liquidMat = mat(product.color, { roughness: 0.3 });
  const bottle = new THREE.Group();
  root.add(bottle);
  const body = cyl(bottle, 0, 0.325, 0, 0.18, 0.65, glass);
  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.18, 0.2, 32),
    glass,
  );
  shoulder.position.y = 0.75;
  bottle.add(shoulder);
  cyl(bottle, 0, 0.925, 0, 0.07, 0.15, glass);
  const liquid = cyl(bottle, 0, 0.04, 0, 0.166, 0.6, liquidMat);
  const cap = cyl(bottle, 0, 1.035, 0, 0.087, 0.07, m.accent);
  const label = box(bottle, 0, 0.37, 0.18, 0.23, 0.26, 0.005, m.accent);
  const packaging = foldingCarton(THREE, bottle, box, m, 0.66, 0.7, 1.14);
  const carton = packaging.group;
  const heads = {};
  for (const id of ["wash", "fill", "cap", "label"]) {
    const x = definition.steps.find((s) => s.id === id).x;
    if (args.stationView) {
      for (const dx of [-0.65, 0.65])
        box(root, x + dx, 1.65, -1.1, 0.1, 3.3, 0.1, m.accent);
      box(root, x, 3.3, -1.1, 1.4, 0.12, 0.12, m.steel);
    } else {
      for (const z of [-1.1, 1.1])
        box(root, x, 1.65, z, 0.1, 3.3, 0.1, m.accent);
    }
    box(
      root,
      x,
      3.3,
      id === "cap" ? -0.3 : 0,
      0.22,
      0.12,
      id === "cap" ? 3.2 : 2.3,
      m.steel,
    );
    const head = new THREE.Group();
    root.add(head);
    head.position.set(x, 2.55, 0);
    cyl(head, 0, 0, 0, 0.1, 0.28, m.steel);
    bar(root, [x, 2.7, 0], [x, 3.3, 0], 0.035, m.steel);
    heads[id] = head;
  }
  const waterJets = [];
  for (let i = 0; i < 5; i++) {
    const jet = cyl(root, -4 + (i - 2) * 0.035, 2.35, 0, 0.009, 0.35, m.water);
    waterJets.push(jet);
  }
  const tankZ = args.stationView ? -3 : -2.1;
  const tank = cyl(root, -2, 1.7, tankZ, 0.52, 2.5, m.steel);
  for (const x of [-2.3, -1.7])
    box(root, x, 0.225, tankZ, 0.09, 0.45, 0.09, m.steel);
  bar(root, [-2, 2.95, tankZ], [-2, 3.15, tankZ], 0.04, m.steel);
  bar(root, [-2, 3.15, tankZ], [-2, 3.15, 0], 0.04, m.steel);
  const fillStream = cyl(root, -2, 2.4, 0, 0.018, 0.4, liquidMat);
  const capTool = new THREE.Group();
  root.add(capTool);
  const toolCap = cyl(capTool, 0, 0, 0, 0.087, 0.07, m.accent);
  box(capTool, 0, 0.12, 0, 0.24, 0.16, 0.16, m.steel);
  const capRod = cyl(root, 0, 2.5, -1.4, 0.035, 1, m.steel);
  for (const side of [-1, 1])
    box(capTool, side * 0.105, 0.05, 0, 0.035, 0.14, 0.06, m.dark);
  box(root, 0, 1.16, -1.4, 0.7, 0.08, 0.7, m.white);
  for (const x of [-0.25, 0.25])
    for (const z of [-1.65, -1.15])
      box(root, x, 0.56, z, 0.07, 1.12, 0.07, m.steel);
  const capFeed = cyl(root, 0, 1.235, -1.4, 0.087, 0.07, m.accent);
  const sensor = box(root, 0, 2.24, 0.35, 0.18, 0.14, 0.14, m.dark);
  bar(root, [0, 0, 0.9], [0, 2.24, 0.9], 0.035, m.steel);
  bar(root, [0, 2.24, 0.9], [0, 2.24, 0.35], 0.035, m.steel);
  const rejectLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 8),
    mat("#718394"),
  );
  rejectLed.position.set(0, 2.37, 0.36);
  root.add(rejectLed);
  return stationModel(args, {
    group: root,
    body,
    liquid,
    cap,
    bottle,
    carton,
    capTool,
    update(s) {
      const active = s.phase === "operating",
        id = s.step?.id,
        t = active ? s.progress : 0,
        u = s.unit;
      const packingLift = u.packed
        ? 0.03
        : active && id === "pack"
          ? 0.03 * Math.min(1, t / 0.15)
          : 0;
      bottle.position.set(s.position.x, 1.2 + packingLift, 0);
      bottle.visible = s.phase !== "complete";
      const amount = id === "fill" && active ? t * u.target : u.volume;
      const h = 0.6 * Math.min(1, amount / u.target);
      liquid.visible = h > 0.002;
      liquid.scale.y = Math.max(0.001, h / 0.6);
      liquid.position.y = 0.025 + h / 2;
      cap.visible =
        u.capped ||
        (active && id === "cap" && !s.settings.missingCap && t >= 0.7);
      label.visible = u.labeled || (active && id === "label" && t > 0.5);
      carton.visible = u.packed || (active && id === "pack" && t >= 0.15);
      const pack = u.packed ? 1 : id === "pack" ? t : 0;
      packaging.update(pack);
      for (const [key, head] of Object.entries(heads))
        head.position.y =
          key === id && active ? 2.55 - 0.1 * Math.sin(Math.PI * t) : 2.55;
      waterJets.forEach(
        (j) => (j.visible = active && id === "wash" && s.running),
      );
      fillStream.visible = active && id === "fill" && t < 0.96;
      const capActive = active && id === "cap" && !s.settings.missingCap;
      const ease = (v) => {
        v = Math.max(0, Math.min(1, v));
        return v * v * (3 - 2 * v);
      };
      const lift = capActive ? ease((t - 0.1) / 0.2) : 0,
        travel = capActive ? ease((t - 0.3) / 0.2) : 0,
        lower = capActive ? ease((t - 0.5) / 0.2) : 0;
      let toolY = 1.235 + 1.415 * lift - 0.415 * lower,
        toolZ = -1.4 * (1 - travel);
      if (capActive && t >= 0.7) {
        toolY = 2.235 + 0.415 * ease((t - 0.7) / 0.1);
        toolZ = -1.4 * ease((t - 0.8) / 0.1);
        if (t >= 0.9) toolY = 2.65 - 1.415 * ease((t - 0.9) / 0.1);
      }
      capTool.visible = true;
      heads.cap.visible = false;
      capTool.position.set(0, toolY, toolZ);
      toolCap.visible = capActive && t < 0.7;
      const rodBottom = toolY + 0.2;
      capRod.position.set(0, (rodBottom + 3.24) / 2, toolZ);
      capRod.scale.y = 3.24 - rodBottom;
      capFeed.visible = !capActive;
      rejectLed.material.color.set(
        s.fault ? "#df493e" : u.capped ? "#2ba978" : "#718394",
      );
    },
    dispose() {
      for (const v of own) v.dispose();
    },
  });
}
export function buildFurnitureModel(args) {
  const {
    THREE,
    root,
    box,
    cyl,
    bar,
    materials: m,
    definition,
    product,
  } = args;
  buildIndustryBase(args);
  const target = (product.length / 100) * 1.25,
    blank = 1.9;
  const piece = new THREE.Group();
  root.add(piece);
  const board = box(piece, 0, 0.07, 0, blank, 0.14, 0.78, m.wood);
  const legs = [];
  for (const x of [-target * 0.35, target * 0.35])
    for (const z of [-0.27, 0.27])
      legs.push(box(piece, x, 0.425, z, 0.09, 0.85, 0.09, m.wood));
  const holes = [];
  for (const x of [-target * 0.35, target * 0.35])
    for (const z of [-0.27, 0.27]) {
      const hole = cyl(piece, x, 0.143, z, 0.025, 0.006, m.dark);
      holes.push(hole);
    }
  const cutting = definition.steps.find((s) => s.id === "cut").x,
    assembly = definition.steps.find((s) => s.id === "assemble").x,
    drilling = definition.steps.find((s) => s.id === "drill").x;
  const saw = new THREE.Group();
  root.add(saw);
  const blade = cyl(saw, 0, 0, 0, 0.27, 0.025, m.steel);
  blade.rotation.z = Math.PI / 2;
  box(saw, 0, 0.28, 0, 0.14, 0.2, 0.2, m.accent);
  for (const x of [cutting - 0.85, cutting + 0.85])
    box(root, x, 1.75, -1.1, 0.12, 3.5, 0.12, m.accent);
  bar(
    root,
    [cutting - 0.85, 3.5, -1.1],
    [cutting + 0.85, 3.5, -1.1],
    0.055,
    m.steel,
  );
  const sawSupport = bar(
    root,
    [cutting, 2, 0],
    [cutting, 3.44, 0],
    0.035,
    m.steel,
  );
  const sawGuard = box(root, cutting, 2.4, 0.8, 1.9, 2.4, 0.035, m.glass);
  box(root, cutting + 0.7, 1.16, -1.3, 0.8, 0.08, 1.8, m.steel);
  for (const x of [cutting + 0.4, cutting + 1])
    for (const z of [-0.6, -2])
      box(root, x, 0.56, z, 0.08, 1.12, 0.08, m.steel);
  const offcut = box(
    root,
    cutting + target / 2 + 0.05,
    1.27,
    0,
    Math.max(0.15, blank - target),
    0.14,
    0.78,
    m.wood,
  );
  const drillHead = new THREE.Group();
  root.add(drillHead);
  box(drillHead, 0, 0.18, 0, 0.24, 0.3, 0.24, m.accent);
  cyl(drillHead, 0, -0.055, 0, 0.018, 0.17, m.steel);
  for (const x of [drilling - 0.85, drilling + 0.85])
    box(root, x, 1.7, -1.1, 0.12, 3.4, 0.12, m.accent);
  bar(
    root,
    [drilling - 0.85, 3.4, -1.1],
    [drilling + 0.85, 3.4, -1.1],
    0.05,
    m.steel,
  );
  bar(root, [drilling, 3.4, -1.1], [drilling, 3.4, 0], 0.04, m.steel);
  cyl(root, assembly, 0.075, 0, 0.18, 0.15, m.steel);
  const lift = cyl(root, assembly, 0.7, 0, 0.09, 1.1, m.steel),
    pad = box(root, assembly, 1.16, 0, 0.65, 0.08, 0.5, m.steel);
  const carrier = new THREE.Group();
  root.add(carrier);
  const spareLegs = [];
  for (const dx of [-target * 0.35, target * 0.35]) {
    box(root, assembly + dx, 1.065, -0.65, 0.18, 0.09, 2.3, m.steel);
    for (const z of [-1.7, 0.4])
      box(root, assembly + dx, 0.51, z, 0.09, 1.02, 0.09, m.accent);
  }
  for (const x of [-target * 0.35, target * 0.35]) {
    box(carrier, x, -0.045, 0, 0.16, 0.09, 0.8, m.steel);
    for (const z of [-0.27, 0.27])
      spareLegs.push(box(carrier, x, 0.425, z, 0.09, 0.85, 0.09, m.wood));
  }
  const drillSupport = cyl(root, drilling, 2.5, 0, 0.035, 1, m.steel);
  const gauge = box(root, 3.6, 2.42, -0.6, 1, 0.12, 0.12, m.accent);
  for (const x of [2.9, 4.3]) box(root, x, 1.25, -1.1, 0.1, 2.5, 0.1, m.steel);
  bar(root, [2.9, 2.5, -1.1], [4.3, 2.5, -1.1], 0.04, m.steel);
  const packaging = foldingCarton(
    THREE,
    piece,
    box,
    m,
    target + 0.22,
    0.95,
    1.04,
  );
  const carton = packaging.group;
  const sawPlane = cutting - blank / 2 + target;
  bar(root, [sawPlane, 3.44, -1.1], [sawPlane, 3.44, 1.1], 0.04, m.steel);
  for (const x of [cutting - 0.85, cutting + 0.85])
    box(root, x, 1.72, 1.1, 0.12, 3.44, 0.12, m.accent);
  bar(
    root,
    [cutting - 0.85, 3.44, 1.1],
    [cutting + 0.85, 3.44, 1.1],
    0.04,
    m.steel,
  );
  for (const z of [-0.55, 0.55])
    bar(
      root,
      [drilling - 0.85, 3.4, z],
      [drilling + 0.85, 3.4, z],
      0.04,
      m.steel,
    );
  for (const x of [drilling - 0.85, drilling + 0.85])
    bar(root, [x, 3.4, -1.1], [x, 3.4, 0.55], 0.04, m.steel);
  const drillBridge = box(root, drilling, 3.4, 0, 0.14, 0.12, 1.2, m.accent);
  return stationModel(args, {
    group: root,
    piece,
    board,
    legs,
    drillHead,
    saw,
    update(s) {
      const active = s.phase === "operating",
        id = s.step?.id,
        t = active ? s.progress : 0,
        u = s.unit;
      const assembling = active && id === "assemble",
        rise = u.assembled
          ? 0.85
          : assembling
            ? 0.85 * Math.min(1, t / 0.25)
            : 0;
      const packingLift = u.packed
        ? 0.03
        : active && id === "pack"
          ? 0.03 * ease(t / 0.15)
          : 0;
      piece.position.set(s.position.x, 1.2 + packingLift, 0);
      piece.visible = s.phase !== "complete";
      const cut = u.cut || (active && id === "cut" && t > 0.75);
      board.scale.x = (cut ? target : blank) / blank;
      board.position.y = 0.07 + rise;
      const recenter =
        active && id === "cut"
          ? Math.max(0, Math.min(1, (t - 0.92) / 0.08))
          : u.cut
            ? 1
            : 0;
      board.position.x = cut ? (-blank / 2 + target / 2) * (1 - recenter) : 0;
      const mounted = u.assembled || (assembling && t >= 0.75);
      for (const leg of legs) leg.visible = mounted;
      holes.forEach((h, i) => {
        h.visible =
          u.drilled ||
          (id === "drill" &&
            active &&
            i < Math.floor(Math.min(1, t / 0.96) * 4));
        h.position.y = 0.143 + rise;
      });
      const cuttingActive = active && id === "cut";
      let sawY = 1.45,
        sawZ = -0.7;
      if (cuttingActive) {
        sawZ = -0.7 + 1.4 * ease(t / 0.75);
        if (t > 0.75) {
          sawY = 1.45 + 0.4 * ease((t - 0.75) / 0.08);
          sawZ = 0.7 - 1.4 * ease((t - 0.83) / 0.12);
          if (t > 0.95) sawY = 1.85 - 0.4 * ease((t - 0.95) / 0.05);
        }
      }
      saw.position.set(cutting - blank / 2 + target, sawY, sawZ);
      blade.rotation.x = t * 50;
      sawGuard.visible = !!s.settings.guardClosed;
      offcut.visible = u.cut || (active && id === "cut" && t > 0.75);
      offcut.position.z = u.cut ? -1.3 : -1.3 * Math.max(0, (t - 0.75) / 0.25);
      const drillT = active && id === "drill" ? Math.min(1, t / 0.96) : 0,
        point = Math.min(3, Math.floor(drillT * 4)),
        cycle = Math.min(1, drillT * 4 - point);
      const points = [
          [-target * 0.35, -0.27],
          [target * 0.35, -0.27],
          [-target * 0.35, 0.27],
          [target * 0.35, 0.27],
        ],
        previous = points[Math.max(0, point - 1)],
        current = points[point],
        move = ease(cycle / 0.3);
      const depth =
        ease((cycle - 0.3) / 0.3) * (1 - ease((cycle - 0.65) / 0.35));
      let dx = previous[0] + (current[0] - previous[0]) * move,
        dz = previous[1] + (current[1] - previous[1]) * move;
      if (active && id === "drill" && t > 0.96) {
        const park = ease((t - 0.96) / 0.04);
        dx = current[0] + (points[0][0] - current[0]) * park;
        dz = current[1] + (points[0][1] - current[1]) * park;
      }
      drillHead.position.set(drilling + dx, 1.7 - 0.232 * depth, dz);
      drillBridge.position.x = drillHead.position.x;
      const drillTop = drillHead.position.y + 0.33;
      drillSupport.position.set(
        drillHead.position.x,
        (drillTop + 3.4) / 2,
        drillHead.position.z,
      );
      drillSupport.scale.y = 3.4 - drillTop;
      const sawTop = saw.position.y + 0.38;
      sawSupport.position.set(
        saw.position.x,
        (sawTop + 3.44) / 2,
        saw.position.z,
      );
      sawSupport.scale.y = (3.44 - sawTop) / 1.44;
      carrier.visible = true;
      carrier.position.set(
        assembly,
        1.2,
        assembling
          ? t >= 0.75
            ? -1.5 * ease((t - 0.75) / 0.25)
            : -1.5 * (1 - ease((t - 0.25) / 0.5))
          : -1.5,
      );
      spareLegs.forEach((l) => (l.visible = !mounted));
      pad.position.y = 1.16 + rise;
      lift.position.y = (0.15 + 1.12 + rise) / 2;
      lift.scale.y = (0.97 + rise) / 1.1;
      const pack = u.packed ? 1 : active && id === "pack" ? t : 0;
      carton.visible = pack >= 0.15;
      packaging.update(pack);
      gauge.position.x =
        3.6 + (active && id === "inspect" ? 0.2 * Math.sin(Math.PI * t) : 0);
    },
    dispose() {},
  });
}

// In the original laboratory, only the selected operation owns the equipment.
// Preserve animation visibility separately from stage visibility so revisiting
// a stage restores tools without resurrecting consumed caps or offcuts.
function stationModel(args, model) {
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
  const moving = new Set([model.bottle, model.piece]);
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
