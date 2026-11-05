const canvasWidth = 1024;
const canvasHeight = 640;
const buttons = [
  { action: "start", label: "START", x: 28 },
  { action: "stop", label: "STOP", x: 274 },
  { action: "reset", label: "RESET", x: 520 },
  { action: "mode", label: "MAN / AUTO", x: 766 },
];
const palette = {
  background: "#0d1319",
  card: "#171f27",
  border: "#35414b",
  text: "#edf3f5",
  muted: "#96a6b3",
  green: "#42cc83",
  yellow: "#e3b640",
  red: "#ef6262",
};

export function buildCircuitHmi({ THREE, group, title, sector, theme }) {
  const preview = theme === "blue";
  const panelHeight = preview ? 2.1 : 1.44;
  const buttonTop = preview ? 294 : 530;
  const buttonHeight = preview ? 170 : 76;
  const object = new THREE.Group();
  object.name = `HMI · ${title}`;
  group.add(object);
  const geometries = [];
  const materials = [];
  function material(color, extra = {}) {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.35,
      ...extra,
    });
    materials.push(result);
    return result;
  }
  function part(geometry, surface, x, y, z) {
    const mesh = new THREE.Mesh(geometry, surface);
    geometries.push(geometry);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    object.add(mesh);
    return mesh;
  }
  function casing(width, height, depth) {
    if (preview) return new THREE.BoxGeometry(width, height, depth);
    const x = -width / 2;
    const y = -height / 2;
    const r = 0.035;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 3,
    }).translate(0, 0, -depth / 2);
  }
  const frame = material("#29333c");
  const trim = material("#64717c");
  const black = material("#080c10");
  const yellow = material("#e5b52c", { metalness: 0.1 });
  const red = material("#d52d30", { metalness: 0.1 });
  part(casing(1.4, 0.94, 0.12), frame, 0, 0, 0);
  part(casing(1.43, 0.97, 0.035), trim, 0, 0, -0.035);
  part(new THREE.BoxGeometry(1.33, 0.86, 0.018), black, 0, 0, 0.066);
  let support;
  if (preview) {
    support = part(
      new THREE.BoxGeometry(0.09, panelHeight, 0.09),
      trim,
      0,
      -panelHeight / 2,
      -0.05,
    );
  } else {
    part(new THREE.BoxGeometry(0.09, 0.99, 0.095), trim, 0, -0.92, -0.025);
    part(
      new THREE.CylinderGeometry(0.23, 0.25, 0.035, 24),
      frame,
      0,
      -1.4225,
      -0.025,
    );
  }
  for (const x of [-0.671, 0.671])
    for (const y of [-0.43, 0.43]) {
      const bolt = part(
        new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10),
        trim,
        x,
        y,
        0.064,
      );
      bolt.rotation.x = Math.PI / 2;
    }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const displayMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  });
  materials.push(displayMaterial);
  const screen = part(
    new THREE.PlaneGeometry(1.23, 0.76875),
    displayMaterial,
    0,
    0,
    0.077,
  );
  screen.name = "Tela de operação HMI";
  const emergencyMount = part(
    new THREE.BoxGeometry(0.18, 0.22, 0.065),
    yellow,
    0.79,
    -0.17,
    0.01,
  );
  const emergencyButton = part(
    new THREE.CylinderGeometry(0.065, 0.072, 0.045, 24),
    red,
    0.79,
    -0.17,
    0.065,
  );
  emergencyButton.rotation.x = Math.PI / 2;
  emergencyButton.name = "Parada de emergência";
  if (preview) {
    const face = new THREE.Group();
    face.add(...object.children.filter((child) => child !== support));
    face.rotation.x = -Math.PI / 18;
    object.add(face);
  }
  let view = null;
  let signature = "";
  let disposed = false;

  function rectangle(x, y, w, h, color, radius = 8) {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    context.fill();
  }
  function text(value, x, y, size, color = palette.text, maxWidth = 960) {
    const raw = value === undefined || value === null ? "—" : String(value);
    context.font = `${size >= 24 ? "600 " : ""}${size}px Segoe UI, sans-serif`;
    context.fillStyle = color;
    let fitted = raw;
    while (fitted.length > 1 && context.measureText(fitted).width > maxWidth)
      fitted = fitted.slice(0, -2) + "…";
    context.fillText(fitted, x, y);
  }
  function enabled(action) {
    return !disposed && view?.actions?.[action] === true;
  }
  function draw() {
    context.fillStyle = palette.background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    text(title, 28, 47, 28, palette.text, 650);
    text(
      view?.wallClock ?? (sector === "beverages" ? "BEBIDAS" : "PANELAS"),
      753,
      43,
      preview ? 22 : 17,
      palette.muted,
      243,
    );
    const status = !view
      ? "Aguardando dados da operação"
      : view.emergency
        ? "Emergência acionada"
        : view.fault
          ? "Falha no processo"
          : view.ready === false
            ? "Intertravamento ativo"
            : view.running
              ? "Em operação"
              : "Pausado";
    const color =
      view?.emergency || view?.fault
        ? palette.red
        : view?.ready === false
          ? palette.yellow
          : palette.green;
    rectangle(22, 68, 980, 56, palette.card);
    context.fillStyle = view ? color : palette.muted;
    context.beginPath();
    context.arc(45, 96, 7, 0, Math.PI * 2);
    context.fill();
    text(status, 65, 104, 23, palette.text, 650);
    if (!preview) text(view?.clock, 844, 104, 21, palette.muted, 135);
    if (preview) {
      text("Operação da linha simulada", 28, 193, 28, palette.text, 650);
      text(
        view?.mode === "manual"
          ? "Modo manual · START aciona a etapa"
          : "Modo automático",
        28,
        236,
        22,
        palette.muted,
      );
    } else {
      const counters = view?.counters ?? [];
      for (let index = 0; index < 3; index++) {
        const x = 24 + index * 328;
        rectangle(x, 143, 312, 105, palette.card);
        text(counters[index]?.label, x + 16, 174, 18, palette.muted, 280);
        text(counters[index]?.value, x + 16, 224, 36, palette.text, 280);
      }
      const stations = view?.stations ?? [];
      for (let index = 0; index < 8; index++) {
        const x = 24 + (index % 4) * 246;
        const y = 267 + Math.floor(index / 4) * 88;
        rectangle(x, y, 230, 75, palette.card);
        const entry = stations[index];
        if (entry) {
          const stateColor =
            entry.state === "fault"
              ? palette.red
              : entry.state === "running"
                ? palette.green
                : palette.border;
          rectangle(x, y + 7, 4, 61, stateColor, 1);
        }
        text(entry?.label, x + 12, y + 27, 18, palette.text, 206);
        text(entry?.value, x + 12, y + 57, 18, palette.muted, 206);
      }
      const mode = {
        auto: "Automático",
        manual: "Manual",
        guided: "Interativo",
      }[view?.mode];
      text(
        view?.message ??
          (view?.emergency
            ? "Use o painel para rearmar o sistema"
            : view?.phase),
        28,
        478,
        18,
        palette.muted,
        720,
      );
      text(mode, 802, 478, 18, palette.muted, 190);
      context.strokeStyle = palette.border;
      context.beginPath();
      context.moveTo(24, 501);
      context.lineTo(1000, 501);
      context.stroke();
    }
    for (const button of buttons) {
      const active = enabled(button.action);
      const fill =
        theme === "blue"
          ? "#15283f"
          : active && button.action === "start"
            ? "#123c2a"
            : palette.card;
      rectangle(button.x, buttonTop, 230, buttonHeight, fill);
      context.strokeStyle =
        theme === "blue"
          ? "#37639c"
          : active && button.action === "start"
            ? palette.green
            : palette.border;
      context.lineWidth = 2;
      context.strokeRect(button.x + 1, buttonTop + 1, 228, buttonHeight - 2);
      text(
        button.label,
        button.x + 20,
        buttonTop + buttonHeight / 2 + 9,
        23,
        active ? palette.text : "#80919f",
        200,
      );
    }
    if (preview && view?.message) text(view.message, 28, 531, 20, palette.yellow, 966);
    emergencyMount.visible = emergencyButton.visible = enabled("emergency");
    texture.needsUpdate = true;
  }
  draw();

  return {
    object,
    screen,
    update(nextView) {
      if (disposed) return false;
      const nextSignature = JSON.stringify(nextView ?? null);
      if (signature === nextSignature) return false;
      signature = nextSignature;
      view = nextView ?? null;
      draw();
      return true;
    },
    pick(raycaster, canHit = () => true) {
      if (disposed) return null;
      object.updateWorldMatrix(true, true);
      if (
        enabled("emergency") &&
        raycaster.intersectObject(emergencyButton, false).length &&
        canHit(emergencyButton)
      )
        return "emergency";
      const hit = raycaster.intersectObject(screen, false)[0];
      if (!hit?.uv) return null;
      const x = hit.uv.x * canvasWidth;
      const y = (1 - hit.uv.y) * canvasHeight;
      const button = buttons.find(
        (entry) =>
          x >= entry.x &&
          x <= entry.x + 230 &&
          y >= buttonTop &&
          y <= buttonTop + buttonHeight,
      );
      return button && enabled(button.action) && canHit(screen)
        ? button.action
        : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      texture.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
    },
  };
}
