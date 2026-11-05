import { getLayout, CONVEYOR_TOP, CLEARANCE } from "./kinematics.js";
import {
  BEVERAGE_CIRCUIT_WAREHOUSE_ENTRY,
  BEVERAGE_CIRCUIT_SEALER_X,
  beverageCircuitCaseHandoff,
} from "./industries/beverage-circuit-layout.js";
export const ORDER_STAGING_CAPACITY = 3;
export const STORAGE_CAPACITY = 24;
export const STORAGE_TRANSPORT_Y = 2.75;
export const WAREHOUSE_DOCK_X = 16;
export const DEMAND_STORAGE_TIMES = [0.7, 8, 7, 0.6, 8];
export const DEMAND_BEVERAGE_STORAGE_DURATION = 7 + 2.8 + 24.3;
const SPEED = 1.6,
  VERTICAL = 1.2,
  PARK = CONVEYOR_TOP - 0.04;
const clamp = (t) => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * clamp(t);
const point = (x, y, z) => ({ x, y, z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function warehouseBoxSize(product) {
  if (product === "juice" || product === "water")
    return { width: 1.53, depth: 1.51, height: 1.2471, centerZ: 0 };
  return getLayout(product).package;
}
export function demandWarehouseSlot(address = "PA-01") {
  const i = Math.max(
    0,
    Math.min(23, (Number(String(address).replace(/\D/g, "")) || 1) - 1),
  );
  const bank = Math.floor(i / 12),
    local = i % 12,
    level = Math.floor(local / 4),
    column = local % 4;
  return {
    id: `PA-${String(i + 1).padStart(2, "0")}`,
    label: `${bank ? "B" : "A"}-${String(local + 1).padStart(2, "0")}`,
    index: i,
    bank,
    x: (column - 1.5) * 3.1,
    y: CONVEYOR_TOP + level * 1.45,
    z: bank ? 5.3 : -5.3,
    width: 2,
    depth: 2.8,
    height: 1.45,
    railOffset: 0.58,
    forkClearance: true,
  };
}
export const demandWarehouseSlots = () =>
  Array.from({ length: 24 }, (_, i) => demandWarehouseSlot(`PA-${i + 1}`));
export const orderStagingSlot = (index) =>
  point(8.5 + Math.max(0, Math.min(2, index)) * 2.1, 1.2, 0);
export const orderTruckSlot = (index) =>
  point(
    WAREHOUSE_DOCK_X + 11.3 - Math.max(0, Math.min(2, index)) * 1.6,
    1.2,
    0,
  );
function polyline(points, t) {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  let remain = clamp(t) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remain <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? clamp(remain / lengths[i]) : 1;
      return point(
        mix(points[i].x, points[i + 1].x, f),
        mix(points[i].y, points[i + 1].y, f),
        mix(points[i].z, points[i + 1].z, f),
      );
    }
    remain -= lengths[i];
  }
  return points[0];
}
export function demandStoragePose(cell, product) {
  if (!cell.onDemand || cell.id !== "finished" || !cell.unit) return null;
  const p = warehouseBoxSize(product.id ?? product),
    slot = demandWarehouseSlot(cell.unit.warehouseAddress);
  const aisle = slot.bank ? 2 : -2,
    belt = point(0, 1.2, p.centerZ),
    home = point(0, PARK, slot.bank ? 2.7 : -2.7),
    high = slot.y + 0.04;
  let material = { ...belt },
    carriage = { ...home },
    forkDepth = 0.1;
  const t = clamp(cell.stage?.progress ?? 0),
    step = cell.stage?.id;
  if (cell.phase === "processing") {
    if (step === "identify") {
      carriage.z = mix(home.z, p.centerZ, t);
      forkDepth = mix(0.1, p.depth + 0.12, t);
    }
    if (step === "raise") {
      forkDepth = p.depth + 0.12;
      const contact = point(0, belt.y, belt.z),
        transport = point(0, STORAGE_TRANSPORT_Y, belt.z);
      const points = [
        contact,
        transport,
        point(slot.x, transport.y, belt.z),
        point(slot.x, transport.y, aisle),
        point(slot.x, high, aisle),
      ];
      if (t < 0.06) {
        carriage = point(0, mix(PARK, belt.y, t / 0.06), belt.z);
      } else material = carriage = polyline(points, (t - 0.06) / 0.94);
    }
    if (step === "store") {
      const extend = clamp(t / 0.55),
        lower = clamp((t - 0.55) / 0.1),
        release = clamp((t - 0.65) / 0.07),
        back = clamp((t - 0.72) / 0.28);
      material = point(slot.x, high - 0.04 * lower, mix(aisle, slot.z, extend));
      carriage = point(
        slot.x,
        material.y - 0.02 * release,
        mix(material.z, aisle, back),
      );
      forkDepth = mix(p.depth + 0.12, 0.1, back);
    }
    if (step === "retrieve" || step === "lower") {
      material = point(slot.x, slot.y, slot.z);
      carriage = point(slot.x, slot.y - 0.02, aisle);
      if (step === "lower")
        carriage = polyline(
          [
            carriage,
            point(slot.x, STORAGE_TRANSPORT_Y, aisle),
            point(0, STORAGE_TRANSPORT_Y, aisle),
            point(0, STORAGE_TRANSPORT_Y, home.z),
            home,
          ],
          t,
        );
    }
  } else if (cell.phase === "unloading") {
    material = point(slot.x, slot.y, slot.z);
    carriage = home;
  } else if (cell.phase === "feeding") {
    material = point(
      -4.35 + 4.35 * clamp(cell.progress / 0.5),
      belt.y,
      p.centerZ,
    );
  }
  return {
    material,
    carriage,
    slot,
    bank: slot.bank,
    x: material.x,
    z: material.z - p.centerZ,
    y: material.y + 0.18,
    support: material.y - CLEARANCE,
    warehouseX: carriage.x,
    warehouseZ: carriage.z - p.centerZ,
    warehouseForkY: carriage.y,
    warehouseAddress: slot.id,
    forkDepth,
  };
}
function buildOrderPlan(action, box, index = 0) {
  const slot = demandWarehouseSlot(box.address),
    bank = slot.bank,
    aisle = bank ? 2 : -2,
    home = point(0, PARK, bank ? 2.7 : -2.7),
    stage = orderStagingSlot(index),
    dock = point(WAREHOUSE_DOCK_X + 4.1, 1.2, 0);
  let state = {
    material: action === "pick" ? point(slot.x, slot.y, slot.z) : stage,
    carriage: home,
    dock,
    bank,
    forkDepth: 0.1,
    holding: false,
    dockHolding: false,
    dockVisible: false,
    truckOffset: 0,
    truckNew: index > 0,
  };
  const start = structuredClone(state),
    segments = [];
  function add(id, duration, patch) {
    const from = structuredClone(state);
    state = { ...state, ...patch };
    segments.push({
      id,
      duration: Math.max(0.001, duration),
      from,
      to: structuredClone(state),
    });
  }
  function move(id, patch, speed = SPEED) {
    let d = 0;
    for (const key of ["material", "carriage", "dock"])
      if (patch[key]) d = Math.max(d, distance(state[key], patch[key]));
    add(id, Math.max(0.04, d / speed), patch);
  }
  const carry = (id, p, speed = SPEED) =>
    move(id, { material: p, carriage: p }, speed);
  function emptyHome() {
    move(
      "emptyToTransport",
      {
        carriage: point(
          state.carriage.x,
          STORAGE_TRANSPORT_Y,
          state.carriage.z,
        ),
      },
      VERTICAL,
    );
    move("emptyToAisle", {
      carriage: point(state.carriage.x, STORAGE_TRANSPORT_Y, aisle),
    });
    move("emptyToCentre", { carriage: point(0, STORAGE_TRANSPORT_Y, aisle) });
    move("emptyRetract", { carriage: point(0, STORAGE_TRANSPORT_Y, home.z) });
    move("emptyPark", { carriage: home }, VERTICAL);
  }
  const source = state.material;
  if (action === "ship" && index === 0) {
    add("departPreviousTruck", 2, { truckOffset: 40 });
    add("exchangeOutsideView", 0.05, { truckNew: true });
    add("dockNewTruck", 2, { truckOffset: 0 });
  }
  move(
    "approachTransport",
    { carriage: point(0, STORAGE_TRANSPORT_Y, home.z) },
    VERTICAL,
  );
  move("approachColumn", {
    carriage: point(source.x, STORAGE_TRANSPORT_Y, home.z),
  });
  move("approachAisle", {
    carriage: point(source.x, STORAGE_TRANSPORT_Y, aisle),
  });
  move(
    "approachHeight",
    { carriage: point(source.x, source.y - 0.02, aisle) },
    VERTICAL,
  );
  move("extendUnderBox", {
    carriage: point(source.x, source.y - 0.02, source.z),
    forkDepth: warehouseBoxSize(box.product).depth + 0.12,
  });
  move("contactBase", { carriage: { ...source } }, VERTICAL);
  add("gripBox", 0.3, { holding: true });
  carry("liftBox", point(source.x, source.y + 0.04, source.z), VERTICAL);
  carry("withdrawBox", point(source.x, source.y + 0.04, aisle));
  carry(
    "transportHeight",
    point(source.x, STORAGE_TRANSPORT_Y, aisle),
    VERTICAL,
  );
  if (action === "pick") {
    carry("toPickingArea", point(stage.x, STORAGE_TRANSPORT_Y, aisle));
    carry("alignPicking", point(stage.x, STORAGE_TRANSPORT_Y, stage.z));
    carry("placeForChecking", stage, VERTICAL);
    add("releaseAtPicking", 0.3, { holding: false });
    move(
      "lowerEmptyFork",
      { carriage: point(stage.x, stage.y - 0.02, stage.z) },
      VERTICAL,
    );
    move("withdrawEmptyFork", {
      carriage: point(stage.x, stage.y - 0.02, aisle),
      forkDepth: 0.1,
    });
    emptyHome();
  } else {
    carry("toDock", point(dock.x, STORAGE_TRANSPORT_Y, aisle));
    carry("alignDock", point(dock.x, STORAGE_TRANSPORT_Y, dock.z));
    carry("placeOnDock", dock, VERTICAL);
    add("releaseOnDock", 0.3, { holding: false });
    move(
      "lowerDockFork",
      { carriage: point(dock.x, dock.y - 0.02, dock.z) },
      VERTICAL,
    );
    move("withdrawFromDock", {
      carriage: point(dock.x, dock.y - 0.02, aisle),
      forkDepth: 0.1,
    });
    emptyHome();
    add("engageDockForks", 0.3, { dockHolding: true, dockVisible: true });
    const cargo = orderTruckSlot(index);
    move("loadTruck", { material: cargo, dock: cargo });
    add("releaseOnCargoRails", 0.3, { dockHolding: false });
    move("retractDockForks", { dock });
    add("dockPark", 0.1, { dockVisible: false });
  }
  return {
    start,
    segments,
    duration: segments.reduce((n, s) => n + s.duration, 0),
    end: state,
  };
}
const cache = new Map();
function orderPlan(action, box, index) {
  const key = `${action}/${box.address}/${box.product}/${index}`;
  if (!cache.has(key)) cache.set(key, buildOrderPlan(action, box, index));
  return cache.get(key);
}
export const getOrderPickDuration = (box, index = 0) =>
  orderPlan("pick", box, index).duration;
