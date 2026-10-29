import { CONVEYOR_TOP, CLEARANCE, getLayout } from "./kinematics.js";
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
export const COOKWARE_PACKING_LAYOUT=Object.freeze({beltEndX:4.875,pickupX:4.5,boxX:8,exitX:13,tableMinX:5.45,tableMaxX:9.925,outputEndX:13.775,gantryHeight:4.8});
export const COOKWARE_PACKING_CARTON_DURATION=9;
export const COOKWARE_CONVEYOR_SPEED=2.088;
export const cookwarePackingFeedDuration=()=> (COOKWARE_PACKING_LAYOUT.pickupX+4.35)/COOKWARE_CONVEYOR_SPEED;
export const cookwarePackingUnloadDuration=()=> (COOKWARE_PACKING_LAYOUT.exitX-COOKWARE_PACKING_LAYOUT.boxX)/COOKWARE_CONVEYOR_SPEED;
export function cookwarePackingPlan(product){
 const pkg=getLayout(product.id).package,highBottom=CONVEYOR_TOP+.035+pkg.height+.35;
 const lift=highBottom-(CONVEYOR_TOP+CLEARANCE),lower=highBottom-(CONVEYOR_TOP+.035+CLEARANCE);
 const segments=[['erect',.8],['approach',lift/1.2],['grip',.25],['lift',lift/1.2],['carry',(8-4.5)/COOKWARE_CONVEYOR_SPEED],['lower',lower/1.2],['release',.2],['retract',lower/1.2],['return',(8-4.5)/COOKWARE_CONVEYOR_SPEED]];
 return {pkg,highBottom,segments};
}
export function cookwarePackingCartonDuration(product){return cookwarePackingPlan(product).segments.reduce((sum,segment)=>sum+segment[1],0)+.1;}
// The product and carton have distinct positions until the gripper releases the
// rim inside the already erected box. All routes derive from recipe progress.
export function cookwarePackingPose(cell,product){
 const layout=COOKWARE_PACKING_LAYOUT,{pkg,highBottom,segments}=cookwarePackingPlan(product);
 const step=cell.stage?.id??'idle',t=clamp(cell.stage?.progress),phase=cell.phase;
 const feed=clamp((cell.progress??0)/.5),out=clamp(((cell.progress??.5)-.5)/.5);
 const p={};let elapsed=0;
 for(const [id,duration]of segments){p[id]=clamp((t*cookwarePackingCartonDuration(product)-elapsed)/duration);elapsed+=duration;}
 const after=phase==='unloading'||phase==='processing'&&['protect','close','label'].includes(step);
 let x=phase==='feeding'?-4.35+(layout.pickupX+4.35)*feed:after?layout.boxX:layout.pickupX;
 let bottom=CONVEYOR_TOP+CLEARANCE,toolX=layout.pickupX,toolBottom=highBottom,grip=0;
 if(step==='carton'&&phase==='processing'){
   const lifted=bottom+(highBottom-bottom)*p.lift;
   x=layout.pickupX+(layout.boxX-layout.pickupX)*p.carry;
   bottom=lifted+(CONVEYOR_TOP+.035+CLEARANCE-highBottom)*p.lower;
   toolX=x-(layout.boxX-layout.pickupX)*p.return;
   toolBottom=highBottom+(CONVEYOR_TOP+CLEARANCE-highBottom)*p.approach+(highBottom-(CONVEYOR_TOP+CLEARANCE))*p.lift+
     (CONVEYOR_TOP+.035+CLEARANCE-highBottom)*p.lower+(highBottom-(CONVEYOR_TOP+.035+CLEARANCE))*p.retract;
   grip=p.grip*(1-p.release);
 }else if(after){bottom=CONVEYOR_TOP+.035+CLEARANCE;}
 if(phase==='unloading'){x=layout.boxX+(layout.exitX-layout.boxX)*out;}
 const boxed=/box/.test(cell.unit?.material??'')||phase==='unloading';
 const walls=phase==='feeding'?0:step==='carton'?p.erect:after?1:0;
 const flaps=step==='close'?t:['label','transfer'].includes(step)||phase==='unloading'?1:0;
 const tape=step==='label'?t:phase==='unloading'?1:0;
 const retractY=CONVEYOR_TOP+pkg.height+pkg.depth/2+.92;
 const packingHeadY=step==='label'?retractY-(retractY-(CONVEYOR_TOP+pkg.height+.14))*Math.sin(Math.PI*t):retractY;
 return {x,z:0,y:bottom+.18,support:boxed?CONVEYOR_TOP-CLEARANCE:bottom-CLEARANCE,
   cartonX:phase==='unloading'?x:layout.boxX,cartonZ:0,cartonBase:CONVEYOR_TOP,
   walls,flaps,tape,foam:step==='protect'?t:['close','label','transfer'].includes(step)||phase==='unloading'?1:0,
   packingHeadY,packingTool:{x:toolX,y:toolBottom+.18+product.height,z:0,gap:.015*(1-grip),grip},packingPhases:p};
}
export function buildCookwarePacking({THREE,root,box,cyl,bar,m,product,layout,rollers}){
 const cfg=COOKWARE_PACKING_LAYOUT,pkg=layout.package,group=new THREE.Group();group.name='Embalagem: bancada independente após a esteira';root.add(group);
 const front=pkg.centerZ+pkg.depth/2+pkg.height+.4,back=pkg.centerZ-pkg.depth/2-pkg.height-.4;
 const top=box(group,(cfg.tableMinX+cfg.tableMaxX)/2,CONVEYOR_TOP-.05,(front+back)/2,cfg.tableMaxX-cfg.tableMinX,.1,front-back,m.steel);top.name='Mesa de montagem com apoio da caixa';
 for(const x of [cfg.tableMinX+.15,cfg.tableMaxX-.15])for(const z of [front-.12,back+.12])box(group,x,(CONVEYOR_TOP-.1)/2,z,.1,CONVEYOR_TOP-.1,.1,m.steel);
 // This short nose starts beyond the last roller tangent and supports the rim pickup.
 box(group,4.9875,CONVEYOR_TOP-.05,-.325,.225,.1,3.55,m.steel);
 for(const z of [-1.9,1.25])box(group,5.04,(CONVEYOR_TOP-.1)/2,z,.08,CONVEYOR_TOP-.1,.08,m.steel);
 for(const z of [-2.15,1.5])box(group,11.85,.87,z,3.85,.27,.12,m.dark);
 for(let x=10;x<=13.701;x+=.3){const roller=bar(group,[x,1.12,-2.1],[x,1.12,1.45],.075,m.steel);rollers.push(roller);}
 for(const x of [10.15,13.55])for(const z of [-2.15,1.5])box(group,x,.3675,z,.12,.735,.1,m.steel);
 for(const x of [3.9,10.65])for(const z of [front+.15,back-.15])box(group,x,cfg.gantryHeight/2,z,.14,cfg.gantryHeight,.14,m.blue);
 for(const z of [front+.15,back-.15])box(group,7.275,cfg.gantryHeight,z,6.89,.16,.16,m.steel);
 const carriage=new THREE.Group();group.add(carriage);box(carriage,0,4.65,(front+back)/2,.18,.14,front-back+.46,m.steel);
 const tool=new THREE.Group();group.add(tool);tool.name='Pinça externa apoia o aro da panela';
 box(tool,0,.28,0,2*(product.rim+.1),.08,.18,m.dark);
 const jaws=[-1,1].map(side=>{const jaw=new THREE.Group();tool.add(jaw);box(jaw,0,.14,0,.045,.2,.09,m.steel);box(jaw,0,0,0,.06,.08,.1,m.dark);return {side,jaw};});
 const rod=cyl(group,cfg.pickupX,4,0,.035,1,m.steel);
 const roof=CONVEYOR_TOP+pkg.height+pkg.depth/2+.7;
 for(const z of [front,back])box(group,8,(roof-.09)/2,z,.15,roof-.09,.15,m.blue);
 box(group,8,roof,(front+back)/2,.15,.18,front-back+.2,m.blue);
 const head=box(group,8,roof+.2,pkg.centerZ,pkg.width+.12,.13,pkg.depth+.05,m.yellow,true);
 const ramAnchor=roof+.5;box(group,8,ramAnchor,pkg.centerZ,.15,.12,front-back+.2,m.steel);
 const ram=cyl(group,8,roof+.3,pkg.centerZ,.08,.8,m.steel),spool=cyl(head,0,.36,0,.3,.2,m.tape);spool.rotation.z=Math.PI/2;
 return {group,top,carriage,tool,jaws,rod,head,ram,ramAnchor,update(p){
   const pose=p.packingTool;carriage.position.x=pose.x;tool.position.set(pose.x,pose.y,pose.z);
   for(const {side,jaw}of jaws)jaw.position.x=side*(product.rim+.055+pose.gap);
   const bottom=pose.y+.32;rod.position.set(pose.x,(bottom+4.58)/2,0);rod.scale.y=Math.max(.01,4.58-bottom);
   spool.rotation.x=2*Math.PI*p.tape;
 }};
}
