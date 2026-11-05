import {buildBottleWarehouse} from './bottle-warehouse.js';
import {sealWarehouseProgress} from './bottle-warehouse-flow.js';
import {createMotionAuthorization} from './motion-authorization.js';
import {bottlePackingState} from './bottle-crate-flow.js';
import {BOTTLE_PACKING_LAYOUT as layout} from './bottle-packing-layout.js';
import {buildBottleCaseTransfer,bottleCaseTransferState} from './bottle-case-transfer.js';
import {BEVERAGE_CIRCUIT_CASE_TARGET_X,beverageCircuitCaseHandoff} from './beverage-circuit-layout.js';
import {ease} from './factory-helpers.js';
import {buildTruckDock} from './truck-dock.js';
import {BOTTLES_PER_CASE,CASE_INNER,bottleCaseSlot,bottleCaseRecords,bottleCasePose,bottleCargoSlot,buildBottleCase,caseSealPose} from './bottle-cases.js';
export {BOTTLES_PER_CASE,CASE_INNER,bottleCaseSlot} from './bottle-cases.js';
export const bottlePackingPose=bottlePackingState;
export function buildBottlePacking(args){
  const {THREE,root,box,cyl,materials:m,definition,createCopy,product}=args,packX=definition.steps.find(s=>s.id==='pack').x,sealX=definition.steps.find(s=>s.id==='seal')?.x??6,shipX=definition.steps.at(-1).x;
  const group=new THREE.Group();group.name='Caixas • encaixotar, fechar, identificar e expedir';root.add(group);
  let authorizeMotion=createMotionAuthorization(),authorizeCaseMotion=createMotionAuthorization();
  const sealFrameY=4.9,sealFrameBottom=sealFrameY-.06;
  let dockPose={x:shipX+4.1,y:1.2,z:0},returnCycle,lastPackingPose;
  const cases=Array.from({length:12},(_,index)=>buildBottleCase(args,group,index)),copies=new Map();let selected=definition.steps[0].id;
  const handling=new THREE.Group();group.add(handling);handling.name='Mesa de transferência das caixas';
  box(handling,packX+(layout.tableMinX+layout.tableMaxX)/2,1.145,(layout.tableMinZ+layout.tableMaxZ)/2,layout.tableMaxX-layout.tableMinX,.1,layout.tableMaxZ-layout.tableMinZ,m.steel);
  for(const x of [packX+layout.tableMinX+.15,packX+8,packX+layout.tableMaxX-.15])for(const z of [-11,.70])box(handling,x,.5475,z,.1,1.095,.1,m.steel);
  const packingMachine=new THREE.Group();group.add(packingMachine);packingMachine.name='Garra coloca garrafas na caixa';
  for(const x of [packX+layout.frameMinX,packX+layout.frameMaxX])for(const z of [layout.frameMaxZ,layout.frameMinZ])box(packingMachine,x,2.6,z,.12,5.2,.12,m.accent);
  for(const z of [layout.frameMaxZ,layout.frameMinZ])box(packingMachine,packX+(layout.frameMinX+layout.frameMaxX)/2,5.2,z,layout.frameMaxX-layout.frameMinX+.12,.16,.16,m.steel);
  const carriage=box(packingMachine,packX+layout.pickupX,5.03,(layout.frameMinZ+layout.frameMaxZ)/2,.18,.16,layout.frameMaxZ-layout.frameMinZ+.12,m.steel),head=new THREE.Group();packingMachine.add(head);
  const rod=cyl(head,0,2,0,.035,1,m.steel);box(head,0,1.15,0,.3,.12,.25,m.dark);
  const jaws=[-1,1].map(side=>box(head,side*.105,.91,0,.06,.12,.1,m.dark));
  const sealingMachine=new THREE.Group();sealingMachine.name='Fechadora • fita e etiqueta da caixa';group.add(sealingMachine);
  box(sealingMachine,sealX,sealFrameY/2,-1.7,.14,sealFrameY,.14,m.accent);box(sealingMachine,sealX,sealFrameY,-.85,.12,.12,1.82,m.steel);
  const roller=cyl(sealingMachine,sealX-.65,2.78,0,.09,.14,m.dark);roller.rotation.x=Math.PI/2;
  const rollerRod=cyl(sealingMachine,sealX-.65,3.1,0,.025,1,m.steel);
  box(sealingMachine,sealX+.25,2.88,1.85,.5,.06,.42,m.white);
  const labelHead=new THREE.Group();sealingMachine.add(labelHead);box(labelHead,0,.05,0,.40,.07,.32,m.steel);
  const heldPaper=box(labelHead,0,0,0,.38,.006,.30,m.white),labelRod=cyl(sealingMachine,sealX+.25,3.2,1,.025,1,m.steel);
  const pushers=[];
  box(sealingMachine,sealX,sealFrameY,0,2.16,.12,.12,m.steel);
  box(sealingMachine,sealX,sealFrameY,0,.12,.12,1.72,m.steel);
  box(sealingMachine,sealX+.25,sealFrameY,.975,.12,.12,2.07,m.steel);
  for(const side of [-1,1])for(const axis of ['x','z']){const pusher=box(sealingMachine,0,0,0,.06,.06,.3,m.dark);const drive=cyl(sealingMachine,0,3,0,.018,1,m.steel);pushers.push({mesh:pusher,drive,side,axis});}
  const warehouse=buildBottleWarehouse({...args,root:group},{kind:'finished',x:sealX});
  const caseTransfer=buildBottleCaseTransfer({...args,root:group},args.circuit
    ? {packX,shipX:BEVERAGE_CIRCUIT_CASE_TARGET_X,supportMaxX:packX+layout.tableMaxX-.4}
    : {packX,shipX});
  const shippingDock=buildTruckDock({...args,root:group},{shipping:true,stageId:'ship',x:shipX,upperShelf:true});
  // The broad table replaces the dock's short input conveyor without overlap.
  const short=shippingDock.group.children.find(o=>o.isMesh&&o.geometry.parameters.width===2.4&&o.geometry.parameters.depth===1.45);if(short){short.geometry.dispose();short.removeFromParent();}
  function updateSealer(t,c){
    const p=caseSealPose(t),top=2.431,lower=ease((t-.6)/.05),raise=ease((t-.82)/.08),back=ease((t-.90)/.10);
    roller.position.set(sealX-.65*lower*(1-back)+1.3*p.tape*(1-back),top+.09+.85*(1-lower)+.85*raise,0);roller.rotation.z=t*20;
    rollerRod.position.set(roller.position.x,(roller.position.y+.09+sealFrameBottom)/2,0);rollerRod.scale.y=Math.max(.02,sealFrameBottom-roller.position.y-.09);
    let z=1.85-(1.85-.29)*ease((t-.84)/.06),y=1.68-(1.68-1.244)*ease((t-.90)/.03);
    if(t>.94)y=1.244+(1.68-1.244)*ease((t-.94)/.03);
    if(t>.97)z=.29+(1.85-.29)*ease((t-.97)/.03);
    labelHead.position.set(sealX+.25,1.2+y,z);heldPaper.visible=t<.93||t>=.999;
    labelRod.position.set(sealX+.25,(labelHead.position.y+.085+sealFrameBottom)/2,z);labelRod.scale.y=Math.max(.02,sealFrameBottom-labelHead.position.y-.085);
    pushers.forEach(({mesh,drive,side,axis})=>{
      const minor=axis==='x',angle=(Math.PI/2)*(1-p[minor?'minor':'major']),reset=ease((t-.97)/.03);
      let radial=.755-.3775*Math.cos(angle)+.042*Math.sin(angle),height=1.2+(minor?1.195:1.22)+.3775*Math.sin(angle)+.042*Math.cos(angle);
      radial+=(.797-radial)*reset;
      const park=1-ease(t/.05)+ease((t-.93)/.04);height+=(3.55-height)*Math.min(1,park);
      mesh.position.set(sealX+(minor?side*radial:0),height,minor?0:side*radial);mesh.rotation.set(minor?0:side*angle,0,minor?-side*angle:0);
      drive.position.set(mesh.position.x,(height+.04+sealFrameBottom)/2,mesh.position.z);drive.scale.y=Math.max(.01,sealFrameBottom-height-.04);
    });
    heldPaper.userData.content=c?.paper.userData.content;
  }
  return {group,cases,copies,shippingDock,sealingMachine,packingMachine,warehouse,handling,caseTransfer,
    get packingState(){return lastPackingPose;},
    selectStage(id){if(id!==selected){authorizeMotion=createMotionAuthorization();authorizeCaseMotion=createMotionAuthorization();}selected=id;},
    update(s){
      const continuous=args.circuit&&s.scope==='line';
      group.visible=['pack','seal','ship'].includes(args.stationView?selected:s.step?.id);packingMachine.visible=selected==='pack';sealingMachine.visible=!continuous&&['pack','seal'].includes(selected);shippingDock.group.visible=selected==='ship';warehouse.group.visible=selected==='seal';
      const permission=authorizeMotion(s);
      const records=bottleCaseRecords(s,product),active=records.active,live=new Set();
      const source=s.caseTransfer?.hasMaterial&&s.caseTransfer.unit?.packed?{...s,...s.caseTransfer,caseTransfer:undefined}:s;
      const casePermission=authorizeCaseMotion(source),sourceId=source.step?.id,sourceIndex=bottleCaseRecords(source,product).active;
      const joined=continuous&&sourceId==='seal'&&source.hasMaterial&&source.unit?.packed;
      const handoff=joined&&source.phase==='moving'?beverageCircuitCaseHandoff(sourceIndex,source.progress):null;
      const targetX=continuous?BEVERAGE_CIRCUIT_CASE_TARGET_X:sourceId==='ship'?shipX:sealX;
      const approach=['seal','ship'].includes(sourceId)&&source.phase==='moving'&&(sourceId==='seal'||source.scope==='bench'),returning=sourceId==='seal'&&source.scope==='bench'&&source.phase==='outgoing';
      const caseState=bottleCaseTransferState(approach?(handoff?.hoistProgress??source.progress):returning?1-source.progress:source.phase==='ready'?0:1,sourceIndex,targetX,packX);
      if(casePermission.initialize||approach&&casePermission.allows('motor')||returning&&casePermission.allows('transfer')||sourceId==='seal'&&source.phase==='operating'&&casePermission.allows('work'))caseTransfer.update(caseState);
      cases.forEach((item,index)=>{
        const c=records.cases[index]??{index,expected:0,units:[],sealed:false,taped:false,identified:false,shipped:false};
        const stocked=s.onDemand&&s.inventory?.boxes.some(record=>record.lotId===s.inventory.lotId&&record.sourceId===`CASE-${String(index+1).padStart(2,'0')}`);
        const delivered=joined&&index===sourceIndex&&(handoff?.onWarehouse||source.phase==='operating');
        item.group.visible=!stocked&&!delivered&&(!c.shipped||selected==='ship');
        const phaseOutput=s.phase==='moving'?'motor':s.phase==='outgoing'?'transfer':'work';
        const transferActive=['moving','operating','outgoing'].includes(s.phase)&&permission.allows(phaseOutput);
        const external=source!==s&&index===sourceIndex&&source.hasMaterial;
        const output=source.phase==='moving'?'motor':source.phase==='outgoing'?'transfer':'work';
        if(external?(casePermission.initialize||casePermission.allows(output)):(permission.initialize||transferActive||permission.ended('seal')||permission.ended('ship'))){
          const pose=joined&&index===sourceIndex?caseState.material:external&&source.phase==='operating'?{x:sealX,y:1.2,z:0}:bottleCasePose(external?source:s,c,external?sourceIndex:active,definition);item.group.position.set(pose.x,pose.y,pose.z);
        }
        const sealing=sourceId==='seal'&&source.phase==='operating'&&index===sourceIndex,progress=sealing?(source.onDemand?Math.min(1,source.progress*(source.step.duration??34.1)/7):sealWarehouseProgress(source.progress,index).closingProgress):c.sealed?1:0;if(permission.initialize||sealing&&casePermission.allows('work')||permission.ended('seal'))item.update(progress,c.expected);
        c.units.forEach((unit,slotIndex)=>{const key=`${index}/${unit.id}`;live.add(key);if(!copies.has(key)){const copy=createCopy(unit);copy.name=`Garrafa encaixotada ${unit.id}`;item.group.add(copy);copies.set(key,copy);}const copy=copies.get(key),slot=bottleCaseSlot(index*9+slotIndex);copy.position.set(slot.x-slot.cx,.04,slot.z-slot.cz);copy.visible=true;
          const closed=item.flaps.every(f=>Math.abs(f.group.rotation[f.axis])<1e-8);
          if(copy.userData.closedOcclusion!==closed){copy.userData.closedOcclusion=closed;copy.traverse(o=>{if(o.isMesh)o.layers.set(closed?31:0);});}});
      });
      for(const [key,copy]of copies)if(!live.has(key)){copy.removeFromParent();copies.delete(key);}
      const packing=s.step?.id==='pack'&&s.phase==='operating',index=s.done??0,p=bottlePackingPose(packing?s.progress:0,index);
      if(permission.initialize||packing&&permission.allows('work')){lastPackingPose=p;carriage.position.x=packX+p.toolX;head.position.set(packX+p.toolX,p.toolY,p.toolZ);const bottom=1.21,top=5.0-p.toolY;rod.position.y=(bottom+top)/2;rod.scale.y=Math.max(.01,top-bottom);jaws.forEach((jaw,i)=>jaw.position.x=(i?-1:1)*(.1+p.jawGap));}
      const sealing=sourceId==='seal'&&source.phase==='operating';if(permission.initialize||sealing&&casePermission.allows('work')){const w=sealWarehouseProgress(sealing?source.progress:0,sourceIndex),closing=sealing&&source.onDemand?Math.min(1,source.progress*(source.step.duration??34.1)/7):w.closingProgress;updateSealer(closing,cases[sourceIndex]);if(!source.onDemand)warehouse.update(w.warehouseProgress,sourceIndex,{quantity:records.cases[sourceIndex]?.units.length??0,id:`CASE-${sourceIndex+1}`});}
      const shipping=s.step?.id==='ship'&&s.phase==='operating',record=records.cases[active];
      const load=shipping&&record?.sealed&&record.taped&&record.identified&&record.units.length===record.expected,pose=load?bottleCasePose(s,record,active,definition):null;
      let moveDock=false;
      if(permission.initialize){
        const stored=records.cases.filter(c=>c.shipped).at(-1);
        if(stored)dockPose=bottleCargoSlot(stored.index,shipX);
        moveDock=true;
      }
      if(s.step?.id==='ship'&&s.phase==='moving'&&permission.allows('motor')){
        if(!returnCycle||returnCycle.index!==active)returnCycle={index:active,start:{...dockPose}};
        const q=Math.max(0,Math.min(1,s.progress)),retract=Math.min(1,q/.4),lower=Math.max(0,Math.min(1,(q-.4)/.3)),reach=Math.max(0,Math.min(1,(q-.7)/.3));
        dockPose={x:returnCycle.start.x+(shipX+4.1-returnCycle.start.x)*retract-4.1*reach,
          y:returnCycle.start.y+(1.2-returnCycle.start.y)*lower,z:returnCycle.start.z*(1-lower)};
        moveDock=true;
      }
      if(load&&permission.allows('work')){dockPose=pose;moveDock=true;}
      if(permission.ended('ship')&&record?.shipped){dockPose=bottleCargoSlot(active,shipX);moveDock=true;}
      if(moveDock)shippingDock.update({pose:{...dockPose,bottom:dockPose.y,width:1.46,depth:1.46},support:dockPose.y-.005,active:true,showTool:true});
      const held=lastPackingPose??p;
      return packing?{...held,x:held.x+packX}:null;
    },
    dispose(){caseTransfer.dispose();warehouse.dispose();shippingDock.dispose();cases.forEach(c=>c.dispose());}
  };
}
