import { BOTTLE_PACK_X } from "./bottle-packing-layout.js";
import { bottleCaseTransferDuration } from "./bottle-case-transfer.js";

export { buildBeverageCorner } from "./beverage-corner.js";

// The original roller beds have a ten-metre frame. Their datum is shared by
// all the bottle machines; the packing table and the stock conveyor meet next.
export const BEVERAGE_CIRCUIT_BOTTLE_PITCH = 10;
const packingToWarehouse = 23.5;
const warehouseToDock = 22;
export const BEVERAGE_CIRCUIT_X = Object.freeze({
  receive: 0,
  wash: 10,
  fill: 20,
  cap: 30,
  label: 40,
  pack: 50,
  seal: 50 + packingToWarehouse,
  ship: 50 + packingToWarehouse + warehouseToDock,
});
const stations = ["receive", "wash", "fill", "cap", "label", "pack"];
export const BEVERAGE_CORNER_RADIUS = 2.1;
export const BEVERAGE_CORNER_ARC = (Math.PI / 2) * BEVERAGE_CORNER_RADIUS;
const cornerTail = 0.125;
export const BEVERAGE_CORNER_LENGTH = BEVERAGE_CORNER_ARC + cornerTail;
const corner = { x: 5, z: 25 - BEVERAGE_CORNER_RADIUS };
const turnedX = corner.x - BEVERAGE_CORNER_RADIUS;
const labelZ = corner.z - cornerTail - BEVERAGE_CIRCUIT_BOTTLE_PITCH / 2;
const packZ = labelZ - BEVERAGE_CIRCUIT_BOTTLE_PITCH;
const sealZ = packZ - packingToWarehouse;
const turned = (z) => ({ x: turnedX, z, yaw: Math.PI / 2 });
const poses = Object.freeze({
  receive: { x: 40, z: 25, yaw: Math.PI },
  wash: { x: 30, z: 25, yaw: Math.PI },
  fill: { x: 20, z: 25, yaw: Math.PI },
  cap: { x: 10, z: 25, yaw: Math.PI },
  label: turned(labelZ),
  pack: turned(packZ),
  seal: turned(sealZ),
  ship: turned(sealZ - warehouseToDock),
});
export const beverageCircuitPlacement = (stage) => poses[stage];
export const beverageCircuitNext = (stage) => {
  const index = stations.indexOf(stage);
  return index < 0 ? undefined : stations[index + 1];
};
export function beverageCircuitLocal(stage, point) {
  const pose = poses[stage];
  const dx = point.x - pose.x, dz = point.z - pose.z;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
export function beverageCornerPoint(distance, lateral = 0) {
  const angle = Math.min(Math.PI / 2, distance / BEVERAGE_CORNER_RADIUS);
  const radius = BEVERAGE_CORNER_RADIUS - lateral;
  return {
    x: corner.x - radius * Math.sin(angle),
    z: corner.z + radius * Math.cos(angle) - Math.max(0, distance - BEVERAGE_CORNER_ARC),
  };
}

export function beverageCircuitTransition(stage, progress) {
  const index = stations.indexOf(stage);
  if (index <= 0) return null;
  const t = Math.max(0, Math.min(1, progress));
  const from = poses[stations[index - 1]], to = poses[stage];
  const length = BEVERAGE_CIRCUIT_BOTTLE_PITCH + (stage === "label" ? BEVERAGE_CORNER_LENGTH : 0);
  const travel = t * length;
  if (stage !== "label")
    return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, travel };
  if (travel <= 5) return { x: from.x - travel, z: from.z, travel };
  if (travel >= 5 + BEVERAGE_CORNER_LENGTH)
    return { x: to.x, z: to.z + length - travel, travel };
  return { ...beverageCornerPoint(travel - 5), travel };
}
export const BEVERAGE_CIRCUIT_WAREHOUSE_ENTRY = -7;
export const BEVERAGE_CIRCUIT_SEALER_X = -4.35;
export const BEVERAGE_CIRCUIT_CASE_TARGET_X =
  BOTTLE_PACK_X + BEVERAGE_CIRCUIT_X.seal - BEVERAGE_CIRCUIT_X.pack +
  BEVERAGE_CIRCUIT_WAREHOUSE_ENTRY;

const speed = 2.088;
const beltDistance = BEVERAGE_CIRCUIT_SEALER_X - BEVERAGE_CIRCUIT_WAREHOUSE_ENTRY;
const beltDuration = beltDistance / speed;

function hoistDuration(index) {
  return bottleCaseTransferDuration(index, BEVERAGE_CIRCUIT_CASE_TARGET_X);
}

export function beverageCircuitMovementDistance({ phase, unit, done, step, benchStage }) {
  if (phase !== "moving" || benchStage || step === "receive" || step === "ship")
    return undefined;
  if (step === "seal" && unit?.packed)
    return hoistDuration(unit.caseIndex ?? Math.floor(done / 9)) * speed + beltDistance;
  if (step === "label") return BEVERAGE_CIRCUIT_BOTTLE_PITCH + BEVERAGE_CORNER_LENGTH;
  if (Object.hasOwn(BEVERAGE_CIRCUIT_X, step)) return BEVERAGE_CIRCUIT_BOTTLE_PITCH;
}

export function beverageCircuitCaseHandoff(index, progress) {
  const lift = hoistDuration(index);
  const time = Math.max(0, Math.min(1, progress)) * (lift + beltDuration);
  return {
    hoistProgress: Math.min(1, time / lift),
    onWarehouse: time >= lift,
    beltProgress: Math.max(0, Math.min(1, (time - lift) / beltDuration)),
  };
}
