const ROUTES = [
  { id: "norte", name: "Norte", address: "A-01", z: -2.6, color: "#164193", mass: 2.4 },
  { id: "sul", name: "Sul", address: "B-01", z: 0, color: "#41816f", mass: 4.8 },
  { id: "serra", name: "Serra", address: "C-01", z: 2.6, color: "#dfb249", mass: 1.2 },
];
export const PARCEL_ROUTES = ROUTES;
const routeFor = (value) => ROUTES.find((r) => r.id === value) ?? ROUTES[0];
const numeric = (v) => Number.isFinite(Number(v)) ? Number(v) : NaN;
const choices = ROUTES.map((r) => ({ value: r.id, label: r.name }));
const barcodeFor = (id) => `EC-${String(id ?? 1).replace(/\D/g, "").padStart(5, "0")}`;

export const PARCELS = {
  id: "parcels", name: "Centro de distribuição de encomendas", short: "Encomendas",
  color: "#164193", entryX: -8, exitX: 8.6,
  description: "Da doca à rota: identificar, pesar, desviar para o endereço certo e conferir a expedição.",
  products: ROUTES.map((r) => ({ id: r.id, name: `Encomenda · ${r.name}`, description: `Volume de ${r.mass.toFixed(1).replace(".", ",")} kg para a rota ${r.name}.` })),
  steps: [
    { id: "unload", label: "Descarregar", x: -6, duration: 1.6, help: "A doca transfere um volume identificado para a esteira de entrada." },
    { id: "scan", label: "Ler etiqueta", x: -3.8, duration: 1.5, help: "O pórtico lê o código da encomenda e consulta o destino." },
    { id: "weigh", label: "Pesar", x: -1.6, duration: 1.8, help: "A balança confere a massa declarada. Corrija a calibração se houver divergência." },
    { id: "sort", label: "Separar por destino", x: 0.6, duration: 1.5, help: "Escolha o destino indicado na etiqueta. O desviador encaminha o volume à sua rua." },
    { id: "store", label: "Armazenar", x: 3.8, duration: 1.7, help: "Confira o endereço de estoque da rota e mantenha o corredor livre." },
    { id: "load", label: "Carregar por rota", x: 6.6, duration: 2, help: "Confira rota e quantidade antes de liberar a encomenda para o veículo." },
  ],
  controls: [
    { id: "barcodeReadable", label: "Etiqueta legível", type: "checkbox", value: true },
    { id: "scaleCalibrated", label: "Balança calibrada", type: "checkbox", value: true },
    { id: "weightOffset", label: "Erro da balança (kg)", type: "number", value: 0, min: -5, max: 5, step: 0.1 },
    { id: "destination", label: "Destino da separação", type: "select", value: "norte", options: choices },
    { id: "address", label: "Endereço de estoque", type: "select", value: "A-01", options: ROUTES.map((r) => ({ value: r.address, label: `${r.address} · ${r.name}` })) },
    { id: "aisleClear", label: "Corredor de estoque livre", type: "checkbox", value: true },
    { id: "route", label: "Rota do carregamento", type: "select", value: "norte", options: choices },
    { id: "quantity", label: "Quantidade conferida (volume)", type: "number", value: 1, min: 0, max: 20, step: 1 },
  ],
  initialize(product) {
    const r = routeFor(typeof product === "string" ? product : product?.id);
    return { destination: r.id, expectedAddress: r.address, nominalWeight: r.mass, quantity: 1, scanned: false, weighed: false, sorted: false, stored: false, loaded: false };
  },
  validate(stepId, settings, unit) {
    if (stepId === "unload") return null;
    if (!unit.unloaded) return "Descarregue a encomenda na esteira antes de continuar.";
    if (stepId === "scan") return settings.barcodeReadable ? null : "Etiqueta ilegível. Ative Etiqueta legível para repetir a leitura.";
    if (!unit.scanned) return "Leia a etiqueta antes de continuar.";
    if (stepId === "weigh") {
      if (!settings.scaleCalibrated) return "Calibre a balança antes de pesar.";
      if (!Number.isFinite(numeric(settings.weightOffset)) || Math.abs(numeric(settings.weightOffset)) > 0.05) return "Massa divergente. Ajuste o erro da balança para 0 kg.";
      return null;
    }
    if (!unit.weighed) return "Pese e confira a encomenda antes de continuar.";
    if (stepId === "sort") return settings.destination === unit.destination ? null : `Destino incorreto. A etiqueta indica ${routeFor(unit.destination).name}.`;
    if (!unit.sorted) return "Separe a encomenda pelo destino antes de continuar.";
    if (stepId === "store") {
      if (!settings.aisleClear) return "Corredor obstruído. Libere a passagem antes de armazenar.";
      return settings.address === unit.expectedAddress ? null : `Endereço incorreto. Armazene em ${unit.expectedAddress}.`;
    }
    if (stepId === "load") {
      if (!unit.stored) return "Confirme a armazenagem antes de carregar.";
      if (settings.route !== unit.destination) return `Rota divergente. Selecione ${routeFor(unit.destination).name}.`;
      if (numeric(settings.quantity) !== unit.quantity) return `Quantidade divergente. Confira ${unit.quantity} volume por encomenda.`;
    }
    return null;
  },
  apply(stepId, unit, settings) {
    if (stepId === "unload") unit.unloaded = true;
    if (stepId === "scan") { unit.scanned = true; unit.barcode = barcodeFor(unit.id); }
    if (stepId === "weigh") { unit.weighed = true; unit.weight = unit.nominalWeight + numeric(settings.weightOffset); }
    if (stepId === "sort") { unit.sorted = true; unit.lane = routeFor(unit.destination).z; }
    if (stepId === "store") { unit.stored = true; unit.address = settings.address; }
    if (stepId === "load") { unit.loaded = true; unit.manifest = { barcode: unit.barcode, route: settings.route, quantity: unit.quantity, weight: unit.weight, address: unit.address }; }
  },
  readings(snapshot) {
    const u = snapshot.unit ?? {};
    return [
      { label: "Etiqueta", value: u.scanned ? u.barcode : "Aguardando leitura" },
      { label: "Destino", value: routeFor(u.destination).name },
      { label: "Massa", value: u.weighed ? `${u.weight.toFixed(2).replace(".", ",")} kg` : "Aguardando pesagem" },
      { label: "Endereço", value: u.stored ? u.address : u.expectedAddress ?? "—" },
      { label: "Conferência", value: u.loaded ? "1 volume · manifesto liberado" : "Expedição pendente" },
    ];
  },
};

