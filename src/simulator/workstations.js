const smoothTravel = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// Match the product's lathed body, excluding its handles and rolled rim.
function bodySurface(product, localY) {
  const r = product.rim,
    h = product.height;
  const profile = [
    [r * 0.72, -0.17],
    [r * 0.8, -0.12],
    [r * 0.86, -0.06],
    [r * 0.91, h * 0.25],
    [r * 0.95, h * 0.62],
    [r * 0.99, h * 0.96],
    [r, h],
  ];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1],
      [r1, y1] = profile[i];
    if (localY <= y1 || i === profile.length - 1) {
      const t = clamp((localY - y0) / (y1 - y0));
      return { radius: r0 + (r1 - r0) * t, slope: (r1 - r0) / (y1 - y0) };
    }
  }
}

// Exact circle/segment envelope also clears profile corners (especially shallow pans).
function wheelEnvelope(product, centreY, radius) {
  const r = product.rim,
    h = product.height;
  const pts = [
    [0.001, -0.18],
    [0.08, -0.18],
    [0.2, -0.18],
    [r * 0.72, -0.17],
    [r * 0.8, -0.12],
    [r * 0.86, -0.06],
    [r * 0.91, h * 0.25],
    [r * 0.95, h * 0.62],
    [r * 0.99, h * 0.96],
    [r, h],
  ];
  let bound = 0;
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1],
      [r1, y1] = pts[i];
    if (y1 === y0) continue;
    const lo = Math.max(y0, centreY - radius),
      hi = Math.min(y1, centreY + radius);
    if (lo > hi) continue;
    const slope = (r1 - r0) / (y1 - y0),
      critical = centreY + (slope * radius) / Math.hypot(1, slope);
    for (const y of [lo, hi, Math.max(lo, Math.min(hi, critical))])
      bound = Math.max(
        bound,
        r0 +
          slope * (y - y0) +
          Math.sqrt(Math.max(0, radius * radius - (y - centreY) ** 2)),
      );
  }
  return bound + 0.002;
}

