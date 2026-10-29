import {BOTTLE_PACK_X,BOTTLE_SEAL_X,BOTTLE_SHIP_X,BOTTLE_PACKING_LAYOUT as layout,bottlePackingCaseCenter} from './bottle-packing-layout.js';
const SPEED=2.088,VERTICAL=1.5,clamp=t=>Math.max(0,Math.min(1,t));
const point=(x,y,z)=>({x,y,z}),cache=new Map();
export const CASE_TRANSFER_FRONT=.86;
export const CASE_TRANSFER_PARK_HEIGHT=5.65;
function plan(index,targetX,packX){
  const key=`${index}/${targetX}/${packX}`;if(cache.has(key))return cache.get(key);
  const center=bottlePackingCaseCenter(index),home=point(packX+center.x,1.2,center.z),park=point(targetX+4,CASE_TRANSFER_PARK_HEIGHT,0);
  const corridor=index<2?home.x:index%2?packX+layout.rightAisleX:packX+layout.leftAisleX;
  let state={material:home,tool:park,forkLength:.04,frontOffset:2.15,holding:false};const segments=[];
  function add(id,duration,patch){const from=structuredClone(state);state={...state,...patch};state.material={...state.material};state.tool={...state.tool};segments.push({id,duration:Math.max(.001,duration),from,to:structuredClone(state)});}
  function move(id,patch,speed=SPEED){let distance=0;for(const field of ['material','tool'])if(patch[field])distance=Math.max(distance,Math.hypot(...['x','y','z'].map(axis=>patch[field][axis]-state[field][axis])));add(id,Math.max(.04,distance/speed),patch);}
  const carry=(id,p,speed=SPEED)=>move(id,{material:p,tool:p},speed);
  move('approachColumn',{tool:point(home.x,CASE_TRANSFER_PARK_HEIGHT,0)});
  move('approachCase',{tool:point(home.x,CASE_TRANSFER_PARK_HEIGHT,home.z)});
  add('alignOutsideFlaps',1.29/SPEED,{frontOffset:CASE_TRANSFER_FRONT});
  move('lowerEmptyForks',{tool:{...home}},VERTICAL);
  add('insertForks',1.6/SPEED,{forkLength:1.64});add('supportLoad',.3,{holding:true});
  carry('liftLoad',point(home.x,1.26,home.z),.3);
  carry('leaveBay',point(corridor,1.26,home.z));
  carry('clearOtherCases',point(corridor,1.26,0));
  add('clearMachineFrame',1.29/SPEED,{frontOffset:2.15,forkLength:2.93});
  carry('transferToMachine',point(targetX,1.26,0));
  carry('placeOnMachine',point(targetX,1.2,0),.3);
  add('releaseLoad',.3,{holding:false});add('withdrawForks',2.89/SPEED,{forkLength:.04});
  move('raiseEmptyForks',{tool:point(targetX,CASE_TRANSFER_PARK_HEIGHT,0)},VERTICAL);
  move('parkOutsideMachine',{tool:park});
  const route={segments,duration:segments.reduce((sum,s)=>sum+s.duration,0),start:segments[0].from,end:state};cache.set(key,route);return route;
}
export const bottleCaseTransferDuration=(index,targetX=BOTTLE_SEAL_X,packX=BOTTLE_PACK_X)=>plan(index,targetX,packX).duration;
export function bottleCaseTransferState(progress,index,targetX=BOTTLE_SEAL_X,packX=BOTTLE_PACK_X){
  const route=plan(index,targetX,packX);let time=clamp(progress)*route.duration;
  if(progress>=1)return {...structuredClone(route.end),stage:'complete',duration:route.duration};
  for(const segment of route.segments){
    if(time<=segment.duration){const t=clamp(time/segment.duration),state=structuredClone(segment.from);for(const field of ['material','tool'])for(const axis of ['x','y','z'])state[field][axis]+=t*(segment.to[field][axis]-state[field][axis]);state.forkLength+=t*(segment.to.forkLength-state.forkLength);state.frontOffset+=t*(segment.to.frontOffset-state.frontOffset);state.holding=t===1?segment.to.holding:segment.from.holding;return {...state,stage:segment.id,duration:route.duration};}
    time-=segment.duration;
  }
  return {...structuredClone(route.end),stage:'complete',duration:route.duration};
}

export function buildBottleCaseTransfer({THREE,root,box,cyl,materials:m},{packX=BOTTLE_PACK_X,shipX=BOTTLE_SHIP_X}={}){
  const group=new THREE.Group();group.name='Transferência de caixas • carro suspenso com garfos';root.add(group);const fixed=[];
  const minX=packX+layout.frameMinX-.3,maxX=shipX+5.2,front=2.75,back=layout.frameMinZ;
  for(const x of [minX,maxX])for(const z of [front,back])fixed.push(box(group,x,3.13,z,.1,6.26,.1,m.steel));
  for(const z of [front,back])fixed.push(box(group,(minX+maxX)/2,6.32,z,maxX-minX+.12,.12,.12,m.steel));
  const carriage=new THREE.Group();carriage.name='Carro de transferência acionado';group.add(carriage);
  box(carriage,0,6.2,(front+back)/2,.14,.12,front-back+.12,m.accent??m.blue);
  for(const z of [front,back]){const inner=z+(z===front?-.14:.14);box(carriage,0,6.32,inner,.12,.26,.06,m.steel);box(carriage,0,6.45,(z+inner)/2,.12,.05,.22,m.steel);const wheel=cyl(carriage,0,6.45,z,.07,.07,m.dark);wheel.rotation.x=Math.PI/2;}
  const head=new THREE.Group();carriage.add(head);head.name='Pórtico desce fora das abas da caixa';
  box(head,0,6.14,0,1.78,.12,.1,m.steel);
  const rods=[-1,1].map(side=>box(head,side*.795,2.5,0,.02,1,.04,m.steel));
  const crossbar=box(head,0,1.198,0,1.61,.004,.08,m.accent??m.blue);
  const forks=[-1,1].map(side=>box(head,side*.4,1.198,-.02,.11,.004,1,m.steel));forks.forEach(fork=>fork.name='Garfo sob o fundo da caixa');
  let last;
  return {group,carriage,head,rods,forks,crossbar,fixed,
    update(state){
      carriage.position.x=state.tool.x;head.position.z=state.tool.z+state.frontOffset;
      const bottom=state.tool.y,top=6.1;rods.forEach(rod=>{rod.position.y=(bottom+top)/2;rod.scale.y=top-bottom;});
      crossbar.position.y=bottom-.002;forks.forEach(fork=>{fork.position.y=bottom-.002;fork.position.z=-state.forkLength/2;fork.scale.z=state.forkLength;});
      group.userData.holding=state.holding;group.userData.stage=state.stage;last=state;
    },
    get state(){return last;},
    dispose(){group.traverse(object=>object.geometry?.dispose());group.removeFromParent();},
  };
}
