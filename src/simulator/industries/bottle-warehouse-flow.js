export const WAREHOUSE_SPEED=2.088;
const clamp=value=>Math.max(0,Math.min(1,value));
export function bottleWarehouseAddress(kind,index){
  const raw=kind==='raw',address=raw?Math.floor(index/9):index;
  const column=address%4,level=Math.floor(address/4),slot=raw?index%9:4;
  return {index:address,id:`${raw?'MP':'PA'}-${String(address+1).padStart(2,'0')}`,
    x:(column-1.5)*1.9+(raw?(slot%3-1)*.43:0),
    y:1.2+level*1.5,z:(raw?-4.8:4.8)+(raw?(Math.floor(slot/3)-1)*.43:0),
    column,level,slot};
}
export function bottleWarehouseSlots(kind){
  const raw=kind==='raw';return Array.from({length:12},(_,index)=>{
    const address=bottleWarehouseAddress(kind,raw?index*9+4:index);
    return {id:address.id,x:(index%4-1.5)*1.9,y:1.2+Math.floor(index/4)*1.5,
      z:raw?-4.8:4.8,width:1.7,depth:1.65,height:1.5,forkClearance:!raw,railOffset:.56};
  });
}
function plan(kind,index){
  const address=bottleWarehouseAddress(kind,index),sign=kind==='raw'?-1:1,
    aisle=sign*2.9,mast=sign*2.4;
  const steps=[];const add=(id,duration)=>steps.push({id,duration:Math.max(.001,duration)});
  add('approach',2.4/WAREHOUSE_SPEED);add('grip',.3);add('raise',.15/1.5);
  add('toAisle',2.9/WAREHOUSE_SPEED);add('toColumn',Math.abs(address.x)/WAREHOUSE_SPEED);
  add('toLevel',Math.abs(address.y+.04-1.35)/1.5);
  add('store',Math.abs(address.z-aisle)/WAREHOUSE_SPEED);add('place',.04/1.5);add('releaseStore',.3);add('withdrawTool',.06/1.5);
  add('retract',Math.abs(address.z-aisle)/WAREHOUSE_SPEED);add('stored',1);
  add('approachStored',Math.abs(address.z-aisle)/WAREHOUSE_SPEED);add('seatGrip',.06/1.5);add('gripStored',.3);add('unseat',.04/1.5);
  add('retrieve',Math.abs(address.z-aisle)/WAREHOUSE_SPEED);
  add('toTransportLevel',Math.abs(address.y+.04-1.35)/1.5);
  add('toCentre',Math.abs(address.x)/WAREHOUSE_SPEED);add('toBelt',2.9/WAREHOUSE_SPEED);
  add('lower',.15/1.5);add('releaseBelt',.3);add('park',2.4/WAREHOUSE_SPEED);
  return {kind,address,sign,aisle,mast,steps,duration:steps.reduce((sum,s)=>sum+s.duration,0)};
}
export const warehouseRawDuration=index=>plan('raw',index).duration;
export const warehouseFinishedDuration=index=>plan('finished',index).duration;
function pose(kind,progress,index){
  const route=plan(kind,index),{address,aisle,mast}=route,time=clamp(progress)*route.duration,p={};let start=0;
  for(const step of route.steps){p[step.id]=clamp((time-start)/step.duration);start+=step.duration;}
  const material={x:address.x*p.toColumn,y:1.2+.15*p.raise+(address.y+.04-1.35)*p.toLevel-.04*p.place,
    z:aisle*p.toAisle+(address.z-aisle)*p.store};
  if(p.retrieve>0)material.z=address.z+(aisle-address.z)*p.retrieve;
  if(p.unseat>0)material.y=address.y+.04*p.unseat;
  if(p.toTransportLevel>0)material.y=address.y+.04+(1.35-address.y-.04)*p.toTransportLevel;
  if(p.toCentre>0)material.x=address.x*(1-p.toCentre);
  if(p.toBelt>0)material.z=aisle*(1-p.toBelt);
  if(p.lower>0)material.y=1.35-.15*p.lower;
  if(p.lower===1)material.y=1.2;
  if(p.toCentre===1)material.x=0;
  if(p.toBelt===1)material.z=0;
  const carriage={x:material.x,y:material.y,z:material.z};
  if(p.grip<1){carriage.x=0;carriage.y=1.2;carriage.z=mast*(1-p.approach);}
  if(p.releaseStore>0&&p.gripStored<1){const offset=kind==='raw'?.06:-.04;carriage.x=address.x;carriage.y=address.y+offset*(p.withdrawTool-p.seatGrip);
    carriage.z=address.z+(aisle-address.z)*p.retract+(address.z-aisle)*p.approachStored;}
  if(p.releaseBelt>0){carriage.x=0;carriage.y=1.2;carriage.z=mast*p.park;}
  const jawGap=p.grip<1?.06*(1-p.grip):p.releaseBelt>0?.06*p.releaseBelt:
    p.releaseStore>0&&p.gripStored<1?.06*p.releaseStore*(1-p.gripStored):0;
  const occupied=p.releaseStore===1&&p.unseat===0;
  return {material,carriage,mast,jawGap,occupied,address,phases:p,
    gripping:p.grip===1&&p.releaseStore===0||p.gripStored===1&&p.releaseBelt===0,
    duration:route.duration};
}
export const warehouseRawPose=(progress,index)=>pose('raw',progress,index);
export const warehouseFinishedPose=(progress,index)=>pose('finished',progress,index);
export function sealWarehouseProgress(progress,index){
  const duration=warehouseFinishedDuration(index),time=clamp(progress)*(7+duration);
  return {closingProgress:clamp(time/7),warehouseProgress:clamp((time-7)/duration),
    totalDuration:7+duration};
}
