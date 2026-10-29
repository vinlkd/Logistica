import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {buildMaterialReceiving} from '../src/simulator/industries/material-receiving.js';
import {buildBottlePacking} from '../src/simulator/industries/bottle-packing.js';
import {bottleReceivingState,bottleReceivingDuration,bottleShippingPose,
  bottleEmptySlot,bottleTruckSlot,bottlePackingState} from '../src/simulator/industries/bottle-crate-flow.js';
import {BOTTLE_PACKING_LAYOUT as layout} from '../src/simulator/industries/bottle-packing-layout.js';
import {bottleCaseHome,bottleCasePose,caseApproachPose} from '../src/simulator/industries/bottle-cases.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';

function fixture(){
  const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};
  const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};
  const bar=(g,a,b,r,m)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av),o=cyl(g,...av.clone().add(bv).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  const createCopy=()=>{const g=new THREE.Group();cyl(g,0,.325,0,.18,.65,materials.white);cyl(g,0,.75,0,.18,.20,materials.white);cyl(g,0,.925,0,.07,.15,materials.white);return g;};
  return {THREE,root,box,cyl,bar,materials,definition:BEVERAGES,product:BEVERAGES.products[0],createCopy};
}
function meshList(root){const result=[];root.traverseVisible(o=>{if(o.isMesh)result.push(o);});return result;}
function record(mesh){
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const local=mesh.geometry.boundingBox;
  const obb=new OBB().fromBox3(local);obb.halfSize.subScalar(1e-6);obb.applyMatrix4(mesh.matrixWorld);
  return {mesh,obb,box:local.clone().applyMatrix4(mesh.matrixWorld)};
}
function intersects(a,b){return a.box.intersectsBox(b.box)&&a.obb.intersectsOBB(b.obb,1e-10);}
function assertClear(parts,obstacles,context){for(const a of parts)for(const b of obstacles)if(intersects(a,b))assert.fail(`${context}: ${a.mesh.name||a.mesh.geometry.type} cruzou ${b.mesh.name||b.mesh.geometry.type} @${b.mesh.position.toArray()}`);}
const pack=BEVERAGES.steps.find(step=>step.id==='pack'),seal=BEVERAGES.steps.find(step=>step.id==='seal');
function snapshot(index,progress){return {scope:'bench',step:pack,phase:'operating',progress,elapsed:100+index+progress,running:true,bottleTotal:108,total:108,done:index,unit:{id:`LOT-${String(index+1).padStart(3,'0')}`,product:'juice',packed:false},completedUnits:Array.from({length:index},(_,i)=>({id:`LOT-${String(i+1).padStart(3,'0')}`,product:'juice',packed:true,capped:true,labeled:true})),outputs:{work:true}};}
test('Bancada e12caixas ficamdepoisdoúltimorolete,semqualquersobreposição com a esteira',()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage('pack');model.update(snapshot(0,0));args.root.updateMatrixWorld(true);
  const table=new THREE.Box3().setFromObject(model.handling),end=pack.x+layout.beltEndX;assert.ok(table.min.x>end+.5);assert.equal(model.cases.length,12);
  for(const item of model.cases){const bounds=new THREE.Box3().setFromObject(item.group);assert.ok(bounds.min.x> end);assert.ok(bounds.min.x>=table.min.x&&bounds.max.x<=table.max.x);assert.ok(bounds.min.z>=table.min.z&&bounds.max.z<=table.max.z);assert.ok(Math.abs(bounds.min.y-table.max.y-.005)<1e-6);}
  model.dispose();
});
test('108destinos:chegadaatéfimdaesteira,garraaltaantespegar,apoioreal e folgasentregarrafas/caixas/estruturas',()=>{
  const args=fixture(),original=args.createCopy;args.createCopy=()=>{const group=original();args.cyl(group,0,1.035,0,.087,.07,args.materials.white);return group;};
  const model=buildBottlePacking(args),material=args.createCopy();args.root.add(material);model.selectStage('pack');
  const head=model.packingMachine.children.find(child=>child.isGroup),carriage=model.packingMachine.children.find(child=>child.isMesh&&child.geometry.parameters.width===.18);
  for(let index=0;index<108;index++){
    model.update(snapshot(index,0));args.root.updateMatrixWorld(true);
    const moving=new Set([...meshList(head),carriage]),fixed=meshList(model.group).filter(mesh=>!moving.has(mesh)).map(record),cartons=model.cases.flatMap(item=>meshList(item.group)).map(record);
    let previous=bottlePackingState(0,index);
    for(let sample=0;sample<=50;sample++){
      const t=sample/50,state=bottlePackingState(t,index);model.update(snapshot(index,t));material.position.set(pack.x+state.x,state.y,state.z);args.root.updateMatrixWorld(true);
      const active=meshList(material).map(record),tool=[...moving].map(record);assertClear(active,fixed.concat(tool),`Garrafa ${index}/${sample}`);assertClear(meshList(head).map(record),cartons,`Pinça ${index}/${sample}`);
      if(state.phases.feed<1){assert.equal(state.y,1.2);assert.ok(Math.abs(state.z)<1e-12);assert.equal(state.toolY,3.3);assert.equal(state.gripping,false);assert.ok(state.x<=layout.pickupX);}
      if(state.phases.grip>0)assert.equal(state.phases.feed,1);
      if(state.released){assert.equal(state.y,1.24);assert.equal(state.x,state.target.x);assert.equal(state.z,state.target.z);}
      if(sample)assert.ok(Math.hypot(state.x-previous.x,state.y-previous.y,state.z-previous.z)<=2.088*state.duration/50+1e-6);previous=state;
    }
  }
  model.dispose();
});
test('12caixas alcançam seladora após a esteira com suporte por toda a bancada e sem cruzar outras caixas',()=>{
  for(let index=0;index<12;index++)for(let sample=0;sample<=150;sample++){
    const pose=caseApproachPose(sample/150,index,seal.x,pack.x);assert.ok(pose.x-.765>=pack.x+layout.tableMinX-1e-8);assert.ok(pose.x+.765<=pack.x+layout.tableMaxX+1e-8);assert.ok(pose.z-.765>=layout.tableMinZ-1e-8);assert.ok(pose.z+.765<=layout.tableMaxZ+1e-8);
    for(let other=0;other<12;other++)if(other!==index){const home=bottleCaseHome(other,pack.x);assert.ok(Math.abs(pose.x-home.x)>=1.53-1e-8||Math.abs(pose.z-home.z)>=1.53-1e-8);}
  }
});
test('Checkpoint antigo de selagem migra posição,identidadeeprogressoparaobancodanovo',()=>{
  const session=createIndustrySession(BEVERAGES);session.selectEnvironment('seal');session.setQuantity(9);session.start();session.tick(.2);const state=session.exportState(),old=structuredClone(state);delete old.engine.layoutVersion;for(const key of ['x','fromX','toX'])old.engine[key]-=seal.x-6;
  const restored=createIndustrySession(BEVERAGES);assert.equal(restored.importState(old),true);assert.deepEqual(restored.snapshot.position,session.snapshot.position);assert.equal(restored.snapshot.unit.id,session.snapshot.unit.id);assert.equal(restored.snapshot.progress,session.snapshot.progress);assert.equal(restored.snapshot.running,false);
});


