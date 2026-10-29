// Coordinates are relative to the packing station, except the process anchors.
// The table begins beyond the last roller, leaving the conveyor fully clear.
export const BOTTLE_PACK_X=4;
export const BOTTLE_SEAL_X=15.9;
export const BOTTLE_SHIP_X=17.9;
export const BOTTLE_PACKING_LAYOUT=Object.freeze({
  beltEndX:4.875,pickupX:4.5,
  tableMinX:5.45,tableMaxX:15.6,tableMinZ:-11.1,tableMaxZ:.8,
  leftAisleX:6.32,rightAisleX:14.1,
  frameMinX:3.8,frameMaxX:12.55,frameMinZ:-11.8,frameMaxZ:1.9,
});
export function bottlePackingCaseCenter(index){return {x:8+(index%2)*1.7,z:-1.8-Math.floor(index/2)*1.7};}
