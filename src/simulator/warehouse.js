// Shared warehouse structure. y is the exact supporting top surface.
export function buildWarehouseRack(args, slots) {
  const { THREE, root, box, materials: m, solid } = args;
  const group = new THREE.Group();
  group.name = "Armazém • endereços de estoque";
  root.add(group);
  const rackMaterial = new THREE.MeshStandardMaterial({color:'#8b9297',metalness:.65,roughness:.38});
  const woodMaterial = new THREE.MeshStandardMaterial({color:'#b28d60',roughness:.92});
  const fixed = [],
    posts = new Map();
  function structure(x, y, z, w, h, d, material = rackMaterial) {
    const mesh = solid
      ? solid(x, y, z, w, h, d, material)
      : box(group, x, y, z, w, h, d, material);
    mesh.name = "Estrutura fixa do armazém";
    mesh.userData.warehouseFixed = true;
    fixed.push(mesh);
    return mesh;
  }
  for (const slot of slots) {
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const x = slot.x + side * (slot.width / 2 + 0.15),
          z = slot.z + end * (slot.depth / 2 + 0.12),
          key = `${x.toFixed(4)}/${z.toFixed(4)}`;
        const previous = posts.get(key);
        posts.set(key, {
          x,
          z,
          top: Math.max(previous?.top ?? 0, slot.y + slot.height),
        });
      }
    if (slot.forkClearance) {
      // Longitudinal stringers leave both fork channels open. The original
      // address remains the exact top surface, including the wooden pallet.
      const offset = Math.max(.58,slot.railOffset ?? slot.width * 0.28),thin=slot.palletProfile==='low'||slot.depth<2;
      for(const dx of [-offset,0,offset]){
        const part=structure(slot.x+dx,slot.y-(thin?.025:.07),slot.z,dx===0?.16:.24,thin?.05:.14,slot.depth-.12,woodMaterial);
        part.name='Palete de madeira • canal de garfos livre';
      }
      for(const end of [-1,1])structure(slot.x,slot.y-(thin?.065:.17),slot.z+end*(slot.depth/2-.18),slot.width-.12,thin?.03:.06,.12,woodMaterial);
      for (const side of [-1, 1])
        structure(
          slot.x + side * (slot.railOffset ?? slot.width * 0.28),
          slot.y - (thin?.11:.23),
          slot.z,
          0.1,
          0.06,
          slot.depth,
          rackMaterial,
        );
    } else
      structure(
        slot.x,
        slot.y - 0.03,
        slot.z,
        slot.width,
        0.06,
        slot.depth,
        rackMaterial,
      );
    for (const side of [-1, 1])
      structure(
        slot.x,
        slot.y - (slot.forkClearance ? slot.palletProfile==='low'||slot.depth<2?.11:.28 : .1),
        slot.z + (side * slot.depth) / 2,
        slot.width + 0.25,
        slot.forkClearance&&(slot.palletProfile==='low'||slot.depth<2)?0.06:0.1,
        0.1,
        rackMaterial,
      );
    const plate = box(
      group,
      slot.x + slot.width / 2 + 0.02,
      slot.y + 0.12,
      slot.z + slot.depth / 2 + 0.18,
      0.32,
      0.18,
      0.025,
      m.white,
    );
    plate.name = `Endereço ${slot.id}`;
    const canvas = globalThis.document?.createElement("canvas");
    if (canvas) {
      canvas.width = 256;
      canvas.height = 128;
      const c = canvas.getContext("2d");
      if (c) {
        c.fillStyle = "#edf2f6";
        c.fillRect(0, 0, 256, 128);
        c.fillStyle = "#164193";
        c.font = "bold 56px Segoe UI";
        c.textAlign = "center";
        c.fillText(slot.id, 128, 84);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        plate.material = new THREE.MeshBasicMaterial({ map: texture });
        plate.userData.warehouseTexture = texture;
        plate.userData.warehouseMaterial = plate.material;
      }
    }
  }
  for (const { x, z, top } of posts.values()) {
    structure(x, top / 2, z, 0.1, top, 0.1);
    structure(x, 0.04, z, 0.3, 0.08, 0.3, m.steel);
  }
  // Connect adjacent bays at the rack faces without entering a fork channel.
  const rows=new Map();
  for(const slot of slots){const key=`${slot.y}/${slot.z}/${slot.depth}`;const row=rows.get(key)??[];row.push(slot);rows.set(key,row);}
  for(const row of rows.values()){
    row.sort((a,b)=>a.x-b.x);
    for(let i=1;i<row.length;i++){
      const a=row[i-1],b=row[i],left=a.x+a.width/2+.15,right=b.x-b.width/2-.15;
      if(right>left&&right-left<1.6)for(const side of [-1,1]){const thin=a.forkClearance&&(a.palletProfile==='low'||a.depth<2);structure((left+right)/2,a.y-(a.forkClearance?thin?.11:.28:.1),a.z+side*a.depth/2,right-left,thin?.06:.1,.1);}
    }
  }
  return {
    group,
    slots,
    fixed,
    dispose() {
      rackMaterial.dispose();woodMaterial.dispose();
      group.traverse((o) => {
        o.userData.warehouseTexture?.dispose();
        o.userData.warehouseMaterial?.dispose();
      });
    },
  };
}
