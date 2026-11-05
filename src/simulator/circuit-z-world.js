import * as THREE from "three";
import { BEVERAGES } from "./industries/definitions.js";
import { beverageZPreviewPlan } from "./circuit-beverage-z-preview.js";
import { buildIndustrialHall } from "./circuit-industrial-hall.js";
import { buildCircuitHmi } from "./circuit-hmi.js";
import { buildDemoConveyor } from "./circuit-cookware-descent.js";

// This world only consumes a static snapshot. It owns no productive engine.
export function buildCircuitZWorld(industry) {
  const plan = beverageZPreviewPlan(),
    scene = new THREE.Scene();
  scene.background = new THREE.Color("#c9d2da");
  const materials = Object.fromEntries(
    Object.entries({
      floor: "#929da4",
      steel: "#405664",
      wall: "#b6c1c7",
      base: "#647785",
      yellow: "#e3b541",
      belt: "#365161",
    }).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: key === "steel" ? 0.45 : 0.82,
        metalness: key === "steel" ? 0.4 : 0,
      }),
    ]),
  );
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = 220 + (((i * 37) ^ ((i >>> 2) * 73)) & 31);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  const concrete = new THREE.DataTexture(pixels, 64, 64);
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  concrete.repeat.set(24, 15);
  concrete.magFilter = THREE.LinearFilter;
  concrete.minFilter = THREE.LinearMipmapLinearFilter;
  concrete.generateMipmaps = true;
  concrete.needsUpdate = true;
  materials.floor.map = concrete;
  const staticSolids = [],
    modelSolids = [],
    machines = new Map(),
    monitors = [];
  function box(name, x, y, z, w, h, d, material = "steel", solid = true) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      materials[material],
    );
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (solid)
      staticSolids.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        name,
      });
    return m;
  }
  const b = plan.bounds,
    hallHeight = plan.height,
    deck = plan.deck,
    { height: playerHeight, radius: playerRadius } = plan.player;
  const hallX = (b.west + b.east) / 2,
    hallZ = (b.north + b.south) / 2,
    hallWidth = b.east - b.west,
    hallDepth = b.south - b.north;
  box(
    "Piso único do galpão",
    hallX,
    -0.12,
    hallZ,
    hallWidth,
    0.24,
    hallDepth,
    "floor",
    false,
  );
  box(
    "Cobertura completa",
    hallX,
    hallHeight + 0.11,
    hallZ,
    hallWidth,
    0.22,
    hallDepth,
    "steel",
    false,
  );
  for (const side of ["north", "south", "west", "east"]) {
    const horizontal = side === "north" || side === "south",
      fixed = b[side],
      low = horizontal ? b.west : b.north,
      high = horizontal ? b.east : b.south;
    const gates = plan.gates
      .filter((gate) => gate.side === side)
      .sort((a, b) => a.center - b.center);
    const spans = [];
    let start = low;
    for (const gate of gates) {
      spans.push([start, gate.center - gate.width / 2]);
      start = gate.center + gate.width / 2;
    }
    spans.push([start, high]);
    for (const [a, c] of spans) {
      box(
        "Muro " + side,
        horizontal ? (a + c) / 2 : fixed,
        hallHeight / 2,
        horizontal ? fixed : (a + c) / 2,
        horizontal ? c - a : 0.24,
        hallHeight,
        horizontal ? 0.24 : c - a,
        "wall",
      );
      box(
        "Rodapé " + side,
        horizontal ? (a + c) / 2 : fixed,
        0.6,
        horizontal ? fixed : (a + c) / 2,
        horizontal ? c - a : 0.28,
        1.2,
        horizontal ? 0.28 : c - a,
        "base",
        false,
      );
    }
    for (const gate of gates) {
      const sill = gate.sill ?? 0;
      const top = sill + gate.height;
      for (const [name, from, to] of [
        ["Base da doca elevada", 0, sill],
        ["Verga do portão", top, hallHeight],
      ]) {
        if (to <= from) continue;
        box(
          name,
          horizontal ? gate.center : fixed,
          (from + to) / 2,
          horizontal ? fixed : gate.center,
          horizontal ? gate.width : 0.24,
          to - from,
          horizontal ? 0.24 : gate.width,
          "wall",
        );
      }
    }
  }
  buildIndustrialHall(THREE, scene, [b], {
    height: hallHeight,
    rows: plan.roofRows,
  });
  const platformThickness = 0.16;
  const wallHeight = deck.y - platformThickness;
  box(
    "Piso do segundo andar",
    (deck.west + deck.east) / 2,
    deck.y - platformThickness / 2,
    (deck.north + deck.south) / 2,
    deck.east - deck.west,
    platformThickness,
    deck.south - deck.north,
    "steel",
  );
  box(
    "Parede de concreto da passarela",
    (deck.west + deck.east) / 2,
    wallHeight / 2,
    deck.south - 0.35,
    deck.east - deck.west,
    wallHeight,
    0.7,
    "wall",
  );
  // The concrete wall carries the front edge, with steel supports at the back.
  for (const x of [deck.west + 0.4, deck.east - 0.4])
    for (let z = deck.north + 1; z < deck.south; z += 7) {
      box(
        "Coluna apoiada no piso",
        x,
        (deck.y - 0.38) / 2,
        z,
        0.22,
        deck.y - 0.38,
        0.22,
      );
      box("Sapata de coluna", x, 0.05, z, 0.5, 0.1, 0.5, "base");
    }
  box(
    "Viga sob o deck",
    (deck.west + deck.east) / 2,
    deck.y - 0.27,
    deck.north + 0.3,
    deck.east - deck.west,
    0.22,
    0.18,
  );
  function rail(ax, az, bx, bz, y) {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) return;
    const count = Math.max(1, Math.ceil(length / 1.8));
    for (let i = 0; i <= count; i++)
      box(
        "Montante de guarda-corpo",
        THREE.MathUtils.lerp(ax, bx, i / count),
        y + 0.55,
        THREE.MathUtils.lerp(az, bz, i / count),
        0.07,
        1.1,
        0.07,
        "yellow",
      );
    for (const h of [0.12, 0.58, 1.08]) {
      const m = box(
        "Guarda-corpo",
        (ax + bx) / 2,
        y + h,
        (az + bz) / 2,
        length,
        h === 0.12 ? 0.16 : 0.06,
        0.06,
        "yellow",
        false,
      );
      m.rotation.y = -Math.atan2(bz - az, bx - ax);
      m.updateMatrixWorld();
      const bb = new THREE.Box3().setFromObject(m);
      staticSolids.push({ ...bbToRecord(bb), name: m.name });
    }
  }
  // Openings are reserved for stairs and the demonstration conveyors.
  for (const side of ["north", "south", "west", "east"]) {
    const horizontal = side === "north" || side === "south",
      fixed = deck[side],
      lo = horizontal ? deck.west : deck.north,
      hi = horizontal ? deck.east : deck.south;
    if (fixed === b[side]) continue;
    const openings = [];
    for (const stair of plan.stairs)
      if (Math.abs((horizontal ? stair.top[2] : stair.top[0]) - fixed) < 0.02)
        openings.push([
          (horizontal ? stair.top[0] : stair.top[2]) - stair.width / 2 - 0.15,
          (horizontal ? stair.top[0] : stair.top[2]) + stair.width / 2 + 0.15,
        ]);
    for (const connector of plan.connectors)
      for (let i = 1; i < connector.points.length; i++) {
        const a = connector.points[i - 1],
          c = connector.points[i],
          axis = horizontal ? 2 : 0;
        if ((a[axis] - fixed) * (c[axis] - fixed) <= 0 && a[axis] !== c[axis]) {
          const t = (fixed - a[axis]) / (c[axis] - a[axis]),
            p = THREE.MathUtils.lerp(
              a[horizontal ? 0 : 2],
              c[horizontal ? 0 : 2],
              t,
            );
          openings.push([p - 0.9, p + 0.9]);
        }
      }
    openings.sort((a, c) => a[0] - c[0]);
    let cursor = lo;
    for (const [a, c] of [...openings, [hi, hi]]) {
      const end = Math.min(hi, a);
      if (end > cursor)
        rail(
          horizontal ? cursor : fixed,
          horizontal ? fixed : cursor,
          horizontal ? end : fixed,
          horizontal ? fixed : end,
          deck.y,
        );
      cursor = Math.max(cursor, c);
    }
  }
  for (const stair of plan.stairs) {
    const [tx, h, tz] = stair.top,
      [bx, , bz] = stair.bottom,
      run = Math.hypot(tx - bx, tz - bz),
      ux = (tx - bx) / run,
      uz = (tz - bz) / run;
    for (let i = 1; i <= stair.steps; i++) {
      const t = (i - 0.5) / stair.steps,
        top = (h * i) / stair.steps;
      box(
        "Degrau " + i,
        bx + (tx - bx) * t,
        top / 2,
        bz + (tz - bz) * t,
        stair.width,
        top,
        run / stair.steps,
        "steel",
        false,
      );
    }
    // Stringers and handrails are sloped, not floating horizontal bars.
    for (const side of [-1, 1]) {
      const a = new THREE.Vector3(bx + (side * stair.width) / 2, 0.08, bz),
        c = new THREE.Vector3(tx + (side * stair.width) / 2, h - 0.16, tz);
      for (const lift of [0, 1.15]) {
        const from = a.clone().add(new THREE.Vector3(0, lift, 0)),
          to = c.clone().add(new THREE.Vector3(0, lift, 0));
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, from.distanceTo(to), 8),
          materials.yellow,
        );
        m.position.copy(from).add(to).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          to.sub(from).normalize(),
        );
        scene.add(m);
      }
      for (let i = 0; i <= stair.steps; i += 4) {
        const t = i / stair.steps;
        box(
          "Poste da escada",
          bx + (tx - bx) * t + (side * stair.width) / 2,
          h * t + 0.5,
          bz + (tz - bz) * t,
          0.065,
          1.05,
          0.065,
          "yellow",
          false,
        );
      }
    }
    stair.direction = { ux, uz, run };
  }
  function onDeck(x, z) {
    return (
      x >= deck.west && x <= deck.east && z >= deck.north && z <= deck.south
    );
  }
  function stairSurface(x, z) {
    for (const s of plan.stairs) {
      const dx = x - s.bottom[0],
        dz = z - s.bottom[2],
        { ux, uz, run } = s.direction;
      const along = dx * ux + dz * uz,
        across = dx * uz - dz * ux;
      if (
        along >= -0.01 &&
        along <= run + 0.01 &&
        Math.abs(across) < s.width / 2 - 0.08
      )
        return {
          height:
            (Math.ceil((Math.max(0, along) / run) * s.steps - 1e-7) *
              s.top[1]) /
            s.steps,
          stair: s,
        };
    }
    return null;
  }
  const worldStations = plan.stages.map((p) => {
    const original = BEVERAGES.steps.find((s) => s.id === p.stage);
    const hasControl = plan.hmiStages.includes(p.stage);
    const upperControl = hasControl && p.y === deck.y;
    const access = upperControl
      ? { x: (deck.west + deck.east) / 2, z: deck.south - 2.4 }
      : p.index === 1
        ? { x: p.x - 5, z: p.z + 15 }
        : { x: p.x, z: p.z + 4.8 };
    const station = {
      name: original.label,
      industry,
      ...p,
      interaction: access,
      hasControl,
    };
    const group = new THREE.Group();
    group.name = "Máquina · " + station.name;
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.yaw;
    scene.add(group);
    machines.set(p.stage, { station, group });
    if (station.hasControl) {
      const monitor = new THREE.Group();
      monitor.position.set(
        upperControl ? access.x : access.x + 1.4,
        p.y + 2.1,
        access.z - (upperControl ? 1.9 : 1.5),
      );
      scene.add(monitor);
      const hmi = buildCircuitHmi({
        THREE,
        group: monitor,
        title: station.name,
        sector: industry,
        theme: "blue",
      });
      monitor.updateMatrixWorld(true);
      staticSolids.push({
        ...bbToRecord(new THREE.Box3().setFromObject(monitor)),
        name: "HMI",
      });
      monitors.push({ station, hmi });
    }
    return station;
  });
  const demos = plan.connectors.map((connector, index) => {
    // Rounded corners stay inside each segment's convex hull.
    const waypoints = connector.points.map((p) => new THREE.Vector3(...p)),
      points = [waypoints[0].clone()];
    for (let i = 1; i < waypoints.length - 1; i++) {
      const a = waypoints[i - 1],
        c = waypoints[i],
        d = waypoints[i + 1],
        r = Math.min(1, a.distanceTo(c) * 0.3, c.distanceTo(d) * 0.3);
      const entry = c.clone().addScaledVector(a.clone().sub(c).normalize(), r),
        exit = c.clone().addScaledVector(d.clone().sub(c).normalize(), r);
      points.push(entry);
      for (let j = 1; j <= 16; j++) {
        const t = j / 16;
        points.push(
          entry
            .clone()
            .multiplyScalar((1 - t) ** 2)
            .addScaledVector(c, 2 * (1 - t) * t)
            .addScaledVector(exit, t * t),
        );
      }
    }
    points.push(waypoints.at(-1));
    const samples = [];
    for (let i = 1; i < points.length; i++) {
      const n = Math.max(
        1,
        Math.ceil(points[i - 1].distanceTo(points[i]) / 0.055),
      );
      for (let j = 0; j < n; j++)
        samples.push(points[i - 1].clone().lerp(points[i], j / n));
    }
    samples.push(points.at(-1));
    const demo = buildDemoConveyor(scene, {
      samples,
      name: "Conector demonstrativo " + (index + 1),
      crossings: [{ x: waypoints[0].x }, { x: waypoints.at(-1).x }],
      supportFloor: (x, z) => (onDeck(x, z) ? deck.y : 0),
      headClearance: playerHeight,
      sideGuides: true,
      startDistance: connector.empty ? 0 : 0.35,
    });
    demo.load.name = "Carga demonstrativa · sem vínculo com estoque";
    demo.load.visible = false;
    return demo;
  });
  // Collect exact per-instance bounds including elevated geometry.
  function collect(root, target) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const add = (m) =>
        target.push({
          ...bbToRecord(o.geometry.boundingBox.clone().applyMatrix4(m)),
          name: o.name || root.name,
        });
      if (o.isInstancedMesh) {
        const m = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          add(m.clone().premultiply(o.matrixWorld));
        }
      } else add(o.matrixWorld);
    });
  }
  for (const demo of demos) {
    for (const o of demo.group.children)
      if (o.isInstancedMesh) collect(o, staticSolids);
    for (let i = 0; i < demo.samples.length; i += 4) {
      const p = demo.samples[i];
      staticSolids.push({
        minX: p.x - 0.49,
        maxX: p.x + 0.49,
        minZ: p.z - 0.49,
        maxZ: p.z + 0.49,
        minY: p.y - 0.13,
        maxY: p.y + 0.18,
        name: "Esteira demonstrativa",
      });
    }
  }
  function refreshSolids() {
    modelSolids.length = 0;
    for (const { group } of machines.values()) collect(group, modelSolids);
  }
  function blocked(record, x, z, y) {
    if (
      (record.name === "Piso do segundo andar" && record.maxY <= y + 0.151) ||
      record.maxY <= y + 0.025 ||
      record.minY >= y + playerHeight
    )
      return false;
    const dx = x - Math.max(record.minX, Math.min(record.maxX, x)),
      dz = z - Math.max(record.minZ, Math.min(record.maxZ, z));
    return dx * dx + dz * dz < playerRadius * playerRadius;
  }
  function step(position, x, z) {
    const oldY = position.y ?? 0,
      stair = stairSurface(x, z);
    let y = oldY;
    if (stair && Math.abs(stair.height - oldY) <= 0.151) y = stair.height;
    else if (onDeck(x, z) && Math.abs(oldY - deck.y) <= 0.151) y = deck.y;
    else if (oldY < 0.151) y = 0;
    else return false;
    if (
      x < b.west + playerRadius ||
      x > b.east - playerRadius ||
      z < b.north + playerRadius ||
      z > b.south - playerRadius
    )
      return false;
    // Stair sides have physical guardrails, entry is only through their ends.
    for (const s of plan.stairs) {
      const { ux, uz, run } = s.direction,
        dx = x - s.bottom[0],
        dz = z - s.bottom[2],
        along = dx * ux + dz * uz,
        across = Math.abs(dx * uz - dz * ux);
      if (
        along > 0.05 &&
        along < run - 0.05 &&
        across > s.width / 2 - playerRadius &&
        across < s.width / 2 + 0.15 &&
        y < s.top[1] + 1
      )
        return false;
    }
    if (
      staticSolids.some((o) => blocked(o, x, z, y)) ||
      modelSolids.some((o) => blocked(o, x, z, y))
    )
      return false;
    position.x = x;
    position.z = z;
    position.y = y;
    return true;
  }
  const ray = new THREE.Raycaster();
  let revision = 0;
  const sun = new THREE.DirectionalLight("#fff3e1", 2.65);
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -24,
    right: 24,
    top: 24,
    bottom: -24,
    near: 1,
    far: 55,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00025;
  scene.add(
    sun,
    sun.target,
    new THREE.HemisphereLight("#e6f2ff", "#52616f", 1.25),
  );
  const roof = scene.getObjectByName("Cobertura completa");
  if (roof) {
    roof.castShadow = false;
    const strips = new THREE.InstancedMesh(
      new THREE.BoxGeometry(6, 0.06, 0.19),
      new THREE.MeshBasicMaterial({ color: "#e6f3ff" }),
      18,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < strips.count; i++) {
      const x = b.west + (((i % 6) + 0.5) / 6) * hallWidth;
      const z = b.north + ((Math.floor(i / 6) + 0.5) / 3) * hallDepth;
      strips.setMatrixAt(
        i,
        matrix.makeTranslation(x, roof.position.y - 0.16, z),
      );
    }
    scene.add(strips);
  }
  return {
    scene,
    plan,
    stations: worldStations,
    demoPoints: [],
    get revision() {
      return revision;
    },
    invalidate() {
      revision++;
    },
    mount(id, stage, root) {
      const target = machines.get(stage);
      if (!target) return;
      target.group.add(root);
      root.traverse((o) => {
        if (
          [
            "sector-floor",
            "Piso industrial cinza acetinado",
            "Junta do piso",
          ].includes(o.name)
        )
          o.visible = false;
      });
    },
    updateAccess() {},
    refreshSolids,
    shouldUpdate() {
      return true;
    },
    onReveal() {
      return () => {};
    },
    configureCookware() {
      return false;
    },
    turnCookwareLink() {},
    updateBeverageCorner() {},
    setVisibleBays() {},
    floorHeight(x, z, y = 0) {
      return y;
    },
    movePlayer(p, dx, dz) {
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.07));
      for (let i = 0; i < n; i++) {
        step(p, p.x + dx / n, p.z);
        step(p, p.x, p.z + dz / n);
      }
    },
    stationNear(p) {
      return worldStations.find(
        (s) =>
          s.hasControl &&
          Math.abs((p.y ?? 0) - s.y) < 0.2 &&
          Math.hypot(p.x - s.interaction.x, p.z - s.interaction.z) < 3.7,
      );
    },
    pickControl(camera, pointer, p) {
      ray.setFromCamera(pointer, camera);
      for (const { station, hmi } of monitors) {
        if (
          Math.abs((p.y ?? 0) - station.y) >= 0.2 ||
          camera.position.distanceTo(hmi.object.parent.position) >= 4.5
        )
          continue;
        const action = hmi.pick(ray, (target) => {
          const visible = [];
          scene.traverseVisible((object) => {
            if (object.isMesh) visible.push(object);
          });
          return ray.intersectObjects(visible, false)[0]?.object === target;
        });
        if (action) return { action };
      }
    },
    updateHmi(view) {
      for (const { hmi } of monitors) hmi.update(view);
    },
    resetDescentDemo() {
      for (const demo of demos) demo.reset();
    },
    updateShadows(position) {
      if (
        Math.hypot(
          position.x - sun.target.position.x,
          position.z - sun.target.position.z,
        ) < 12 &&
        sun.shadow.map
      )
        return;
      sun.target.position.set(position.x, 0, position.z);
      sun.position.set(position.x - 10, 18, position.z + 9);
      sun.shadow.needsUpdate = true;
    },
    updateDescentDemo(dt) {
      for (const demo of demos) demo.update(dt);
      return true;
    },
    diagnostics() {
      return { architecture: staticSolids, machines: modelSolids, demos, plan };
    },
  };
}
function bbToRecord(b) {
  return {
    minX: b.min.x,
    maxX: b.max.x,
    minY: b.min.y,
    maxY: b.max.y,
    minZ: b.min.z,
    maxZ: b.max.z,
  };
}
