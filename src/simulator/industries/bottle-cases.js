import {sealWarehouseProgress,warehouseFinishedPose} from './bottle-warehouse-flow.js';
import {dockEase as ease} from './truck-dock.js';
import {bottleTruckSlot,bottleShippingPose,bottleApproachPose} from './bottle-crate-flow.js';
import {BOTTLE_PACK_X,bottlePackingCaseCenter} from './bottle-packing-layout.js';
export const BOTTLES_PER_CASE=9,CASE_INNER=1.4;
export function bottleCaseSlot(index){const caseIndex=Math.floor(index/9),slot=index%9,{x:cx,z:cz}=bottlePackingCaseCenter(caseIndex);return {caseIndex,slot,cx,cz,x:cx+(slot%3-1)*.43,z:cz+(Math.floor(slot/3)-1)*.43,y:1.24};}
export function bottleCaseHome(index,packX=BOTTLE_PACK_X){const p=bottleCaseSlot(index*9);return {x:packX+p.cx,y:1.2,z:p.cz};}
export const bottleCargoSlot=bottleTruckSlot;
export const caseApproachPose=bottleApproachPose;
export function caseSealPose(t){return {minor:ease((t-.05)/.25),major:ease((t-.33)/.27),tape:ease((t-.65)/.17),paper:ease((t-.84)/.09),press:ease((t-.82)/.11)*(1-ease((t-.94)/.06))};}
export function bottleCaseRecords(s,product){
  const total=s.bottleTotal??s.total??12,count=Math.ceil(total/9),caseBench=s.scope==='bench'&&['seal','ship'].includes(s.step?.id),active=Math.min(count-1,s.unit?.caseIndex??s.activeCaseIndex??Math.floor((s.done??0)/9));
  const cases=Array.from({length:count},(_,index)=>({index,expected:Math.max(0,Math.min(9,total-index*9)),units:[],sealed:false,taped:false,identified:false,shipped:false}));
  if(caseBench){for(const c of cases){for(let i=0;i<c.expected;i++)c.units.push({id:`CASE-${c.index+1}-${i+1}`,product:product.id,volume:product.volume,target:product.volume,capped:true,labeled:true,packed:true});c.sealed=c.expected>0&&(s.step.id==='ship'||c.index<(s.done??0)||c.index===active&&!!s.unit.caseSealed);c.taped=c.identified=c.sealed;c.shipped=c.expected>0&&s.step.id==='ship'&&(c.index<(s.done??0)||c.index===active&&!!s.unit.shipped);}}
  else{
    const units=[...(s.completedUnits??[])];if(s.unit?.packed&&!units.some(u=>u.id===s.unit.id))units.push(s.unit);
    units.forEach((unit,i)=>{if(!unit.packed)return;const index=Math.floor(((Number(String(unit.id).replace(/\D/g,''))||i+1)-1)/9),c=cases[index];if(!c)return;c.units.push(unit);c.sealed||=!!unit.caseSealed;c.taped||=!!unit.caseTaped;c.identified||=!!unit.caseIdentified;c.shipped||=!!unit.shipped;});
  }
  return {cases,active};
}
export function bottleCasePose(s,c,active,definition){
  const packX=definition.steps.find(step=>step.id==='pack').x,sealX=definition.steps.find(step=>step.id==='seal')?.x??6,shipX=definition.steps.at(-1).x,home=bottleCaseHome(c.index,packX),id=s.step?.id,bench=s.scope==='bench',isActive=c.index===active;
  if(isActive&&id==='seal'){
    if(s.phase==='moving')return caseApproachPose(s.progress,c.index,sealX,packX);
    if(s.phase==='operating'){const w=sealWarehouseProgress(s.progress,c.index),pose=warehouseFinishedPose(w.warehouseProgress,c.index).material;return {x:sealX+pose.x,y:pose.y,z:pose.z};}
    if(bench&&['outgoing','complete'].includes(s.phase))return caseApproachPose(s.phase==='complete'?0:1-s.progress,c.index,sealX,packX);
  }
  if(isActive&&id==='ship'){
    if(s.phase==='ready')return bench?home:{x:sealX,y:1.2,z:0};
    if(s.phase==='moving')return bench?caseApproachPose(s.progress,c.index,shipX,packX):{x:sealX+(shipX-sealX)*s.progress,y:1.2,z:0};
    if(s.phase==='operating'&&c.sealed&&c.taped&&c.identified&&c.expected>0&&c.units.length===c.expected)return bottleShippingPose(s.progress,c.index,shipX);
    if(['outgoing','complete'].includes(s.phase)&&c.sealed)return bottleCargoSlot(c.index,shipX);
  }
  if(c.shipped)return bottleCargoSlot(c.index,shipX);
  if(c.sealed&&!bench)return {x:sealX,y:1.2,z:0};
  return home;
}
export function buildBottleCase({THREE,box,materials:m,product},parent,index){
  const group=new THREE.Group();parent.add(group);group.name=`Caixa ${index+1} • capacidade 9`;
  box(group,0,.02,0,1.46,.04,1.46,m.box);
  for(const side of [-1,1]){box(group,side*.715,.61,0,.03,1.14,1.46,m.box);box(group,0,.61,side*.715,1.4,1.14,.03,m.box);}
  const flaps=[];
  for(const side of [-1,1]){
    const minor=new THREE.Group();minor.position.set(side*.755,1.195,0);group.add(minor);box(minor,-side*.3775,0,0,.755,.02,1.4,m.box);flaps.push({group:minor,axis:'z',open:-side*Math.PI/2,kind:'minor'});
    const major=new THREE.Group();major.position.set(0,1.22,side*.755);group.add(major);box(major,0,0,-side*.3775,1.53,.02,.755,m.box);flaps.push({group:major,axis:'x',open:side*Math.PI/2,kind:'major'});
  }
  const tape=box(group,0,1.234,0,1.3,.006,.10,m.tape??m.box),paper=box(group,.25,1.244,.29,.38,.006,.30,m.white);
  tape.name='Fita fecha a emenda da caixa';paper.name='Papel identifica conteúdo e quantidade';
  const canvas=globalThis.document?.createElement('canvas');let ctx,texture,owned;
  if(canvas){canvas.width=640;canvas.height=384;ctx=canvas.getContext('2d');if(ctx){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;owned=new THREE.MeshBasicMaterial({map:texture});const face=new THREE.Mesh(new THREE.PlaneGeometry(.37,.29),owned);face.rotation.x=-Math.PI/2;face.position.set(.25,1.2471,.29);group.add(face);face.name='Conteúdo impresso na etiqueta da caixa';paper.userData.face=face;}}
  let printed='';
  return {group,flaps,tape,paper,
    update(progress,quantity){const p=caseSealPose(progress);flaps.forEach(f=>f.group.rotation[f.axis]=f.open*(1-p[f.kind]));tape.visible=p.tape>0;tape.scale.x=Math.max(.001,p.tape);tape.position.x=-.65+.65*p.tape;paper.visible=p.paper===1;if(paper.userData.face)paper.userData.face.visible=paper.visible;const text=`${product.name}|${quantity}`;paper.userData.content=`${product.name} • ${quantity} garrafas`;if(ctx&&printed!==text){printed=text;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,640,384);ctx.fillStyle='#123451';ctx.font='bold 42px Segoe UI';ctx.fillText('CONTEÚDO',30,65);ctx.font='32px Segoe UI';ctx.fillText(product.name,30,145,580);ctx.fillText(`${quantity} garrafas · caixa ${index+1}`,30,205);for(let j=0;j<32;j++)ctx.fillRect(30+j*15,260,j%3?5:9,80);texture.needsUpdate=true;}return p;},
    dispose(){texture?.dispose();owned?.dispose();}
  };
}
