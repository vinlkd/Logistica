import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';import {OBB} from 'three/addons/math/OBB.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {buildBottleWarehouse} from '../src/simulator/industries/bottle-warehouse.js';
import {bottleWarehouseAddress,warehouseRawPose,warehouseFinishedPose,sealWarehouseProgress} from '../src/simulator/industries/bottle-warehouse-flow.js';
import {buildBottleCase} from '../src/simulator/industries/bottle-cases.js';
import {buildBeveragesModel} from '../src/simulator/industries/factory-models.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
function fixture(){const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape','wood','glass','green','water','belt'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};
  const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};
  const bar=(g,a,b,r,m)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va),o=cyl(g,...va.clone().add(vb).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  return {THREE,root,materials,box,cyl,bar,definition:BEVERAGES,product:BEVERAGES.products[0],stationView:true};}
function meshes(root){const list=[];root.traverseVisible(o=>{if(o.isMesh)list.push(o);});return list;}
function record(mesh){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;const obb=new OBB().fromBox3(box);obb.halfSize.subScalar(1e-6);obb.applyMatrix4(mesh.matrixWorld);return {obb,box:box.clone().applyMatrix4(mesh.matrixWorld),mesh};}
function clear(a,b,message){for(const x of a)for(const y of b)if(x.box.intersectsBox(y.box)&&x.obb.intersectsOBB(y.obb,1e-10))assert.fail(`${message}: ${x.mesh.name||x.mesh.geometry.type} / ${y.mesh.name||y.mesh.geometry.type} @${y.mesh.position.toArray()}`);}
function poses(group){const r=[];group.traverse(o=>r.push([o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]));return r;}
for(const kind of ['finished'])test(`Armazém ${kind}:12 endereços e acesso físico sem cruzar estantes/carga`,()=>{
  const args=fixture(),warehouse=buildBottleWarehouse(args,{kind}),material=new THREE.Group();args.root.add(material);
  if(kind==='raw'){args.cyl(material,0,.325,0,.18,.65,args.materials.white);args.cyl(material,0,.75,0,.18,.2,args.materials.white);args.cyl(material,0,.925,0,.07,.15,args.materials.white);}
  else{const item=buildBottleCase(args,material,0);item.update(1,9);}
  const count=kind==='raw'?108:12;assert.equal(warehouse.slots.length,12);
  args.root.updateMatrixWorld(true);const fixed=warehouse.rack.fixed.map(record);
  for(let index=0;index<count;index++){
    let occupied=false,previous;
    for(let i=0;i<=120;i++){
      const progress=i/120,state=warehouse.update(progress,index,{quantity:kind==='raw'?1:9,id:`U-${index}`});material.position.set(state.material.x,state.material.y,state.material.z);args.root.updateMatrixWorld(true);
      clear(meshes(material).map(record),fixed,`Carga ${kind}/${index}/${i}`);
      clear(meshes(warehouse.carriage).map(record),fixed,`Mecanismo ${kind}/${index}/${i}`);
      clear(meshes(material).map(record),meshes(warehouse.carriage).map(record),`Garra/carga ${kind}/${index}/${i}`);
      if(state.occupied){occupied=true;assert.ok(Math.abs(state.material.y-warehouse.slots[state.address.index].y)<1e-9);assert.equal(warehouse.group.userData.quantity,kind==='raw'?1:9);}
      if(previous)assert.ok(Math.hypot(state.material.x-previous.x,state.material.y-previous.y,state.material.z-previous.z)<.6);
      previous=state.material;
    }
    assert.equal(occupied,true);assert.deepEqual(previous,{x:0,y:1.2,z:0});assert.equal(warehouse.group.userData.quantity,0);
  }
  warehouse.dispose();
});
test('Armazéns integrados usam os materiais existentes e preservam pausa/checkpoint a8×',()=>{
  for(const stage of ['seal']){
    const args=fixture(),model=buildBeveragesModel(args),session=createIndustrySession(BEVERAGES);session.selectEnvironment(stage);session.setQuantity(12);session.setSpeed(8);model.selectStage(stage);session.start();let n=0,stored=false;
    while(n++<8000&&session.snapshot.phase!=='complete'){
      session.tick(.025);const s=session.snapshot;model.update(s);
      const warehouse=stage==='receive'?model.receiver.warehouse:model.output.warehouse;
      if(warehouse.group.userData.quantity>0){
        stored=true;const before=poses(args.root);session.pause();session.tick(.25);model.update(session.snapshot);assert.deepEqual(poses(args.root),before);
        const restored=createIndustrySession(BEVERAGES);assert.equal(restored.importState(session.exportState()),true);const args2=fixture(),model2=buildBeveragesModel(args2);model2.selectStage(stage);model2.update(restored.snapshot);
        const same=stage==='receive'?model2.receiver.warehouse:model2.output.warehouse;assert.deepEqual(same.group.userData.stock,warehouse.group.userData.stock);
        if(stage==='receive'){assert.equal(model.receiver.copies.size,108);assert.equal(s.completedUnits.length,0);}
        else assert.equal(model.output.cases[0].group.children.filter(c=>c.name.startsWith('Garrafa encaixotada')).length,9);
        model2.dispose();break;
      }
    }
    assert.equal(stored,true,stage);model.dispose();
  }
});
test('Armazém de caixas começa só depois das abas, fita e identificação',()=>{
  for(let index=0;index<12;index++)for(let i=0;i<=100;i++){const p=sealWarehouseProgress(i/100,index);if(p.warehouseProgress>0)assert.equal(p.closingProgress,1);}
});

