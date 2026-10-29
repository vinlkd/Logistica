import {BOTTLE_PACK_X,BOTTLE_SEAL_X,BOTTLE_SHIP_X,BOTTLE_PACKING_LAYOUT as layout,bottlePackingCaseCenter} from './bottle-packing-layout.js';
import {bottleCaseTransferState} from './bottle-case-transfer.js';
export const BOTTLE_CASE_COUNT = 12;
export const BOTTLE_STOCK = 108;
export const CASE_PITCH = 1.65;
export const CASE_TIER = 1.3;
export const CASE_CONVEYOR_SPEED = 2.088;
const clamp = value => Math.max(0, Math.min(1, value));
export const crateEase = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function bottleSourceSlot(index) {
  const local = index % 6;
  return {x: -6.7 - Math.floor(local / 2) * CASE_PITCH,
    y: index < 6 ? 2.5 : 1.2, z: local % 2 ? .805 : -.745};
}
export function bottleEmptySlot(index) {
  return {x: -5 - (5 - index % 6) * CASE_PITCH, y: 1.2,
    z: index < 6 ? 4.7 : 3};
}
export function bottleTruckSlot(index, shipX = BOTTLE_SHIP_X) {
  const local = index % 6;
  return {x: shipX + 11.3 - Math.floor(local / 2) * CASE_PITCH,
    y: 1.2 + Math.floor(index / 6) * CASE_TIER,
    z: local % 2 ? .805 : -.745};
}
export function bottleShippingPoints(index, shipX = BOTTLE_SHIP_X) {
  const slot = bottleTruckSlot(index, shipX);
  return [{x: shipX, y: 1.2, z: 0}, {x: shipX + 4.1, y: 1.2, z: 0},
    {x: shipX + 4.1, y: 1.2, z: slot.z},
    {x: shipX + 4.1, y: slot.y, z: slot.z}, slot];
}
export function cratePathLength(points) {
  return points.slice(1).reduce((sum, point, index) => sum +
    Math.hypot(point.x - points[index].x, (point.y ?? 1.2) - (points[index].y ?? 1.2), point.z - points[index].z), 0);
}
export function cratePathPose(points, progress) {
  let distance = clamp(progress) * cratePathLength(points);
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index], to = points[index + 1];
    const length = Math.hypot(to.x - from.x, (to.y ?? 1.2) - (from.y ?? 1.2), to.z - from.z);
    if (distance <= length || index === points.length - 2) {
      const t = length ? Math.min(1, distance / length) : 1;
      return {x: from.x + (to.x - from.x) * t,
        y: (from.y ?? 1.2) + ((to.y ?? 1.2) - (from.y ?? 1.2)) * t,
        z: from.z + (to.z - from.z) * t};
    }
    distance -= length;
  }
  return {...points[0]};
}
export const bottleShippingDistance = index => cratePathLength(bottleShippingPoints(index));
export const bottleShippingPose = (progress, index, shipX = BOTTLE_SHIP_X) => cratePathPose(bottleShippingPoints(index, shipX), progress);

export function bottleApproachPoints(index, targetX = BOTTLE_SEAL_X, packX = BOTTLE_PACK_X) {
  const center=bottlePackingCaseCenter(index),home = {x:packX+center.x,y:1.2,z:center.z};
  const corridor = index % 2 ? packX+layout.rightAisleX : index < 2 ? home.x : packX+layout.leftAisleX;
  return [home, {x: corridor, y: 1.2, z: home.z},
    {x: corridor, y: 1.2, z: 0}, {x: targetX, y: 1.2, z: 0}];
}
export const caseApproachDistance = (index, targetX = BOTTLE_SEAL_X, packX = BOTTLE_PACK_X) => cratePathLength(bottleApproachPoints(index, targetX, packX));
export const bottleApproachPose = (progress, index, targetX = BOTTLE_SEAL_X, packX = BOTTLE_PACK_X) => bottleCaseTransferState(progress,index,targetX,packX).material;

