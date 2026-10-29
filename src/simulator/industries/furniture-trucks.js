import {buildTruckDock,shippingDockPose,receivingDockPose} from './truck-dock.js';
export function furnitureCargoSlot(index,target,x=6){
  const tier=Math.floor(index/10),at=index%10;
  return at===0?{x:x+11.95,y:1.23+tier*1.103,z:0,rotation:Math.PI/2}:{x:x+10.35-Math.floor((at-1)/3)*1.8,y:1.23+tier*1.103,z:((at-1)%3-1)*1.05,rotation:0};
}
export function furnitureInputSlot(index,x=-6){return {x:x-6.95-Math.floor(index%9/3)*2.05,y:1.2+Math.floor(index/9)*.145,z:(index%3-1)*.9};}
export function createFurnitureTrucks(args){
  const {THREE,root,box,materials:m,definition}=args,first=definition.steps[0],last=definition.steps.at(-1);
  const incoming=buildTruckDock(args,{shipping:false,stageId:first.id,x:first.x}),outgoing=buildTruckDock(args,{shipping:true,stageId:last.id,x:last.x});
  const stock=new THREE.Group();stock.name='Painéis aguardando recebimento';root.add(stock);
  const boards=Array.from({length:30},(_,index)=>{const board=box(stock,0,.07,0,1.9,.14,.78,m.wood);board.userData.index=index;return board;});
  return {incoming,outgoing,stock,
    inputPose(s){const index=Math.max(0,(s.total??1)-1-(s.done??0)),slot=furnitureInputSlot(index,first.x);return ['moving','operating'].includes(s.phase)?receivingDockPose(s.phase==='moving'?s.progress*.15:.15+s.progress*.85,slot,{x:first.x,y:1.2,raise:.16}):slot;},
    outputPose(s,target){const index=s.phase==='complete'?Math.max(0,(s.done??1)-1):s.done??0,slot=furnitureCargoSlot(index,target,last.x);return s.phase==='outgoing'?shippingDockPose(s.progress,slot,{x:last.x,y:1.23}):slot;},
    update(s,selected,pose){
      incoming.group.visible=selected===first.id;outgoing.group.visible=selected===last.id;stock.visible=incoming.group.visible;
      const remaining=Math.max(0,(s.total??1)-1-(s.done??0));boards.forEach((board,index)=>{board.visible=index<remaining;const p=furnitureInputSlot(index,first.x);board.position.set(p.x,p.y+.07,p.z);});
      const input=selected===first.id&&s.step.id===first.id&&['ready','moving','operating'].includes(s.phase),output=selected===last.id&&s.step.id===last.id&&['outgoing','complete'].includes(s.phase);
      incoming.update({support:input?pose.y-.005:1.195,pose:input?{...pose,bottom:pose.y,width:1.9}:null,active:input&&s.phase!=='ready'});
      outgoing.update({support:output?pose.y-.035:1.195,pose:output?{...pose,bottom:pose.y-.03,width:1.72}:null,active:output&&s.phase==='outgoing'});
    },dispose(){incoming.dispose();outgoing.dispose();stock.traverse(o=>o.geometry?.dispose());stock.removeFromParent();}
  };
}
