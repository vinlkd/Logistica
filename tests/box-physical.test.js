import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {buildMaterialReceiving} from '../src/simulator/industries/material-receiving.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {bottleCaseRecords,bottleCasePose,bottleCargoSlot,buildBottleCase,caseSealPose} from '../src/simulator/industries/bottle-cases.js';
import {buildBottlePacking} from '../src/simulator/industries/bottle-packing.js';
const overlap=(a,b)=>['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>1e-5);
function fixture(){const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape'].map(k=>[k,new THREE.MeshStandardMaterial()]));const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};const bar=(g,a,b,r,m)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av),o=cyl(g,...av.clone().add(bv).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};const createCopy=()=>{const g=new THREE.Group();cyl(g,0,.325,0,.18,.65,materials.white);cyl(g,0,.75,0,.18,.20,materials.white);cyl(g,0,.925,0,.07,.15,materials.white);return g;};return {THREE,root,box,cyl,bar,materials,definition:BEVERAGES,product:BEVERAGES.products[0],createCopy};}
function meshes(root){const out=[];root.traverseVisible(o=>{if(o.isMesh)out.push(o);});return out;}
for(const kind of ['discs','bottles'])test(`${kind}: caixa é puxada antes de retirar o material e todos os materiais conservam espaço`,()=>{
  const args=fixture(),model=buildMaterialReceiving(args,{kind,createCopy:args.createCopy}),material=kind==='discs'?new THREE.Group():args.createCopy();if(kind==='discs')args.cyl(material,0,.2225,0,.62,.025,args.materials.steel);args.root.add(material);
  const total=kind==='discs'?50:30;
  args.root.updateMatrixWorld(true);const truck=meshes(model.dock.truck).map(o=>new THREE.Box3().setFromObject(o));
  for(let done=0;done<total;done++)for(let i=0;i<=100;i++){
    const state=kind==='discs'?{phase:'feeding',progress:i/200,part:true,queue:total-done-1,done,unit:{product:'saucepan'}}:{phase:'operating',progress:i/100,total,done,step:BEVERAGES.steps[0],unit:{received:false}};
    const pose=model.update(state);material.position.set(pose.x,pose.y,pose.z);args.root.updateMatrixWorld(true);
    for(const crate of model.crates)if(crate.visible){const b=new THREE.Box3().setFromObject(crate);for(const obstacle of truck)assert.equal(overlap(b,obstacle),false,`Caixa de material cruzou caminh�o ${kind}/${done}/${i}`);}
    const active=meshes(material).map(o=>new THREE.Box3().setFromObject(o));
    for(const o of meshes(model.group)){const b=new THREE.Box3().setFromObject(o);for(const a of active)assert.equal(overlap(a,b),false,`Material cruzou ${o.name||o.geometry.type} ${kind}/${done}/${i} parent=${o.parent.name},pos=${o.position.toArray()},bounds=${b.min.toArray()}..${b.max.toArray()}`);}
  }
  model.dispose();
});
test('Caixas parciais mantêm quantidade, abas não atravessam garrafas e papel identifica conteúdo',()=>{
  const args=fixture();for(const quantity of [1,9,12,30]){const s={scope:'bench',step:{id:'seal'},bottleTotal:quantity,total:Math.ceil(quantity/9),done:0,unit:{caseIndex:0}},records=bottleCaseRecords(s,args.product);assert.deepEqual(records.cases.map(c=>c.units.length),quantity===30?[9,9,9,3]:quantity===12?[9,3]:[quantity]);}
  const item=buildBottleCase(args,args.root,0),bottles=Array.from({length:9},(_,i)=>{const copy=args.createCopy();copy.position.set((i%3-1)*.43,.04,(Math.floor(i/3)-1)*.43);item.group.add(copy);return copy;});
  for(let i=0;i<=200;i++){item.update(i/200,3);args.root.updateMatrixWorld(true);for(const flap of item.flaps)for(const bottle of bottles)assert.equal(overlap(new THREE.Box3().setFromObject(flap.group),new THREE.Box3().setFromObject(bottle)),false);}
  assert.equal(item.tape.visible,true);assert.equal(item.paper.visible,true);assert.match(item.paper.userData.content,/3 garrafas/);assert.deepEqual(caseSealPose(1),{minor:1,major:1,tape:1,paper:1,press:0});
});
test('Expedição leva somente caixas fechadas com todo o conteúdo, sem cruzar o baú ou outras caixas',()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage('ship');args.root.updateMatrixWorld(true);const truck=meshes(model.shippingDock.truck).map(o=>new THREE.Box3().setFromObject(o)),loaded=[];
  for(let done=0;done<4;done++){
    for(let i=0;i<=200;i++){
      const s={scope:'bench',step:BEVERAGES.steps.at(-1),phase:'operating',progress:i/200,bottleTotal:30,total:4,done,unit:{caseIndex:done,caseQuantity:done===3?3:9,packed:true,caseSealed:true,caseTaped:true,caseIdentified:true}};
      model.update(s);args.root.updateMatrixWorld(true);const item=model.cases[done],b=new THREE.Box3().setFromObject(item.group);for(const obstacle of truck)assert.equal(overlap(b,obstacle),false,`Baú ${done}/${i}`);for(const old of loaded)assert.equal(overlap(b,old),false,`Carga ${done}/${i}`);assert.equal(item.paper.visible,true);
      assert.equal(item.group.children.filter(o=>o.name.startsWith('Garrafa encaixotada')).length,done===3?3:9);
    }
    loaded.push(new THREE.Box3().setFromObject(model.cases[done].group));
  }
  model.dispose();
});


import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
for(const id of ['seal','ship'])test(`Bancada ${id}: quatro caixas aproximam sem atravessar outras ou a fechadora`,()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage(id);
  const step=BEVERAGES.steps.find(s=>s.id===id);
  for(let done=0;done<4;done++)for(const phase of id==='seal'?['moving','outgoing']:['moving'])for(let i=0;i<=100;i++){
    const s={scope:'bench',step,phase,progress:i/100,bottleTotal:30,total:4,done,unit:{caseIndex:done,caseQuantity:done===3?3:9,caseSealed:id==='ship'||phase==='outgoing',caseTaped:true,caseIdentified:true,packed:true}};
    model.update(s);args.root.updateMatrixWorld(true);const active=model.cases[done],parts=meshes(active.group).map(o=>new THREE.Box3().setFromObject(o));
    for(let j=0;j<4;j++)if(j!==done){const other=new THREE.Box3().setFromObject(model.cases[j].group);for(const part of parts)assert.equal(overlap(part,other),false,`Outra caixa ${id}/${done}/${phase}/${i}/${j}`);}
    if(id==='seal')for(const obstacle of meshes(model.sealingMachine))for(const part of parts)assert.equal(overlap(part,new THREE.Box3().setFromObject(obstacle)),false,`Fechadora ${done}/${phase}/${i}/${obstacle.position.toArray()}`);
  }
  model.dispose();
});
test('Linha 12 conserva caixas9/3 em pausa, restaura��o e fim da expedi��o',()=>{
  const args=fixture(),model=buildBottlePacking(args),session=createIndustrySession(BEVERAGES);session.setScope('line');session.setQuantity(12);session.setSpeed(4);session.start();let paused=false,n=0;
  while(session.snapshot.phase!=='complete'&&n++<10000){session.tick(.05);const s=session.snapshot;if(!paused&&s.step.id==='seal'&&s.phase==='operating'&&s.progress>.5){model.selectStage('seal');model.update(s);const before=model.cases.map(c=>c.group.position.toArray());session.pause();session.tick(.25);model.update(session.snapshot);assert.deepEqual(model.cases.map(c=>c.group.position.toArray()),before);const checkpoint=session.exportState(),restored=createIndustrySession(BEVERAGES);assert.equal(restored.importState(checkpoint),true);assert.deepEqual(bottleCaseRecords(restored.snapshot,args.product),bottleCaseRecords(session.snapshot,args.product));session.start();paused=true;}}
  assert.equal(paused,true);assert.equal(session.snapshot.done,12);const records=bottleCaseRecords(session.snapshot,args.product);assert.deepEqual(records.cases.map(c=>c.units.length),[9,3]);assert.equal(records.cases.every(c=>c.sealed&&c.taped&&c.identified&&c.shipped),true);model.selectStage('ship');model.update(session.snapshot);model.cases.slice(0,2).forEach((c,i)=>assert.deepEqual(c.group.position.toArray(),Object.values(bottleCargoSlot(i))));model.dispose();
});