function packingPlan(index) {
  const caseIndex=Math.floor(index/9),slot=index%9;
  const {x:cx,z:cz}=bottlePackingCaseCenter(caseIndex);
  const target={caseIndex,slot,cx,cz,x:cx+(slot%3-1)*.43,
    z:cz+(Math.floor(slot/3)-1)*.43,y:1.24};
  const segments=[['feed',layout.pickupX/CASE_CONVEYOR_SPEED],['approach',2.1/1.5],['grip',.35],['lift',2.1/1.5],
    ['travelX',Math.abs(target.x-layout.pickupX)/CASE_CONVEYOR_SPEED],
    ['travelZ',Math.abs(target.z)/CASE_CONVEYOR_SPEED],
    ['lower',2.06/1.5],['release',.35],['retract',2.06/1.5],
    ['returnZ',Math.abs(target.z)/CASE_CONVEYOR_SPEED],
    ['returnX',Math.abs(target.x-layout.pickupX)/CASE_CONVEYOR_SPEED]];
  return {target,segments,duration:segments.reduce((sum,s)=>sum+s[1],0)};
}
export const bottlePackingDuration=index=>packingPlan(index).duration;
export function bottlePackingState(progress,index) {
  const {target,segments,duration}=packingPlan(index),time=clamp(progress)*duration;
  const p={};let start=0;
  for(const [id,length]of segments){p[id]=clamp((time-start)/length);start+=length;}
  if(time===duration)for(const id of Object.keys(p))p[id]=1;
  const x=layout.pickupX*p.feed+(target.x-layout.pickupX)*p.travelX,z=target.z*p.travelZ;
  const y=p.lower===1?target.y:1.2+2.1*p.lift-2.06*p.lower;
  const toolY=p.grip===0?3.3-2.1*p.approach:p.release>0?y+2.06*p.retract:y;
  return {x,y,z,toolX:layout.pickupX+(target.x-layout.pickupX)*p.travelX*(1-p.returnX),toolY,
    toolZ:z*(1-p.returnZ),jawGap:.045*(1-p.grip+p.release),
    released:p.release>0,gripping:p.grip===1&&p.release===0,
    conveyorTravel:layout.pickupX*p.feed,index,target,duration,phases:p};
}

export function bottleStockPosition(index) {
  const slot = index % 9;
  return {x: -4.1 + (slot % 3 - 1) * .43, y: 1.24,
    z: (Math.floor(slot / 3) - 1) * .43};
}
function receivingPlan(index) {
  const caseIndex = Math.floor(index / 9), first = index % 9 === 0;
  const source = bottleSourceSlot(caseIndex), slot = bottleStockPosition(index);
  const segments = [];
  const add = (id, duration) => segments.push({id, duration: Math.max(.001, duration)});
  if (first) {
    add('lowerFork', (4.2 - source.y) / 1.5); add('extendFork', .5);
    add('raiseDock', (source.y - 1.2) / 1.0);
    add('pullCrate', (-4.1 - source.x) / CASE_CONVEYOR_SPEED);
    add('alignCrate', Math.abs(source.z) / CASE_CONVEYOR_SPEED);
    add('lowerCrate', (source.y - 1.2) / 1.0);
    add('releaseFork', .5); add('raiseFork', 3 / 1.5);
    add('parkFork', 1.55 / CASE_CONVEYOR_SPEED);
    add('majorDown', 2.5 / 1.5); add('openMajor', 3.6);
    add('majorUp', 2.5 / 1.5); add('minorDown', 2.5 / 1.5);
    add('openMinor', 3.6); add('minorUp', 2.5 / 1.5);
    add('headApproachX', Math.abs(slot.x + 1.7) / CASE_CONVEYOR_SPEED);
    add('headApproachZ', Math.abs(slot.z) / CASE_CONVEYOR_SPEED);
  }
  add('lowerHead', 2.06 / 1.5); add('grip', .35);
  add('liftMaterial', 2.06 / 1.5);
  add('carryMaterialX', Math.abs(slot.x + 1.7) / CASE_CONVEYOR_SPEED);
  add('carryMaterialZ', Math.abs(slot.z) / CASE_CONVEYOR_SPEED);
  add('lowerMaterial', 2.1 / 1.5); add('releaseMaterial', .35);
  add('retractHead', 2.1 / 1.5); add('feedMaterial', 1.7 / CASE_CONVEYOR_SPEED);
  if (index % 9 === 8) {
    const parked = bottleEmptySlot(caseIndex);
    add('emptyForward', .8 / CASE_CONVEYOR_SPEED);
    add('emptyLateral', parked.z / CASE_CONVEYOR_SPEED);
    add('emptyPark', Math.abs(parked.x + 3.3) / CASE_CONVEYOR_SPEED);
  }
  return {segments, first, source, slot, caseIndex,
    duration: segments.reduce((sum, segment) => sum + segment.duration, 0)};
}
export const bottleReceivingDuration = index => receivingPlan(Math.max(0, Math.min(107, index))).duration;

