import {furnitureCargoSlot} from "./furniture-trucks.js";
// Completed units keep their identity and leave on a supported output conveyor.
// Their travel derives from simulation time, so pause/reload cannot move them.
export function createFurnitureOutput({THREE,root,box,materials:m,definition,target,blank,foldingCarton}){
  const group=new THREE.Group();group.name="Transportador de saída dos móveis";root.add(group);
  const spacing=Math.max(blank,target+.22)+.25,end=3.2+spacing*30,start=4.875;
  box(group,(8+end+.3)/2,-.04,0,end+.3-8,.08,1.8,m.floor??m.white);
  box(group,(start+end)/2,1.15,0,end-start,.09,1.4,m.dark);
  for(const side of [-1,1]){
    box(group,(start+end)/2,1.02,side*.73,end-start,.17,.08,m.steel);
    for(let x=start+.4;x<end;x+=1.5)box(group,x,.4675,side*.73,.09,.935,.09,m.steel);
  }
  const units=new Map();
  function make(unit){
    const item=new THREE.Group();item.name=`Móvel concluído ${unit.id}`;group.add(item);
    const rise=unit.assembled?.85:0;
    box(item,0,.07+rise,0,unit.cut?target:blank,.14,.78,m.wood);
    if(unit.assembled)for(const x of [-target*.35,target*.35])for(const z of [-.27,.27])box(item,x,.425,z,.09,.85,.09,m.wood);
    if(unit.drilled)for(const x of [-target*.35,target*.35])for(const z of [-.27,.27]){const hole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.006,16),m.dark);hole.position.set(x,.143+rise,z);item.add(hole);}
    if(unit.packed)foldingCarton(THREE,item,box,m,target+.22,.95,1.02).update(1);
    item.position.y=1.2+(unit.packed?.03:0);return item;
  }
  return {group,
    update(s,selected){
      const terminal=s.scope==='bench'?definition.steps.find(step=>step.id===s.step.id):definition.steps.at(-1);
      group.position.x=terminal.x;group.visible=selected===terminal.id;
      const shipping=terminal.id===definition.steps.at(-1).id;
      group.children.filter(o=>o.isMesh).forEach(o=>o.visible=!shipping);
      const completed=s.completedUnits??[],live=new Set(completed.map(unit=>unit.id));
      for(const [id,item]of units)if(!live.has(id)){item.traverse(o=>o.geometry?.dispose());item.removeFromParent();units.delete(id);}
      completed.forEach((unit,index)=>{
        if(!units.has(unit.id))units.set(unit.id,make(unit));
        const item=units.get(unit.id);item.visible=!(s.phase==='complete'&&unit.id===s.unit.id);
        const last=s.history?.filter(event=>event.unit===unit.id&&event.step===terminal.id).at(-1);
        const transfer=definition.transferDuration??(s.scope==='bench'?2.1:Math.max(.65,Math.abs((definition.exitX??9)-terminal.x)/2));
        const finished=(last?.time??s.elapsed)+transfer;
        const destination=3.2+spacing*Math.max(0,(s.total??completed.length)-1-index);
        if(shipping){const slot=furnitureCargoSlot(index,target,0);item.position.set(slot.x,slot.y,slot.z);item.rotation.y=slot.rotation;}else{item.position.x=Math.min(destination,3.2+Math.max(0,(s.elapsed??0)-finished)*1.5);item.rotation.y=0;}
      });
    },
    dispose(){group.traverse(o=>o.geometry?.dispose());group.removeFromParent();units.clear();}
  };
}
