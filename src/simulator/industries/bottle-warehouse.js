import {buildWarehouseRack} from '../warehouse.js';
import {bottleWarehouseSlots,warehouseRawPose,warehouseFinishedPose} from './bottle-warehouse-flow.js';

export function buildBottleWarehouse(args,{kind='raw',x=0}={}){
  const {THREE,root,box,cyl,materials:m}=args,raw=kind==='raw',sign=raw?-1:1,mastZ=sign*2.4;
  const group=new THREE.Group();group.position.x=x;group.name=raw?'Armazém de garrafas recebidas • MP-01 a MP-12':'Armazém de caixas prontas • PA-01 a PA-12';root.add(group);
  const slots=bottleWarehouseSlots(kind),rack=buildWarehouseRack({...args,root:group},slots);
  for(const z of [mastZ-.2,mastZ+.2]){
    const rail=box(group,0,.08,z,8.2,.12,.08,m.steel);rail.name='Trilho fixo do armazém';rail.userData.warehouseFixed=true;
  }
  const carriage=new THREE.Group();group.add(carriage);carriage.name='Carro de transferência • somente com operação acionada';
  box(carriage,0,.2,mastZ,1.9,.2,.6,m.blue);
  for(const dx of [-.8,.8])for(const z of [mastZ-.2,mastZ+.2]){const wheel=cyl(carriage,dx,.15,z,.07,.07,m.dark);wheel.rotation.x=Math.PI/2;}
  for(const dx of [-.9,.9])box(carriage,dx,3,mastZ,.1,6,.1,m.blue);
  box(carriage,0,6,mastZ,1.95,.12,.18,m.steel);
  const lift=new THREE.Group();carriage.add(lift);lift.name=raw?'Pinça de estoque • segura pelo gargalo':'Garfos sob a caixa fechada';
  box(lift,0,raw?1.27:-.10,mastZ,1.9,.12,.20,m.blue);
  const moving=[];let head,jaws=[];
  if(raw){
    const arm=box(lift,0,1.11,0,.07,.08,1,m.steel);arm.name='Braço horizontal entre prateleiras';moving.push(arm);
    head=new THREE.Group();lift.add(head);box(head,0,1.1,0,.3,.10,.26,m.steel);
    jaws=[-1,1].map(side=>box(head,side*.16,.925,0,.06,.12,.10,m.dark));
  }else{
    for(const dx of [-.4,.4]){const fork=box(lift,dx,-.002,0,.11,.004,1,m.steel);fork.name='Garfo contínuo sob a carga';moving.push(fork);}
  }
  const ram=cyl(carriage,.65,1,mastZ,.025,1,m.steel);ram.name='Atuador vertical do armazém';
  let last;
  return {group,rack,slots,carriage,lift,moving,head,jaws,
    update(progress,index,{quantity=raw?1:9,id=''}={}){
      const state=raw?warehouseRawPose(progress,index):warehouseFinishedPose(progress,index);
      carriage.position.x=state.carriage.x;lift.position.y=state.carriage.y;
      const forkDepth=.1+1.4*state.phases.approach*(1-state.phases.park);
      const from=raw?Math.min(mastZ,state.carriage.z):Math.min(mastZ,state.carriage.z-forkDepth/2);
      const to=raw?Math.max(mastZ,state.carriage.z):Math.max(mastZ,state.carriage.z+forkDepth/2);
      const length=Math.max(.04,to-from),middle=(from+to)/2;
      for(const part of moving){part.position.z=middle;part.scale.z=length;}
      if(head){head.position.z=state.carriage.z;jaws.forEach((jaw,i)=>jaw.position.x=(i?1:-1)*(.1+state.jawGap));}
      const bottom=.3,top=Math.max(bottom+.01,state.carriage.y-.2);ram.position.y=(bottom+top)/2;ram.scale.y=top-bottom;
      group.userData.address=state.address.id;
      group.userData.stock=state.occupied?[{id,address:state.address.id,quantity}]:[];
      group.userData.quantity=state.occupied?quantity:0;
      last=state;return state;
    },
    get state(){return last;},
    dispose(){rack.dispose();group.traverse(o=>o.geometry?.dispose());group.removeFromParent();}
  };
}
