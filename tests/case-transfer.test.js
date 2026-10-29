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
import {bottleCaseTransferState,bottleCaseTransferDuration,CASE_TRANSFER_PARK_HEIGHT} from '../src/simulator/industries/bottle-case-transfer.js';

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
function poses(root){const result=[];root.traverse(object=>result.push([object.position.toArray(),object.quaternion.toArray(),object.scale.toArray(),object.visible]));return result;}
function state(index,progress,stage='seal'){return {scope:'bench',step:BEVERAGES.steps.find(step=>step.id===stage),phase:'moving',progress,elapsed:100+progress,running:true,bottleTotal:108,total:12,done:index,unit:{id:`LOT-${index+1}`,product:'juice',caseIndex:index,caseQuantity:9,packed:true,caseSealed:stage==='ship',caseTaped:stage==='ship',caseIdentified:stage==='ship'},outputs:{motor:true}};}
test('12caixaspega→levanta→transfere→apoia→solta comgarfosvisíveisemcontato,semcolisões',()=>{
  for(const stage of ['seal','ship'])for(let index=0;index<12;index++){
    const args=fixture(),model=buildBottlePacking(args);model.selectStage(stage);model.update(state(index,0,stage));args.root.updateMatrixWorld(true);
    const active=model.cases[index].group,moving=new Set(meshList(model.caseTransfer.carriage)),load=new Set(meshList(active));
    const fixed=meshList(model.group).filter(mesh=>!moving.has(mesh)&&!load.has(mesh)&&!model.shippingDock.group.getObjectById(mesh.id)).map(record);
    const cartons=model.cases.flatMap(item=>meshList(item.group)).map(record);let previous=bottleCaseTransferState(0,index,BEVERAGES.steps.find(step=>step.id===stage).x),moved=0;
    for(let sample=0;sample<=120;sample++){
      const t=sample/120,snapshot=state(index,t,stage);model.update(snapshot);args.root.updateMatrixWorld(true);const pose=model.caseTransfer.state;
      assert.deepEqual(active.position.toArray(),[pose.material.x,pose.material.y,pose.material.z]);
      assertClear(meshList(active).map(record),fixed.concat([...moving].map(record)),`Caixa ${stage}/${index}/${sample}`);
      const others=model.cases.filter((_,i)=>i!==index).flatMap(item=>meshList(item.group)).map(record);
      assertClear([...moving].map(record),fixed.concat(others),`Carro ${stage}/${index}/${sample}`);
      if(pose.holding){assert.ok(pose.forkLength>=1.64-1e-8);assert.equal(pose.tool.y,pose.material.y);assert.equal(pose.tool.x,pose.material.x);assert.equal(pose.tool.z,pose.material.z);for(const fork of model.caseTransfer.forks){const bounds=new THREE.Box3().setFromObject(fork);assert.ok(Math.abs(bounds.max.y-pose.material.y)<1e-6);}}
      if(sample){const distance=Math.hypot(pose.material.x-previous.material.x,pose.material.y-previous.material.y,pose.material.z-previous.material.z);if(distance>1e-8){moved++;assert.ok(pose.holding||previous.holding);}assert.ok(distance<=2.088*pose.duration/120+1e-6);}
      previous=pose;
    }
    assert.ok(moved>0);assert.equal(model.caseTransfer.state.holding,false);assert.equal(model.caseTransfer.state.forkLength,.04);assert.equal(model.caseTransfer.state.tool.y,CASE_TRANSFER_PARK_HEIGHT);model.dispose();
  }
});
test('Carro/garfos paramemready/pausa,retomamsemperdercaixaetempoenglobaape gaeapoio',()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage('seal');const ready={...state(0,0),phase:'ready',running:false,outputs:{}};model.update(ready);const waiting=poses(model.group);for(let i=0;i<5;i++)model.update({...ready,clock:i*1000});assert.deepEqual(poses(model.group),waiting);
  const working=state(0,.55);model.update(working);const held=poses(model.group);for(let i=0;i<10;i++)model.update({...working,running:false,outputs:{},clock:i*1000});assert.deepEqual(poses(model.group),held);
  for(let index=0;index<12;index++)assert.equal(BEVERAGES.movementDistance({phase:'moving',unit:{packed:true,caseIndex:index},done:index*9,step:'seal'}),bottleCaseTransferDuration(index)*BEVERAGES.transportSpeed);
  model.dispose();
});