export const PARCEL_DIMENSIONS = Object.freeze({ width: 0.72, height: 0.62, depth: 0.58, supportY: 1.2, clearance: 0.012 });
const clamp = (n) => Math.max(0, Math.min(1, n));
// The diverter moves across a supported cross-belt, then along the selected lane.
// Parameterizing by distance avoids a diagonal through a rack or a belt edge.
function polyline(points, progress) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let distance = clamp(progress) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, distance / lengths[i]) : 1;
      return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * t, z: points[i][1] + (points[i + 1][1] - points[i][1]) * t };
    }
    distance -= lengths[i];
  }
  return { x: points[0][0], z: points[0][1] };
}

export function parcelPose(snapshot) {
  const lane = routeFor(snapshot.unit?.destination ?? snapshot.product?.id).z;
  const x = snapshot.position?.x ?? snapshot.step?.x ?? -8;
  const stepId = snapshot.step?.id;
  let pose = { x, z: ["store", "load"].includes(stepId) ? lane : 0 };
  if (snapshot.phase === "ready" && stepId === "store") pose.z = 0;
  if (snapshot.phase === "moving" && stepId === "store") {
    pose = polyline([[0.6, 0], [1.8, 0], [1.8, lane], [3.8, lane]], snapshot.progress ?? 0);
  }
  return { ...pose, y: PARCEL_DIMENSIONS.supportY + PARCEL_DIMENSIONS.clearance + PARCEL_DIMENSIONS.height / 2 };
}