export const getOrderShipDuration = (box, index = 0) =>
  orderPlan("ship", box, index).duration;
function orderPose(action, progress, box, index = 0) {
  const plan = orderPlan(action, box, index);
  let time = clamp(progress) * plan.duration;
  for (const segment of plan.segments) {
    if (time <= segment.duration) {
      const t = clamp(time / segment.duration),
        state = { ...segment.from, stage: segment.id };
      for (const key of ["material", "carriage", "dock"])
        state[key] = point(
          mix(segment.from[key].x, segment.to[key].x, t),
          mix(segment.from[key].y, segment.to[key].y, t),
          mix(segment.from[key].z, segment.to[key].z, t),
        );
      state.forkDepth = mix(segment.from.forkDepth, segment.to.forkDepth, t);
      state.truckOffset = mix(
        segment.from.truckOffset,
        segment.to.truckOffset,
        t,
      );
      if (t === 1) {
        state.holding = segment.to.holding;
        state.dockHolding = segment.to.dockHolding;
        state.dockVisible = segment.to.dockVisible;
        state.truckNew = segment.to.truckNew;
      }
      return state;
    }
    time -= segment.duration;
  }
  return { ...plan.end, stage: "complete" };
}
export const getOrderPickPose = (t, box, index = 0) =>
  orderPose("pick", t, box, index);
