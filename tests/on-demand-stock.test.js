import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/simulator/simulation.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {validateProgressState} from '../src/progress-format.js';
import {validateSavedSimulation} from '../server/progress-validation.js';
import {createProgressStore} from '../src/progress.js';
import {missionDefinition,missionEvidence} from '../src/simulator/missions.js';
const options={onDemand:true,scope:'line',accountKey:'student-a',fulfillmentDuration:()=>.5};
function run(sim,predicate,max=16000){sim.start();for(let i=0;i<max;i++){sim.step(.1);const snapshot=sim.snapshot;if(predicate(snapshot))return snapshot;}assert.fail('A operação não terminou: '+JSON.stringify(sim.snapshot));}
test('Panelas:10produzidas ficamnoarmazém;pedido3 separa,confereeexpedesó3',()=>{
  const sim=createSimulation(10,options);sim.setSpeed(8);let s=run(sim,s=>s.done===10);
  assert.equal(s.inventory.counts.available,10);assert.equal(s.inventory.counts.shipped,0);assert.equal(s.cells[7].done,0);assert.equal(s.running,false);
  const stored=structuredClone(s.inventory.boxes);for(let i=0;i<100;i++)sim.step(.5);assert.deepEqual(sim.snapshot.inventory.boxes,stored);
  const order=sim.generateOrder({product:'saucepan',quantity:3,rng:()=>0}).order;assert.equal(sim.dispatchOrder(order.id).ok,false);
  assert.equal(sim.pickOrder(order.id,order.boxIds).ok,true);assert.equal(sim.checkOrder(order.id,{product:'saucepan',quantity:3}).ok,false);
  s=run(sim,s=>!s.fulfillment);assert.equal(s.inventory.counts.picked,3);assert.equal(s.inventory.counts.shipped,0);
  assert.equal(sim.checkOrder(order.id,{product:'saucepan',quantity:2}).ok,false);assert.equal(sim.checkOrder(order.id,{product:'saucepan',quantity:3}).ok,true);
  assert.equal(sim.dispatchOrder(order.id).ok,true);s=run(sim,s=>!s.fulfillment);assert.equal(s.inventory.counts.shipped,3);assert.equal(s.inventory.counts.available,7);assert.deepEqual(s.inventory.boxes.filter(b=>b.status==='available'),stored.slice(3));
});
test('Pausa,emergência e reload conservam posição e todas as reservas;outroaluno não importa',()=>{
  const sim=createSimulation(3,options);sim.setSpeed(8);run(sim,s=>s.done===3);const order=sim.generateOrder({quantity:2}).order;sim.pickOrder(order.id,order.boxIds);sim.start();sim.step(.025);sim.stop();
  const state=sim.exportState(),before=sim.snapshot;sim.step(.5);assert.deepEqual(sim.snapshot.fulfillment,before.fulfillment);assert.deepEqual(sim.snapshot.inventory,before.inventory);
  const restored=createSimulation(1,options);assert.equal(restored.importState(JSON.parse(JSON.stringify(state))),true);assert.deepEqual(restored.snapshot.fulfillment,before.fulfillment);assert.deepEqual(restored.snapshot.inventory,before.inventory);assert.equal(restored.snapshot.running,false);
  restored.emergencyStop();assert.equal(restored.start(),false);restored.step(.1);assert.deepEqual(restored.snapshot.fulfillment,before.fulfillment);
  const other=createSimulation(1,{...options,accountKey:'student-b'});assert.equal(other.importState(state),false);assert.equal(other.snapshot.inventory.boxes.length,0);
  const bad=structuredClone(state);bad.fulfillment.boxIds.reverse();assert.equal(restored.importState(bad),false);
});
test('Novolote/trocademodelo preservam caixas e IDs e endereços distintos apósretomada',()=>{
  const sim=createSimulation(2,options);sim.setSpeed(8);run(sim,s=>s.done===2);const before=sim.snapshot.inventory.boxes;
  assert.equal(sim.setProduct('casserole'),true);run(sim,s=>s.done===2);const s=sim.snapshot;assert.equal(s.inventory.counts.available,4);assert.deepEqual(s.inventory.boxes.slice(0,2),before);assert.equal(new Set(s.inventory.boxes.map(b=>b.id)).size,4);assert.equal(new Set(s.inventory.boxes.map(b=>b.address)).size,4);
  const restored=createSimulation(1,options);assert.equal(restored.importState(sim.exportState()),true);assert.deepEqual(restored.snapshot.inventory,s.inventory);
});
test('Capacidadefinita bloqueiaalimentação sem perdernem sobrescrevercaixas',()=>{
  const sim=createSimulation(4,{...options,capacity:2});sim.setSpeed(8);run(sim,s=>s.inventory.counts.occupied===2);
  for(let i=0;i<400;i++)sim.step(.1);const full=sim.snapshot;assert.equal(full.inventory.counts.occupied,2);assert.equal(new Set(full.inventory.boxes.map(b=>b.address)).size,2);
  assert.equal(full.cells.slice(0,7).reduce((n,c)=>n+c.queue+Number(c.part),0)+full.done,4);
  assert.ok(full.cells.slice(1,7).every(c=>c.queue<=1));
  const order=sim.generateOrder({quantity:1}).order;sim.pickOrder(order.id,order.boxIds);run(sim,s=>!s.fulfillment);sim.checkOrder(order.id,{product:order.product,quantity:1});sim.dispatchOrder(order.id);run(sim,s=>s.inventory.counts.shipped===1);run(sim,s=>s.done===3);
  assert.equal(sim.snapshot.inventory.counts.occupied,2);assert.equal(sim.snapshot.inventory.counts.shipped,1);
});
function beverages(quantity=12,extra={}){const session=createIndustrySession(BEVERAGES,{...options,...extra});session.setQuantity(quantity);session.setSpeed(8);return session;}
function finishBeverages(session,predicate,max=60000){session.start();for(let i=0;i<max;i++){session.tick(.1);const s=session.snapshot;if(predicate(s))return s;if(s.fault&&!s.fulfillment)assert.fail(s.fault);}assert.fail('Bebidas não terminou.');}
test('Garrafas:108reaisviram12caixasarmazenadas;pedido3expede27garrafas emantém9caixas',()=>{
  const session=beverages(108);const before=finishBeverages(session,s=>s.phase==='complete');
  assert.equal(before.inventory.counts.available,12);assert.equal(before.inventory.boxes.reduce((n,b)=>n+b.quantity,0),108);assert.ok(before.history.every(h=>h.step!=='ship'));assert.ok(before.completedUnits.every(u=>!u.shipped));
  const order=session.generateOrder({product:'juice',quantity:3,rng:()=>0}).order;assert.equal(order.unitQuantity,27);
  session.pickOrder(order.id,order.boxIds);const picked=finishBeverages(session,s=>!s.fulfillment);assert.equal(picked.inventory.counts.picked,3);
  session.checkOrder(order.id,{product:'juice',quantity:3});session.dispatchOrder(order.id);const shipped=finishBeverages(session,s=>!s.fulfillment);
  assert.equal(shipped.inventory.counts.shipped,3);assert.equal(shipped.inventory.counts.available,9);assert.equal(shipped.inventory.boxes.filter(b=>b.status==='available').reduce((n,b)=>n+b.quantity,0),81);assert.deepEqual(shipped.inventory.boxes.slice(3),before.inventory.boxes.slice(3));
});
test('Garrafas:caixaparcial real,novo loteágua,retomadadopedido econtasisoladas',()=>{
  const session=beverages();finishBeverages(session,s=>s.phase==='complete');const original=session.snapshot.inventory.boxes;
  assert.deepEqual(original.map(b=>b.quantity),[9,3]);assert.equal(session.setProduct('water'),true);session.setSetting('volume',BEVERAGES.products.find(p=>p.id==='water').volume);finishBeverages(session,s=>s.phase==='complete');
  assert.equal(session.snapshot.inventory.boxes.length,4);assert.deepEqual(session.snapshot.inventory.boxes.slice(0,2),original);
  const order=session.generateOrder({product:'juice',quantity:1,rng:()=>0}).order;session.pickOrder(order.id,order.boxIds);session.start();session.tick(.025);session.pause();const before=session.snapshot;session.tick(.25);assert.deepEqual(session.snapshot.inventory,before.inventory);assert.deepEqual(session.snapshot.fulfillment,before.fulfillment);
  const restored=beverages();assert.equal(restored.importState(JSON.parse(JSON.stringify(session.exportState()))),true);assert.deepEqual(restored.snapshot.inventory,before.inventory);assert.deepEqual(restored.snapshot.fulfillment,{...before.fulfillment,running:false});
  const other=beverages(12,{accountKey:'student-b'});assert.equal(other.importState(session.exportState()),false);
});
test('Garrafas:armazémcheioesperasemexpedir e retomaapenasapósbaixadepedido',()=>{
  const session=beverages(27,{capacity:2});session.start();for(let i=0;i<14000;i++){session.tick(.1);if(session.snapshot.fault)break;}
  const full=session.snapshot;assert.equal(full.inventory.counts.occupied,2);assert.equal(full.inventory.counts.shipped,0);assert.match(full.fault,/Armazém cheio/);const boxes=full.inventory.boxes;
  for(let i=0;i<50;i++)session.tick(.25);assert.deepEqual(session.snapshot.inventory.boxes,boxes);
  const order=session.generateOrder({quantity:1}).order;session.pickOrder(order.id,order.boxIds);finishBeverages(session,s=>!s.fulfillment);session.checkOrder(order.id,{product:order.product,quantity:1});session.dispatchOrder(order.id);finishBeverages(session,s=>!s.fulfillment);finishBeverages(session,s=>s.phase==='complete');
  assert.equal(session.snapshot.inventory.counts.occupied,2);assert.equal(session.snapshot.inventory.counts.shipped,1);
});
test('Checkpoints anteriores ao inventário retomam antesdaexpedição semcriarestoque',()=>{
  const old=createIndustrySession(BEVERAGES);old.setScope('line');old.start();old.tick(.1);const saved=old.exportState();const next=beverages();assert.equal(next.importState(saved),true);assert.equal(next.snapshot.inventory.boxes.length,0);assert.equal(next.snapshot.running,false);assert.deepEqual(next.snapshot.position,old.snapshot.position);
  const oldPot=createSimulation(2,{scope:'line'});oldPot.start();oldPot.step(.1);const nextPot=createSimulation(1,options);assert.equal(nextPot.importState(oldPot.exportState()),true);assert.equal(nextPot.snapshot.inventory.boxes.length,0);
});
test('Conclusõesantigasretêmhistórico deexpedição e reabremsem recriarestoque físico',()=>{
  const old=createSimulation(1,{scope:'line'});old.setSpeed(8);run(old,s=>s.done===1);const next=createSimulation(1,options);assert.equal(next.importState(old.exportState()),true);assert.equal(next.snapshot.inventory.boxes.length,0);assert.equal(next.snapshot.cells[7].done,0);assert.equal(missionEvidence(next.snapshot,missionDefinition('cookware',[])).done,1);const reloaded=createSimulation(1,options);assert.equal(reloaded.importState(next.exportState()),true);
  const bottles=createIndustrySession(BEVERAGES);bottles.setQuantity(1);bottles.setScope('line');bottles.setSpeed(8);finishBeverages(bottles,s=>s.phase==='complete');const migrated=beverages(1);assert.equal(migrated.importState(bottles.exportState()),true);assert.equal(migrated.snapshot.inventory.boxes.length,0);assert.equal(missionEvidence(migrated.snapshot,missionDefinition('beverages',BEVERAGES.steps)).done,1);const again=beverages(1);assert.equal(again.importState(migrated.exportState()),true);
});
test('Bancadasdetreinoantigasnão viramestoquerealnemliberampedidos apósretomada',()=>{
  const oldPot=createSimulation(2,{scope:'bench',environment:'finished'});oldPot.start();oldPot.step(.1);const savedPot=oldPot.exportState();
  const pot=createSimulation(1,options);assert.equal(pot.importState(savedPot),true);pot.setSpeed(8);run(pot,s=>s.done===2);assert.equal(pot.snapshot.inventory.boxes.length,0);assert.equal(pot.snapshot.completedUnits.length,2);assert.equal(pot.generateOrder().code,'NO_AVAILABLE_STOCK');
  const oldBottles=createIndustrySession(BEVERAGES);oldBottles.setQuantity(12);oldBottles.selectEnvironment('seal');oldBottles.start();oldBottles.tick(.1);const savedBottles=oldBottles.exportState();
  const bottles=beverages();assert.equal(bottles.importState(savedBottles),true);bottles.setSpeed(8);finishBeverages(bottles,s=>s.phase==='complete');assert.equal(bottles.snapshot.inventory.boxes.length,0);assert.equal(bottles.snapshot.completedUnits.length,2);assert.equal(bottles.generateOrder().code,'NO_AVAILABLE_STOCK');
  const reloaded=beverages();assert.equal(reloaded.importState(bottles.exportState()),true);assert.equal(reloaded.snapshot.inventory.boxes.length,0);
});
test('Salvamento local versionado retoma estoque/pedido;validadoresrecusamreservas corrompidas',async()=>{
  for(const environment of ['cookware','beverages']){
    const sim=environment==='cookware'?createSimulation(2,options):beverages();
    sim.setSpeed(8);environment==='cookware'?run(sim,s=>s.done===2):finishBeverages(sim,s=>s.phase==='complete');
    const order=sim.generateOrder({quantity:1}).order;sim.pickOrder(order.id,order.boxIds);
    const snapshot=sim.exportState(),state={version:1,simulation:snapshot,mission:null,results:[],view:{selected:snapshot.selected??snapshot.focus,scope:snapshot.scope}};
    assert.doesNotThrow(()=>validateProgressState(environment,state));assert.doesNotThrow(()=>validateSavedSimulation(environment,snapshot,state));
    const map=new Map(),config={demo:true,storage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}};
    const store=createProgressStore(environment,config);await store.load();await store.save(state);const next=createProgressStore(environment,config);assert.deepEqual(await next.load(),state);
    const corrupt=structuredClone(state);corrupt.simulation.inventory.orders[0].quantity++;assert.throws(()=>validateProgressState(environment,corrupt));
    const malformed=structuredClone(state);malformed.simulation.fulfillment.index=999;assert.throws(()=>validateSavedSimulation(environment,malformed.simulation,malformed));
    assert.deepEqual(await next.load(),state);
    const definition=missionDefinition(environment,environment==='cookware'?[]:BEVERAGES.steps,12,{onDemand:true});assert.equal(missionEvidence(sim.snapshot,definition).done,0);
  }
});
