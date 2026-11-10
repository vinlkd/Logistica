import { buildTruckDock } from "./truck-dock.js";
import { buildBottleCase } from "./bottle-cases.js";
import { buildCrateOpener } from "./crate-opener.js";
import {
  cookwareReceivingStateFromCell,
  cookwareSourceSlot,
  cookwareEmptySlot,
  cookwareDiscSlot,
} from "../cookware-receiving-flow.js";
export function buildCookwareReceiving(args) {
  const { THREE, root, box, cyl, materials: m } = args;
  const group = new THREE.Group();
  group.name = "Recebimento • caixas fechadas de discos de inox";
  root.add(group);
  const dock = buildTruckDock(
    { ...args, root: group },
    { shipping: false, stageId: "receiving", cradle: true, outwardDoors: true },
  );
  // The laboratory already has receiving rollers and a weighing plate here.
  // Keep their real transport surface instead of embedding them in a solid bridge.
  for (const part of [...dock.group.children]) {
    const size = part.geometry?.parameters;
    const bridge = size?.width === 2.4 && size.depth === 1.45;
    const bridgeFoot =
      size?.width === 0.08 &&
      size.depth === 0.08 &&
      Math.abs(size.height - 1.095) < 1e-9 &&
      Math.abs(Math.abs(part.position.z) - 0.69) < 1e-9;
    if (bridge || bridgeFoot) {
      part.geometry.dispose();
      part.removeFromParent();
    }
  }
  const sourceCases = Array.from({ length: 6 }, (_, index) => {
    const item = buildBottleCase(
      { ...args, product: args.product ?? { name: "Discos de inox" } },
      group,
      index,
    );
    item.group.name = `Caixa de origem ${index + 1} • até 12 discos`;
    item.tape.visible = item.paper.visible = false;
    if (item.paper.userData.face) item.paper.userData.face.visible = false;
    return item;
  });
  const copies = new Map();
  box(group, -4.1, 1.145, 3.505, 3.4, 0.1, 3.89, m.steel);
  box(group, -9.9, 1.145, 3, 8.2, 0.1, 1.6, m.steel);
  for (const x of [-13.7, -11, -8, -5.5, -2.55])
    for (const z of [2.28, 3.72])
      box(group, x, 0.5475, z, 0.1, 1.095, 0.1, m.steel);
  for (const x of [-6.7, 0.7])
    for (const z of [-2, 2])
      box(group, x, 2.525, z, 0.12, 5.05, 0.12, m.accent ?? m.blue);
  for (const z of [-2, 2]) {
    box(group, -3, 4.65, z, 7.26, 0.08, 0.08, m.steel);
    box(group, -3, 5.05, z, 7.26, 0.08, 0.08, m.steel);
  }
  const carriage = box(group, -1.7, 4.75, 0, 0.14, 0.08, 4.08, m.steel);
  carriage.name = "Ponte do eletroímã • mesma doca das bebidas";
  const head = new THREE.Group();
  group.add(head);
  head.name = "Eletroímã retira o disco de cima da pilha";
  const magnet = cyl(head, 0, 0.025, 0, 0.25, 0.05, m.dark);
  const rod = cyl(group, -1.7, 4, 0, 0.025, 1, m.steel);
  for (const x of [-5.12, -3.08])
    box(group, x, 5.15, 0, 0.12, 0.08, 4.08, m.steel);
  for (const z of [-1.02, 1.02])
    box(group, -4.1, 5.05, z, 2.16, 0.08, 0.12, m.steel);
  const opener = buildCrateOpener({ ...args, root: group }, { topCrossbar: false });
  let lastState,
    lastKey,
    previousPhase,
    previousCommanded = false;
  return {
    group,
    dock,
    sourceCases,
    crates: sourceCases.map((item) => item.group),
    copies,
    head,
    rod,
    magnet,
    opener,
    get state() {
      return lastState;
    },
    update(cell) {
      const logical = cookwareReceivingStateFromCell(cell),
        total = logical.total;
      const key = [total, cell.done, cell.part, cell.unit?.product].join("|");
      const safe = !cell.emergency && cell.guard !== false && !cell.fault;
      const commanded =
        safe &&
        ((cell.phase === "feeding" && cell.outputs?.motor) ||
          (cell.phase === "processing" && cell.outputs?.work) ||
          (cell.phase === "unloading" && cell.outputs?.transfer));
      const settle =
        previousPhase === "feeding" &&
        cell.phase === "processing" &&
        previousCommanded;
      if (!lastState || key !== lastKey || commanded || settle)
        lastState = logical;
      lastKey = key;
      previousPhase = cell.phase;
      previousCommanded = !!commanded;
      const state = lastState,
        current = state.caseIndex;
      for (let index = 0; index < total; index++) {
        if (!copies.has(index)) {
          const copy = cyl(
            sourceCases[Math.floor(index / 12)].group,
            0,
            0,
            0,
            0.62,
            0.025,
            m.steel,
          );
          copy.name = `Disco de inox de origem ${index + 1}`;
          copies.set(index, copy);
        }
        const copy = copies.get(index),
          slot = cookwareDiscSlot(index, total);
        copy.position.set(0, slot.y - 0.0125, 0);
        copy.visible = index >= (cell.done ?? 0) + (cell.part ? 1 : 0);
      }
      for (const [index, copy] of copies)
        if (index >= total) copy.visible = false;
      sourceCases.forEach((item, index) => {
        item.group.visible = index < Math.ceil(total / 12);
        const pose =
          index < current
            ? cookwareEmptySlot(index)
            : index > current
              ? cookwareSourceSlot(index)
              : state.crate;
        item.group.position.set(pose.x, pose.y, pose.z);
        for (const flap of item.flaps)
          flap.group.rotation[flap.axis] =
            3 *
            flap.open *
            (index < current ? 1 : index > current ? 0 : state[flap.kind]);
      });
      dock.update({
        support: 1.195,
        showTool: true,
        active: true,
        pose: {
          x: state.carrier.x,
          z: state.carrier.z,
          bottom: state.carrier.y,
          width: 1.49,
          depth: 1.49,
          extension: state.extension,
        },
      });
      opener.update(state);
      head.position.set(state.head.x, state.head.y, state.head.z);
      carriage.position.x = state.head.x;
      const bottom = state.head.y + 0.05;
      rod.position.set(state.head.x, (bottom + 4.61) / 2, state.head.z);
      rod.scale.y = Math.max(0.001, 4.61 - bottom);
      return cell.part ? state.material : null;
    },
    dispose() {
      dock.dispose();
      sourceCases.forEach((c) => c.dispose());
      group.traverse((o) => o.geometry?.dispose());
      group.removeFromParent();
    },
  };
}
