import * as THREE from "three";

export function buildCookwareDescent(
  scene,
  { supportFloor = () => 0, headClearance = 2 } = {},
) {
  const samples = [];
  function add(x, y, z) {
    samples.push(new THREE.Vector3(x, y, z));
  }
  function straight(a, b) {
    const count = Math.ceil(a.distanceTo(b) / 0.06);
    for (let index = 0; index < count; index++) {
      const p = a.clone().lerp(b, index / count);
      add(p.x, p.y, p.z);
    }
  }
  straight(
    new THREE.Vector3(31.25, 2.95, -14.5),
    new THREE.Vector3(27.8, 2.95, -14.5),
  );
  for (let index = 0; index < 32; index++) {
    const angle = (index * Math.PI) / 64;
    add(27.8 - 0.8 * Math.sin(angle), 2.95, -13.7 - 0.8 * Math.cos(angle));
  }
  straight(
    new THREE.Vector3(27, 2.95, -13.7),
    new THREE.Vector3(27, 2.95, 35.8),
  );
  for (let index = 0; index <= 200; index++) {
    const t = index / 200;
    add(
      27,
      THREE.MathUtils.lerp(2.95, 0.85, t * t * (3 - 2 * t)),
      THREE.MathUtils.lerp(35.8, 43.5, t),
    );
  }
  straight(
    new THREE.Vector3(27, 0.85, 43.5),
    new THREE.Vector3(27, 0.85, 44.7),
  );
  add(27, 0.85, 44.7);

  return buildDemoConveyor(scene, {
    samples,
    supportFloor,
    headClearance,
    name: "Descida de demonstração de Panelas até a expedição",
    crossings: [{ z: 34.9 }],
  });
}

