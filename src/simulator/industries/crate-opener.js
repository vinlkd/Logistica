// Each arm holds a corner outside the panel's hinge-axis width. The rod can
// therefore follow a flap through 270 degrees without crossing that panel.
export function buildCrateOpener({THREE,root,box,cyl,materials:m},{x=-4.1,topCrossbar=true}={}) {
  const group=new THREE.Group();group.name='Abridor • abas dobradas para fora e para baixo';root.add(group);
  const arms=[];
  for(const side of [-1,1])for(const axis of ['x','z']) {
    const minor=axis==='x',anchor=new THREE.Vector3(
      x+(minor?side*1.4:-side*1.1),4.4,minor?side*.9:side*1.85);
    const shoe=box(group,anchor.x,anchor.y,anchor.z,minor?.06:.036,.03,minor?.036:.06,m.dark);
    shoe.name=`Pinça do canto da aba ${axis} ${side}`;
    const drive=cyl(group,anchor.x,anchor.y,anchor.z,.012,.02,m.steel);
    drive.name='Braço telescópico fora do painel';
    const motor=cyl(group,anchor.x,anchor.y,anchor.z,.06,.12,m.dark);
    const outside=side*2.25;
    const braceEnd=outside-side*.045;
    box(group,anchor.x,4.4,(anchor.z+braceEnd)/2,.07,.07,Math.abs(braceEnd-anchor.z),m.steel);
    box(group,anchor.x,4.705,outside,.07,.61,.07,m.steel);
    if(topCrossbar)box(group,anchor.x,5.05,(side*2+outside)/2,.08,.08,.25,m.steel);
    arms.push({minor,side,axis,anchor,shoe,drive,motor});
  }
  return {group,arms,
    update({minor=0,major=0,openerMinor=0,openerMajor=0}={}) {
      for(const arm of arms) {
        const angle=1.5*Math.PI*(arm.minor?minor:major),engagement=arm.minor?openerMinor:openerMajor;
        const radial=arm.side*(.755-.755*Math.cos(angle));
        const contact=new THREE.Vector3(
          x+(arm.minor?radial:-arm.side*.783),
          1.2+(arm.minor?1.195:1.22)+.755*Math.sin(angle),
          arm.minor?arm.side*.718:radial);
        arm.shoe.position.copy(arm.anchor).lerp(contact,engagement);
        arm.shoe.rotation.set(arm.minor?0:arm.side*angle*engagement,0,
          arm.minor?-arm.side*angle*engagement:0);
        const delta=arm.shoe.position.clone().sub(arm.anchor),length=Math.max(.02,delta.length());
        arm.drive.position.copy(arm.anchor).add(arm.shoe.position).multiplyScalar(.5);
        arm.drive.scale.y=length/.02;
        if(delta.lengthSq()>1e-9)arm.drive.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      }
    }
  };
}
