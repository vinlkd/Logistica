import {createMotionAuthorization} from './motion-authorization.js';
import {buildCrateOpener} from './crate-opener.js';
import {buildTruckDock} from './truck-dock.js';
import {buildBottleCase} from './bottle-cases.js';
import {BOTTLE_CASE_COUNT, BOTTLE_STOCK, bottleSourceSlot, bottleEmptySlot,
  bottleReceivingState} from './bottle-crate-flow.js';

export function buildBottleReceiving(args, {createCopy}) {
  const {THREE, root, box, cyl, materials:m, definition, product} = args;
  const first = definition.steps[0], group = new THREE.Group();
  group.name = 'Recebimento • 12 caixas fechadas com 108 garrafas vazias';
  group.position.x = first.x; root.add(group);
  const dock = buildTruckDock({...args, root:group}, {
    shipping:false, stageId:first.id, cradle:true, upperShelf:true});
  const sourceCases = Array.from({length:BOTTLE_CASE_COUNT}, (_, index) => {
    const item = buildBottleCase(args, group, index);
    item.group.name = `Caixa de origem ${index+1} • 9 garrafas vazias`;
    return item;
  });
  const copies = new Map();
  for(let index=0; index<BOTTLE_STOCK; index++) {
    const copy = createCopy({...definition.initialize(product),
      id:`MAT-${index+1}`, volume:0, capped:false, labeled:false});
    copy.name = `Garrafa vazia de origem ${index+1}`;
    const slot = index % 9;
    copy.position.set((slot%3-1)*.43, .04, (Math.floor(slot/3)-1)*.43);
    sourceCases[Math.floor(index/9)].group.add(copy); copies.set(index,copy);
  }
  // The empty-box route crosses in front of the opened rear doors. Filling
  // the parking rows from their far end keeps earlier boxes out of the path.
  box(group,-4.1,1.145,3.505,3.4,.1,3.89,m.steel);
  box(group,-9.9,1.145,3.825,8.2,.1,3.25,m.steel);
  for(const x of [-13.7,-11,-8,-5.5,-2.55])
    for(const z of [2.28,5.32])
      box(group,x,.5475,z,.10,1.095,.10,m.steel);
  for(const x of [-6.7,.7]) for(const z of [-2,2])
    box(group,x,2.525,z,.12,5.05,.12,m.accent);
  for(const z of [-2,2]) {
    box(group,-3,4.65,z,7.52,.08,.08,m.steel);
    box(group,-3,5.05,z,7.52,.08,.08,m.steel);
  }
  const carriage = box(group,-1.7,4.65,0,.14,.08,4.08,m.steel);
  carriage.name = 'Ponte da pinça fora das caixas';
  const head = new THREE.Group(); group.add(head);
  head.name = 'Pinça extrai pelo topo depois da abertura das abas';
  box(head,0,1.1,0,.3,.10,.26,m.steel);
  const jaws = [-1,1].map(side=>box(head,side*.16,.925,0,.06,.12,.1,m.dark));
  const rod = cyl(group,-1.7,4,0,.025,1,m.steel);
  for(const x of [-5.12,-3.08]) box(group,x,5.05,0,.12,.08,4.08,m.steel);
  for(const z of [-1.02,1.02]) box(group,-4.1,5.05,z,2.16,.08,.12,m.steel);
  const opener=buildCrateOpener({...args,root:group});
  const openers=opener.arms;
  let authorizeMotion=createMotionAuthorization();
  let selected = first.id,lastState;
  return {group,dock,sourceCases,crates:sourceCases.map(c=>c.group),copies,
    head,rod,jaws,openers,
    get state(){return lastState;},
    selectStage(id) { if(id!==selected)authorizeMotion=createMotionAuthorization();selected=id; },
    update(snapshot) {
      const s=snapshot, done=Math.min(BOTTLE_STOCK,s.done??0);
      const index=Math.min(107,Math.max(0,s.phase==='complete'?done-1:done));
      const atInput=s.step?.id===first.id;
      const received=!!s.unit?.received||!!s.completedSteps?.includes(first.id)||!atInput;
      const phase=atInput&&!received?s.phase:'settled';
      const permission=authorizeMotion(s);
      const commanded=atInput&&((s.phase==='moving'&&permission.allows('motor'))||
        (s.phase==='operating'&&permission.allows('work')));
      const applyMotion=permission.initialize||commanded||permission.ended(first.id)&&received||permission.advanced&&received;
      const logicalState=bottleReceivingState(index,phase,s.progress??0);
      const state=applyMotion||!lastState?logicalState:lastState;
      if(applyMotion)lastState=state;
      const current=state.caseIndex;
      const consumed=Math.min(BOTTLE_STOCK,done+(s.phase==='complete'?0:received?1:0));
      const active=atInput&&!received&&s.phase!=='complete';
      group.visible=!args.stationView||selected===first.id;
      sourceCases.forEach((item,caseIndex)=>{
        const past=caseIndex<current, future=caseIndex>current;
        const pose=past?bottleEmptySlot(caseIndex):future?bottleSourceSlot(caseIndex):state.crate;
        item.group.position.set(pose.x,pose.y,pose.z);
        for(const flap of item.flaps) {
          const opened=past?1:future?0:state[flap.kind];
          flap.group.rotation[flap.axis]=3*flap.open*opened;
        }
        // Source cartons are closed, self-locking cartons, with no shipping
        // tape or finished-product label attached to their opening flaps.
        item.tape.visible=item.paper.visible=false;
        if(item.paper.userData.face)item.paper.userData.face.visible=false;
      });
      for(const [materialIndex,copy] of copies){
        copy.visible=materialIndex>=consumed&&!(active&&materialIndex===index);
        const caseIndex=Math.floor(materialIndex/9),closed=caseIndex>current||caseIndex===current&&state.minor===0&&state.major===0;
        if(copy.userData.closedOcclusion!==closed){copy.userData.closedOcclusion=closed;copy.traverse(o=>{if(o.isMesh)o.layers.set(closed?31:0);});}
      }
      if(applyMotion){dock.update({support:state.liftSupport,showTool:true,active:true,
        pose:{x:state.carrier.x,z:state.carrier.z,bottom:state.carrier.y,
          width:1.49,depth:1.49,extension:state.extension}});
      opener.update(state);
      head.position.set(state.head.x,state.head.y,state.head.z);
      jaws.forEach((jaw,i)=>jaw.position.x=(i?1:-1)*(.1+state.jawGap));
      carriage.position.x=state.head.x;
      const bottom=state.head.y+1.15;
      rod.position.set(state.head.x,(bottom+4.61)/2,state.head.z);
      rod.scale.y=4.61-bottom;}
      const material=s.phase==='ready'?logicalState.material:state.material;
      return active?{x:first.x+material.x,y:material.y,z:material.z}:null;
    },
    dispose() {
      dock.dispose();sourceCases.forEach(c=>c.dispose());
      group.traverse(o=>o.geometry?.dispose());group.removeFromParent();
    }
  };
}