test('Trajetos dos armazéns também respeitam as estruturas das estações existentes',()=>{
  for(const stage of ['seal']){
    const args=fixture(),model=buildBeveragesModel(args),session=createIndustrySession(BEVERAGES);
    session.selectEnvironment(stage);session.setQuantity(108);model.selectStage(stage);
    const snapshot={...session.snapshot,phase:'operating',progress:.999,running:true,elapsed:100,outputs:{work:true,motor:false,transfer:false}};
    model.update(snapshot);
    const warehouse=stage==='receive'?model.receiver.warehouse:model.output.warehouse;
    const material=stage==='receive'?model.bottle:model.output.cases[0].group;
    const excluded=new Set([...meshes(warehouse.group),...meshes(material)]);
    const offset=stage==='receive'?BEVERAGES.steps[0].x:BEVERAGES.steps.find(s=>s.id==='seal').x;
    args.root.updateMatrixWorld(true);
    const surroundings=meshes(args.root).filter(o=>!excluded.has(o)).map(record);
    for(let index=0;index<(stage==='receive'?108:12);index++)for(let i=0;i<=80;i++){
      const state=warehouse.update(i/80,index);material.position.set(offset+state.material.x,state.material.y,state.material.z);args.root.updateMatrixWorld(true);
      clear(meshes(material).map(record),surroundings,`Carga/estação ${stage}/${index}/${i}`);
      clear(meshes(warehouse.carriage).map(record),surroundings,`Mecanismo/estação ${stage}/${index}/${i}`);
    }
    model.dispose();
  }
});

test('Lote108 conclui recebimento,selagem e expedição sem alterar as quantidades reais',()=>{
  for(const stage of ['receive','seal','ship']){
    const session=createIndustrySession(BEVERAGES);session.selectEnvironment(stage);session.setQuantity(108);session.setSpeed(8);session.start();
    let snapshot;
    for(let i=0;i<80000;i++){session.tick(.1);snapshot=session.snapshot;assert.equal(snapshot.fault,'');if(snapshot.phase==='complete')break;}
    assert.equal(snapshot.phase,'complete',stage);assert.equal(snapshot.done,stage==='receive'?108:12);assert.equal(new Set(snapshot.completedUnits.map(u=>u.id)).size,snapshot.done);
    if(stage!=='receive')assert.equal(snapshot.completedUnits.reduce((n,u)=>n+u.caseQuantity,0),108);
  }
});