export const getOrderShipPose = (t, box, index = 0) =>
  orderPose("ship", t, box, index);

export function beverageStorageState(snapshot, { circuit = false } = {}) {
  if (
    snapshot.step?.id !== "seal" ||
    !["moving", "operating"].includes(snapshot.phase) ||
    snapshot.hasMaterial === false ||
    !snapshot.unit?.packed ||
    !snapshot.unit?.warehouseAddress
  )
    return null;
  const index = snapshot.unit.caseIndex ?? Math.floor(snapshot.done / 9),
    quantity = Math.min(
      9,
      (snapshot.bottleTotal ?? snapshot.total) - index * 9,
    );
  const unit = {
    ...snapshot.unit,
    warehouseAddress:
      snapshot.unit.warehouseAddress ??
      `PA-${String(index + 1).padStart(2, "0")}`,
  };
  if (snapshot.phase !== "operating") {
    const handoff = circuit ? beverageCircuitCaseHandoff(index, snapshot.progress) : null;
    if (handoff && !handoff.onWarehouse) return null;
    const x = handoff
      ? mix(BEVERAGE_CIRCUIT_WAREHOUSE_ENTRY, BEVERAGE_CIRCUIT_SEALER_X, handoff.beltProgress)
      : -7.15 + 2.8 * clamp(snapshot.progress);
    return {
      unit,
      quantity,
      index,
      closing: 0,
      pose: {
        material: point(x, 1.2, 0),
        carriage: point(
          0,
          PARK,
          demandWarehouseSlot(unit.warehouseAddress).bank ? 2.7 : -2.7,
        ),
        forkDepth: 0.1,
        bank: demandWarehouseSlot(unit.warehouseAddress).bank,
      },
    };
  }
  const seconds = snapshot.progress * DEMAND_BEVERAGE_STORAGE_DURATION;
  if (seconds < 7)
    return {
      unit,
      quantity,
      index,
      closing: seconds / 7,
      pose: {
        material: point(-4.35, 1.2, 0),
        carriage: point(
          0,
          PARK,
          demandWarehouseSlot(unit.warehouseAddress).bank ? 2.7 : -2.7,
        ),
        forkDepth: 0.1,
        bank: demandWarehouseSlot(unit.warehouseAddress).bank,
      },
    };
  if (seconds < 9.8)
    return {
      unit,
      quantity,
      index,
      closing: 1,
      pose: {
        material: point(-4.35 + 4.35 * clamp((seconds - 7) / 2.8), 1.2, 0),
        carriage: point(
          0,
          PARK,
          demandWarehouseSlot(unit.warehouseAddress).bank ? 2.7 : -2.7,
        ),
        forkDepth: 0.1,
        bank: demandWarehouseSlot(unit.warehouseAddress).bank,
      },
    };
  let time = seconds - 9.8;
  const ids = ["identify", "raise", "store", "retrieve", "lower"];
  let stage;
  for (let i = 0; i < ids.length; i++) {
    if (time <= DEMAND_STORAGE_TIMES[i] || i === ids.length - 1) {
      stage = { id: ids[i], progress: clamp(time / DEMAND_STORAGE_TIMES[i]) };
      break;
    }
    time -= DEMAND_STORAGE_TIMES[i];
  }
  return {
    unit,
    quantity,
    index,
    closing: 1,
    pose: demandStoragePose(
      { id: "finished", onDemand: true, phase: "processing", unit, stage },
      unit.product,
    ),
  };
}
