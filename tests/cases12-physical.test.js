import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {buildMaterialReceiving} from '../src/simulator/industries/material-receiving.js';
import {buildBottlePacking} from '../src/simulator/industries/bottle-packing.js';
import {bottleReceivingState,bottleReceivingDuration,bottleShippingPose,
  bottleEmptySlot,bottleTruckSlot,bottlePackingState} from '../src/simulator/industries/bottle-crate-flow.js';

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
  mesh.geometry.computeBoundingBox();const local=mesh.geometry.boundingBox;
  const obb=new OBB().fromBox3(local);obb.halfSize.subScalar(1e-6);obb.applyMatrix4(mesh.matrixWorld);
  return {mesh,obb,box:local.clone().applyMatrix4(mesh.matrixWorld)};
}
function intersects(a,b){return a.box.intersectsBox(b.box)&&a.obb.intersectsOBB(b.obb,1e-10);}
function assertClear(parts,obstacles,context){for(const a of parts)for(const b of obstacles)if(intersects(a,b))assert.fail(`${context}: ${a.mesh.name||a.mesh.geometry.type} cruzou ${b.mesh.name||b.mesh.geometry.type} @${b.mesh.position.toArray()}`);}

test('Recebimento mantém12 caixas e retira108 garrafas, inclusive última caixa e pausa/restauração',()=>{
  const args=fixture(),model=buildMaterialReceiving(args,{kind:'bottles',createCopy:args.createCopy});
  assert.equal(model.crates.length,12);assert.equal(model.copies.size,108);
  for(let done=0;done<108;done++){
    const start={phase:'ready',progress:0,total:108,done,step:BEVERAGES.steps[0],unit:{received:false}};
    assert.ok(model.update(start));
    const end={...start,phase:'operating',progress:1},pose=model.update(end);
    assert.deepEqual(pose,{x:BEVERAGES.steps[0].x,y:1.2,z:0});
    assert.equal([...model.copies.values()].filter(o=>o.visible).length,107-done);
    const before=model.crates.map(c=>c.position.toArray());model.update(structuredClone(end));
    assert.deepEqual(model.crates.map(c=>c.position.toArray()),before);
    assert.ok(bottleReceivingDuration(done)>0);
  }
  model.update({phase:'complete',progress:0,total:108,done:108,step:BEVERAGES.steps[0],unit:{received:true}});
  assert.equal([...model.copies.values()].filter(o=>o.visible).length,0);
  model.crates.forEach((c,i)=>assert.deepEqual(c.position.toArray(),Object.values(bottleEmptySlot(i))));
  model.dispose();
});

test('Todas12 caixas saem fechadas do baú, abrem fora dele e mecanismos respeitam caixas e materiais',()=>{
  const args=fixture(),model=buildMaterialReceiving(args,{kind:'bottles',createCopy:args.createCopy}),material=args.createCopy();args.root.add(material);
  const indices=Array.from({length:12},(_,i)=>[i*9,i*9+8]).flat();
  for(const done of indices)for(let sample=0;sample<=80;sample++){
    const progress=sample/80,s={phase:'operating',progress,total:108,done,step:BEVERAGES.steps[0],unit:{received:false}};
    const pose=model.update(s);material.position.set(pose.x,pose.y,pose.z);args.root.updateMatrixWorld(true);
    const all=meshList(model.group).map(record),active=meshList(material).map(record);
    assertClear(active,all,`Material ${done}/${sample}`);
    const cartons=model.sourceCases.flatMap(c=>meshList(c.group)).map(record);
    const carrier=[...meshList(model.dock.transfer),...meshList(model.dock.hoist)].map(record);
    const vehicle=meshList(model.dock.truck).map(record);
    assertClear(carrier,cartons.concat(vehicle),`Berço ${done}/${sample}`);
    const tool=[...meshList(model.head),model.rod].map(record);
    assertClear(tool,cartons,`Pinça ${done}/${sample}`);
    const state=bottleReceivingState(done,'operating',progress);
    if(state.minor>0||state.major>0){assert.ok(state.crate.x-0.765>-5.8||state.crate.z-.765>1.6);assert.equal(state.crate.y,1.2);}
    for(const item of model.sourceCases){const pieces=meshList(item.group).map(record);assertClear(pieces,vehicle,`Caixa ${done}/${sample}`);}
    const flapParts=model.sourceCases[state.caseIndex].flaps.flatMap(f=>meshList(f.group)).map(record);
    const opening=model.openers.flatMap(o=>[o.shoe,o.drive]).map(record);
    assertClear(opening,flapParts,`Abridor ${done}/${sample}`);
  }
  model.dispose();
});

test('Expedição mantém12 caixas físicas e carrega12×9 reais em dois níveis sem atravessar baú/cargas',()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage('ship');assert.equal(model.cases.length,12);
  for(let done=0;done<12;done++)for(let sample=0;sample<=100;sample++){
    const s={scope:'bench',step:BEVERAGES.steps.at(-1),phase:'operating',progress:sample/100,bottleTotal:108,total:12,done,unit:{caseIndex:done,caseQuantity:9,packed:true,caseSealed:true,caseTaped:true,caseIdentified:true}};
    model.update(s);args.root.updateMatrixWorld(true);
    const active=meshList(model.cases[done].group).map(record),truck=meshList(model.shippingDock.truck).map(record);
    assertClear(active,truck,`Carga ${done}/${sample}`);
    for(let i=0;i<done;i++)assertClear(active,meshList(model.cases[i].group).map(record),`Outra carga ${done}/${sample}/${i}`);
    assert.equal(model.cases[done].group.children.filter(c=>c.name.startsWith('Garrafa encaixotada')).length,9);
    const expected=bottleShippingPose(sample/100,done);assert.deepEqual(model.cases[done].group.position.toArray(),Object.values(expected));
  }
  for(let i=0;i<12;i++)assert.deepEqual(model.cases[i].group.position.toArray(),Object.values(bottleTruckSlot(i)));
  model.dispose();
});

test('Packing alcança108 destinos com pinça capturando antes de elevar e sem saltos',()=>{
  for(let index=0;index<108;index++){
    let previous=bottlePackingState(0,index);
    for(let i=1;i<=500;i++){
      const p=bottlePackingState(i/500,index),dt=p.duration/500;
      assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<=2.088*dt+1e-6);
      assert.ok(Math.hypot(p.toolX-previous.toolX,p.toolY-previous.toolY,p.toolZ-previous.toolZ)<=2.088*dt+1e-6);
      if(p.phases.lift>0&&p.phases.release===0)assert.equal(p.jawGap,0);
      if(p.released)assert.deepEqual([p.x,p.y,p.z],[p.target.x,p.target.y,p.target.z]);previous=p;
    }
  }
});
