import { buildWarehouseRack } from "./warehouse.js";
import { buildWarehouseRoom } from "./warehouse-room.js";
import {
  demandWarehouseSlots,
  demandWarehouseSlot,
  demandStoragePose,
  warehouseBoxSize,
  orderStagingSlot,
  orderTruckSlot,
  getOrderPickPose,
  getOrderShipPose,
  beverageStorageState,
  WAREHOUSE_DOCK_X,
} from "./warehouse-logistics.js";
import { buildTruckDock } from "./industries/truck-dock.js";
import { buildBottleCase, caseSealPose } from "./industries/bottle-cases.js";
const point = (x, y, z) => ({ x, y, z });
export function buildDemandWarehouse({
  THREE,
  root,
  materials: m,
  environment = "cookware",
  circuit = false,
}) {
  const continuous = circuit && environment === "beverages";
  const group = new THREE.Group();
  root.add(group);
  group.position.y = continuous ? 0 : 0.025;
  group.name = "Armazém e pedidos • estoque real permanente";
  const own = new Set(),
    labels = [];
  function box(parent, x, y, z, w, h, d, material = m.steel) {
    const geo = new THREE.BoxGeometry(w, h, d);
    own.add(geo);
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function cyl(parent, x, y, z, r, h, material = m.steel) {
    const geo = new THREE.CylinderGeometry(r, r, h, 16);
    own.add(geo);
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function bar(parent, a, b, r, material = m.steel) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av),
      o = cyl(
        parent,
        ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
        r,
        v.length(),
        material,
      );
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return o;
  }
  function label(text, x, y, z, w = 1.4, h = 0.3) {
    const canvas = globalThis.document?.createElement("canvas");
    let mat = m.white;
    if (canvas) {
      canvas.width = 768;
      canvas.height = 160;
      const c = canvas.getContext("2d");
      if (c) {
        c.fillStyle = "#e8eef4";
        c.fillRect(0, 0, 768, 160);
        c.fillStyle = "#164193";
        c.font = "bold 48px Segoe UI";
        c.textAlign = "center";
        c.fillText(text, 384, 105, 740);
        const t = new THREE.CanvasTexture(canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        mat = new THREE.MeshBasicMaterial({ map: t });
        labels.push(t, mat);
      }
    }
    const o = box(group, x, y, z, w, h, 0.035, mat);
    o.name = text;
    o.userData.physicalSign = true;
    return o;
  }
  const floorMat = new THREE.MeshStandardMaterial({
    color: "#9b9d9d",
    roughness: 0.32,
    metalness: 0.08,
  });
  labels.push(floorMat);
  box(group,55.25,-.04,0,49.5,.08,4,floorMat).name="Via de entrada e saída dos caminhões";
  const room=buildWarehouseRoom({THREE,root:group});
  room.setCutaway(true);
  for (const z of [-7.4, 7.4])
    box(group, 3, 0.004, z, 26, 0.006, 0.05, m.yellow);
  for (const x of [-6.5, 6.5])
    box(group, x, 0.004, 0, 0.05, 0.006, 15, m.yellow);
  const slots = demandWarehouseSlots(),
    rack = buildWarehouseRack(
      { THREE, root: group, box, materials: m },
      slots.map((s) => ({ ...s, id: s.label, palletProfile:'low' })),
    );
  const fixed = [...rack.fixed,...room.solids];
  const staging = Array.from({ length: 3 }, (_, i) => {
    const s = orderStagingSlot(i);
    const r = buildWarehouseRack({ THREE, root: group, box, materials: m }, [
      {
        id: `SEP-${i + 1}`,
        x: s.x,
        y: s.y,
        z: s.z,
        width: 1.7,
        depth: 2.8,
        height: 0.18,
        railOffset: 0.58,
        forkClearance: true,
      },
    ]);
    fixed.push(...r.fixed);
    return r;
  });
  label("RECEBIMENTO DA PRODUÇÃO", -5.6, 2.4, -1.7, 3.3, 0.35);
  label("ESTOQUE A", 0, 6.0, -5.3, 2.5, 0.4);
  label("ESTOQUE B", 0, 6.0, 5.3, 2.5, 0.4);
  label("SEPARAÇÃO E CONFERÊNCIA", 10.6, 2.6, -1.9, 4.4, 0.35);
  label("DOCA • EXPEDIÇÃO POR PEDIDO", 20.1, 3.6, -2.0, 4.4, 0.35);
  // Incoming belt has an open central fork lane; packages rest on roller tops.
  const incomingRollers = [];
  const beltStart = continuous ? -7.42 : -8.9;
  const firstRoller = continuous ? -7.3 : -8.5;
  const beltEnd = 1.1;
  for (const z of [-1.45, 1.45]) {
    box(group, (beltStart + beltEnd) / 2, 1.05, z, beltEnd - beltStart, 0.16, 0.12, m.dark);
    for (const x of [continuous ? firstRoller : -8, -5, -2, 0.8])
      box(group, x, 0.5, z, 0.1, 1, 0.1, m.steel);
  }
  for (let x = firstRoller; x < 1; x += 0.3) {
    if (Math.abs(x) < 0.36) continue;
    const roller = cyl(group, x, 1.125, 0, 0.075, 2.8, m.steel);
    roller.rotation.x = Math.PI / 2;
    incomingRollers.push(roller);
  }
  const banks = [-1, 1].map((sign, bank) => {
    const mast = sign * 2.7;
    for (const z of [mast - 0.22, mast + 0.22])
      box(group, 7.2, 0.08, z, 28, 0.12, 0.08, m.steel);
    const carriage = new THREE.Group();
    group.add(carriage);
    carriage.name = `Carro ${bank ? "B" : "A"} sobre trilhos`;
    box(carriage, 0, 0.34, mast, 1.9, 0.2, 0.6, m.blue);
    for (const dx of [-0.8, 0.8])
      for (const z of [mast - 0.22, mast + 0.22]) {
        const w = cyl(carriage, dx, 0.21, z, 0.07, 0.07, m.dark);
        w.rotation.x = Math.PI / 2;
      }
    for (const dx of [-0.9, 0.9])
      box(carriage, dx, 3.2, mast, 0.1, 5.6, 0.1, m.blue);
    box(carriage, 0, 6, mast, 2, 0.12, 0.2, m.steel);
    const lift = new THREE.Group();
    carriage.add(lift);
    box(lift, 0, -0.1, mast, 1.85, 0.12, 0.2, m.blue);
    const forks = [-0.2, 0.2].map((dx) =>
      box(lift, dx, -0.004, 0, 0.11, 0.008, 1, m.steel),
    );
    for (const dx of [-0.2, 0.2])
      box(lift, dx, -0.06, mast, 0.11, 0.12, 0.1, m.steel);
    const ram = cyl(carriage, 0.62, 1, mast, 0.035, 1, m.steel);
    function update(p, size, forkDepth = size.depth+.12) {
      carriage.position.x=p.x; lift.position.y=p.y;
      const start=Math.min(mast,p.z-forkDepth/2),end=Math.max(mast,p.z+forkDepth/2),length=Math.max(.03,end-start);
      forks.forEach((f) => {
        f.position.z = (start + end) / 2;
        f.scale.z = length;
      });
      ram.position.y = (0.45 + p.y - 0.16) / 2;
      ram.scale.y = Math.max(0.02, p.y - 0.61);
    }
    update(point(0, 1.155, mast), { depth: 2.4 }, .1);
    return { carriage, lift, forks, update };
  });
  const dock = buildTruckDock(
    { THREE, root: group, box, cyl, bar, materials: m },
    { shipping: true, stageId: "shipping", x: WAREHOUSE_DOCK_X },
  );
  const truckRestX = dock.truck.position.x;
  // Fork channels in both directions prevent either set of forks crossing a deck plate.
  for (const o of [...dock.lift.children])
    if (o.geometry?.parameters.width === 3.4) {
      o.geometry.dispose();
      o.removeFromParent();
    }
  const sectionsX = [
      [-1.7, -0.27],
      [-0.13, 0.13],
      [0.27, 1.7],
    ],
    sectionsZ = [
      [-1.56, -0.28],
      [-0.16, 0.16],
      [0.28, 1.56],
    ];
  for (const [x0, x1] of sectionsX)
    for (const [z0, z1] of sectionsZ)
      box(
        dock.lift,
        4.1 + (x0 + x1) / 2,
        1.145,
        (z0 + z1) / 2,
        x1 - x0,
        0.1,
        z1 - z0,
        m.steel,
      );
  const cargoSupports = Array.from({ length: 3 }, (_, i) =>
    [-1, 1].map((side) => {
      const s = orderTruckSlot(i);
      return box(group, s.x, 1.1975, side * 0.55, 1.5, 0.005, 0.1, m.steel);
    }),
  );
  const stored = new Map();
  let incoming = null,
    lastIncomingKey = "",
    sealer = null,
    lastTruckOrder = null,
    lastFlow = null;
  function closedBox(record) {
    if(record.product==='juice'||record.product==='water'){
      const physical=buildBottleCase({THREE,box,materials:m,product:{id:record.product,name:record.product==='water'?'Água • 350 mL':'Suco • 500 mL'}},group,0);
      physical.update(1,record.quantity);const g=physical.group;
      const mat=new THREE.MeshStandardMaterial({color:'#164193'});labels.push(mat);
      const marker=box(g,0,.7,.734,.22,.12,.006,mat);
      g.userData={inventoryId:record.id,product:record.product,marker,physicalCase:physical};return g;
    }
    const g = new THREE.Group(),
      size = warehouseBoxSize(record.product);
    g.name = `${record.id} • ${record.product}`;
    box(g, 0, size.height / 2, 0, size.width, size.height, size.depth, m.box);
    box(g, 0, size.height + 0.008, 0, 0.1, 0.012, size.depth, m.tape);
    const paper = box(
      g,
      0.15,
      size.height + 0.018,
      0.15,
      0.3,
      0.008,
      0.28,
      m.white,
    );
    const statusMat = new THREE.MeshStandardMaterial({ color: "#164193" });
    labels.push(statusMat);
    const marker = box(
      g,
      0,
      size.height * 0.65,
      size.depth / 2 + 0.004,
      0.22,
      0.12,
      0.006,
      statusMat,
    );
    g.userData = { inventoryId: record.id, product: record.product, marker };
    group.add(g);
    return g;
  }
  function buildIncoming(product, quantity = 1) {
    if (environment !== "beverages")
      return closedBox({ id: "incoming", product });
    const productInfo = {
      id: product,
      name: product === "water" ? "Água • 350 mL" : "Suco • 500 mL",
    };
    const result = buildBottleCase(
      { THREE, box, materials: m, product: productInfo },
      group,
      0,
    );
    const glass = new THREE.MeshStandardMaterial({
      color: "#bad4dd",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      roughness: 0.2,
    });
    labels.push(glass);
    const liquid = new THREE.MeshStandardMaterial({
      color: product === "water" ? "#7fcee8" : "#efa638",
    });
    labels.push(liquid);
    for (let i = 0; i < quantity; i++) {
      const x = ((i % 3) - 1) * 0.43,
        z = (Math.floor(i / 3) - 1) * 0.43;
      const body = cyl(result.group, x, 0.49, z, 0.17, 0.9, glass);
      cyl(result.group, x, 0.47, z, 0.145, 0.84, liquid);
      cyl(result.group, x, 1.075, z, 0.085, 0.07, m.blue);
      body.name = "Garrafa processada dentro da caixa";
    }
    result.group.userData.incomingCase = result;
    return result.group;
  }
  function createSealer() {
    const frame = new THREE.Group();
    frame.position.x = -4.35;
    group.add(frame);
    frame.name = "Fechadora e identificação acionadas";
    for (const x of [-1.1, 1.1])
      for (const z of [-1.7, 1.7])
        box(frame, x, 1.75, z, 0.12, 3.5, 0.12, m.blue);
    for (const z of [-1.7, 1.7])
      box(frame, 0, 3.5, z, 2.32, 0.12, 0.12, m.steel);
    for (const x of [-1.1, 1.1])
      box(frame, x, 3.5, 0, 0.12, 0.12, 3.5, m.steel);
    for (const z of [-1.02, 1.02])
      box(frame, 0, 2.42, z, 2.3, 0.08, 0.08, m.steel);
    const arms = [], drives = [];
    for (const side of [-1, 1])
      for (const minor of [true, false]) {
        const pivot = new THREE.Group();
        pivot.position.set(
          minor ? side * 0.755 : 0,
          1.2 + (minor ? 1.195 : 1.22),
          minor ? 0 : side * 0.755,
        );
        frame.add(pivot);
        const edge = 0.84,
          normal = 0.05;
        if (minor) {
          box(pivot, -side * 0.34, normal, edge, 0.68, 0.04, 0.05, m.steel);
          box(pivot, -side * 0.65, normal, 0.75, 0.08, 0.04, 0.22, m.dark);
          const drive = cyl(
            frame,
            side * 0.755,
            1.2 + 1.195,
            0.9,
            0.05,
            0.18,
            m.blue,
          );
          drive.rotation.x = Math.PI / 2;
          drives.push({ mesh: drive, y: drive.position.y });
        } else {
          box(pivot, edge, normal, -side * 0.34, 0.05, 0.04, 0.68, m.steel);
          box(pivot, 0.76, normal, -side * 0.65, 0.22, 0.04, 0.08, m.dark);
          const drive = cyl(
            frame,
            0.94,
            1.2 + 1.22,
            side * 0.755,
            0.05,
            0.18,
            m.blue,
          );
          drive.rotation.z = Math.PI / 2;
          drives.push({ mesh: drive, y: drive.position.y });
        }
        arms.push({ pivot, minor, side, y: pivot.position.y });
      }
    const roller = cyl(frame, -0.65, 3.32, 0, 0.09, 0.14, m.dark);
    roller.rotation.x = Math.PI / 2;
    const rod = cyl(frame, 0, 3.4, 0, 0.025, 1, m.steel);
    const head = box(frame, 0.25, 2.9, 1.3, 0.4, 0.06, 0.32, m.steel),
      paper = box(frame, 0.25, 2.866, 1.3, 0.38, 0.006, 0.3, m.white);
    return {
      frame,
      update(t, incomingOnBelt = false) {
        const p = caseSealPose(t),
          returnArms = Math.max(0, Math.min(1, (t - 0.94) / 0.06));
        // In the joined line the open carton approaches sideways along X.
        // Keep the folding paddles above its envelope until it is centred.
        const clamp = (value) => Math.max(0, Math.min(1, value));
        const lift = continuous
          ? 0.95 * (incomingOnBelt ? 1 : 1 - clamp(t / 0.04) + clamp((t - 0.97) / 0.03))
          : 0;
        for (const drive of drives) drive.mesh.position.y = drive.y + lift;
        for (const a of arms) {
          a.pivot.position.y = a.y + lift;
          const amount = 1 - p[a.minor ? "minor" : "major"] + returnArms;
          const angle =
            (((a.minor ? -a.side : a.side) * Math.PI) / 2) *
            Math.min(1, amount);
          a.pivot.rotation[a.minor ? "z" : "x"] = angle;
        }
        const lower = Math.max(0, Math.min(1, (t - 0.6) / 0.05)),
          raise = Math.max(0, Math.min(1, (t - 0.82) / 0.08)),
          back = Math.max(0, Math.min(1, (t - 0.9) / 0.1));
        roller.position.set(
          -0.65 + 1.3 * p.tape * (1 - back),
          2.524 + 0.8 * (1 - lower) + 0.8 * raise,
          0,
        );
        rod.position.set(
          roller.position.x,
          (roller.position.y + 0.09 + 3.44) / 2,
          0,
        );
        rod.scale.y = Math.max(0.02, 3.44 - roller.position.y - 0.09);
        const approach = Math.max(0, Math.min(1, (t - 0.84) / 0.06)),
          press = Math.max(0, Math.min(1, (t - 0.9) / 0.03)),
          retreat = Math.max(0, Math.min(1, (t - 0.93) / 0.07));
        head.position.set(
          0.25,
          2.9 - (2.9 - 2.478) * press * (1 - retreat),
          1.3 - (1.3 - 0.29) * approach * (1 - retreat),
        );
        paper.position.copy(head.position);
        paper.position.y -= 0.034;
        paper.visible = t < 0.93;
      },
    };
  }
  if (environment === "beverages") {
    sealer = createSealer();
    sealer.update(0, continuous);
  }
  let previousBeltCase;
  function activeIncoming(snapshot) {
    if (environment === "beverages")
      return beverageStorageState(snapshot, { circuit: continuous });
    const cell = snapshot.cells?.find((c) => c.id === "finished");
    if (!cell?.unit) return null;
    return {
      unit: cell.unit,
      quantity: 1,
      pose: demandStoragePose(cell, cell.unit.product),
      closing: 1,
    };
  }
  function position(g, p) {
    g.position.set(p.x, p.y, p.z);
  }
  return {
    get incoming(){return incoming;},
    group,
    rack,
    room,
    slots,
    banks,
    dock,
    stored,
    fixed,
    staging,
    update(snapshot) {
      const inv = snapshot.inventory ?? { boxes: [], orders: [] },
        flow = snapshot.fulfillment;
      const currentShip =
        flow?.action === "ship"
          ? flow.orderId
          : [...inv.orders]
              .reverse()
              .find((o) => o.status === "shipping" || o.status === "shipped")
              ?.id;
      const previousShip = [...inv.orders]
        .reverse()
        .find((o) => o.status === "shipped" && o.id !== currentShip)?.id;
      let movement = null,
        completedFlow = null;
      if (flow?.box) {
        movement =
          flow.action === "pick"
            ? getOrderPickPose(flow.progress, flow.box, flow.index)
            : getOrderShipPose(flow.progress, flow.box, flow.index);
        lastFlow = { ...flow };
      } else if (lastFlow) {
        completedFlow = lastFlow;
        movement =
          lastFlow.action === "pick"
            ? getOrderPickPose(1, lastFlow.box, lastFlow.index)
            : getOrderShipPose(1, lastFlow.box, lastFlow.index);
        lastFlow = null;
      }
      const truckOrder =
        movement &&
        !movement.truckNew &&
        (flow ?? completedFlow)?.action === "ship" &&
        (flow ?? completedFlow)?.index === 0
          ? previousShip
          : currentShip;
      lastTruckOrder = truckOrder ?? lastTruckOrder;
      dock.truck.position.x = truckRestX + (movement?.truckOffset ?? 0);
      cargoSupports.forEach((row) =>
        row.forEach(
          (o) =>
            (o.position.x =
              orderTruckSlot(cargoSupports.indexOf(row)).x +
              (movement?.truckOffset ?? 0)),
        ),
      );
      const src = activeIncoming(snapshot),
        key = src?.unit
          ? `${src.unit.id}/${src.unit.product}/${src.quantity}`
          : "";
      if (continuous) {
        const p = src?.pose?.material;
        const onBelt = p?.z === 0 && p.y === 1.2 && p.x <= 0;
        if (onBelt && snapshot.running && previousBeltCase?.key === key) {
          const travel = Math.max(0, p.x - previousBeltCase.x);
          if (travel > 0) for (const roller of incomingRollers) roller.rotateY(-travel / 0.075);
        }
        previousBeltCase = onBelt ? { key, x: p.x } : undefined;
      }
      if (src?.pose) {
        if (key !== lastIncomingKey) {
          if (incoming) {
            incoming.userData.incomingCase?.dispose();
            incoming.traverse((o) => {
              o.geometry?.dispose();
              own.delete(o.geometry);
            });
            incoming.removeFromParent();
          }
          incoming = buildIncoming(src.unit.product, src.quantity);
          lastIncomingKey = key;
        }
        position(incoming, src.pose.material);
        incoming.visible = true;
        incoming.userData.incomingCase?.update(src.closing, src.quantity);
        sealer?.update(src.closing, snapshot.phase === "moving");
        banks[
          src.pose.bank ?? demandWarehouseSlot(src.unit.warehouseAddress).bank
        ].update(src.pose.carriage, warehouseBoxSize(src.unit.product), src.pose.forkDepth ?? .1);
      } else if (incoming) incoming.visible = false;
      const live = new Set();
      for (const record of inv.boxes) {
        const visible =
          record.status !== "shipped" || record.orderId === lastTruckOrder;
        if (!visible) continue;
        live.add(record.id);
        if (!stored.has(record.id)) stored.set(record.id, closedBox(record));
        const g = stored.get(record.id),
          order = inv.orders.find((o) => o.id === record.orderId),
          index = Math.max(0, order?.boxIds.indexOf(record.id) ?? 0);
        let p = demandWarehouseSlot(record.address);
        if (["picked", "checked", "shipping"].includes(record.status))
          p = orderStagingSlot(index);
        if (record.status === "shipped")
          p = {
            ...orderTruckSlot(index),
            x: orderTruckSlot(index).x + (movement?.truckOffset ?? 0),
          };
        if (flow?.boxId === record.id && movement) p = movement.material;
        position(g, p);
        g.visible = true;
        g.userData.marker.material.color.set(
          record.status === "available"
            ? "#164193"
            : record.status === "reserved"
              ? "#e7490f"
              : "#41816f",
        );
      }
      for (const [id, g] of stored)
        if (!live.has(id)) {
          g.traverse((o) => {
            o.geometry?.dispose();
            own.delete(o.geometry);
          });
          g.userData.physicalCase?.dispose();
          g.userData.marker?.material.dispose();
          g.removeFromParent();
          stored.delete(id);
        }
      if (movement) {
        if (!src?.pose || ((flow ?? completedFlow)?.progress ?? 1) > 0)
          banks[movement.bank].update(
            movement.carriage,
            warehouseBoxSize((flow ?? completedFlow).box.product),
            movement.forkDepth ?? .1,
          );
        dock.update({
          support: 1.2,
          active: movement.dockVisible,
          showTool: movement.dockVisible,
          pose: movement.dockVisible
            ? {
                x: movement.dock.x,
                y: movement.dock.y,
                bottom: movement.dock.y,
                z: movement.dock.z,
                width: warehouseBoxSize((flow ?? completedFlow).box.product)
                  .width,
                depth: warehouseBoxSize((flow ?? completedFlow).box.product)
                  .depth,
              }
            : undefined,
        });
      }
    },
    dispose() {
      room.dispose();
      rack.dispose();
      staging.forEach((s) => s.dispose());
      dock.dispose();
      incoming?.userData.incomingCase?.dispose();
      own.forEach((g) => g.dispose());
      labels.forEach((o) => o.dispose());
      group.removeFromParent();
    },
  };
}
