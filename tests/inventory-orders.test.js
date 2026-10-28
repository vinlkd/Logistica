import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarehouseInventory } from '../src/simulator/inventory-orders.js';
function pick(stock,order){assert.equal(stock.pickOrder(order.id,order.boxIds).ok,true);for(const id of order.boxIds)assert.equal(stock.completePickBox(order.id,id).ok,true);}
const make = (options={}) => createWarehouseInventory({environment:'cookware',accountKey:'student-a',...options});
function fill(stock,count,product='saucepan',quantity=1){
  for(let i=1;i<=count;i++) assert.equal(stock.receiveBox({id:`UT-${i}`,product,quantity,unit:{id:`UT-${i}`,product,history:[{environment:'packing',step:'seal',time:i}]}}).ok,true);
}
test('Produzir10,pedir3,expedir3conserva7caixasoriginais e sóbaixaapósconclusãofísica',()=>{
  const stock=make();fill(stock,10);const before=stock.snapshot;
  const {order}=stock.generateOrder({product:'saucepan',quantity:3,rng:()=>.2});
  assert.equal(stock.snapshot.counts.available,7);assert.equal(stock.snapshot.counts.reserved,3);
  assert.equal(stock.dispatchOrder(order.id).code,'NOT_CHECKED');assert.equal(stock.snapshot.counts.shipped,0);
  pick(stock,order);
  assert.equal(stock.checkOrder(order.id,{product:'saucepan',quantity:3,boxIds:order.boxIds}).ok,true);
  assert.equal(stock.dispatchOrder(order.id).ok,true);assert.equal(stock.snapshot.counts.occupied,10);
  for(const id of order.boxIds) assert.equal(stock.completeShipmentBox(order.id,id).ok,true);
  assert.equal(stock.snapshot.counts.shipped,3);assert.equal(stock.snapshot.counts.occupied,7);assert.equal(stock.snapshot.orders[0].status,'shipped');
  assert.deepEqual(stock.snapshot.boxes.filter(b=>b.status==='available'),before.boxes.slice(3));
});
test('Reservasnão concorrem e erros de produto,quantidade e caixa sãoatômicos',()=>{
  const stock=make();fill(stock,10);
  const a=stock.generateOrder({product:'saucepan',quantity:3,rng:()=>0}).order,b=stock.generateOrder({product:'saucepan',quantity:3,rng:()=>0}).order;
  assert.equal(a.boxIds.some(id=>b.boxIds.includes(id)),false);
  let state=stock.exportState();assert.equal(stock.pickOrder(a.id,b.boxIds).ok,false);assert.deepEqual(stock.exportState(),state);
  pick(stock,a);state=stock.exportState();
  for(const check of [{product:'casserole',quantity:3},{product:'saucepan',quantity:4},{product:'saucepan',quantity:3,boxIds:b.boxIds}]){assert.equal(stock.checkOrder(a.id,check).code,'CHECK_MISMATCH');assert.deepEqual(stock.exportState(),state);}
  assert.equal(stock.completeShipmentBox(a.id,a.boxIds[0]).ok,false);
  assert.equal(stock.generateOrder({product:'saucepan',quantity:5}).code,'INSUFFICIENT_STOCK');
});
test('Semestoque nãohápedido;sorteioécompatívelcomprodutos ecaixasparciais',()=>{
  const stock=make({environment:'beverages'});assert.equal(stock.generateOrder().code,'NO_AVAILABLE_STOCK');
  fill(stock,2,'juice',9);stock.beginLot();fill(stock,1,'water',3);
  const order=stock.generateOrder({rng:()=>.999999}).order;
  assert.equal(order.product,'water');assert.equal(order.quantity,1);assert.equal(order.unitQuantity,3);
  assert.equal(stock.snapshot.boxes.filter(b=>b.product==='juice'&&b.status==='available').length,2);
});
test('Capacidade finita não sobrescreve endereços; novos lotes e modelos preservam IDs',()=>{
  const stock=make({capacity:2});fill(stock,2);const original=stock.exportState();
  assert.equal(stock.canReceiveBox(),false);assert.equal(stock.receiveBox({id:'UT-3',product:'saucepan',unit:{id:'UT-3',product:'saucepan'}}).code,'WAREHOUSE_FULL');assert.deepEqual(stock.exportState(),original);
  const order=stock.generateOrder({quantity:1,product:'saucepan'}).order;pick(stock,order);stock.checkOrder(order.id,{product:'saucepan',quantity:1});stock.dispatchOrder(order.id);stock.completeShipmentBox(order.id,order.boxIds[0]);
  stock.beginLot();const next=stock.receiveBox({id:'UT-1',product:'casserole',unit:{id:'UT-1',product:'casserole'}});assert.equal(next.ok,true);assert.notEqual(next.box.id,original.boxes[0].id);assert.equal(next.box.address,original.boxes[0].address);assert.deepEqual(stock.snapshot.boxes[1],original.boxes[1]);
});
test('Retomada versionada preserva estoque,pedidos,reservas,caixas emcarga e isolamento de conta',()=>{
  const stock=make();fill(stock,10);const order=stock.generateOrder({quantity:3,product:'saucepan'}).order;
  pick(stock,order);stock.checkOrder(order.id,{product:'saucepan',quantity:3});stock.dispatchOrder(order.id);stock.completeShipmentBox(order.id,order.boxIds[0]);
  const state=JSON.parse(JSON.stringify(stock.exportState())),restored=make();assert.equal(restored.importState(state),true);assert.deepEqual(restored.snapshot,stock.snapshot);
  const other=make({accountKey:'student-b'});assert.equal(other.importState(state),false);assert.equal(other.snapshot.boxes.length,0);
  for(const change of [s=>s.version++,s=>s.boxes[2].address=s.boxes[1].address,s=>s.orders[0].boxIds[0]=s.boxes[9].id,s=>s.boxes[1].status='available',s=>s.orders[0].unitQuantity++]){
    const bad=structuredClone(state);change(bad);assert.equal(restored.importState(bad),false);assert.deepEqual(restored.snapshot,stock.snapshot);
  }
  const snapshot=stock.snapshot;snapshot.boxes[1].unit.product='tampered';assert.equal(stock.snapshot.boxes[1].product,'saucepan');
});
