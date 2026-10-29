import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildDemandWarehouse} from '../src/simulator/demand-warehouse.js';
import {demandWarehouseSlots,warehouseBoxSize,getOrderPickPose,demandStoragePose} from '../src/simulator/warehouse-logistics.js';
const overlap=(a,b)=>['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>1e-6);
for(const product of ['saucepan','casserole','frying-pan','juice','water'])test(`${product}: paletes e estantes deixam livres os 24 trajetos de entrada e retirada`,()=>{
  const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape','glass','wood'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const model=buildDemandWarehouse({THREE,root,materials,environment:product==='juice'||product==='water'?'beverages':'cookware'}),size=warehouseBoxSize(product);
  root.updateMatrixWorld(true);const obstacles=model.fixed.map(mesh=>({name:mesh.name,bounds:new THREE.Box3().setFromObject(mesh)}));
  const check=(pose,bank,context)=>{
    model.banks[bank].update(pose.carriage,size,pose.forkDepth??.1);model.banks[bank].carriage.updateMatrixWorld(true);
    const p=pose.material,body=new THREE.Box3(new THREE.Vector3(p.x-size.width/2,p.y,p.z-size.depth/2),new THREE.Vector3(p.x+size.width/2,p.y+size.height,p.z+size.depth/2)).translate(model.group.position);
    const moving=[{name:'Caixa',bounds:body},...model.banks[bank].forks.map(mesh=>({name:'Garfo',bounds:new THREE.Box3().setFromObject(mesh)}))];
    for(const a of moving)for(const b of obstacles)if(overlap(a.bounds,b.bounds))assert.fail(`${context}: ${a.name} / ${b.name} @${b.bounds.min.toArray()}`);
  };
  for(const slot of demandWarehouseSlots()){
    const unit={id:`TEST-${slot.id}`,product,warehouseAddress:slot.id};
    for(let i=0;i<=100;i++)check(getOrderPickPose(i/100,unit),slot.bank,`${slot.id}/pick/${i}`);
    for(const id of ['identify','raise','store','retrieve','lower'])for(let i=0;i<=100;i++)check(demandStoragePose({id:'finished',onDemand:true,phase:'processing',unit,stage:{id,progress:i/100}},product),slot.bank,`${slot.id}/${id}/${i}`);
  }
  model.dispose();Object.values(materials).forEach(m=>m.dispose());
});