function makePanel(THREE, root, box, m, rear, title) {
  const owned = [];
  const canvas = globalThis.document?.createElement("canvas");
  let context = null,
    texture = null;
  if (canvas) {
    canvas.width = 768;
    canvas.height = 448;
    context = canvas.getContext("2d");
  }
  if (context) {
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const material = new THREE.MeshBasicMaterial({
    color: texture ? "#ffffff" : "#153956",
    map: texture,
    toneMapped: false,
  });
  owned.push(material);
  const group = new THREE.Group();
  group.position.set(1.75, 2.35, rear + 0.05);
  root.add(group);
  box(group, 0, -1.175, -0.05, 0.09, 2.35, 0.09, m.steel);
  box(group, 0, 0, 0, 1.72, 1.05, 0.12, m.dark);
  box(group, 0, 0, 0.067, 1.58, 0.92, 0.014, material);
  const panel = {
    group,
    lines: [],
    texture,
    status: "idle",
    key: "",
    update(lines, status = "idle") {
      const key = `${status}|${lines.join("|")}`;
      if (key === this.key) return;
      this.key = key;
      this.lines = [...lines];
      this.status = status;
      if (!context) return;
      context.fillStyle = "#123451";
      context.fillRect(0, 0, 768, 448);
      context.fillStyle = "#e7490f";
      context.fillRect(0, 0, 768, 7);
      context.fillStyle = "#b8d4e7";
      context.font = "500 24px Segoe UI, sans-serif";
      context.fillText(title, 30, 48);
      lines.forEach((line, index) => {
        context.font =
          index === lines.length - 1
            ? "600 25px Segoe UI, sans-serif"
            : "27px Segoe UI, sans-serif";
        context.fillStyle =
          index === lines.length - 1
            ? status === "approved"
              ? "#8be1b9"
              : status === "working"
                ? "#ffd79d"
                : "#c4d3df"
            : "#f1f7fb";
        context.fillText(line, 30, 103 + index * 57, 708);
      });
      texture.needsUpdate = true;
    },
    dispose() {
      texture?.dispose();
      for (const item of owned) item.dispose();
    },
  };
  return panel;
}

export function buildWorkstation({
  id,
  root,
  THREE,
  box,
  cyl,
  bar,
  m,
  product,
  layout,
}) {
  if (!["finishing", "quality"].includes(id)) return null;
  const group = new THREE.Group();
  group.name = `workstation-${id}`;
  root.add(group);
  const top = layout.conveyorTop,
    clearance = layout.clearance ?? 0.012,
    bottom = layout.potBottom ?? -0.18;
  const origin = top + clearance - bottom;
  const footprint = layout.footprint;
  const rear = Math.max(1.25, footprint.maxZ + 0.45);
  const openX =
    Math.max(Math.abs(footprint.minX), Math.abs(footprint.maxX)) + 0.25;
  const supportTop = top;
  const rotary = new THREE.Group();
  group.add(rotary);
  const cradle = cyl(rotary, 0, supportTop - 0.009, 0, 0.25, 0.018, m.steel);
  cyl(group, 0, top - 0.065, 0, 0.19, 0.1, m.steel);
  const gasket = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.006, 8, 40),
    m.dark,
  );
  gasket.rotation.x = Math.PI / 2;
  gasket.position.y = top + 0.006;
  rotary.add(gasket);
  for (let i = 0; i < 3; i++) {
    const mark = box(
      rotary,
      Math.cos((i * 2 * Math.PI) / 3) * 0.18,
      top + 0.002,
      Math.sin((i * 2 * Math.PI) / 3) * 0.18,
      0.08,
      0.004,
      0.015,
      m.yellow,
    );
    mark.rotation.y = (-i * 2 * Math.PI) / 3;
  }
  cradle.name = "Apoio do fundo";
  // The body rests on a thin fixture; structural hardware stays below the rollers
  // or behind the complete product footprint, leaving the travel corridor open.
  box(group, 0, top - 0.15, 0, 1.5, 0.08, 0.72, m.steel);
  for (const side of [-1, 1]) {
    box(
      group,
      side * 0.64,
      (top - 0.2) / 2,
      rear,
      0.11,
      top - 0.2,
      0.11,
      m.blue,
    );
    bar(
      group,
      [side * 0.64, top - 0.2, rear],
      [side * 0.64, top - 0.2, 0.25],
      0.045,
      m.steel,
    );
  }
  const jaws = [];
  const contactY = bottom + 0.055;
  const jawZ = Math.min(0.19, product.rim * 0.4);
  const surface = bodySurface(product, contactY + 0.035);
  const jawContact =
    Math.sqrt(Math.max(0.01, surface.radius ** 2 - (jawZ - 0.045) ** 2)) +
    0.049;
  for (const side of [-1, 1])
    for (const z of [-jawZ, jawZ]) {
      const slide = new THREE.Group();
      slide.position.set(side * openX, origin + contactY, z);
      group.add(slide);
      const pad = box(slide, 0, 0, 0, 0.09, 0.07, 0.09, m.dark);
      pad.name = "Garra de apoio";
      box(slide, side * 0.1, -0.02, 0, 0.18, 0.045, 0.055, m.steel);
      box(slide, 0, -0.08725, 0, 0.055, 0.0895, 0.055, m.steel);
      if (id === "quality" && side === -1)
        box(group, 0, top - 0.1, z, 2 * openX + 0.2, 0.07, 0.09, m.steel);
      if (id === "finishing") slide.visible = false;
      jaws.push({ slide, side, openX, closedX: jawContact });
    }
  const panel = makePanel(
    THREE,
    group,
    box,
    m,
    rear,
    id === "quality" ? "Inspeção dimensional" : "Acabamento superficial",
  );
  const model = {
    id,
    group,
    cradle,
    rotary,
    gasket,
    jaws,
    panel,
    rear,
    origin,
    bottom,
    product,
    layout,
    clock: 0,
    owned: [],
    supportBounds: { rearMinZ: rear - 0.08, productMaxZ: footprint.maxZ },
    dispose() {
      panel.dispose();
      for (const material of this.owned) material.dispose();
    },
  };

  if (id === "finishing") {
    const localY = (bottom + product.height) * 0.5;
    const contact = bodySurface(product, localY);
    const radius = Math.max(
      0.025,
      Math.min(0.12, (product.height - bottom) * 0.16),
    );
    // Offset the wheel along the normal of the body's sloped wall, rather than
    // placing its centre on the surface (which would cut through the cookware).
    const norm = Math.hypot(1, contact.slope);
    const contactX = contact.radius + radius / norm;
    const centreY = localY - (contact.slope * radius) / norm;
    const retractedX = Math.max(openX + 0.32, contactX + 0.65);
    const tool = new THREE.Group();
    group.add(tool);
    const wheel = new THREE.Group();
    tool.add(wheel);
    const abrasiveMaterial = new THREE.MeshStandardMaterial({
      color: "#6d747c",
      roughness: 0.95,
      metalness: 0.1,
    });
    model.owned.push(abrasiveMaterial);
    const abrasive = cyl(wheel, 0, 0, 0, radius, 0.14, abrasiveMaterial);
    abrasive.rotation.x = Math.PI / 2;
    cyl(wheel, 0, 0, 0, 0.025, 0.18, m.steel).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const marker = box(
        wheel,
        0,
        0,
        0.077,
        radius * 1.3,
        0.009,
        0.006,
        m.steel,
      );
      marker.rotation.z = (i * Math.PI) / 4;
    }
    const shroud = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.025, 0.018, 8, 32, Math.PI),
      m.blue,
    );
    shroud.rotation.z = -Math.PI / 2;
    shroud.position.z = -0.095;
    tool.add(shroud);
    box(tool, 0, 0.08, -0.23, 0.18, 0.2, 0.27, m.dark);
    const mastX = retractedX + 0.25;
    box(
      group,
      mastX,
      (origin + product.height + 0.6) / 2,
      rear,
      0.16,
      origin + product.height + 0.6,
      0.16,
      m.blue,
    );
    const bridgeY = origin + product.height + 0.5;
    bar(group, [mastX, bridgeY, rear], [mastX, bridgeY, 0], 0.045, m.steel);
    bar(
      group,
      [contactX - 0.12, bridgeY, 0],
      [mastX, bridgeY, 0],
      0.045,
      m.steel,
    );
    // Second slide parks the complete wheel/motor behind the full handled-product corridor.
    bar(
      group,
      [retractedX, bridgeY, 0],
      [retractedX, bridgeY, rear],
      0.035,
      m.steel,
    );
    bar(
      group,
      [retractedX, bridgeY, rear],
      [mastX, bridgeY, rear],
      0.035,
      m.steel,
    );
    const carriage = box(
      group,
      retractedX,
      bridgeY,
      -0.07,
      0.22,
      0.14,
      0.4,
      m.yellow,
    );
    const link = bar(
      group,
      [retractedX, origin + centreY + 0.1, -0.23],
      [retractedX, bridgeY, -0.23],
      0.035,
      m.steel,
    );
    model.finishing = {
      tool,
      wheel,
      carriage,
      link,
      radius,
      contactX,
      centreY,
      retractedX,
      bridgeY,
      linkLength: bridgeY - origin - centreY - 0.1,
      active: false,
    };
  } else {
    const bridgeY = origin + product.height + 0.78;
    for (const side of [-1, 1])
      box(
        group,
        side * (openX + 0.25),
        bridgeY / 2,
        rear,
        0.13,
        bridgeY,
        0.13,
        m.blue,
      );
    box(group, 0, bridgeY, rear, 2 * (openX + 0.35), 0.14, 0.18, m.steel);
    // Cantilever guides pass above the tallest pot and its handles.
    for (const side of [-1, 1])
      bar(
        group,
        [side * (product.rim + 0.11), bridgeY, rear],
        [side * (product.rim + 0.11), bridgeY, -0.05],
        0.03,
        m.steel,
      );
    const carriage = new THREE.Group();
    group.add(carriage);
    box(carriage, 0, bridgeY, 0, 2 * (product.rim + 0.23), 0.12, 0.2, m.yellow);
    const sideProbes = [];
    for (const side of [-1, 1]) {
      const shaft = cyl(
        carriage,
        side * (product.rim + 0.06),
        bridgeY - 0.2,
        0,
        0.018,
        0.4,
        m.steel,
      );
      const shoe = box(
        carriage,
        side * (product.rim + 0.03),
        bridgeY - 0.4,
        0,
        0.06,
        0.09,
        0.08,
        m.dark,
      );
      sideProbes.push({ side, shaft, shoe });
    }
    const depth = cyl(carriage, 0, bridgeY - 0.2, 0, 0.012, 0.4, m.steel);
    const depthTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 8),
      m.steel,
    );
    carriage.add(depthTip);
    const indicators = [];
    for (let i = 0; i < 3; i++) {
      const material = new THREE.MeshBasicMaterial({ color: "#718395" });
      model.owned.push(material);
      const sensor = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 10),
        material,
      );
      sensor.position.set((i - 1) * 0.16, bridgeY + 0.12, 0.12);
      sensor.userData.signal = ["diameter", "height", "depth"][i];
      carriage.add(sensor);
      indicators.push(sensor);
    }
    const nominalDiameter = Number.parseFloat(product.size) * 10;
    const scale = nominalDiameter / (product.rim * 2);
    model.quality = {
      carriage,
      sideProbes,
      depth,
      depthTip,
      indicators,
      bridgeY,
      rear,
      extension: 0,
      travel: 0,
      nominal: {
        diameter: nominalDiameter,
        height: (product.height - bottom) * scale,
        depth: (product.height - bottom - 0.021) * scale,
      },
    };
  }
  updateWorkstation(model, {
    pose: { step: "idle", t: 0, x: -4, y: origin, z: 0 },
    cell: { part: false, phase: "idle", outputs: {} },
    dt: 0,
    running: false,
    product,
    layout,
  });
  return model;
}

