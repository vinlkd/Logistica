import { CONVEYOR_TOP, CLEARANCE } from "./kinematics.js";
import { materialCrateSlot } from "./material-crates.js";
export const COOKWARE_SOURCE_CAPACITY = 12;
export const COOKWARE_RECEIVING_SPEED = 1.6;
const VERTICAL = 1.5,
  TOP = CONVEYOR_TOP + CLEARANCE;
const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const copy = (v) => structuredClone(v);
const point = (x, y, z) => ({ x, y, z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const cookwareSourceSlot = (index) => materialCrateSlot(index, 0);
export const cookwareEmptySlot = (index) => point(-11.6 + index * 1.65, 1.2, 3);
export function cookwareDiscSlot(index, total) {
  const count = Math.max(1, Math.min(12, total - Math.floor(index / 12) * 12));
  return {
    x: 0,
    y: 0.04 + Math.max(0, count - 1 - (index % 12)) * 0.03 + 0.025,
    z: 0,
  };
}
const plans = new Map();
function plan(index, total) {
  total = Math.max(1, Math.min(50, Math.floor(Number(total) || 1)));
  index = Math.max(0, Math.min(total - 1, Math.floor(Number(index) || 0)));
  const key = `${index}/${total}`;
  if (plans.has(key)) return plans.get(key);
  const caseIndex = Math.floor(index / 12),
    first = index % 12 === 0,
    last = index % 12 === Math.min(12, total - caseIndex * 12) - 1;
  const source = cookwareSourceSlot(caseIndex),
    slot = cookwareDiscSlot(index, total),
    dock = point(-4.1, 1.2, 0);
  let state = {
    crate: first ? source : dock,
    carrier: point(-5.65, 4.2, 0),
    head: point(-1.7, 3.3, 0),
    material: point(
      (first ? source : dock).x,
      (first ? source : dock).y + slot.y,
      (first ? source : dock).z,
    ),
    extension: 0,
    major: first ? 0 : 1,
    minor: first ? 0 : 1,
    openerMajor: 0,
    openerMinor: 0,
    grip: 0,
    conveyorTravel: 0,
  };
  state = copy(state);
  const initial = copy(state),
    segments = [];
  function move(id, duration, target) {
    const next = { ...copy(state), ...copy(target) };
    segments.push({
      id,
      duration: Math.max(0.001, duration),
      from: copy(state),
      to: next,
    });
    state = copy(next);
  }
  function carrier(id, p) {
    move(id, distance(state.carrier, p) / COOKWARE_RECEIVING_SPEED, {
      carrier: p,
    });
  }
  function crate(id, p, carryDisc = true) {
    const old = state.crate,
      delta = point(p.x - old.x, p.y - old.y, p.z - old.z);
    move(id, distance(old, p) / COOKWARE_RECEIVING_SPEED, {
      crate: p,
      carrier: p,
      ...(carryDisc
        ? {
            material: point(
              state.material.x + delta.x,
              state.material.y + delta.y,
              state.material.z + delta.z,
            ),
          }
        : {}),
    });
  }
  if (first) {
    carrier("approachSource", point(source.x, 4.2, source.z));
    move("lowerFork", (4.2 - source.y) / VERTICAL, { carrier: copy(source) });
    move("extendFork", 0.5, { extension: 1 });
    crate("liftCrate", point(source.x, 1.24, source.z));
    crate("pullCrate", point(-4.1, 1.24, source.z));
    crate("alignCrate", point(-4.1, 1.24, 0));
    crate("placeCrate", copy(dock));
    move("releaseFork", 0.5, { extension: 0 });
    move("raiseFork", 3 / VERTICAL, { carrier: point(-4.1, 4.2, 0) });
    carrier("parkFork", point(-5.65, 4.2, 0));
    move("majorDown", 2.5 / VERTICAL, { openerMajor: 1 });
    move("openMajor", 3.6, { major: 1 });
    move("majorUp", 2.5 / VERTICAL, { openerMajor: 0 });
    move("minorDown", 2.5 / VERTICAL, { openerMinor: 1 });
    move("openMinor", 3.6, { minor: 1 });
    move("minorUp", 2.5 / VERTICAL, { openerMinor: 0 });
  }
  move("headApproach", 2.4 / COOKWARE_RECEIVING_SPEED, {
    head: point(-4.1, 3.3, 0),
  });
  move("lowerHead", (3.3 - state.material.y) / VERTICAL, {
    head: copy(state.material),
  });
  move("grip", 0.3, { grip: 1 });
  move("liftDisc", (3.3 - state.material.y) / VERTICAL, {
    head: point(-4.1, 3.3, 0),
    material: point(-4.1, 3.3, 0),
  });
  move("carryDisc", 2.4 / COOKWARE_RECEIVING_SPEED, {
    head: point(-1.7, 3.3, 0),
    material: point(-1.7, 3.3, 0),
  });
  move("lowerDisc", (3.3 - TOP) / VERTICAL, {
    head: point(-1.7, TOP, 0),
    material: point(-1.7, TOP, 0),
  });
  move("releaseDisc", 0.25, { grip: 0 });
  move("retractHead", (3.3 - TOP) / VERTICAL, { head: point(-1.7, 3.3, 0) });
  move("feedDisc", 1.7 / COOKWARE_RECEIVING_SPEED, {
    material: point(0, TOP, 0),
    conveyorTravel: 1.7,
  });
  if (last) {
    carrier("approachEmpty", point(-4.1, 4.2, 0));
    move("lowerEmpty", 3 / VERTICAL, { carrier: copy(dock) });
    move("extendEmpty", 0.5, { extension: 1 });
    crate("liftEmpty", point(-4.1, 1.24, 0), false);
    crate("emptyForward", point(-3.3, 1.24, 0), false);
    crate("emptyLateral", point(-3.3, 1.24, 3), false);
    const parked = cookwareEmptySlot(caseIndex);
    crate("emptyPark", point(parked.x, 1.24, 3), false);
    crate("placeEmpty", parked, false);
    move("releaseEmpty", 0.5, { extension: 0 });
    move("raiseEmpty", 3 / VERTICAL, { carrier: point(parked.x, 4.2, 3) });
    carrier("returnEmptyZ", point(parked.x, 4.2, 0));
    carrier("returnEmptyX", point(-5.65, 4.2, 0));
  }
  const value = {
    initial,
    end: copy(state),
    segments,
    duration: segments.reduce((sum, s) => sum + s.duration, 0),
    index,
    total,
    caseIndex,
    first,
    last,
  };
  plans.set(key, value);
  return value;
}
export const cookwareReceivingDuration = (index, total = 12) =>
  plan(index, total).duration;
export function discReceivingState(progress, index = 0, total = 12) {
  const p = plan(index, total);
  let time = clamp(progress) * p.duration,
    state;
  for (const s of p.segments) {
    if (time <= s.duration) {
      const t = clamp(time / s.duration);
      state = { ...copy(s.from), stage: s.id };
      for (const key of ["crate", "carrier", "head", "material"])
        state[key] = point(
          ...["x", "y", "z"].map(
            (axis) =>
              s.from[key][axis] + (s.to[key][axis] - s.from[key][axis]) * t,
          ),
        );
      for (const key of [
        "extension",
        "major",
        "minor",
        "openerMajor",
        "openerMinor",
        "grip",
        "conveyorTravel",
      ])
        state[key] = s.from[key] + (s.to[key] - s.from[key]) * t;
      break;
    }
    time -= s.duration;
  }
  state ??= { ...copy(p.end), stage: "complete" };
  return {
    ...state,
    index: p.index,
    total: p.total,
    caseIndex: p.caseIndex,
    first: p.first,
    last: p.last,
    duration: p.duration,
    gripping: state.grip > 0.999,
    liftSupport: 1.195,
  };
}
export function cookwareReceivingStateFromCell(cell) {
  const total = Math.max(
    0,
    (cell.done ?? 0) + (cell.queue ?? 0) + (cell.part ? 1 : 0),
  );
  const index = Math.min(Math.max(0, total - 1), cell.done ?? 0);
  const progress =
    cell.phase === "feeding"
      ? clamp((cell.progress ?? 0) / 0.5)
      : cell.part || (total > 0 && (cell.done ?? 0) >= total)
        ? 1
        : 0;
  return { ...discReceivingState(progress, index, total), total, progress };
}
