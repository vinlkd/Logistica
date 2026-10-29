import { ease, foldingCarton, buildIndustryBase, stationModel } from "./factory-helpers.js";
import { createFurnitureTrucks } from "./furniture-trucks.js";
import { createFurnitureOutput } from "./furniture-flow.js";
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
  const waste = new THREE.Group(); waste.name = "Coleta das sobras do corte"; root.add(waste);
  const offcutWidth = blank - target, wasteWidth = 3 * offcutWidth + 0.4;
  box(waste, cutting + target / 2, 0.21, -3.3, wasteWidth, 0.08, 2, m.steel);
  for (const x of [cutting + target / 2 - wasteWidth / 2 + 0.1, cutting + target / 2 + wasteWidth / 2 - 0.1])
    for (const z of [-4.1, -2.5]) box(waste, x, 0.085, z, 0.08, 0.17, 0.08, m.steel);
  const offcut = box(
    root,
    cutting + target / 2,
    1.27,
    0,
    Math.max(0.15, blank - target),
    0.14,
    0.78,
    m.wood,
  );
  const wasteSlot = (index) => ({ x: cutting + target / 2 + ((index % 3) - 1) * (offcutWidth + 0.1), y: 0.32 + Math.floor(index / 6) * 0.145, z: index % 6 < 3 ? -3.75 : -2.85 });
  const scraps = Array.from({ length: 30 }, (_, index) => { const p = wasteSlot(index), mesh = box(waste, p.x, p.y, p.z, offcutWidth, 0.14, 0.78, m.wood); mesh.visible = false; return mesh; });
  box(waste, cutting + target / 2, 0.925, 1.85, 0.1, 1.85, 0.1, m.accent);
  box(waste, cutting + target / 2, 1.85, 1.85, wasteWidth, 0.12, 0.12, m.steel);
  const ejector = box(waste, cutting + target / 2, 1.27, 0.44, offcutWidth - 0.02, 0.1, 0.1, m.accent);
  const ejectorNeck = box(waste, cutting + target / 2, 1.585, 0.44, 0.06, 1, 0.05, m.steel);
  const ejectorRod = cyl(waste, cutting + target / 2, 1.85, 1, 0.025, 1, m.steel); ejectorRod.rotation.x = Math.PI / 2;
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
    box(root, assembly + dx, 1.065, -1.5, 0.18, 0.09, 4, m.steel);
    // The feed skids meet the parked carriage without occupying its swept rail.
    box(root, assembly + dx, 1.155, -2.7525, 0.16, 0.09, 1.695, m.steel);
    for (const z of [-3.3, -1.7, 0.4])
      box(root, assembly + dx, 0.51, z, 0.09, 1.02, 0.09, m.accent);
  }
  for (const x of [-target * 0.35, target * 0.35]) {
    box(carrier, x, -0.045, 0, 0.16, 0.09, 0.8, m.steel);
    for (const z of [-0.27, 0.27])
      spareLegs.push(box(carrier, x, 0.425, z, 0.09, 0.85, 0.09, m.wood));
  }
  const magazineHalf = target * 0.35 + 0.17;
  for (const side of [-1, 1]) {
    box(root, assembly + side * magazineHalf, 1.65, -3, 0.08, 1.1, 1.4, m.accent);
    box(root, assembly + side * magazineHalf, 1.7, -2.35, 0.08, 3.4, 0.08, m.steel);
  }
  box(root, assembly, 1.65, -3.65, magazineHalf * 2, 1.1, 0.08, m.accent);
  box(root, assembly, 2.2, -3, magazineHalf * 2 + 0.08, 0.08, 1.4, m.accent);
  const feedDoor = box(root, assembly, 1.65, -2.26, magazineHalf * 2, 1.1, 0.05, m.white);
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
    1.02,
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
  const output = createFurnitureOutput({THREE,root,box,materials:m,definition,target,blank,foldingCarton});
  const model = stationModel(args, {
    group: root,
    piece,
    board,
    legs,
    drillHead,
    saw,
    carrier, spareLegs, feedDoor, pad, lift, offcut, scraps, ejector,
    update(s) {
      const active = s.phase === "operating",
        id = s.step?.id,
        t = active ? s.progress : 0,
        u = s.unit;
      const assembling = active && id === "assemble",
        rise = u.assembled
          ? 0.85
          : assembling
            ? 0.85 * ease(t / 0.25)
            : 0;
      const packingLift = u.packed
        ? 0.03
        : active && id === "pack"
          ? 0.03 * ease(t / 0.15)
          : 0;
      const renderX = s.phase === "outgoing" ? s.step.x + 3.2 * ease(s.progress) : s.phase === "complete" ? s.step.x + 3.2 : s.position.x;
      piece.position.set(renderX, 1.2 + packingLift, 0);
      piece.visible = true;
      const cut = u.cut || (active && id === "cut" && t > 0.75);
      board.scale.x = (cut ? target : blank) / blank;
      board.position.y = 0.07 + rise;
      const recenter =
        active && id === "cut"
          ? ease((t - 0.92) / 0.08)
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
      const unitIndex = Math.max(0, Math.min(29, (Number(String(u.id ?? "1").replace(/\D/g, "")) || 1) - 1));
      const slot = wasteSlot(unitIndex), separated = u.cut || (active && id === "cut" && t > 0.75);
      offcut.visible = separated;
      const push = active && id === "cut" ? ease((t - 0.75) / 0.05) : 0;
      const lateral = active && id === "cut" ? ease((t - 0.8) / 0.1) : 0;
      const drop = u.cut ? 1 : active && id === "cut" ? Math.max(0, Math.min(1, (t - 0.9) / 0.1)) : 0;
      const fall = drop * drop;
      const scrapX = u.cut ? slot.x : cutting + target / 2 + (slot.x - cutting - target / 2) * lateral;
      const scrapZ = u.cut ? slot.z : -push - 1.5 * lateral + (slot.z + 2.5) * drop;
      offcut.position.set(scrapX, 1.27 + (slot.y - 1.27) * fall, scrapZ);
      const cutUnits = s.history ? new Set(s.history.filter((entry) => entry.step === "cut" && entry.unit !== u.id).map((entry) => entry.unit)).size : unitIndex;
      scraps.forEach((mesh, index) => mesh.visible = index < cutUnits);
      const retract = u.cut ? 1 : ease((t - 0.93) / 0.05);
      const retractHeight = u.cut ? 0 : 0.3 * ease((t - 0.9) / 0.03) * (1 - ease((t - 0.98) / 0.02));
      ejector.position.set(scrapX + (cutting + target / 2 - scrapX) * retract, 1.27 + retractHeight, (-push - 1.5 * lateral + 0.44) * (1 - retract) + 0.44 * retract);
      const rodEnd = ejector.position.z + 0.05;
      ejectorNeck.position.set(ejector.position.x, (ejector.position.y + 0.05 + 1.85) / 2, ejector.position.z); ejectorNeck.scale.y = 1.85 - ejector.position.y - 0.05;
      ejectorRod.position.set(ejector.position.x, 1.85, (rodEnd + 1.85) / 2); ejectorRod.scale.y = 1.85 - rodEnd;
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
      const received = s.completedSteps?.includes("receive") || s.history?.some((entry) => entry.unit === u.id && entry.step === "receive");
      const feedT = received || active && id === "assemble" ? 1 : id === "assemble" && s.phase === "moving" ? s.progress : id === "assemble" && s.phase === "ready" ? 0 : id === "receive" ? active ? t : 0 : 1;
      const feed = ease((feedT - 0.2) / 0.6), door = ease(feedT / 0.2) * (1 - ease((feedT - 0.8) / 0.2));
      feedDoor.position.y = 1.65 + 1.15 * door;
      spareLegs.forEach((leg, i) => leg.position.z = (i % 2 ? 0.27 : -0.27) - 1.5 * (1 - feed));
      // Once the four legs carry the tabletop, retract before handing it to
      // the conveyor. The lift no longer snaps down when the next unit starts.
      const liftRise = assembling ? rise * (1 - ease((t - 0.82) / 0.18)) : 0;
      pad.position.y = 1.16 + liftRise;
      lift.position.y = (0.15 + 1.12 + liftRise) / 2;
      lift.scale.y = (0.97 + liftRise) / 1.1;
      const pack = u.packed ? 1 : active && id === "pack" ? t : 0;
      carton.visible = pack >= 0.15;
      packaging.update(pack);
      gauge.position.x =
        3.6 + (active && id === "inspect" ? 0.2 * Math.sin(Math.PI * t) : 0);
    },
    dispose() { output.dispose(); },
  });
  const docks=createFurnitureTrucks(args);
  let selected = definition.steps[0].id;
  const select = model.selectStage?.bind(model), animate = model.update.bind(model);
  model.selectStage = id => { selected = id; select?.(id); };
  model.update = (snapshot,dt) => {
    animate(snapshot,dt);output.update(snapshot,selected);
    let pose={x:piece.position.x,y:piece.position.y,z:piece.position.z,rotation:0};
    if(snapshot.step.id===definition.steps[0].id&&['ready','moving','operating'].includes(snapshot.phase))pose=docks.inputPose(snapshot);
    if(snapshot.step.id===definition.steps.at(-1).id&&['outgoing','complete'].includes(snapshot.phase))pose=docks.outputPose(snapshot,target);
    piece.position.set(pose.x,pose.y,pose.z);piece.rotation.y=pose.rotation??0;
    docks.update(snapshot,selected,pose);
  };
  const dispose=model.dispose.bind(model);model.dispose=()=>{dispose();docks.dispose();};model.docks=docks;
  model.output = output;
  return model;
}

