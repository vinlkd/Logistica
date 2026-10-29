import { buildTruck } from "../trucks.js";
import { getLayout } from "../kinematics.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
export const dockEase = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
// Reuse the cookware truck at its original scale. Only the separate handling
// equipment is replaced; the body, cab, doors, wheels and finishes are untouched.
export function buildTruckDock(
  args,
  {
    shipping,
    stageId,
    x = 0,
    z = 0,
    cradle = false,
    upperShelf = false,
    outwardDoors = false,
  },
) {
  const { THREE, root, box, cyl, bar, materials: m } = args,
    group = new THREE.Group();
  group.name = shipping
    ? "Caminhão e doca de expedição"
    : "Caminhão e doca de recebimento";
  group.position.set(x, 0, z);
  group.userData.stages = [stageId];
  root.add(group);
  const layout = getLayout("saucepan");
  layout.package = { ...layout.package, centerZ: 0 };
  const truckBox = (
    parent,
    x,
    y,
    z,
    w,
    h,
    d,
    material = m.blue,
    rounded = false,
  ) => {
    const mesh = new THREE.Mesh(
      rounded
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(0.06, w / 5, h / 5, d / 5),
          )
        : new THREE.BoxGeometry(w, h, d),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const truckCyl = (parent, x, y, z, r, h, material = m.steel) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 32),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const truckBar = (parent, a, b, r, material = m.steel) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av),
      mesh = truckCyl(
        parent,
        ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
        r,
        v.length(),
        material,
      );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      v.normalize(),
    );
    return mesh;
  };
  const model = buildTruck({
    THREE,
    root: group,
    box: truckBox,
    cyl: truckCyl,
    bar: truckBar,
    m,
    shipping,
    layout,
    outwardDoors,
  });
  // The original cargo rails and dock lift belong to the cookware load. Keep
  // its complete vehicle and fit forks to the different cargo dimensions.
  for (const child of [...group.children])
    if (child !== model.truck) {
      child.traverse((o) => o.geometry?.dispose());
      child.removeFromParent();
    }
  for (const child of [...model.truck.children])
    if (
      child.geometry?.parameters?.width === 6.65 &&
      child.geometry.parameters.height === 0.07
    ) {
      child.geometry.dispose();
      child.removeFromParent();
    }
  const direction = shipping ? 1 : -1,
    deck = 1.195,
    lift = new THREE.Group();
  group.add(lift);
  box(lift, direction * 4.1, deck - 0.05, 0, 3.4, 0.1, 3.12, m.steel);
  for (const side of [-1, 1]) {
    box(group, direction * 4.1, 0.1, side * 1.73, 0.8, 0.2, 0.25, m.dark);
    box(group, direction * 4.1, 0.65, side * 1.73, 0.12, 1.1, 0.12, m.steel);
  }
  const stems = [-1, 1].map((side) =>
    box(group, direction * 4.1, 0.65, side * 1.73, 0.065, 1, 0.065, m.steel),
  );
  const transfer = new THREE.Group();
  group.add(transfer);
  transfer.name = "Garfos telescópicos sob a carga";
  const forks = [-1, 1].map((side) =>
    box(transfer, 0, -0.002, side * 0.22, 1, 0.004, 0.08, m.steel),
  );
  const cradleFeet = cradle
    ? [-1, 1].map((side) => ({
        side,
        pad: box(transfer, side * 0.82, 0.03, 0, 0.03, 0.06, 0.58, m.steel),
        blades: [-1, 1].map((z) =>
          box(
            transfer,
            side * 0.79,
            -0.002,
            z * 0.22,
            0.04,
            0.004,
            0.08,
            m.steel,
          ),
        ),
      }))
    : [];
  if (cradle)
    for (const fork of forks) {
      fork.geometry.dispose();
      fork.removeFromParent();
    }
  const hoist = new THREE.Group();
  group.add(hoist);
  hoist.name = "Ponte interna de descarga abaixo do teto";
  if (!shipping)
    for (const side of [-1, 1])
      box(group, -6.2, 4.35, side * 1.51, 12.4, 0.08, 0.06, m.steel);
  const hoistBridge = box(hoist, 0, 4.35, 0, 0.14, 0.08, 3.08, m.steel);
  const hoistLong = box(hoist, 0, 4.35, 0, 1.8, 0.08, 0.08, m.steel);
  hoistLong.visible = cradle;
  const cables = [-1, 1].map((side) =>
    box(hoist, 0, 2, side * 0.45, 0.025, 1, 0.025, m.dark),
  );
  const bridge = box(
    group,
    direction * 1.2,
    deck - 0.05,
    0,
    2.4,
    0.1,
    1.45,
    m.dark,
  );
  for (const side of [-1, 1])
    for (const at of [0.3, 2.1])
      box(
        group,
        direction * at,
        0.5475,
        side * 0.69,
        0.08,
        1.095,
        0.08,
        m.steel,
      );
  if (upperShelf) {
    for (const lane of [-0.745, 0.805])
      for (const side of [-1, 1])
        box(
          group,
          direction * 9.19,
          2.493,
          lane + side * 0.55,
          6.58,
          0.004,
          0.08,
          m.steel,
        ).name = "Trilho da prateleira superior";
    for (const at of [6.1, 8.9, 11.8]) {
      for (const z of [-1.55, 0.03, 1.61]) {
        const bottom = z === 0.03 ? 1.195 : 1.325;
        box(
          group,
          direction * at,
          (bottom + 2.491) / 2,
          z,
          0.02,
          2.491 - bottom,
          0.02,
          m.steel,
        ).name = "Apoio entre as ruas de carga";
      }
      for (const [from, to] of [
        [-1.55, -1.295],
        [-0.195, 0.255],
        [1.355, 1.61],
      ])
        box(
          group,
          direction * at,
          2.493,
          (from + to) / 2,
          0.04,
          0.004,
          to - from,
          m.steel,
        ).name = "Travessa fora do percurso das pinças";
    }
  }
  return {
    group,
    truck: model.truck,
    lift,
    forks,
    transfer,
    hoist,
    cables,
    cradleFeet,
    update({ support = deck, pose, active = false, showTool = active } = {}) {
      lift.position.y = support - deck;
      stems.forEach((stem) => {
        stem.position.y = (0.2 + support - 0.1) / 2;
        stem.scale.y = Math.max(0.01, support - 0.3);
      });
      transfer.visible = showTool && !!pose;
      hoist.visible = !shipping && showTool && !!pose;
      if (pose) {
        const bottom = pose.bottom ?? support + 0.005;
        transfer.position.set(pose.x - x, bottom, pose.z - z);
        const span = shipping ? pose.x - x - direction * 4.1 : 0;
        forks.forEach((fork) => {
          fork.position.x = -span / 2;
          fork.scale.x = Math.abs(span) + Math.min(0.9, pose.width ?? 0.7);
        });
        hoistBridge.position.x = pose.x - x;
        hoistLong.position.set(pose.x - x, 4.35, pose.z - z);
        if (cradle) {
          const extension = Math.max(0, Math.min(1, pose.extension ?? 0));
          for (const foot of cradleFeet) {
            const length = 0.04 + 0.71 * extension;
            for (const blade of foot.blades) {
              blade.scale.x = length / 0.04;
              blade.position.x = foot.side * (0.81 - length / 2);
            }
          }
        }
        cables.forEach((cable, index) => {
          const cableBottom = bottom + (cradle ? 0.06 : 0);
          cable.position.set(
            pose.x - x + (cradle ? (index ? 1 : -1) * 0.82 : 0),
            (4.31 + cableBottom) / 2,
            pose.z -
              z +
              (cradle
                ? 0
                : (index ? 1 : -1) *
                  ((pose.depth ?? 0.78) / 2 + (pose.cableClearance ?? 0.045))),
          );
          cable.scale.y = 4.31 - cableBottom;
        });
      }
      bridge.visible = true;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      model.materials.forEach((material) => material.dispose());
      group.removeFromParent();
    },
  };
}
// Align on the wide dock before entering the rear opening. Height and lateral
// travel finish outside the body, so no cargo is ever lifted through its roof.
export function shippingDockPose(
  progress,
  slot,
  { x = 0, y = 1.2, z = 0 } = {},
) {
  const t = Math.max(0, Math.min(1, progress)),
    a = dockEase(t / 0.24),
    b = dockEase((t - 0.24) / 0.2),
    c = dockEase((t - 0.44) / 0.2),
    d = dockEase((t - 0.64) / 0.36);
  return {
    x: x + 4.1 * a + (slot.x - x - 4.1) * d,
    y: y + (slot.y - y) * c,
    z: z + (slot.z - z) * b,
    rotation: (slot.rotation ?? 0) * b,
  };
}
export function receivingDockPose(
  progress,
  slot,
  { x = 0, y = 1.2, z = 0, raise = 0.08 } = {},
) {
  const t = Math.max(0, Math.min(1, progress)),
    lift = dockEase(t / 0.12),
    pull = dockEase((t - 0.12) / 0.33),
    down = dockEase((t - 0.45) / 0.15),
    align = dockEase((t - 0.6) / 0.15),
    feed = dockEase((t - 0.75) / 0.25);
  return {
    x: slot.x + (x - 4.1 - slot.x) * pull + 4.1 * feed,
    y: slot.y + raise * lift + (y - slot.y - raise) * down,
    z: slot.z + (z - slot.z) * align,
    rotation: 0,
  };
}