const positionNear = (actual,expected) => {for(const key of ["x","fromX","toX"])assert.ok(Math.abs(actual[key]-expected[key])<1e-9,`${key}: ${actual[key]} vs ${expected[key]}`);};
const previousLayout = {...BEVERAGES,layoutVersion:2,exitX:20.2,
  steps:BEVERAGES.steps.map(step=>({...step,x:step.id==='seal'?15.2:step.id==='ship'?17.2:step.x}))};
for(const stage of ['seal','ship'])test(`Checkpoint versão2 de ${stage} migra +0.7 sem perder identidade, fase ou progresso`,()=>{
 const old=createIndustrySession(previousLayout);old.selectEnvironment(stage);old.setQuantity(9);old.start();old.tick(.2);
 const saved=old.exportState();assert.equal(saved.engine.layoutVersion,2);const original=old.snapshot;
 const next=createIndustrySession(BEVERAGES);assert.equal(next.importState(saved),true);
 positionNear(next.snapshot.position,Object.fromEntries(Object.entries(original.position).map(([key,value])=>[key,value+.7])));
 assert.equal(next.snapshot.phase,original.phase);assert.equal(next.snapshot.progress,original.progress);assert.equal(next.snapshot.unit.id,original.unit.id);
 assert.equal(next.snapshot.running,false);assert.equal(next.exportState().engine.layoutVersion,3);
});
test('Checkpoint versão2 da linha em transferência para selagem preserva progresso no segmento remapeado',()=>{
 const old=createIndustrySession(previousLayout);old.setQuantity(9);old.setScope('line');old.setSpeed(8);old.start();
 let original;
 for(let i=0;i<10000;i++){old.tick(.1);const s=old.snapshot;if(s.step.id==='seal'&&s.phase==='moving'){original=s;break;}}
 assert.ok(original,'deve percorrer o trecho real entre embalagem e seladora');const saved=old.exportState();
 const next=createIndustrySession(BEVERAGES);assert.equal(next.importState(saved),true);const v=next.snapshot;
 assert.equal(v.position.fromX,pack.x);assert.equal(v.position.toX,seal.x);
 assert.ok(Math.abs(v.position.x-(v.position.fromX+(v.position.toX-v.position.fromX)*original.progress))<1e-9);
 assert.equal(v.progress,original.progress);assert.equal(v.phase,original.phase);assert.equal(v.unit.id,original.unit.id);assert.equal(v.running,false);
 assert.deepEqual(v.history,original.history);assert.equal(next.exportState().engine.layoutVersion,3);
});