export function updateWorkstation(
  model,
  { pose, cell, dt = 0, running = false, product, layout },
) {
  if (!model) return;
  const processing = !!cell.part && cell.phase === "processing";
  const step = pose.step ?? "idle",
    t = clamp(pose.t);
  const origin = model.origin;
  const bottom = layout?.potBottom ?? model.bottom;
  let fixation = 0;
  if (processing) {
    if (model.id === "quality") {
      const probe = clamp(
        pose.inspectionProbe ??
          (step === "scan" ? clamp(t / 0.28) : step === "check" ? 1 : 0),
      );
      fixation = clamp(probe / 0.25);
    } else if (Number.isFinite(pose.fixation)) fixation = clamp(pose.fixation);
    else
      fixation =
        step === "clamp"
          ? t
          : step === "polish"
            ? 1
            : step === "release"
              ? 1 - t
              : 0;
  }
  for (const jaw of model.jaws) {
    jaw.slide.position.x =
      jaw.side * (jaw.openX + (jaw.closedX - jaw.openX) * fixation);
    jaw.slide.position.y = origin + bottom + 0.055;
  }
  const unit = cell.unit?.id ?? "Sem unidade";
  if (model.id === "finishing") {
    const f = model.finishing;
    model.rotary.rotation.y = pose.polishAngle ?? 0;
    const lowY = bottom + f.radius * 2 + 0.035,
      highY = product.height - 0.025;
    const polishT = processing && step === "polish" ? t : 0;
    const localY =
      lowY + (highY - lowY) * (0.5 - 0.5 * Math.cos(4 * Math.PI * polishT));
    const surface = bodySurface(product, localY),
      norm = Math.hypot(1, surface.slope);
    f.centreY = localY - (surface.slope * f.radius) / norm;
    f.contactX = wheelEnvelope(product, f.centreY, f.radius);
    const fallback =
      step === "polish" ? Math.min(clamp(t / 0.16), clamp((1 - t) / 0.16)) : 0;
    const contact =
      processing && step === "polish"
        ? clamp(pose.polishContact ?? fallback)
        : 0;
    f.active = processing && step === "polish" && contact > 0.98;
    f.tool.position.set(
      f.retractedX + (f.contactX - f.retractedX) * contact,
      origin + f.centreY,
      (pose.z ?? 0) +
        model.rear *
          (1 -
            (processing && step === "polish"
              ? smoothTravel(t / 0.12) * (1 - smoothTravel((t - 0.88) / 0.12))
              : 0)),
    );
    f.carriage.position.x = f.tool.position.x;
    f.carriage.position.z = f.tool.position.z - 0.07;
    const low = origin + f.centreY + 0.1,
      high = f.bridgeY;
    f.link.position.set(
      f.tool.position.x,
      (low + high) / 2,
      f.tool.position.z - 0.23,
    );
    f.link.scale.y = Math.max(0.01, (high - low) / f.linkLength);
    if (processing && step === "polish") f.wheel.rotation.z = t * 24 * Math.PI;
    const status = step === "polish" && processing ? "working" : "idle";
    model.panel.update(
      [
        product.name,
        unit,
        processing && step === "polish"
          ? `Polimento: ${Math.round(t * 100)}%`
          : "Rebolo recolhido",
        f.active
          ? "Pe�a girando � fixa��o pela base"
          : contact > 0
            ? "Aproximação / afastamento"
            : "Transporte livre",
      ],
      status,
    );
    return;
  }
  const q = model.quality;
  const fallback = step === "scan" ? clamp(t / 0.28) : step === "check" ? 1 : 0;
  const probe = processing ? clamp(pose.inspectionProbe ?? fallback) : 0;
  q.travel = clamp(probe / 0.4);
  q.extension = clamp((probe - 0.4) / 0.6);
  q.carriage.position.z = q.rear * (1 - q.travel);
  const safeTip = origin + product.height + 0.35;
  const sideTip =
    safeTip + (origin + product.height - 0.02 - safeTip) * q.extension;
  const depthY = safeTip + (origin + bottom + 0.021 - safeTip) * q.extension;
  for (const probe of q.sideProbes) {
    const top = q.bridgeY - 0.08,
      length = top - sideTip;
    probe.shaft.position.y = (top + sideTip) / 2;
    probe.shaft.scale.y = length / 0.4;
    probe.shoe.position.y = sideTip;
  }
  const top = q.bridgeY - 0.08;
  q.depth.position.y = (top + depthY) / 2;
  q.depth.scale.y = (top - depthY) / 0.4;
  q.depthTip.position.y = depthY;
  const measured =
    (processing && ["check", "approve"].includes(step)) ||
    (cell.part && cell.phase === "unloading");
  const approved =
    cell.part && (step === "approve" || cell.phase === "unloading");
  const progress = processing && step === "scan" ? t : measured ? 1 : 0;
  for (let i = 0; i < q.indicators.length; i++)
    q.indicators[i].material.color.set(
      progress >= (i + 1) / 3 ? "#34bf8d" : "#718395",
    );
  const diameter = measured ? `${q.nominal.diameter.toFixed(1)} mm` : "—";
  const height = measured ? `${q.nominal.height.toFixed(1)} mm` : "—";
  const status = approved ? "approved" : processing ? "working" : "idle";
  model.panel.update(
    [
      product.name,
      `Diâmetro: ${diameter}`,
      `Altura: ${height}`,
      approved
        ? "Conforme ao modelo didático"
        : processing
          ? `Leitura nominal: ${Math.round(progress * 100)}%`
          : "Aguardando peça",
      "Referência didática · não metrologia real",
    ],
    status,
  );
}
