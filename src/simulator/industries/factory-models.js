import {
  createBottleFluid,
  setBottleFluidAmount,
  setBottleFluidLevel,
  detachFluidGeometry,
  getFillPose,
} from "./bottle-fluid.js";
import { buildMaterialReceiving } from "./material-receiving.js";
import { buildBottlePacking } from "./bottle-packing.js";
import { createBottleLabel, buildBottleLabeler } from "./bottle-labeler.js";
import { buildBottleRinser, getRinsePose } from "./bottle-rinser.js";
import { ease, buildIndustryBase, stationModel } from "./factory-helpers.js";
export { buildIndustryBase } from "./factory-helpers.js";
export { buildFurnitureModel } from "./furniture-model.js";
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
  const glass = mat("#5f8395", {
      transparent: true,
      opacity: 0.18,
      roughness: 0.12,
      metalness: 0,
      envMapIntensity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    liquidMat = mat(product.color, {
      roughness: 0.26,
      metalness: 0,
      emissive: product.color,
      emissiveIntensity: 0.06,
    });
  // Glass stays clear face-on while its silhouette reflects more light, so an empty bottle remains visible.
  glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      float glassEdge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
      diffuseColor.a = 0.16 + 0.68 * glassEdge;
      #include <opaque_fragment>
    `,
    );
  };
  glass.customProgramCacheKey = () => "visible-bottle-glass-v1";
  const bottle = new THREE.Group();
  root.add(bottle);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.65, 32, 1, true),
    glass,
  );
  body.position.y = 0.325;
  bottle.add(body);
  cyl(bottle, 0, 0.009, 0, 0.18, 0.018, glass);
  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.18, 0.2, 32, 1, true),
    glass,
  );
  shoulder.position.y = 0.75;
  bottle.add(shoulder);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.15, 32, 1, true),
    glass,
  );
  neck.position.y = 0.925;
  bottle.add(neck);
  const liquid = createBottleFluid(THREE, liquidMat);
  bottle.add(liquid);
  const rinseWater = createBottleFluid(
    THREE,
    mat("#40b9dd", {
      transparent: true,
      opacity: 0.65,
      roughness: 0.2,
      depthWrite: false,
    }),
    "bottle-rinse-water",
  );
  bottle.add(rinseWater);
  const cap = cyl(bottle, 0, 1.035, 0, 0.087, 0.07, m.accent);
  cap.name = "bottle-cap";
  liquid.name = "bottle-liquid";
  const printedLabel = createBottleLabel(THREE, product);
  const label = printedLabel.mesh;
  bottle.add(label);
  label.name = "bottle-label";
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
    if (id !== "wash" && id !== "label")
      cyl(head, 0, 0, 0, id === "fill" ? 0.035 : 0.1, 0.28, m.steel);
    if (id !== "wash" && id !== "cap" && id !== "fill")
      bar(root, [x, 2.7, 0], [x, 3.3, 0], 0.035, m.steel);
    heads[id] = head;
  }
  const rinser = buildBottleRinser({
    ...args,
    x: definition.steps.find((step) => step.id === "wash").x,
  });
  const tankZ = args.stationView ? -2.3 : -2.1;
  const fillTank = new THREE.Group();
  fillTank.userData.stageId = "fill";
  root.add(fillTank);
  const tankX = -3.8;
  cyl(fillTank, tankX, 1.7, tankZ, 0.52, 2.5, m.steel);
  for (const x of [tankX - 0.3, tankX + 0.3])
    box(fillTank, x, 0.225, tankZ, 0.09, 0.45, 0.09, m.steel);
  bar(fillTank, [tankX, 2.95, tankZ], [tankX, 3.15, tankZ], 0.04, m.steel);
  bar(fillTank, [tankX, 3.15, tankZ], [-2, 3.15, tankZ], 0.04, m.steel);
  bar(fillTank, [-2, 3.15, tankZ], [-2, 3.15, 0], 0.04, m.steel);
  const fillStream = cyl(root, -2, 2, 0, 0.011, 1, liquidMat);
  fillStream.name = "Jato contínuo até o nível interno";
  const fillRod = cyl(root, -2, 2.8, 0, 0.016, 1, m.steel);
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
  const labeler = buildBottleLabeler(args);
  function createCopy(unit) {
    const copy = bottle.clone(true);
    copy.visible = true;
    copy.rotation.set(0, 0, 0);
    const content = copy.getObjectByName("bottle-liquid");
    detachFluidGeometry(content);
    setBottleFluidAmount(content, unit.volume / unit.target);
    copy.getObjectByName("bottle-rinse-water").visible = false;
    copy.getObjectByName("bottle-cap").visible = !!unit.capped;
    copy.getObjectByName("bottle-label").visible = !!unit.labeled;
    return copy;
  }
  const receiver = buildMaterialReceiving(args, {
    kind: "bottles",
    createCopy,
  });
  const output = buildBottlePacking({
    ...args,
    createCopy,
  });
  let selectedStage = definition.steps[0].id;
  return stationModel(args, {
    group: root,
    body,
    liquid,
    cap,
    bottle,
    capTool,
    rinser,
    receiver,
    fillStream,
    fillRod,
    output,
    alwaysVisible: [output.group, receiver.group],
    onSelectStage: (id) => {
      selectedStage = id;
      receiver.selectStage(id);
      output.selectStage(id);
    },
    update(s) {
      const active = s.phase === "operating",
        id = s.step?.id,
        t = active ? s.progress : 0,
        u = s.unit;
      receiver.group.visible =
        !args.stationView || selectedStage === definition.steps[0].id;
      output.group.visible =
        !args.stationView || ["pack", "seal", "ship"].includes(selectedStage);
      const transfer = output.group.visible ? output.update(s) : null;
      const rinse = getRinsePose(t, active && id === "wash");
      bottle.position.set(s.position.x + rinse.xOffset, rinse.baseY, 0);
      bottle.rotation.z = rinse.angle;
      rinser.update(s);
      if (transfer) bottle.position.set(transfer.x, transfer.y, transfer.z);
      bottle.visible = s.phase !== "complete" && !u.packed;
      const receivePose = receiver.group.visible ? receiver.update(s) : null;
      if (receivePose)
        bottle.position.set(receivePose.x, receivePose.y, receivePose.z);
      const fill = getFillPose(t, active && id === "fill");
      const amount =
        id === "fill" && active ? fill.fraction * u.target : u.volume;
      setBottleFluidAmount(liquid, amount / u.target);
      setBottleFluidLevel(
        rinseWater,
        active && id === "wash" ? rinse.waterLevel : 0.025,
      );
      cap.visible =
        u.capped ||
        (active && id === "cap" && !s.settings.missingCap && t >= 0.7);
      const labelPose = labeler.update(s);
      label.visible =
        u.labeled || (active && id === "label" && labelPose.applied);
      // Fixed head housings do not bob while their internal actuators work.
      const nozzleTip = active && id === "fill" ? fill.nozzleTip : 2.55;
      heads.fill.position.y = nozzleTip + 0.14;
      const rodLow = nozzleTip + 0.28;
      fillRod.position.y = (rodLow + 3.24) / 2;
      fillRod.scale.y = 3.24 - rodLow;
      fillStream.visible =
        active &&
        id === "fill" &&
        fill.flowing &&
        s.running &&
        (!s.outputs || s.outputs.work);
      const levelY = 1.2 + fill.level;
      fillStream.position.y = (nozzleTip + levelY) / 2;
      fillStream.scale.y = Math.max(0.001, nozzleTip - levelY);
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
      receiver.dispose();
      output.dispose?.();
      printedLabel.dispose();
      labeler.dispose();
      for (const v of own) v.dispose();
    },
  });
}
