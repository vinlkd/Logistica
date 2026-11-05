export function buildIndustrialHall(THREE, scene, bands, { height = 10, rows } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: "#303a43",
    metalness: 0.48,
    roughness: 0.6,
  });
  const matrices = [];
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const upper = height - 0.4;
  const lower = height - 1.3;
  function beam(a, b, w, d) {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    direction.copy(to).sub(from);
    rotation.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    matrices.push(
      new THREE.Matrix4().compose(
        from.add(to).multiplyScalar(0.5),
        rotation,
        new THREE.Vector3(w, direction.length(), d),
      ),
    );
  }
  for (const { north, south, west, east } of bands) {
    const count = Math.max(1, Math.ceil((south - north) / 16));
    const positions = rows ?? Array.from({ length: count }, (_, index) =>
      north + ((south - north) * (index + 0.5)) / count,
    );
    for (const z of positions) {
      beam([west + 0.3, upper, z], [east - 0.3, upper, z], 0.14, 0.14);
      beam([west + 0.3, lower, z], [east - 0.3, lower, z], 0.12, 0.12);
      for (let x = west + 0.3; x < east - 0.4; x += 5.3) {
        const end = Math.min(east - 0.3, x + 5.3);
        beam([x, lower, z], [end, upper, z], 0.07, 0.07);
        beam([x, upper, z], [end, lower, z], 0.07, 0.07);
      }
      for (const x of [west + 0.3, east - 0.3]) {
        beam([x, 0.04, z], [x, upper, z], 0.2, 0.2);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
    matrices.length,
  );
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.name = "Treliças da cobertura industrial";
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}
