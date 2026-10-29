import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PARCELS, PARCEL_ROUTES, buildParcelsModel, parcelLoadingMotion, parcelCargoSlot } from "../src/simulator/industries/parcels.js";
import { FURNITURE } from "../src/simulator/industries/definitions.js";
import { buildFurnitureModel } from "../src/simulator/industries/furniture-model.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
const volumeOverlap=(a,b)=>['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>1e-6);
const boxAt=p=>new THREE.Box3(new THREE.Vector3(p.x-.36,p.y-.31,p.z-.29),new THREE.Vector3(p.x+.36,p.y+.31,p.z+.29));
for(const route of PARCEL_ROUTES)test(`carga ${route.name}: 30 volumes sem saltos, colisões ou soltura no ar`,()=>{
  const root=new THREE.Group(),model=buildParcelsModel({THREE,root,product:{id:route.id}}),step=PARCELS.steps.at(-1);
  for(let done=0;done<30;done++){
    let previous;
    const stored=Array.from({length:done},(_,i)=>boxAt(parcelCargoSlot(i,route.id)));
    for(let i=0;i<=400;i++){
      const s={phase:'operating',step,progress:i/400,done,total:30,unit:{destination:route.id},position:{x:step.x}},motion=parcelLoadingMotion(s),bounds=boxAt(motion.pose);
      if(previous){assert.ok(Math.hypot(motion.pose.x-previous.pose.x,motion.pose.y-previous.pose.y,motion.pose.z-previous.pose.z)<.1);assert.ok(Math.hypot(motion.tool.x-previous.tool.x,motion.tool.y-previous.tool.y,motion.tool.z-previous.tool.z)<.1);}
      for(const cargo of stored)assert.equal(volumeOverlap(bounds,cargo),false,`Cruzou volume já carregado ${done}/${i}`);
      model.update(s);root.updateMatrixWorld(true);
      const dock=model.trucks.find(d=>d.group.userData.route===route.id);
      assert.equal(dock.transfer.visible,true);
      for(const fork of dock.forks){const b=new THREE.Box3().setFromObject(fork);assert.ok(Math.abs(b.max.y-bounds.min.y)<1e-7,'Garfo n�o apoia o volume');for(const cargo of stored)assert.equal(volumeOverlap(b,cargo),false,'Garfo cruza carga anterior');}
      previous=motion;
    }
    const before=parcelLoadingMotion({phase:'operating',step,progress:1,done,unit:{destination:route.id}}).pose;
    model.update({phase:'complete',step,done:done+1,total:done+1,unit:{destination:route.id,loaded:true},position:{x:8.6}});root.updateMatrixWorld(true);
    assert.equal(model.parcel.visible,true);assert.ok(model.parcel.position.distanceTo(new THREE.Vector3(before.x,before.y,before.z))<1e-8);
    assert.equal(model.cargo.filter(o=>o.visible).length,done);
    model.update({phase:'ready',step:PARCELS.steps[0],done:done+1,total:30,unit:{destination:route.id},position:{x:-8}});
    assert.equal(model.cargo[done].visible,true);assert.ok(model.cargo[done].position.distanceTo(new THREE.Vector3(before.x,before.y,before.z))<1e-8,'Carga sumiu ao entrar a próxima encomenda');
  }
  model.dispose();
});
function furnitureFixture(product){
  const root=new THREE.Group(),materials=Object.fromEntries(['steel','dark','blue','white','yellow','wood','glass','green','accent','box','water'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};
  const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};
  const bar=(g,a,b,r,m)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va),o=cyl(g,...va.clone().add(vb).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  const model=buildFurnitureModel({THREE,root,materials,definition:FURNITURE,product,box,cyl,bar}),settings=Object.fromEntries(FURNITURE.controls.map(c=>[c.id,c.value]));
  const unit={id:'LOT-001',...FURNITURE.initialize(product,settings),cut:true,drilled:true};
  return {root,model,settings,unit,dispose(){root.traverse(o=>o.geometry?.dispose());Object.values(materials).forEach(m=>m.dispose());}};
}
for(const product of FURNITURE.products)test(`móveis ${product.id}: pernas saem do alimentador e apoio retrai antes da transferência`,()=>{
  const f=furnitureFixture(product),{model,unit,settings,root}=f,step=FURNITURE.steps.find(s=>s.id==='assemble');let previous;
  for(let i=0;i<=1000;i++){
    model.update({phase:'moving',step,progress:i/1000,unit,settings,position:{x:step.x-4.2*(1-i/1000)}});root.updateMatrixWorld(true);
    const p=model.spareLegs[0].getWorldPosition(new THREE.Vector3());if(previous)assert.ok(p.distanceTo(previous)<.02);previous=p;
    assert.ok(Math.abs(p.y-.425-1.2)<1e-8);assert.ok(Math.abs(model.spareLegs[0].scale.y-1)<1e-8);
  }
  let padY;
  for(let i=0;i<=1000;i++){
    const t=i/1000;model.update({phase:'operating',step,progress:t,unit,settings,position:{x:step.x}});root.updateMatrixWorld(true);
    if(padY!==undefined)assert.ok(Math.abs(model.pad.position.y-padY)<.02);padY=model.pad.position.y;
    if(t===.75){const leg=model.legs[0].getWorldPosition(new THREE.Vector3()),spare=model.spareLegs[0].getWorldPosition(new THREE.Vector3());assert.ok(leg.distanceTo(spare)<1e-8,'Montante teletransportou ao encaixar');}
  }
  assert.ok(Math.abs(model.pad.position.y-1.16)<1e-8);
  unit.assembled=true;model.update({phase:'outgoing',step,progress:0,unit,settings,position:{x:step.x}});assert.ok(Math.abs(model.pad.position.y-padY)<1e-8);
  model.update({phase:'complete',step,progress:0,unit,settings,position:{x:9}});assert.equal(model.piece.visible,true);
  f.dispose();
});
for(const product of FURNITURE.products)test(`móveis ${product.id}: saída mantém a unidade anterior e congela ao pausar`,()=>{
  const f=furnitureFixture(product),session=createIndustrySession(FURNITURE);session.setProduct(product.id);session.selectEnvironment('pack');session.setQuantity(3);session.setSpeed(4);f.model.selectStage('pack');session.start();
  let previous=session.snapshot,lastPosition,paused=false;
  for(let i=0;i<5000&&session.snapshot.phase!=='complete';i++){
    session.tick(.025);const current=session.snapshot;f.model.update(current,.025);f.root.updateMatrixWorld(true);
    if(previous.unit.id!==current.unit.id){const old=f.model.output.group.children.find(o=>o.name===`Móvel concluído ${previous.unit.id}`);assert.ok(old?.visible,'Móvel anterior desapareceu');assert.ok(old.getWorldPosition(new THREE.Vector3()).distanceTo(lastPosition)<.1,'Saída teletransportou na troca de ID');}
    if(!paused&&current.done===1){session.pause();const before=f.model.output.group.children.filter(o=>o.isGroup).map(o=>o.position.toArray());session.tick(.25);f.model.update(session.snapshot,.25);assert.deepEqual(f.model.output.group.children.filter(o=>o.isGroup).map(o=>o.position.toArray()),before);session.start();paused=true;}
    lastPosition=f.model.piece.getWorldPosition(new THREE.Vector3());previous=current;
  }
  assert.equal(session.snapshot.done,3);assert.equal(f.model.piece.visible,true);assert.equal(f.model.output.group.children.filter(o=>o.isGroup&&o.visible).length,2);
  const units=f.model.output.group.children.filter(o=>o.isGroup&&o.visible).concat(f.model.piece),bounds=units.map(o=>new THREE.Box3().setFromObject(o));
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++)assert.equal(volumeOverlap(bounds[i],bounds[j]),false,'Móveis da saída se atravessam');
  f.model.dispose();f.dispose();
});
for(const product of FURNITURE.products)test(`corte ${product.id}: sobras não atravessam o tampo e permanecem na coleta`,()=>{
  const f=furnitureFixture(product),step=FURNITURE.steps.find(s=>s.id==='cut');f.unit.cut=false;f.unit.drilled=false;
  for(let unitIndex=0;unitIndex<30;unitIndex++){
    f.unit.id=`LOT-${String(unitIndex+1).padStart(3,'0')}`;
    const history=Array.from({length:unitIndex},(_,i)=>({unit:`LOT-${String(i+1).padStart(3,'0')}`,step:'cut',time:i}));
    for(let i=751;i<=1000;i+=2){
      const progress=i/1000;f.model.update({phase:'operating',step,progress,unit:f.unit,settings:f.settings,position:{x:step.x},history});f.root.updateMatrixWorld(true);
      const scrap=new THREE.Box3().setFromObject(f.model.offcut),board=new THREE.Box3().setFromObject(f.model.board);
      assert.equal(volumeOverlap(scrap,board),false,'Sobra atravessa o tampo após separar');
      for(const saved of f.model.scraps)if(saved.visible)assert.equal(volumeOverlap(scrap,new THREE.Box3().setFromObject(saved)),false,'Sobra atravessa outra sobra');
      assert.equal(volumeOverlap(new THREE.Box3().setFromObject(f.model.ejector),board),false,'Ejetor atravessa o tampo');
    }
    const landed=f.model.offcut.position.clone();f.unit.cut=true;f.model.update({phase:'outgoing',step,progress:0,unit:f.unit,settings:f.settings,position:{x:step.x},history});assert.ok(f.model.offcut.position.distanceTo(landed)<.03);
    f.unit.cut=false;f.unit.id=`LOT-${String(unitIndex+2).padStart(3,'0')}`;f.model.update({phase:'ready',step,progress:0,unit:f.unit,settings:f.settings,position:{x:step.x-4.2},history:history.concat({unit:`LOT-${String(unitIndex+1).padStart(3,'0')}`,step:'cut'})});
    assert.equal(f.model.scraps[unitIndex].visible,true);assert.ok(f.model.scraps[unitIndex].position.distanceTo(landed)<.03,'Sobra apagou ou mudou de lugar no próximo ciclo');
  }
  f.model.dispose();f.dispose();
});
