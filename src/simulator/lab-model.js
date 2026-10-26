import { applyCookwareFinish } from "./cookware-finish.js";
import {
  buildHandleAssembler,
  updateHandleAssembler,
} from "./handle-assembler.js";
import { buildRawLoader, updateRawLoader } from "./raw-loader.js";
import { getRawStock, RAW_PILE_X } from "./raw-stock.js";
import { buildLiftSupport, updateLiftSupport } from "./lift-support.js";
import { buildReceiving, updateReceiving } from "./receiving.js";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getProduct } from "./products.js";
import { getPresentation } from "./presentation.js";
import {
  getLayout,
  boundsForPose,
  overlaps,
  sweptBounds,
  CONVEYOR_TOP,
  CLEARANCE,
  YAW,
} from "./kinematics.js";
import { buildWorkstation, updateWorkstation } from "./workstations.js";
import { buildTruck } from "./trucks.js";

export function buildLabModel({
  id,
  product,
  layout = getLayout(product.id),
  m,
  scene = new THREE.Group(),
}) {
  const mat = (color, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  function box(group, x, y, z, w, h, d, material = m.blue, rounded = false) {
    const mesh = new THREE.Mesh(
      rounded
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(0.06, w / 5, h / 5, d / 5),
          )
        : new THREE.BoxGeometry(w, h, d),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function cyl(group, x, y, z, r, h, material = m.steel) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 32),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function bar(group, a, b, r, material = m.steel) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      delta = bv.clone().sub(av),
      mesh = cyl(
        group,
        ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
        r,
        delta.length(),
        material,
      );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }
  function carton(group, x = 0, y = 0, z = 0, scale = 1) {
    const p = layout.package,
      g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    group.add(g);
    box(g, 0, p.height / 2, p.centerZ, p.width, p.height, p.depth, m.box);
    box(g, 0, p.height + 0.009, p.centerZ, 0.12, 0.015, p.depth, m.tape);
    box(g, 0.25, p.height + 0.019, p.centerZ, 0.26, 0.012, 0.3, m.white);
    return g;
  }
  function pot(group, morph = false) {
    group.rotation.y = YAW;
    const r = product.rim,
      h = product.height,
      profile = [
        [0.001, -0.18],
        [0.08, -0.18],
        [0.2, -0.18],
        [r * 0.72, -0.17],
        [r * 0.8, -0.12],
        [r * 0.86, -0.06],
        [r * 0.91, h * 0.25],
        [r * 0.95, h * 0.62],
        [r * 0.99, h * 0.96],
        [r, h],
      ],
      flat = profile.map(
        (_, i) =>
          new THREE.Vector2(0.001 + (i / (profile.length - 1)) * 0.619, 0.21),
      );
    const geo = new THREE.LatheGeometry(flat, 48),
      target = new THREE.LatheGeometry(
        profile.map((p) => new THREE.Vector2(...p)),
        48,
      );
    geo.morphAttributes.position = [target.attributes.position];
    geo.morphAttributes.normal = [target.attributes.normal];
    const metal = m.steel.clone();
    metal.side = THREE.DoubleSide;
    if (m.cookwareReflection) metal.envMap = m.cookwareReflection;
    applyCookwareFinish(metal, 0);
    const body = new THREE.Mesh(geo, metal);
    body.castShadow = true;
    body.receiveShadow = true;
    body.morphTargetInfluences[0] = morph ? 0 : 1;
    group.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 48), metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = morph ? 0.21 : h;
    group.add(rim);
    const handles = new THREE.Group();
    group.add(handles);
    if (product.handles === "long") {
      box(handles, r + 0.13, h - 0.07, 0, 0.28, 0.065, 0.13, m.steel, true);
      const grip = box(
        handles,
        r + 0.61,
        h - 0.03,
        0,
        0.72,
        0.12,
        0.19,
        m.dark,
        true,
      );
      grip.rotation.z = 0.07;
    } else
      for (const side of [-1, 1]) {
        bar(
          handles,
          [side * r, h - 0.1, -0.16],
          [side * (r + 0.27), h - 0.04, -0.16],
          0.045,
        );
        bar(
          handles,
          [side * (r + 0.27), h - 0.04, -0.16],
          [side * (r + 0.27), h - 0.04, 0.16],
          0.05,
          m.dark,
        );
        bar(
          handles,
          [side * (r + 0.27), h - 0.04, 0.16],
          [side * r, h - 0.1, 0.16],
          0.045,
        );
      }
    handles.visible = !morph;
    return { body, rim, metal, handles };
  }
  function foldingBox(root) {
    const p = layout.package,
      g = new THREE.Group();
    root.add(g);
    box(g, 0, 0.0175, p.centerZ, p.width, 0.035, p.depth, m.box);
    const walls = [],
      flaps = [];
    for (const side of [-1, 1]) {
      const wall = new THREE.Group();
      wall.position.set(0, 0.035, p.centerZ + (side * p.depth) / 2);
      g.add(wall);
      box(wall, 0, p.height / 2, 0, p.width, p.height, 0.025, m.box);
      walls.push({ object: wall, axis: "x", open: (side * Math.PI) / 2 });
      const end = new THREE.Group();
      end.position.set((side * p.width) / 2, 0.035, p.centerZ);
      g.add(end);
      box(end, 0, p.height / 2, 0, 0.025, p.height, p.depth, m.box);
      walls.push({ object: end, axis: "z", open: (-side * Math.PI) / 2 });
      const flap = new THREE.Group();
      flap.position.set(0, p.height + 0.035, p.centerZ + (side * p.depth) / 2);
      g.add(flap);
      box(flap, 0, 0, (-side * p.depth) / 4, p.width, 0.02, p.depth / 2, m.box);
      flaps.push({ object: flap, open: (side * Math.PI) / 2 });
    }
    const tape = box(
        g,
        0,
        p.height + 0.06,
        p.centerZ,
        0.12,
        0.012,
        p.depth,
        m.tape,
      ),
      label = box(
        g,
        0.25,
        p.height + 0.07,
        p.centerZ,
        0.27,
        0.012,
        0.3,
        m.white,
      );
    const foam = new THREE.Mesh(
      new THREE.TorusGeometry(product.rim + 0.055, 0.04, 8, 48),
      m.white,
    );
    foam.rotation.x = Math.PI / 2;
    foam.position.set(0, product.height + 0.18, 0);
    g.add(foam);
    return { group: g, walls, flaps, tape, label, foam };
  }
  function build(id) {
    const root = new THREE.Group();
    root.position.y = 0.025;
    scene.add(root);
    const solids = [],
      rollers = [];
    const solid = (x, y, z, w, h, d, material = m.blue) => {
      const mesh = box(root, x, y, z, w, h, d, material);
      solids.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        name: "estrutura da máquina",
      });
      return mesh;
    };
    const dock = ["receiving", "shipping"].includes(id),
      floorX = dock ? (id === "shipping" ? 5 : -5) : 0;
    const floor = box(
      root,
      floorX,
      -0.04,
      0,
      dock ? 32 : 16,
      0.08,
      12,
      mat("#60788b", 0.1, 0.85),
    );
    floor.name = "sector-floor";
    for (const z of [-5.8, 5.8])
      box(root, 0, 0.001, z, 15.6, 0.002, 0.05, m.yellow);
    for (const z of [-2.15, 1.5]) box(root, 0, 0.87, z, 10, 0.27, 0.12, m.dark);
    const gap = [
      "receiving",
      "production",
      "raw",
      "finished",
      "quality",
      "finishing",
      "packing",
    ].includes(id)
      ? 0.82
      : 0;
    for (let x = -4.8; x < 4.9; x += 0.3)
      if (Math.abs(x) > gap && !(id === "shipping" && x > 2.5)) {
        const roller = bar(root, [x, 1.12, -2.1], [x, 1.12, 1.45], 0.075);
        box(roller, 0.077, 0, 0, 0.009, 3.5, 0.012, m.dark);
        for (const z of [-2.15, 1.5])
          box(root, x, 1.0475, z, 0.15, 0.085, 0.12, m.dark);
        rollers.push(roller);
      }
    for (const x of [-4.4, -2, 2, 4.4])
      for (const z of [-2.15, 1.5])
        box(root, x, 0.3675, z, 0.12, 0.735, 0.1, m.steel);
    const sensors = {};
    for (const [key, x] of [
      ["entry", -3.9],
      ["positioned", -0.45],
      ["exit", 3.8],
    ]) {
      box(root, x, 0.99, 1.57, 0.1, 0.04, 0.22, m.steel);
      box(root, x, 1.16, 1.65, 0.17, 0.3, 0.16, m.dark);
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        new THREE.MeshBasicMaterial({ color: "#43556a" }),
      );
      led.position.set(x, 1.25, 1.74);
      led.userData.signal = key;
      root.add(led);
      sensors[key] = led;
    }
    const active = new THREE.Group();
    root.add(active);
    const cookware = pot(active, true),
      packed = new THREE.Group();
    root.add(packed);
    carton(packed);
    const blank = foldingBox(root);
    let head = null,
      ram = null,
      piston = null,
      platform = null,
      fork = null,
      guard = null,
      truck = null,
      workstation = null,
      receiving = null,
      liftSupport = null,
      assembler = null,
      rawLoader = null,
      ramAnchor = 4.3;
    const clamps = [];
    if (id === "production") {
      box(root, 0, 0.1, 0, 2.8, 0.2, 3.3, m.blue, true);
      for (const x of [-1.12, 1.12]) solid(x, 2.15, -2.2, 0.26, 4.3, 0.3);
      solid(0, 4.45, -0.6, 3, 0.3, 3.5);
      head = box(root, 0, 3.3, 0, 1.7, 0.26, 1.7, m.yellow, true);
      cyl(head, 0, -0.7, 0, 0.29, 0.9, m.steel);
      ram = cyl(root, 0, 3.85, 0, 0.18, 0.8, m.steel);
      const die = new THREE.Mesh(
        new THREE.TorusGeometry(0.69, 0.04, 10, 48),
        m.steel,
      );
      die.rotation.x = Math.PI / 2;
      die.position.y = CONVEYOR_TOP - 0.028;
      root.add(die);
      const dieHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.72, 48, 1, true),
        m.steel,
      );
      dieHousing.position.y = CONVEYOR_TOP - 0.41;
      root.add(dieHousing);
      for (const x of [-0.5, 0.5])
        for (const z of [-0.5, 0.5])
          cyl(root, x, 0.3125, z, 0.05, 0.225, m.blue);
      platform = cyl(root, 0, CONVEYOR_TOP - 0.04, 0, 0.34, 0.08, m.steel);
      piston = cyl(root, 0, 0.65, 0, 0.11, 1, m.steel);
      cyl(root, 0, 0.21, 0, 0.18, 0.02, m.steel);
      for (const side of [-1, 1])
        clamps.push({
          object: box(
            root,
            side * 0.86,
            CONVEYOR_TOP + 0.05,
            0,
            0.2,
            0.08,
            0.25,
            m.dark,
          ),
          side,
        });
      guard = box(root, 0, 2.4, 1.98, 2.9, 2.4, 0.025, m.glass);
      for (const x of [-1.52, 4.8])
        box(root, x, 1.85, 1.98, 0.07, 3.7, 0.09, m.steel);
      box(root, 1.64, 3.65, 1.98, 6.4, 0.08, 0.1, m.steel);
      for (const x of [-1.1, 1.1])
        box(guard, x, 1.25, 0, 0.13, 0.14, 0.14, m.dark);
    } else if (id === "raw" || id === "finished") {
      // Addressed central slot has fork lanes between support rails.
      const rear = -3.6 + layout.package.centerZ,
        depth = layout.package.depth + 0.35;
      for (const x of [-1.18, 1.18])
        for (const z of [rear - depth / 2 - 0.1, rear + depth / 2 + 0.1])
          solid(x, 2.3, z, 0.12, 4.6, 0.12);
      for (const x of [
        -layout.package.width * 0.34,
        layout.package.width * 0.34,
      ])
        box(
          root,
          x,
          CONVEYOR_TOP + 1.6 - 0.04,
          rear,
          0.1,
          0.08,
          depth,
          m.yellow,
        );
      if (id === "finished") solid(0, 4.6, rear, 2.5, 0.12, depth);
      else {
        solid(0, 4.66, rear - depth / 2 - 0.1, 2.5, 0.12, 0.12);
        rawLoader = buildRawLoader({ root, THREE, box, cyl, m, layout });
      }
      for (const z of [rear - depth / 2, rear + depth / 2]) {
        box(root, 0, 2.59, z, 2.45, 0.12, 0.12, m.steel);
        for (const x of [
          -layout.package.width * 0.34,
          layout.package.width * 0.34,
        ])
          box(root, x, 2.6825, z, 0.1, 0.065, 0.1, m.steel);
      }
      fork = new THREE.Group();
      root.add(fork);
      for (const x of [-0.15, 0.15])
        box(
          fork,
          x,
          CONVEYOR_TOP - 0.06,
          layout.package.centerZ,
          0.14,
          0.12,
          layout.package.depth + 0.1,
          m.steel,
        );
      liftSupport = buildLiftSupport({ root, box, cyl, m, layout });
      for (const x of [-0.87, 0.87])
        solid(x, 2.16, 1.95, 0.12, 4.08, 0.12, m.white);
      box(root, 0, 4.2, 1.95, 1.9, 0.12, 0.2, m.blue);
      for (const side of [-1, 1])
        for (let n = 0; n < 2; n++) {
          const x = side * (2.8 + n * 1.75);
          box(root, x, 0.77, rear, 1.55, 0.12, depth, m.yellow);
          for (const dx of [-0.6, 0.6])
            for (const dz of [-depth * 0.4, depth * 0.4])
              box(root, x + dx, 0.36, rear + dz, 0.08, 0.72, 0.08, m.blue);
          if (id === "finished")
            carton(root, x, 0.83, rear - layout.package.centerZ, 0.9);
        }
    } else if (id === "packing") {
      const p = layout.package,
        front = p.centerZ + p.depth / 2 + p.height + 0.35,
        back = p.centerZ - p.depth / 2 - p.height - 0.35,
        roof = CONVEYOR_TOP + p.height + p.depth / 2 + 0.7;
      for (const x of [-1.85, 1.85])
        for (const z of [front, back])
          solid(x, (roof - 0.09) / 2, z, 0.15, roof - 0.09, 0.15);
      solid(0, roof, back, 3.55, 0.18, 0.2);
      solid(0, roof, front, 3.55, 0.18, 0.2);
      for (const x of [-1.85, 1.85])
        box(
          root,
          x,
          roof,
          (front + back) / 2,
          0.15,
          0.18,
          front - back + 0.2,
          m.blue,
        );
      // Side guards are outside the entire unfolded blank; both transport ends stay open.
      for (const z of [front, back])
        box(root, 0, 2.05, z, 3.5, 2.4, 0.025, m.glass);
      head = box(
        root,
        0,
        roof + 0.2,
        p.centerZ,
        p.width + 0.12,
        0.13,
        p.depth + 0.05,
        m.yellow,
        true,
      );
      ramAnchor = roof + 0.5;
      for (const x of [-1.85, 1.85])
        box(root, x, roof + 0.25, p.centerZ, 0.12, 0.5, 0.12, m.steel);
      box(root, 0, ramAnchor, p.centerZ, 3.85, 0.12, 0.18, m.steel);
      ram = cyl(root, 0, roof + 0.3, p.centerZ, 0.08, 0.8, m.steel);
      const spool = cyl(head, 0, 0.36, 0, 0.3, 0.2, m.tape);
      spool.rotation.z = Math.PI / 2;
    } else if (id === "finishing" || id === "quality") {
      workstation = buildWorkstation({
        id,
        root,
        THREE,
        box,
        cyl,
        bar,
        m,
        product,
        layout,
      });
      if (workstation?.panel) workstation.panel.group.position.x = 3.6;
    } else if (id === "receiving" || id === "shipping") {
      truck = buildTruck({
        root,
        THREE,
        box,
        cyl,
        bar,
        m,
        shipping: id === "shipping",
        layout,
      });
      if (id === "receiving")
        receiving = buildReceiving({ root, THREE, box, cyl, bar, m, layout });
      if (id === "receiving")
        for (let n = 0; n < 3; n++)
          for (let j = 0; j < 6; j++)
            cyl(
              root,
              -8 - n * 1.4,
              CONVEYOR_TOP + CLEARANCE + 0.013 + j * 0.03,
              0,
              0.6,
              0.025,
            );
    }
    if (id === "finishing")
      assembler = buildHandleAssembler({
        root,
        THREE,
        box,
        cyl,
        bar,
        m,
        product,
        layout,
        handles: cookware.handles,
      });
    const inputs = [],
      outputs = [],
      cargo = [];
    if (["receiving", "production"].includes(id)) {
      if (id === "production") {
        box(root, -5.65, CONVEYOR_TOP - 0.06, 0, 1.35, 0.12, 1.45, m.white);
        for (const dx of [-0.54, 0.54])
          for (const z of [-0.57, 0.57])
            box(
              root,
              -5.65 + dx,
              (CONVEYOR_TOP - 0.12) / 2,
              z,
              0.08,
              CONVEYOR_TOP - 0.12,
              0.08,
              m.steel,
            );
      }
      for (let i = 0; i < 12; i++) {
        const disc = cyl(
          root,
          -5.65,
          CONVEYOR_TOP + CLEARANCE + 0.0125 + i * 0.03,
          0,
          0.6,
          0.025,
        );
        inputs.push(disc);
      }
    }
    if (id === "raw")
      for (let pile = 0; pile < 4; pile++)
        for (let level = 0; level < 13; level++) {
          const disc = cyl(
            root,
            RAW_PILE_X[pile],
            0.8545 + level * 0.026,
            -3.6 + layout.package.centerZ,
            0.6,
            0.025,
          );
          disc.userData.pile = pile;
          disc.userData.level = level;
          inputs.push(disc);
        }
    if (id === "packing") {
      box(root, 0, 0.77, -4.3, 13, 0.16, 3.3, m.white);
      for (const x of [-6, -3, 0, 3, 6])
        for (const z of [-5.65, -2.95])
          box(root, x, 0.345, z, 0.09, 0.69, 0.09, m.steel);
      for (let i = 0; i < 8; i++) {
        const g = new THREE.Group();
        root.add(g);
        g.position.set(-5.5 + i * 1.55, 0.85 + CLEARANCE, -4.3);
        if (id === "packing") carton(g);
        else {
          g.position.y += 0.18;
          pot(g);
        }
        outputs.push(g);
      }
    }
    if (id === "shipping")
      for (let i = 0; i < 12; i++) {
        const g = new THREE.Group();
        root.add(g);
        const tier = Math.floor(i / 4),
          slot = 3 - (i % 4);
        g.position.set(
          6.65 + slot * (layout.package.width + 0.14),
          CONVEYOR_TOP + tier * (layout.package.height + 0.08) + CLEARANCE,
          0,
        );
        carton(g);
        cargo.push(g);
      }
    const hmi = new THREE.Group();
    hmi.position.set(4.5, 0, 2.2);
    root.add(hmi);
    bar(hmi, [0, 0, 0], [0, 1.7, 0], 0.06);
    box(hmi, 0, 1.9, 0, 0.8, 0.6, 0.12, m.dark, true);
    bar(root, [2.3, 0, 2], [2.3, 3.32, 2], 0.025, m.steel);
    box(root, 2.3, 0.035, 2, 0.23, 0.07, 0.23, m.steel);
    const lamps = {};
    for (const [i, key, color] of [
      [0, "red", "#be4a3c"],
      [1, "amber", "#db9b36"],
      [2, "green", "#339478"],
    ])
      lamps[key] = cyl(
        root,
        2.3,
        3.2 - i * 0.18,
        2,
        0.085,
        0.14,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.04,
        }),
      );
    const model = {
      id,
      root,
      solids,
      rollers,
      lastRenderX: null,
      sensors,
      active,
      cookware,
      packed,
      blank,
      head,
      ram,
      ramAnchor,
      piston,
      platform,
      fork,
      liftSupport,
      assembler,
      rawLoader,
      guard,
      truck,
      workstation,
      receiving,
      clamps,
      inputs,
      outputs,
      cargo,
      lamps,
      lastPose: null,
      lastUnit: null,
    };
    return model;
  }
  const model = build(id);
  let serial = 0;
  model.root.traverse((o) => {
    if (o.isMesh && !o.name) o.name = `${id}/${o.geometry.type}/${serial++}`;
  });
  return model;
}