export function buildParcelsModel({ THREE, root, product, stationView = false }) {
  const group = new THREE.Group(); group.name = "Centro de distribuição de encomendas"; root.add(group);
  let currentStages = null;
  let currentRoute = null;
  const stages = (...ids) => { currentStages = ids; };
  function add(parent, object) {
    if (parent === group && currentStages) object.userData.stages = [...currentStages];
    if (parent === group && currentRoute) object.userData.route = currentRoute;
    parent.add(object); return object;
  }
  const materials = [], textures = [];
  const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); materials.push(m); return m; };
  // Use the same finish and paint as the cookware laboratory; route colors are identifiers.
  const m = {
    steel: mat("#aebdc9", { metalness: 0.84, roughness: 0.25 }),
    frame: mat("#164193", { metalness: 0.4, roughness: 0.35 }),
    belt: mat("#313c47", { metalness: 0.12, roughness: 0.8 }),
    yellow: mat("#dfb249", { metalness: 0.2, roughness: 0.46 }),
    cardboard: mat("#ba9466", { roughness: 0.9 }), tape: mat("#ddc59f"),
    white: mat("#cbd5df", { metalness: 0.25, roughness: 0.44 }),
    dark: mat("#25323e", { metalness: 0.45, roughness: 0.48 }),
    green: mat("#41816f"), red: mat("#c95147"), ground: mat("#60788b", { metalness: 0.1, roughness: 0.85 }),
    truckBody: mat("#dce3e8", { metalness: 0.48, roughness: 0.36 }),
    truckPaint: mat("#164193", { metalness: 0.48, roughness: 0.28 }),
    window: mat("#375c73", { metalness: 0.15, roughness: 0.14 }),
    rubber: mat("#172027", { roughness: 0.94 }),
  };
  const routeMaterials = ROUTES.map((r) => mat(r.color, { metalness: 0.2, roughness: 0.46 }));
  function box(parent, name, x, y, z, w, h, d, material) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    o.name = name; o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return add(parent, o);
  }
  function cylinder(parent, name, x, y, z, radius, length, material, axis = "y") {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material);
    o.name = name; o.position.set(x, y, z); if (axis === "z") o.rotation.x = Math.PI / 2; if (axis === "x") o.rotation.z = Math.PI / 2;
    o.castShadow = true; return add(parent, o);
  }
  function label(parent, name, text, x, y, z, width = 1.5, height = 0.3) {
    const holder = new THREE.Group(); holder.name = name; holder.userData.text = text; holder.position.set(x, y, z); add(parent, holder);
    if (typeof document === "undefined") return holder;
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 128;
    const ctx = canvas.getContext("2d"); if (!ctx) return holder;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    holder.userData.setText = (value) => {
      if (holder.userData.rendered === value) return;
      holder.userData.text = value; holder.userData.rendered = value;
      ctx.fillStyle = "#edf2f6"; ctx.fillRect(0, 0, 640, 128); ctx.fillStyle = "#164193"; ctx.font = "600 44px Segoe UI, Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(value, 320, 64, 610); texture.needsUpdate = true;
    };
    holder.userData.setText(text);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); holder.add(mesh); return holder;
  }
  function conveyor(x1, x2, z, width = 1.5) {
    const segment = new THREE.Group(); segment.name = "Trecho da esteira de encomendas";
    add(group, segment);
    const length = x2 - x1, cx = (x1 + x2) / 2;
    const top = box(segment, "Superfície de apoio da esteira", cx, 1.15, z, length, 0.1, width, m.belt);
    top.userData.support = true;
    for (const side of [-1, 1]) {
      box(segment, "Longarina fora do volume transportado", cx, 1.005, z + side * (width / 2 + 0.025), length, 0.19, 0.08, m.steel);
      for (let x = x1 + 0.18; x <= x2 - 0.12; x += 1.5) box(segment, "Pé da esteira", x, 0.455, z + side * (width / 2 + 0.025), 0.09, 0.91, 0.09, m.frame);
    }
    return top;
  }
  if (!stationView) {
    box(group, "Piso do centro de distribuição", 0.7, -0.04, 0, 24, 0.08, 10.8, m.ground);
    for (const z of [-4.5, 4.5]) box(group, "Faixa de circulação da doca", 0.5, 0.006, z, 22, 0.008, 0.08, m.yellow);
  }
  // A continuous datum at y=1.2 supports every package path, including the switch.
  if (!stationView) {
    conveyor(-8.7, -2.29, 0);
    conveyor(-0.91, 1.15, 0);
  }
  stages("sort", "store");
  conveyor(1.15, 2.45, 0, 6.9);
  if (stationView) {
    stages("store");
    conveyor(0.1, 1.15, 0);
  }
  const trucks = [];
  for (const [i, r] of ROUTES.entries()) {
    currentRoute = r.id;
    stages("store", ...(!stationView ? ["load"] : []));
    conveyor(2.45, 2.925, r.z);
    conveyor(4.675, 6.1, r.z);
    if (stationView) {
      stages("load");
      conveyor(2.45, 6.1, r.z);
    }
    stages("store");
    box(group, "Prateleira de estoque", 3.8, 1.14, r.z, 1.75, 0.12, 1.5, m.steel).userData.support = true;
    for (const x of [3.05, 4.55]) for (const z of [r.z - 0.9, r.z + 0.9]) {
      box(group, "Montante do endereço", x, 1.5, z, 0.09, 3, 0.09, m.frame);
      box(group, "Base do montante", x, 0.04, z, 0.25, 0.08, 0.25, m.steel);
    }
    for (const x of [3.05, 4.55]) box(group, "Travessa de apoio da prateleira", x, 1.01, r.z, 0.12, 0.14, 1.9, m.yellow);
    box(group, "Travessa superior do estoque", 3.8, 2.85, r.z, 1.75, 0.1, 1.9, m.frame);
    label(group, `Endereço ${r.address}`, r.address, 3.8, 2.85, r.z + 0.956, 0.68, 0.14);
    // Open flatbed keeps the loading path clear; wheels are below the bed.
    stages("load");
    const truck = new THREE.Group(); truck.name = `Veículo da rota ${r.name}`; add(group, truck); trucks.push(truck);
    box(truck, "Plataforma do veículo", 7.7, 1.1, r.z, 3.2, 0.2, 1.65, m.truckBody).userData.support = true;
    box(truck, "Chassi", 8.3, 0.72, r.z, 4.4, 0.24, 1.3, m.dark);
    box(truck, "Cabine", 9.95, 1.28, r.z, 1.05, 1.5, 1.6, m.truckPaint);
    box(truck, "Para-brisa", 10.49, 1.6, r.z, 0.015, 0.52, 1.28, m.window);
    for (const side of [-1, 1]) {
      box(truck, "Vidro lateral da cabine", 9.98, 1.65, r.z + side * 0.805, 0.64, 0.42, 0.012, m.window);
      box(truck, "Maçaneta", 9.62, 1.25, r.z + side * 0.81, 0.16, 0.035, 0.025, m.steel);
      box(truck, "Farol", 10.49, 1.01, r.z + side * 0.55, 0.02, 0.13, 0.18, m.white);
    }
    for (const x of [6.6, 9.85]) for (const z of [r.z - 0.83, r.z + 0.83]) {
      cylinder(truck, "Roda apoiada no chão", x, 0.42, z, 0.42, 0.22, m.rubber, "z");
      cylinder(truck, "Cubo da roda", x, 0.42, z + Math.sign(z - r.z) * 0.115, 0.18, 0.02, m.steel, "z");
    }
    label(truck, `Identificação da rota ${r.name}`, r.name, 7.7, 1.08, r.z + 0.831, 0.68, 0.14);
  }
  currentRoute = null;
  // Incoming dock, barcode portal, load cell scale, and switch are distinct machines.
  stages("unload");
  const dockZ = stationView ? -3.2 : -2;
  box(group, "Plataforma de recebimento", -7.5, 0.55, dockZ, 3.1, 1.1, 1.9, m.frame);
  box(group, "Tampo da doca", -7.5, 1.15, dockZ, 3.1, 0.1, 1.9, m.steel);
  for (const x of [-8.3, -7.3, -6.3]) box(group, "Volume aguardando descarga", x, 1.52, dockZ - 0.2, 0.72, 0.64, 0.58, m.cardboard);
  stages("scan");
  for (const z of stationView ? [-2.4, 1.8] : [-0.97, 0.97]) box(group, "Coluna do leitor", -3.8, 1.45, z, 0.12, 2.9, 0.12, m.frame);
  box(group, "Pórtico do leitor", -3.8, 2.87, stationView ? -0.3 : 0, 0.22, 0.12, stationView ? 4.32 : 2.05, m.frame);
  box(group, "Leitor de código", -3.8, 2.65, 0, 0.35, 0.28, 0.3, m.yellow);
  const scan = box(group, "Linha de leitura sobre a etiqueta", -3.8, 1.847, 0, 0.025, 0.012, 0.5, mat("#39c3d5", { emissive: "#168299", emissiveIntensity: 0.7 }));
  scan.visible = false;
  // Scale deck exactly replaces (does not cover) the conveyor top at the same datum.
  stages("weigh");
  box(group, "Balança nivelada com a esteira", -1.6, 1.14, 0, 1.38, 0.12, 1.5, m.steel).userData.support = true;
  for (const x of [-2.12, -1.08]) for (const z of [-0.55, 0.55]) box(group, "Célula de carga e apoio", x, 0.57, z, 0.11, 1.14, 0.11, m.frame);
  box(group, "Coluna do indicador de peso", -1.6, 1.12, -1.1, 0.08, 2.24, 0.08, m.steel);
  const weightLabel = label(group, "Indicador da balança", "Balança · kg", -1.6, 2.3, -1.05, 1.5, 0.32);
  stages("sort");
  const signalZ = stationView ? -2.4 : -1.05;
  const diverter = box(group, "Sinalizador do desviador", 0.6, 2.15, signalZ, 0.18, 0.24, 0.18, m.green);
  box(group, "Poste do sinalizador", 0.6, 1, signalZ, 0.07, 2, 0.07, m.steel);
  // Destination arrows lie outside the swept package footprint, without coplanar faces.
  for (const [i, r] of ROUTES.entries()) {
    currentRoute = r.id;
    stages("sort", "store", "load");
    box(group, "Guia colorida da rota", 5, 1.211, r.z + 0.63, 1.6, 0.008, 0.08, routeMaterials[i]);
  }
  currentRoute = null;
  currentStages = null;
  const parcel = new THREE.Group(); parcel.name = "Encomenda em processo"; group.add(parcel);
  const d = PARCEL_DIMENSIONS;
  box(parcel, "Caixa da encomenda", 0, 0, 0, d.width, d.height, d.depth, m.cardboard);
  box(parcel, "Fita adesiva", 0, d.height / 2 + 0.002, 0, 0.1, 0.004, d.depth - 0.01, m.tape);
  box(parcel, "Etiqueta identificada", 0.16, d.height / 2 + 0.005, 0, 0.23, 0.004, 0.32, m.white);
  for (let i = 0; i < 12; i++) box(parcel, "Barra do código", 0.065 + i * 0.016, d.height / 2 + 0.008, 0, i % 3 ? 0.006 : 0.011, 0.002, 0.18, m.dark);
  const band = box(parcel, "Cor da rota conferida", 0, 0, d.depth / 2 + 0.003, d.width - 0.05, 0.14, 0.004, routeMaterials[0]);
  const status = label(parcel, "Código da encomenda", "EC-00001", 0, -0.07, d.depth / 2 + 0.008, 0.58, 0.12);
  let disposed = false;
  let selectedStage = null;
  let selectedRoute = routeFor(product?.id);
  function selectStage(id) {
    if (!PARCELS.steps.some((step) => step.id === id)) return;
    selectedStage = id;
    const oneRoute = stationView && ["store", "load"].includes(id);
    group.position.z = oneRoute ? -selectedRoute.z : 0;
    for (const object of group.children) {
      if (object.userData.stages) object.visible = object.userData.stages.includes(id) && (!oneRoute || !object.userData.route || object.userData.route === selectedRoute.id);
    }
  }
  function update(snapshot) {
    if (disposed) return;
    const u = snapshot.unit ?? {}, r = routeFor(u.destination ?? product?.id);
    if (selectedRoute.id !== r.id) {
      selectedRoute = r;
      if (selectedStage) selectStage(selectedStage);
    }
    const pose = parcelPose({ ...snapshot, product });
    parcel.position.set(pose.x, pose.y, pose.z);
    parcel.visible = snapshot.phase !== "complete";
    band.material = routeMaterials[ROUTES.indexOf(r)];
    band.visible = !!u.scanned;
    const code = u.barcode ?? barcodeFor(u.id);
    status.userData.text = code; status.userData.setText?.(code);
    parcel.userData = { ...u, supportY: d.supportY, clearance: d.clearance };
    scan.visible = (!selectedStage || selectedStage === "scan") && snapshot.step?.id === "scan" && snapshot.phase === "operating";
    scan.position.x = -4.05 + clamp(snapshot.progress ?? 0) * 0.5;
    const weight = u.weighed ? `${u.weight.toFixed(2)} kg` : "Balança · kg";
    weightLabel.userData.text = weight; weightLabel.userData.setText?.(weight);
    diverter.material = snapshot.fault ? m.red : m.green;
  }
  update({ phase: "ready", position: { x: -8 }, unit: PARCELS.initialize(product) });
  if (stationView) selectStage("unload");
  return {
    root: group, parcel, update, selectStage,
    dispose() {
      if (disposed) return; disposed = true;
      group.traverse((o) => o.geometry?.dispose());
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.removeFromParent();
    },
  };
}
