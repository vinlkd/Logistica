const ease=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export const MATERIAL_CRATE={width:1.46,depth:1.46,height:1.18,bottom:1.2};
export const materialCapacity=kind=>kind==='discs'?12:9;
export function materialCrateSlot(index,centerZ=0){return {x:-6.7-Math.floor(index/2)*1.65,y:1.2,z:centerZ+(index%2?.805:-.745)};}
export function materialSlot(index,total,kind){
  const capacity=materialCapacity(kind),caseIndex=Math.floor(index/capacity),local=index%capacity,count=Math.min(capacity,total-caseIndex*capacity);
  return kind==='discs'?{x:0,y:.04+Math.max(0,count-1-local)*.03,z:0}:{x:(local%3-1)*.43,y:.04,z:(Math.floor(local/3)-1)*.43};
}
export function materialCratePose(index,{done,total,progress=1,receiving=false,received=false,kind='bottles',centerZ=0}){
  const capacity=materialCapacity(kind),activeCase=Math.floor(done/capacity),first=done%capacity===0,last=done%capacity===Math.min(capacity,total-activeCase*capacity)-1;
  const parked={x:-5-index*1.65,y:1.2,z:3};
  if(index<activeCase)return parked;
  const source=materialCrateSlot(index,centerZ);
  if(index>activeCase)return source;
  const t=receiving?progress:received?1:0;
  let x=first?source.x+(-4.1-source.x)*ease((t-.12)/.13):-4.1,z=first?source.z*(1-ease((t-.25)/.08)):0;
  if(last){const a=ease((t-.87)/.035),b=ease((t-.905)/.045),c=ease((t-.95)/.05);x+=(-3.3-x)*a+(parked.x+3.3)*c;z+=3*b;}
  return {x,y:1.2,z};
}
// A box reaches the dock first. Only then may the gripper reach into it.
export function materialReceivingPose({kind='bottles',done=0,total=12,progress=0,receiving=true,received=false,centerZ=0}){
  const t=Math.max(0,Math.min(1,progress)),capacity=materialCapacity(kind),caseIndex=Math.floor(done/capacity),slot=materialSlot(done,total,kind);
  const crate=materialCratePose(caseIndex,{done,total,progress:t,receiving,received,kind,centerZ}),base=kind==='discs'?1.207:1.2;
  const lift=ease((t-.46)/.14),travel=ease((t-.60)/.13),lower=ease((t-.73)/.11),feed=ease((t-.87)/.13);
  const source={x:crate.x+slot.x,y:1.2+slot.y,z:crate.z+slot.z};
  const p={x:source.x+(-1.7-source.x)*travel+1.7*feed,y:source.y+(2.65-source.y)*lift+(base-2.65)*lower,z:source.z*(1-travel)};
  if(!receiving&&received){p.x=0;p.y=base;p.z=0;}
  const approach=ease((t-.35)/.05),descend=ease((t-.40)/.06),retract=ease((t-.84)/.08),back=ease((t-.92)/.08);
  let tool={x:-4.1+(source.x+4.1)*approach,y:2.65+(source.y-2.65)*descend,z:source.z*approach};
  if(t>=.46)tool={x:p.x,y:p.y,z:p.z};
  if(t>=.84)tool={x:-1.7+(-4.1+1.7)*back,y:base+(2.65-base)*retract,z:0};
  return {material:p,crate,tool,gripped:t>=.46&&t<.84,caseIndex,slot,extracting:receiving,t};
}
export function buildOpenMaterialCrate({THREE,box,materials:m},parent,name,{kind="bottles"}={}){
  const group=new THREE.Group();group.name=name;parent.add(group);
  box(group,0,.02,0,1.46,.04,1.46,m.box);
  const wall=kind==="discs"?.42:.64;
  for(const side of [-1,1]){
    box(group,side*.715,.04+wall/2,0,.03,wall,1.46,m.box);
    box(group,0,.04+wall/2,side*.715,1.4,wall,.03,m.box);
  }
  return group;
}