// The state is reconstructed from simulation progress; pause, reload and old
// checkpoints do not create additional materials or move any equipment.
export function bottleReceivingState(index, phase = 'ready', progress = 0) {
  index = Math.max(0, Math.min(107, index));
  const plan = receivingPlan(index), {first, source, slot, caseIndex} = plan;
  const time = phase === 'operating' ? clamp(progress) * plan.duration :
    phase === 'ready' || phase === 'moving' ? 0 : plan.duration;
  const phases = {}; let start = 0;
  for (const segment of plan.segments) {
    phases[segment.id] = clamp((time - start) / segment.duration);
    start += segment.duration;
  }
  if(time===plan.duration)for(const id of Object.keys(phases))phases[id]=1;
  const p = name => phases[name] ?? 0;
  const pre = phase === 'moving' ? clamp(progress) : phase === 'ready' ? 0 : 1;
  let crate = first ? {
    x: source.x + (-4.1 - source.x) * p('pullCrate'),
    y: source.y + (1.2 - source.y) * p('lowerCrate'),
    z: source.z * (1 - p('alignCrate'))} : {x: -4.1, y: 1.2, z: 0};
  const parked = bottleEmptySlot(caseIndex);
  if (index % 9 === 8) crate = {
    x: -4.1 + .8 * p('emptyForward') + (parked.x + 3.3) * p('emptyPark'),
    y: 1.2, z: parked.z * p('emptyLateral')};
  if(p('pullCrate')===1)crate.x=-4.1;
  if(p('alignCrate')===1)crate.z=0;
  if(p('lowerCrate')===1)crate.y=1.2;
  if(p('emptyPark')===1)crate={...parked};
  let carrier = first ? {
    x: -5.65 + (source.x + 5.65) * pre,
    y: 4.2 + (source.y - 4.2) * p('lowerFork'),
    z: source.z * pre} : {x: -5.65, y: 4.2, z: 0};
  if (first && p('extendFork') > 0) carrier = {...crate, y: crate.y};
  if (first && p('releaseFork') > 0) carrier = {
    x: -4.1 - 1.55 * p('parkFork'), y: 1.2 + 3 * p('raiseFork'), z: 0};
  const extension = first ? p('extendFork') * (1 - p('releaseFork')) : 0;
  const minor = first ? p('openMinor') : 1, major = first ? p('openMajor') : 1;
  const openerMajor = first ? p('majorDown') * (1 - p('majorUp')) : 0;
  const openerMinor = first ? p('minorDown') * (1 - p('minorUp')) : 0;
  const opener=Math.max(openerMajor,openerMinor);
  const lift = p('liftMaterial'), carryX = p('carryMaterialX'), carryZ = p('carryMaterialZ');
  const material = {
    x: crate.x + (slot.x + 4.1), y: crate.y + .04, z: crate.z + slot.z};
  if (p('lowerHead') > 0 || !first) {
    material.x = slot.x + (-1.7 - slot.x) * carryX + 1.7 * p('feedMaterial');
    material.y = 1.24 + 2.06 * lift - 2.1 * p('lowerMaterial');
    material.z = slot.z * (1 - carryZ);
  }
  if(p('lowerMaterial')===1)material.y=1.2;
  if(p('carryMaterialZ')===1)material.z=0;
  if(p('feedMaterial')===1)material.x=0;
  let head = {x: -1.7, y: 3.3, z: 0};
  if (first) {
    head.x += (slot.x + 1.7) * p('headApproachX');
    head.z = slot.z * p('headApproachZ');
  } else {head.x += (slot.x + 1.7) * pre; head.z = slot.z * pre;}
  head.y -= 2.06 * p('lowerHead');
  if (p('grip') > 0) head = {...material};
  if (p('releaseMaterial') > 0) head = {
    x: -1.7, y: 1.2 + 2.1 * p('retractHead'), z: 0};
  const jawGap = .06 * (1 - p('grip') + p('releaseMaterial'));
  const liftSupport = first ? 1.195 + (source.y - 1.2) *
    (p('raiseDock') - p('lowerCrate')) : 1.195;
  return {crate, carrier, extension, minor, major, opener, openerMajor, openerMinor, material, head, liftSupport,
    jawGap, gripping: p('grip') === 1 && p('releaseMaterial') === 0,
    phases, conveyorTravel:1.7*p('feedMaterial'), duration: plan.duration, index, caseIndex, first};
}