export function buildDemoConveyor(
  scene,
  {
    samples,
    name,
    crossings = [],
    supportFloor = () => 0,
    headClearance = 2,
    sideGuides = false,
    startDistance = 0,
  },
) {
  const group = new THREE.Group();
  group.name = name;
  scene.add(group);
  const material = new THREE.MeshStandardMaterial({
    color: sideGuides ? "#242a2f" : "#365161",
    roughness: 0.75,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: "#a2b4bd",
    metalness: 0.4,
  });
  const frames = samples.map((point, index) => {
    const direction = samples[Math.min(index + 1, samples.length - 1)]
      .clone()
      .sub(samples[Math.max(0, index - 1)])
      .normalize();
    const across = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    return { point, across, direction };
  });
  const vertices = [];
  const indices = [];
  for (const { point, across } of frames) {
    for (let strip = 0; strip <= 4; strip++) {
      const vertex = point
        .clone()
        .addScaledVector(across, (strip / 4 - 0.5) * 0.82);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
  }
  for (let row = 0; row < frames.length - 1; row++) {
    for (let column = 0; column < 4; column++) {
      const a = row * 5 + column,
        b = a + 5;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  surface.setIndex(indices);
  surface.computeVertexNormals();
  material.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(surface, material));
  const barriers = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const posts = [];
  for (let index = 0; index < samples.length; index += 50) {
    const { point, across } = frames[index];
    // Keep the validated pedestrian crossing beneath the overhead conveyor open.
    if (
      crossings.some((crossing) =>
        crossing.z !== undefined
          ? Math.abs(point.z - crossing.z) < 1.1
          : Math.abs(point.x - crossing.x) < 1.1,
      )
    )
      continue;
    for (const side of [-1, 1]) {
      const position = point.clone().addScaledVector(across, side * 0.44);
      const base = supportFloor(position.x, position.z);
      const height = point.y - 0.12 - base;
      const matrix = new THREE.Matrix4().makeScale(0.08, height, 0.08);
      matrix.setPosition(position.x, base + height / 2, position.z);
      posts.push(matrix);
      if (sideGuides) {
        const bracket = new THREE.Matrix4().makeScale(0.055, 0.28, 0.055);
        bracket.setPosition(position.x, point.y + 0.01, position.z);
        posts.push(bracket);
      }
      barriers.push({
        minX: position.x - 0.04,
        maxX: position.x + 0.04,
        minZ: position.z - 0.04,
        maxZ: position.z + 0.04,
      });
    }
  }
  const supports = new THREE.InstancedMesh(unit, railMaterial, posts.length);
  posts.forEach((matrix, index) => supports.setMatrixAt(index, matrix));
  group.add(supports);
  for (const height of sideGuides ? [-0.08, 0.145] : [-0.08])
    for (const side of [-1, 1]) {
      const line = frames
        .filter((_, index) => index % 3 === 0 || index === frames.length - 1)
        .map(({ point, across }) =>
          point
            .clone()
            .addScaledVector(across, side * 0.45)
            .add(new THREE.Vector3(0, height, 0)),
        );
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(line),
            line.length * 2,
            height > 0 ? 0.03 : 0.04,
            6,
            false,
          ),
          railMaterial,
        ),
      );
    }
  // Low sections also block walking through the transport frame.
  for (const { point } of frames) {
    if (point.y - 0.12 < headClearance || supportFloor(point.x, point.z) > 0)
      barriers.push({
        minX: point.x - 0.49,
        maxX: point.x + 0.49,
        minZ: point.z - 0.05,
        maxZ: point.z + 0.05,
      });
  }
  const load = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.29, 0.52),
    new THREE.MeshStandardMaterial({ color: "#bb8954" }),
  );
  load.name = "Caixa de teste · Panelas";
  group.add(load);
  if (sideGuides)
    for (const mesh of group.children) mesh.castShadow = mesh.receiveShadow = true;
  const distances = [0];
  for (let index = 1; index < samples.length; index++)
    distances.push(
      distances[index - 1] + samples[index].distanceTo(samples[index - 1]),
    );
  const total = distances.at(-1);
  let travelled;
  function clipLoad(polygon, axis, boundary, sign) {
    const inside = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const keepsA = sign * (a[axis] - boundary) <= 0;
      const keepsB = sign * (b[axis] - boundary) <= 0;
      if (keepsA) inside.push(a);
      if (keepsA !== keepsB)
        inside.push(a.clone().lerp(b, (boundary - a[axis]) / (b[axis] - a[axis])));
    }
    return inside;
  }
  function update(dt) {
    const previous = travelled;
    travelled = Math.min(total - 0.29, travelled + dt * 1.4);
    let index = distances.findIndex((distance) => distance >= travelled);
    index = Math.max(1, index);
    const fraction =
      (travelled - distances[index - 1]) /
      (distances[index] - distances[index - 1]);
    const point = samples[index - 1].clone().lerp(samples[index], fraction);
    const direction = frames[index - 1].direction
      .clone()
      .lerp(frames[index].direction, fraction)
      .normalize();
    const across = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const up = direction.clone().cross(across).normalize();
    load.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, up, direction),
    );
    load.position.copy(point).addScaledVector(up, 0.145);
    const inverse = load.quaternion.clone().invert();
    let lift = 0;
    let previousRow;
    const supportRows = sideGuides ? 24 : 10;
    for (
      let row = Math.max(0, index - supportRows);
      row <= Math.min(frames.length - 1, index + supportRows);
      row++
    ) {
      const currentRow = [];
      for (let strip = 0; strip <= 4; strip++) {
        const vertex = frames[row].point
          .clone()
          .addScaledVector(frames[row].across, (strip / 4 - 0.5) * 0.82);
        const local = vertex.sub(load.position).applyQuaternion(inverse);
        currentRow.push(local);
        if (Math.abs(local.x) <= 0.24 && Math.abs(local.z) <= 0.26)
          lift = Math.max(lift, local.y + 0.145);
      }
      if (sideGuides && previousRow)
        for (let strip = 0; strip < 4; strip++) {
          const a = previousRow[strip], b = currentRow[strip];
          const c = previousRow[strip + 1], d = currentRow[strip + 1];
          for (let polygon of [[a, b, c], [c, b, d]]) {
            polygon = clipLoad(polygon, "x", 0.24, 1);
            polygon = clipLoad(polygon, "x", -0.24, -1);
            polygon = clipLoad(polygon, "z", 0.26, 1);
            polygon = clipLoad(polygon, "z", -0.26, -1);
            for (const vertex of polygon) lift = Math.max(lift, vertex.y + 0.145);
          }
        }
      previousRow = currentRow;
    }
    if (sideGuides) load.position.addScaledVector(up, lift + 0.001);
    else load.position.y += lift / up.y + 0.001;
    return previous !== travelled;
  }
  function reset() {
    travelled = Math.max(0, Math.min(startDistance, total - 0.29));
    update(0);
  }
  reset();
  return { group, barriers, update, reset, samples, load };
}