export function updateLabModel(
  model,
  cell,
  product,
  dt,
  running,
  emergency,
  scope = "bench",
  onMotionBlocked = () => {},
) {
  if (!model || !cell) return;
  const layout = getLayout(product.id);
  let p = getPresentation(cell, product.id);
  if (cell.unit?.id !== model.lastUnit) {
    model.lastPose = null;
    model.lastRenderX = null;
    model.lastUnit = cell.unit?.id;
  }
  if (cell.part) {
    const bounds = boundsForPose(p, product.id),
      sweep = model.lastPose
        ? sweptBounds(boundsForPose(model.lastPose, product.id), bounds)
        : bounds;
    const hit = model.solids.find((s) => overlaps(sweep, s, 0.001));
    if (hit && model.lastPose) {
      p = model.lastPose;
      onMotionBlocked(cell.id, hit.name);
    } else model.lastPose = p;
  }
  if (model.lastRenderX !== null && cell.outputs.motor && !emergency)
    for (const r of model.rollers)
      r.rotateY(-(p.x - model.lastRenderX) / 0.075);
  model.lastRenderX = p.x;
  model.active.visible = cell.part && !p.isBox;
  model.active.position.set(p.x, p.y, p.z);
  model.active.rotation.y = YAW + (cell.id === "finishing" ? p.polishAngle : 0);
  model.packed.visible = cell.part && p.isBox && cell.id !== "packing";
  model.packed.position.set(p.x, p.support + CLEARANCE, p.z);
  const pot = model.cookware;
  pot.body.morphTargetInfluences[0] = p.form;
  pot.rim.position.y = 0.21 + (product.height - 0.21) * p.form;
  pot.rim.scale.setScalar((0.62 + (product.rim - 0.62) * p.form) / product.rim);
  if (!model.assembler) {
    pot.handles.visible = p.form > 0.99 && cell.id !== "production";
    pot.handles.scale.setScalar(1);
  }
  applyCookwareFinish(pot.metal, p.polish);
  if (model.platform) model.platform.position.y = p.support - 0.04;
  if (model.piston) {
    model.piston.position.y = (0.22 + p.support - 0.08) / 2;
    model.piston.scale.y = p.support - 0.3;
  }
  if (model.head)
    model.head.position.y = cell.id === "production" ? p.headY : p.packingHeadY;
  if (model.ram) {
    const end =
      model.head.position.y + (cell.id === "production" ? 0.13 : 0.065);
    model.ram.position.y = (model.ramAnchor + end) / 2;
    model.ram.scale.y = (model.ramAnchor - end) / 0.8;
  }
  for (const clamp of model.clamps)
    clamp.object.position.x = clamp.side * (0.86 - 0.18 * p.fixation);
  if (model.fork) model.fork.position.set(0, p.forkLift, p.forkZ);
  if (model.liftSupport) updateLiftSupport(model.liftSupport, p);
  if (model.guard) model.guard.position.x = cell.guard ? 0 : 3.1;
  if (model.receiving)
    updateReceiving(model.receiving, { cell, product, layout, running });
  if (model.assembler)
    updateHandleAssembler(model.assembler, { pose: p, cell, product, layout });
  if (model.rawLoader) updateRawLoader(model.rawLoader, p);
  if (model.workstation)
    updateWorkstation(model.workstation, {
      pose: p,
      cell,
      dt,
      running,
      product,
      layout,
    });
  if (model.truck)
    model.truck.lift.position.y =
      cell.id === "shipping" ? p.support - CONVEYOR_TOP : 0;
  const c = model.blank;
  c.group.visible = cell.id === "packing" && cell.part;
  c.group.position.set(p.x, CONVEYOR_TOP, p.z);
  for (const wall of c.walls)
    wall.object.rotation[wall.axis] = wall.open * (1 - p.walls);
  for (const flap of c.flaps) {
    flap.object.visible = p.walls > 0.999;
    flap.object.rotation.x = flap.open * (1 - p.flaps);
  }
  c.tape.visible = p.tape > 0;
  c.tape.scale.z = Math.max(0.001, p.tape);
  c.label.visible = p.tape > 0.75;
  c.foam.visible = p.foam > 0;
  c.foam.scale.setScalar(Math.max(0.001, p.foam));
  const rawCounts =
    cell.id === "raw" ? getRawStock(cell, product).counts : null;
  model.inputs.forEach(
    (g, i) =>
      (g.visible = rawCounts
        ? g.userData.level < rawCounts[g.userData.pile]
        : i < cell.queue),
  );
  model.outputs.forEach(
    (g, i) => (g.visible = scope === "bench" && i < cell.done),
  );
  model.cargo.forEach((g, i) => (g.visible = i < cell.done));
  for (const [key, led] of Object.entries(model.sensors))
    led.material.color.set(cell.inputs[key] ? "#36bd8c" : "#43556a");
  const states = {
    red: emergency || !cell.guard || cell.fault,
    amber: !running || cell.awaitingAction,
    green: running && !cell.awaitingAction,
  };
  for (const [key, lamp] of Object.entries(model.lamps))
    lamp.material.emissiveIntensity = states[key] ? 1.5 : 0.04;
}
