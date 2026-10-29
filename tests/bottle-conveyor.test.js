import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';import {OBB} from 'three/addons/math/OBB.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {buildBottleWarehouse} from '../src/simulator/industries/bottle-warehouse.js';
import {bottleWarehouseAddress,warehouseRawPose,warehouseFinishedPose,sealWarehouseProgress} from '../src/simulator/industries/bottle-warehouse-flow.js';
import {buildBottleCase} from '../src/simulator/industries/bottle-cases.js';
import {buildBeveragesModel} from '../src/simulator/industries/factory-models.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
import {bottleReceivingState,bottleReceivingDuration,CASE_CONVEYOR_SPEED} from '../src/simulator/industries/bottle-crate-flow.js';
import {buildIndustryStation} from '../src/simulator/industries/station-adapter.js';
function fixture(){const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape','wood','glass','green','water','belt'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};
  const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};
  const bar=(g,a,b,r,m)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va),o=cyl(g,...va.clone().add(vb).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  return {THREE,root,materials,box,cyl,bar,definition:BEVERAGES,product:BEVERAGES.products[0],stationView:true};}
function meshes(root){const list=[];root.traverseVisible(o=>{if(o.isMesh)list.push(o);});return list;}
function record(mesh){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;const obb=new OBB().fromBox3(box);obb.halfSize.subScalar(1e-6);obb.applyMatrix4(mesh.matrixWorld);return {obb,box:box.clone().applyMatrix4(mesh.matrixWorld),mesh};}
function clear(a,b,message){for(const x of a)for(const y of b)if(x.box.intersectsBox(y.box)&&x.obb.intersectsOBB(y.obb,1e-10))assert.fail(`${message}: ${x.mesh.name||x.mesh.geometry.type} / ${y.mesh.name||y.mesh.geometry.type} @${y.mesh.position.toArray()}`);}
function poses(group){const r=[];group.traverse(o=>r.push([o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]));return r;}
function feedProgress(value,index=0){for(let i=0;i<=10000;i++){const t=i/10000,p=bottleReceivingState(index,'operating',t).phases.feedMaterial;if(p>=value)return t;}assert.fail('Transporte não encontrado');}
test('108garrafas:depoisdesoltar,sótrajetolinearapoiadonaesteira,semvoltaparapinçaouestante',()=>{
  for(let index=0;index<108;index++){
    const duration=bottleReceivingDuration(index);let released=false,previous=null,travelled=false;
    for(let i=0;i<=300;i++){
      const s=bottleReceivingState(index,'operating',i/300);assert.equal(s.phases.warehouse,undefined);
      if(s.phases.releaseMaterial>0){
        released=true;assert.equal(s.gripping,false);assert.equal(s.material.y,1.2);assert.equal(s.material.z,0);assert.ok(s.material.x>=-1.700000001&&s.material.x<=1e-9);
        if(previous){assert.ok(s.material.x>=previous.x-1e-9);assert.ok(s.material.x-previous.x<=CASE_CONVEYOR_SPEED*duration/300+1e-9);}
        previous=s.material;if(s.phases.feedMaterial>0&&s.phases.feedMaterial<1){travelled=true;assert.equal(s.phases.retractHead,1);}
      }
    }
    assert.ok(released&&travelled);assert.deepEqual(previous,{x:0,y:1.2,z:0});
  }
});
test('Recebimento não contémsegunda pinça/rack;garrafasemtransporte respeitamasoutrasestruturas',()=>{
  const args=fixture(),model=buildBeveragesModel(args);model.selectStage('receive');assert.equal(model.receiver.warehouse,undefined);assert.equal(model.receiver.copies.size,108);assert.equal(model.receiver.sourceCases.length,12);
  assert.equal(model.receiver.group.getObjectByName('Pinça de estoque • segura pelo gargalo'),undefined);
  const start=feedProgress(.05),end=feedProgress(.95);
  for(let index=0;index<108;index++)for(let i=0;i<=6;i++){
    const progress=feedProgress(.05+.9*i/6,index),state={step:BEVERAGES.steps[0],phase:'operating',progress,running:true,elapsed:1+index+i/10,scope:'bench',done:index,total:108,bottleTotal:108,unit:{id:`LOT-${index+1}`,product:'juice',...BEVERAGES.initialize(BEVERAGES.products[0])},settings:{},position:{x:-6},completedUnits:[],outputs:{work:true}};
    model.update(state);args.root.updateMatrixWorld(true);const bottle=new Set(meshes(model.bottle));
    clear([...bottle].map(record),meshes(model.receiver.group).filter(o=>!bottle.has(o)).map(record),`Esteira ${index}/${i}`);
  }
  model.dispose();
});
test('Pausa8×eretomadapreservamgarrafasoltasobreesteira e todooestoquedeorigem',()=>{
  const args=fixture(),model=buildBeveragesModel(args),session=createIndustrySession(BEVERAGES);session.setQuantity(108);session.setSpeed(8);model.selectStage('receive');session.start();let found=false;
  for(let i=0;i<4000;i++){session.tick(.025);model.update(session.snapshot);const feed=model.receiver.state?.phases.feedMaterial;if(feed>.2&&feed<.8){found=true;break;}}
  assert.ok(found);session.pause();model.update(session.snapshot);const before=poses(args.root);for(let i=0;i<10;i++){session.tick(.25);model.update(session.snapshot);}assert.deepEqual(poses(args.root),before);
  const restored=createIndustrySession(BEVERAGES);assert.equal(restored.importState(session.exportState()),true);const args2=fixture(),model2=buildBeveragesModel(args2);model2.selectStage('receive');model2.update(restored.snapshot);assert.deepEqual(model2.bottle.position.toArray(),model.bottle.position.toArray());assert.equal(model2.receiver.copies.size,108);model.dispose();model2.dispose();
});
test('Roletesseguemdeslocamentorealdaesteira duranteoperaçãoenãogiramnapausa',()=>{
  const args=fixture(),roller=args.cyl(args.root,-1,1.12,0,.075,1,args.materials.steel),base={root:args.root,rollers:[roller],lamps:{}};
  const station=buildIndustryStation({THREE,base,materials:args.materials,definition:BEVERAGES,product:BEVERAGES.products[0],build:buildBeveragesModel});
  const state={step:BEVERAGES.steps[0],phase:'operating',running:true,elapsed:1,scope:'bench',done:0,total:108,unit:{id:'LOT-001',product:'juice',...BEVERAGES.initialize(BEVERAGES.products[0])},settings:{},position:{x:-6},completedUnits:[],outputs:{work:true}};
  station.update({...state,progress:feedProgress(.2)},.1);const before=roller.quaternion.clone();station.update({...state,elapsed:2,progress:feedProgress(.7)},.1);assert.ok(before.angleTo(roller.quaternion)>.1);
  const stopped=roller.quaternion.clone();station.update({...state,progress:feedProgress(.7),elapsed:2,running:false,outputs:{}},1);assert.deepEqual(roller.quaternion.toArray(),stopped.toArray());station.dispose();
});
