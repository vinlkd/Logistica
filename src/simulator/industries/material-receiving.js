import { buildCookwareReceiving } from "./cookware-receiving.js";
import { buildBottleReceiving } from "./bottle-receiving.js";
import { buildTruckDock } from "./truck-dock.js";
import {
  materialCapacity,
  materialCrateSlot,
  materialCratePose,
  materialSlot,
  materialReceivingPose,
  buildOpenMaterialCrate,
} from "../material-crates.js";
export function buildMaterialReceiving(
  args,
  { kind = "bottles", createCopy, centerZ = 0 } = {},
) {
  if (kind === "bottles") return buildBottleReceiving(args, { createCopy });
  if (kind === "discs") return buildCookwareReceiving(args);
  const { THREE, root, box, cyl, materials: m, definition } = args,
    x = definition?.steps?.[0]?.x ?? 0,
    stageId = definition?.steps?.[0]?.id ?? "receiving";
  const group = new THREE.Group();
  group.name = "Caixas de materiais • recebimento";
  group.position.x = x;
  root.add(group);
  const dock = buildTruckDock(
    { ...args, root: group },
    { shipping: false, stageId, x: 0, z: centerZ, outwardDoors: true },
  );
  const crates = Array.from({ length: 6 }, (_, index) =>
    buildOpenMaterialCrate(args, group, `Caixa de materiais ${index + 1}`, {
      kind,
    }),
  );
  const copies = new Map();
  // External handling and empty-box parking are outside the cargo body.
  const edge = centerZ + 1.56;
  box(group, -4.1, 1.145, (edge + 3.8) / 2, 3.4, 0.1, 3.8 - edge, m.steel);
  box(group, -9.1, 1.145, 3, 6.6, 0.1, 1.6, m.steel);
  for (const at of [-5.55, -3.05])
    for (const z of [-1.95, 3.6])
      box(group, at, 0.5475, z, 0.1, 1.095, 0.1, m.steel);
  for (const at of [-12.2, -10.5, -8, -6])
    for (const z of [2.3, 3.7])
      box(group, at, 0.5475, z, 0.1, 1.095, 0.1, m.steel);
  for (const at of [-6.7, 0.7])
    for (const z of [-2, 2])
      box(group, at, 2.325, z, 0.12, 4.65, 0.12, m.accent ?? m.blue);
  for (const z of [-2, 2]) box(group, -3, 4.65, z, 7.52, 0.08, 0.08, m.steel);
  const bridge = box(group, -4.1, 4.65, 0, 0.14, 0.08, 4.08, m.steel),
    head = new THREE.Group();
  group.add(head);
  head.name =
    kind === "discs"
      ? "Eletroímã retira disco de dentro da caixa"
      : "Pinça retira garrafa de dentro da caixa";
  let offset;
  const jaws = [];
  if (kind === "discs") {
    cyl(head, 0, 0.05, 0, 0.25, 0.05, m.dark);
    offset = 0.075;
  } else {
    box(head, 0, 1.1, 0, 0.3, 0.1, 0.26, m.steel);
    for (const side of [-1, 1])
      jaws.push(box(head, side * 0.1, 0.925, 0, 0.06, 0.12, 0.1, m.dark));
    offset = 1.15;
  }
  const rod = cyl(group, -4.1, 3, 0, 0.025, 1, m.steel);
  let selected = stageId;
  return {
    group,
    dock,
    crates,
    copies,
    head,
    rod,
    selectStage(id) {
      selected = id;
    },
    update(s) {
      const panel = kind === "discs",
        total = panel
          ? (s.done ?? 0) + (s.queue ?? 0) + (s.part ? 1 : 0)
          : (s.bottleTotal ?? s.total ?? 12),
        done = s.done ?? 0;
      const atInput = panel ? true : s.step?.id === stageId;
      const received = panel
        ? !!s.part && s.phase !== "feeding"
        : !!s.unit?.received ||
          !!s.completedSteps?.includes(stageId) ||
          (!atInput && !!s.unit);
      const receiving = panel
        ? s.phase === "feeding"
        : atInput && ["moving", "operating"].includes(s.phase);
      const progress = panel
        ? receiving
          ? Math.min(1, s.progress / 0.5)
          : received
            ? 1
            : 0
        : receiving
          ? s.phase === "moving"
            ? 0.15 * s.progress
            : 0.15 + 0.85 * s.progress
          : received
            ? 1
            : 0;
      const state = {
        kind,
        total,
        done,
        progress,
        receiving,
        received,
        centerZ,
      };
      const p = materialReceivingPose(state),
        capacity = materialCapacity(kind),
        activeInput = panel ? !!s.part : atInput && !received;
      group.visible = panel || !args.stationView || selected === stageId;
      crates.forEach((crate, index) => {
        crate.visible = index < Math.ceil(total / capacity);
        const pose = materialCratePose(index, state);
        crate.position.set(pose.x, pose.y, pose.z);
      });
      for (let index = 0; index < total; index++) {
        if (!copies.has(index)) {
          let copy;
          if (kind === "discs")
            copy = cyl(
              crates[Math.floor(index / capacity)],
              0,
              0,
              0,
              0.62,
              0.025,
              m.steel,
            );
          else {
            copy = createCopy({
              ...definition.initialize(args.product),
              id: `MAT-${index + 1}`,
              volume: 0,
              capped: false,
              labeled: false,
            });
            crates[Math.floor(index / capacity)].add(copy);
          }
          copies.set(index, copy);
        }
        const copy = copies.get(index),
          slot = materialSlot(index, total, kind);
        copy.position.set(
          slot.x,
          slot.y + (kind === "discs" ? 0.0125 : 0),
          slot.z,
        );
        copy.visible =
          index >= done + (received ? 1 : 0) &&
          !(index === done && activeInput);
      }
      for (const [index, copy] of copies)
        if (index >= total) copy.visible = false;
      const smooth = (v) => {
        v = Math.max(0, Math.min(1, v));
        return v * v * (3 - 2 * v);
      };
      const pulling = receiving && done % capacity === 0 && progress < 0.41,
        source = materialCrateSlot(p.caseIndex, centerZ);
      let carrier = { x: -5.65, z: 0, bottom: 4.2 };
      if (pulling) {
        if (progress < 0.12) {
          carrier = {
            x:
              -5.65 +
              (source.x + 1.3 + 5.65) * smooth(progress / 0.04) -
              1.3 * smooth((progress - 0.08) / 0.04),
            z: source.z * smooth(progress / 0.04),
            bottom: 4.2 - 3 * smooth((progress - 0.04) / 0.04),
          };
        } else if (progress < 0.33) carrier = { ...p.crate, bottom: 1.2 };
        else
          carrier = {
            x: -4.1 - 1.55 * smooth((progress - 0.33) / 0.04),
            z: 0,
            bottom: 1.2 + 3 * smooth((progress - 0.37) / 0.04),
          };
      }
      dock.update({
        pose: { ...carrier, width: 1.46, depth: 1.46, cableClearance: 0.03 },
        support: 1.195,
        active: pulling,
        showTool: true,
      });
      const gap =
        progress < 0.35
          ? 0.06
          : progress < 0.46
            ? 0.06 * (1 - smooth((progress - 0.35) / 0.11))
            : progress < 0.84
              ? 0
              : 0.06 * smooth((progress - 0.84) / 0.02);
      jaws.forEach(
        (jaw, index) => (jaw.position.x = (index ? 1 : -1) * (0.1 + gap)),
      );
      head.position.set(p.tool.x, p.tool.y, p.tool.z);
      bridge.position.x = p.tool.x;
      const bottom = p.tool.y + offset;
      rod.position.set(p.tool.x, (bottom + 4.61) / 2, p.tool.z);
      rod.scale.y = 4.61 - bottom;
      head.visible = rod.visible = true;
      const material = {
        x: p.material.x + x,
        y: p.material.y - (kind === "discs" ? 0.21 : 0),
        z: p.material.z,
      };
      return activeInput ? material : null;
    },
    dispose() {
      dock.dispose();
      group.traverse((o) => o.geometry?.dispose());
      group.removeFromParent();
    },
  };
}
