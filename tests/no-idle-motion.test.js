import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {buildMaterialReceiving} from '../src/simulator/industries/material-receiving.js';
import {buildBottlePacking} from '../src/simulator/industries/bottle-packing.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
function fixture(){
  const root=new THREE.Group(),materials=Object.fromEntries(['blue','accent','steel','dark','white','yellow','box','tape'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const box=(g,x,y,z,w,h,d,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};
  const cyl=(g,x,y,z,r,h,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),m);o.position.set(x,y,z);g.add(o);return o;};
  const bar=(g,a,b,r,m)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av),o=cyl(g,...av.clone().add(bv).multiplyScalar(.5).toArray(),r,v.length(),m);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;};
  const createCopy=()=>{const g=new THREE.Group();cyl(g,0,.325,0,.18,.65,materials.white);cyl(g,0,.75,0,.18,.2,materials.white);cyl(g,0,.925,0,.07,.15,materials.white);return g;};
  return {THREE,root,box,cyl,bar,materials,definition:BEVERAGES,product:BEVERAGES.products[0],createCopy};
}
const off={motor:false,work:false,transfer:false};
const step=id=>BEVERAGES.steps.find(s=>s.id===id);
function poses(root){const result=[];root.traverse(o=>result.push([o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible]));return result;}
function base(id){return {scope:'bench',step:step(id),phase:'ready',progress:0,total:108,bottleTotal:108,done:0,elapsed:0,running:false,mode:'auto',speed:8,guard:true,unit:{id:'LOT-001',product:'juice',received:false},outputs:{...off}};}

test('Recebimento: ready e pausa não movem estruturas, caixas ou pinças; comando real continua',()=>{
  const args=fixture(),model=buildMaterialReceiving(args,{kind:'bottles',createCopy:args.createCopy}),s=base('receive');model.update(s);
  const ready=poses(model.group);for(let i=0;i<12;i++)model.update({...s,progress:i/12,clock:i*1000});assert.deepEqual(poses(model.group),ready);
  const active={...s,phase:'operating',progress:.6,elapsed:1,running:true,outputs:{...off,work:true}};model.update(active);const held=poses(model.group);assert.notDeepEqual(held,ready);
  for(let i=0;i<12;i++)model.update({...active,running:false,outputs:{...off},commands:{work:true},progress:.8,clock:i*1000});assert.deepEqual(poses(model.group),held);
  model.update({...active,mode:'manual',progress:.9,outputs:{...off}});assert.deepEqual(poses(model.group),held);
  model.update({...active,progress:.9,elapsed:2});assert.notDeepEqual(poses(model.group),held);model.dispose();
});

for(const id of ['pack','seal'])test(`${id}: checkpoint pausado mantém ferramentas e caixas imóveis até a operação ser acionada`,()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage(id);
  const s={...base(id),phase:'operating',progress:.45,elapsed:50,total:id==='seal'?12:108,
    unit:{...base(id).unit,caseIndex:0,caseQuantity:9,packed:id==='seal'}};
  model.update(s);const paused=poses(model.group);
  for(let i=0;i<10;i++)model.update({...s,progress:.7,clock:i*1000});assert.deepEqual(poses(model.group),paused);
  model.update({...s,running:true,mode:'manual',outputs:{...off},progress:.7});assert.deepEqual(poses(model.group),paused);
  model.update({...s,running:true,outputs:{...off,work:true},progress:.7,elapsed:51});assert.notDeepEqual(poses(model.group),paused);model.dispose();
});

test('Doca: plataforma superior não cai em done; retorno só ocorre no transporte acionado seguinte',()=>{
  const args=fixture(),model=buildBottlePacking(args);model.selectStage('ship');
  const s={...base('ship'),phase:'operating',progress:1,total:12,done:11,elapsed:100,running:true,outputs:{...off,work:true},
    unit:{id:'CASE-12',product:'juice',caseIndex:11,caseQuantity:9,packed:true,caseSealed:true,caseTaped:true,caseIdentified:true}};
  model.update(s);assert.ok(model.shippingDock.lift.position.y>1);const loaded=poses(model.shippingDock.group);
  const end={...s,phase:'complete',progress:0,done:12,elapsed:101,running:false,outputs:{...off},unit:{...s.unit,shipped:true}};
  model.update(end);assert.deepEqual(poses(model.shippingDock.group),loaded);
  for(let i=0;i<20;i++)model.update({...end,clock:i*1000});assert.deepEqual(poses(model.shippingDock.group),loaded);
  const next={...s,phase:'ready',progress:0,done:11,elapsed:101,running:false,outputs:{...off}};
  model.update(next);assert.deepEqual(poses(model.shippingDock.group),loaded);
  model.update({...next,phase:'moving',progress:.2,elapsed:102,running:true,outputs:{...off,motor:true}});const returning=poses(model.shippingDock.group);assert.notDeepEqual(returning,loaded);
  model.update({...next,phase:'moving',progress:.8,elapsed:102});assert.deepEqual(poses(model.shippingDock.group),returning);
  model.dispose();
});

test('Passo manual a8× avança quando acionado e permanece imóvel entre passos',()=>{
  const args=fixture(),model=buildMaterialReceiving(args,{kind:'bottles',createCopy:args.createCopy}),session=createIndustrySession(BEVERAGES);
  session.selectEnvironment('receive');session.setQuantity(108);session.setSpeed(8);session.setMode('guided');model.update(session.snapshot);const before=poses(model.group);
  session.advance(.1);assert.equal(session.snapshot.running,false);model.update(session.snapshot);const after=poses(model.group);assert.notDeepEqual(after,before);
  for(let i=0;i<10;i++){session.tick(.1);model.update(session.snapshot);}assert.deepEqual(poses(model.group),after);
  session.advance(.1);model.update(session.snapshot);assert.notDeepEqual(poses(model.group),after);model.dispose();
});
