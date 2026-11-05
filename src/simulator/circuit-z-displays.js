export function stylePreviewDisplays(scene, THREE) {
  scene.traverse((object) => {
    if (object.userData.cutaway) {
      for (const part of object.children.filter(
        (child) => child.userData.cargoSide,
      )) {
        const opposite = part.clone(false);
        opposite.position.z = -part.position.z;
        object.add(opposite);
      }
    }

    if (object.userData.inactiveMonitor || object.userData.physicalSign)
      object.visible = false;
    const display = object.userData.machineDisplay;
    if (!display) return;
    const face = new THREE.Group();
    object.add(face);
    face.add(...display.parts);
    face.rotation.x = -Math.PI / 18;
    const texture = display.texture;
    const canvas = texture?.image;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = "#0d1319";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#edf3f5";
    ctx.font = "650 27px Segoe UI, sans-serif";
    ctx.fillText(display.title, 28, 51, width - 56);
    const lines = display.lines();
    const row = (height - 82) / Math.max(1, lines.length);
    for (const [index, text] of lines.entries()) {
      const y = 70 + index * row;
      ctx.fillStyle = "#171f27";
      ctx.fillRect(24, y, width - 48, row - 7);
      ctx.fillStyle = index === 0 ? "#edf3f5" : "#acbeca";
      ctx.font = "24px Segoe UI, sans-serif";
      ctx.fillText(text, 41, y + row / 2 + 6, width - 82);
    }
    texture.needsUpdate = true;
  });
}
