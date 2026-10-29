import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PRODUCTS } from "../src/simulator/products.js";
import { buildLabModel, updateLabModel } from "../src/simulator/lab-model.js";
import { createSimulation } from "../src/simulator/simulation.js";
import { getPresentation } from "../src/simulator/presentation.js";
import { boundsForPose, CONVEYOR_TOP, CLEARANCE } from "../src/simulator/kinematics.js";
import { COOKWARE_PACKING_LAYOUT as cfg, cookwarePackingFeedDuration, cookwarePackingCartonDuration } from "../src/simulator/cookware-packing.js";
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const materials=()=>Object.fromEntries(["blue","white","steel","dark","belt","yellow","box","tape","wood","glass","green"].map(k=>[k,new THREE.MeshStandardMaterial()]));
const overlap=(a,b)=>['X','Y','Z'].every(k=>a[`min${k}`]<b[`max${k}`]-1e-6&&a[`max${k}`]>b[`min${k}`]+1e-6);
const bounds=o=>{const b=new THREE.Box3().setFromObject(o);return {minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};};
const cell=(stage,t)=>({id:'packing',part:true,unit:{id:'UT-001',material:stage==='transfer'?'boxed-pot':'approved-pot'},phase:stage==='feed'?'feeding':stage==='transfer'?'unloading':'processing',progress:stage==='feed'?.5*t:stage==='transfer'?.5+.5*t:.5,stage:{id:stage,progress:t},outputs:{motor:stage==='feed'||stage==='transfer',work:!['feed','transfer'].includes(stage),transfer:stage==='transfer'},queue:0,done:0,guard:true,inputs:{}});
for(const product of PRODUCTS)test(`${product.id}: bancada após último rolete e caixa real respeitam panela e cabos`,()=>{
 const model=buildLabModel({id:'packing',product,m:materials()});
 assert.equal(model.outputs.length,0,'sem caixas decorativas fora do estoque');
 model.root.updateMatrixWorld(true);assert.ok(bounds(model.packingStation.top).minX>cfg.beltEndX+.5);
 let previous;
 for(const stage of ['feed','carton','protect','close','label','transfer'])for(let i=0;i<=100;i++){
  const c=cell(stage,i/100),p=getPresentation(c,product.id);updateLabModel(model,c,product,.01,true,false);model.root.updateMatrixWorld(true);
  const material={...boundsForPose({...p,isBox:false},product.id)};material.minY+=model.root.position.y;material.maxY+=model.root.position.y;
  for(const wall of model.blank.walls)assert.equal(overlap(material,bounds(wall.object)),false,`${stage}/${i}: parede atravessa produto`);
  for(const {jaw} of model.packingStation.jaws) for(const wall of model.blank.walls) assert.equal(overlap(bounds(jaw),bounds(wall.object)),false,`${stage}/${i}: garra atravessa parede`);
  for(const flap of model.blank.flaps)if(flap.object.visible)assert.equal(overlap(material,bounds(flap.object)),false,`${stage}/${i}: aba atravessa produto`);
  if(stage==='carton'&&p.x>cfg.pickupX+.001&&p.x<cfg.boxX-.001){assert.equal(p.walls,1);assert.ok(material.minY>CONVEYOR_TOP+model.root.position.y+.035+p.layout.package.height+.3);}
  if(previous){assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<.28,`${stage}/${i}: salto de posição`);}previous=p;
 }
 const placed=getPresentation(cell('protect',0),product.id);
 assert.ok(Math.abs(placed.x-cfg.boxX)<1e-9);assert.ok(Math.abs(placed.support+ CLEARANCE-(CONVEYOR_TOP+.035+CLEARANCE))<1e-9);
});
test('embalagem: transporte tem velocidade linear e mesmo checkpoint após pausa/reload',()=>{
 for(const product of PRODUCTS){const s=createSimulation(1,{scope:'bench',environment:'packing',product:product.id});s.setSpeed(8);s.start();let old=null,seen=false;
  for(let i=0;i<1000;i++){s.step(.0125);const c=s.snapshot.cells.find(c=>c.id==='packing');if(c.phase==='feeding'){const p=getPresentation(c,product.id);if(old)assert.ok(Math.abs((p.x-old.x)/.1-2.088)<1e-7);old=p;}
   if(c.phase==='processing'&&c.stage.id==='carton'&&c.stage.progress>.55){s.stop();const saved=s.exportState(),next=createSimulation(1,{scope:'bench',environment:'packing'});assert.equal(next.importState(saved),true);assert.deepEqual(getPresentation(next.snapshot.cells.find(c=>c.id==='packing'),product.id),getPresentation(c,product.id));seen=true;break;}}
  assert.equal(seen,true);assert.ok(cookwarePackingCartonDuration(product)>7);assert.ok(cookwarePackingFeedDuration()>4);
 }
});

test('embalagem: checkpoint do layout anterior mantém ID e progresso normalizado da receita',()=>{
 const s=createSimulation(1,{scope:'bench',environment:'packing'});s.start();
 for(let i=0;i<1000;i++){s.step(.025);const c=s.snapshot.cells.find(c=>c.id==='packing');if(c.phase==='processing'&&c.stage.id==='carton'&&c.stage.progress>.55)break;}
 s.stop();const saved=s.exportState(),packing=saved.cells.find(c=>c.id==='packing');
 delete saved.packingLayoutVersion;packing.processing=1.2*.55;
 const restored=createSimulation(1,{scope:'bench',environment:'packing'});assert.equal(restored.importState(saved),true);
 const c=restored.snapshot.cells.find(c=>c.id==='packing');assert.equal(c.unit.id,packing.unit.id);assert.equal(c.stage.id,'carton');assert.ok(Math.abs(c.stage.progress-.55)<1e-9);assert.equal(restored.snapshot.running,false);
});
