import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation,ENVIRONMENTS} from '../src/simulator/simulation.js';
import {createIndustrySession} from '../src/simulator/industries/industry-session.js';
import {BEVERAGES} from '../src/simulator/industries/definitions.js';
import {validateProgressState} from '../src/progress-format.js';
import {validateSavedSimulation} from '../server/progress-validation.js';
const options={onDemand:true,accountKey:'student-a',fulfillmentDuration:()=>1};
const create=environment=>environment==='cookware'?createSimulation(3,{...options,scope:'line'}):createIndustrySession(BEVERAGES,options);
function tick(sim){if(sim.step)sim.step(.1);else sim.tick(.1);}
function finish(sim,done){sim.setSpeed(8);sim.start();for(let i=0;i<30000;i++){tick(sim);if(done(sim.snapshot))return;assert.equal(sim.snapshot.fault??'','');}assert.fail('Teste não terminou');}
for(const environment of ['cookware','beverages'])test(`${environment}:todasasetapaspreparam entradaimediata e preservamalinhaemtrocas sucessivas`,()=>{
  const sim=create(environment);sim.start();tick(sim);const original=sim.exportState();
  for(const stage of environment==='cookware'?ENVIRONMENTS:BEVERAGES.steps){
    assert.equal(sim.enterBench(stage.id),true);let s=sim.snapshot;assert.equal(s.scope,'bench');assert.equal(s.practice,true);assert.equal(s.running,false);assert.equal(s.cells?s.cells.find(c=>c.queue).id:s.step.id,stage.id);
    assert.equal(sim.generateOrder().code,'PRACTICE_MODE');finish(sim,s=>s.done===1);s=sim.snapshot;assert.equal(s.scope,'bench');assert.equal(s.done,1);
    assert.equal(sim.returnLine(),true);const restored=sim.exportState();assert.equal(sim.snapshot.practice,false);assert.equal(sim.snapshot.running,false);assert.equal(restored.scope,original.scope);
    assert.deepEqual(restored.cells??restored.engine,original.cells??{...original.engine,running:false});assert.deepEqual(restored.inventory,original.inventory);
  }
});
for(const environment of ['cookware','beverages'])test(`${environment}:reloadnotesteisolado preservaestoque,pedido e trajetopausado para retomar`,()=>{
  const sim=create(environment);if(environment==='beverages')sim.setQuantity(12);finish(sim,s=>s.cells?s.done===3:s.phase==='complete');
  const order=sim.generateOrder({quantity:1}).order;sim.pickOrder(order.id,order.boxIds);sim.start();tick(sim);const live=sim.snapshot;
  assert.equal(sim.enterBench(environment==='cookware'?'quality':'wash'),true);sim.setProduct(environment==='cookware'?'casserole':'water');
  const checkpoint=sim.exportState(),state={version:1,simulation:checkpoint,mission:null,results:[],view:{scope:'bench',selected:environment==='cookware'?'quality':'wash'}};
  assert.doesNotThrow(()=>validateProgressState(environment,state));assert.doesNotThrow(()=>validateSavedSimulation(environment,checkpoint,state));
  const restored=create(environment);assert.equal(restored.importState(JSON.parse(JSON.stringify(checkpoint))),true);assert.equal(restored.snapshot.practice,true);assert.equal(restored.snapshot.running,false);
  assert.equal(restored.resumeLine(),true);assert.equal(restored.snapshot.scope,'line');assert.deepEqual(restored.snapshot.inventory,live.inventory);assert.deepEqual(restored.snapshot.fulfillment,{...live.fulfillment,...(environment==='beverages'?{running:false}:{})});
  assert.equal(restored.snapshot.product?.id??restored.snapshot.product,live.product?.id??live.product);assert.equal(restored.snapshot.running,false);
  const bad=structuredClone(checkpoint);bad.lineCheckpoint.inventory.boxes[0].orderId='PED-UNKNOWN';assert.equal(create(environment).importState(bad),false);
});
