import { buildIndustryStation } from "./industries/station-adapter.js";
import { buildLabModel, updateLabModel } from "./lab-model.js";
import {
  buildHandleAssembler,
  updateHandleAssembler,
} from "./handle-assembler.js";
import { buildRawLoader, updateRawLoader } from "./raw-loader.js";
import { getRawStock, RAW_PILE_X } from "./raw-stock.js";
import { buildLiftSupport, updateLiftSupport } from "./lift-support.js";
import { buildReceiving, updateReceiving } from "./receiving.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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

export function createLabScene(
  canvas,
  onSensorPick = () => {},
  onMotionBlocked = () => {},
  industry = null,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dce4ed");
  scene.fog = new THREE.Fog("#dce4ed", 42, 95);
  const room = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer),
    env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.75;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#dae6f4", "#65717b", 1.7));
  const sun = new THREE.DirectionalLight("#fff8ec", 3);
  sun.position.set(-7, 15, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -18,
    right: 18,
    top: 18,
    bottom: -18,
    near: 0.1,
    far: 45,
  });
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 130),
    controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI * 0.49;
  const mat = (color, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const m = {
    blue: mat("#164193", 0.4, 0.35),
    white: mat("#cbd5df", 0.25, 0.44),
    steel: mat("#aebdc9", 0.84, 0.25),
    dark: mat("#25323e", 0.45, 0.48),
    belt: mat("#313c47", 0.12, 0.8),
    yellow: mat("#dfb249", 0.2, 0.46),
    box: mat("#ba9466", 0, 0.9),
    tape: mat("#ddc59f"),
    wood: mat("#967348"),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#b3d6e1",
      transparent: true,
      opacity: 0.12,
      roughness: 0.15,
    }),
    green: mat("#41816f"),
  };
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    mat("#cbd6e1"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(60, 60, "#aabccb", "#bfcedb");
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  scene.add(grid);
  let product = getProduct("saucepan"),
    layout = getLayout(product.id),
    selected = null,
    pointerStart = null,
    overview = null;
  const cache = new Map(),
    raycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2();

  function select(id) {
    closeOverview();
    if (industry) {
      if (selected) selected.root.visible = false;
      selected = cache.get(id);
      if (!selected) {
        selected = buildLabModel({ id: "industry", product, layout, m, scene });
        cache.set(id, selected);
        selected.active.visible = false;
        selected.packed.visible = false;
        selected.blank.group.visible = false;
        selected.industry = buildIndustryStation({
          THREE,
          base: selected,
          materials: m,
          ...industry,
        });
      }
      selected.root.visible = true;
      selected.industry.selectStage(id);
      setView("front");
      return;
    }
    if (selected) selected.root.visible = false;
    selected =
      cache.get(id) ?? buildLabModel({ id, product, layout, m, scene });
    cache.set(id, selected);
    selected.root.visible = true;
    setView("front");
  }
  function setView(view) {
    const dock = ["receiving", "shipping"].includes(selected?.id),
      distance = dock ? 20 : 10,
      centre = dock ? (selected.id === "shipping" ? 5 : -5) : 0;
    const positions = {
      front: [centre, dock ? 10 : 6.5, distance],
      iso: [centre + (dock ? 15 : 9), dock ? 11 : 8, dock ? 23 : 14],
      top: [centre + 0.01, dock ? 32 : 21, 0.01],
    };
    camera.position.set(...(positions[view] ?? positions.front));
    controls.target.set(centre, 1.6, 0);
    controls.update();
  }
  function closeOverview() {
    if (!overview) return;
    for (const model of cache.values()) {
      const position = overview.positions.get(model.root);
      if (position) model.root.position.copy(position);
      model.root.visible = false;
    }
    overview = null;
    controls.maxDistance = 50;
    camera.far = 130;
    camera.updateProjectionMatrix();
    scene.fog.near = 42;
    scene.fog.far = 95;
  }
  function showOverview(environments, onPick) {
    const current = industry ? selected?.industry.stageId : selected?.id;
    closeOverview();
    for (const environment of environments) select(environment.id);
    if (current) select(current);
    const positions = new Map(),
      pitch = industry ? 18 : 44;
    environments.forEach((environment, index) => {
      const model = cache.get(environment.id);
      positions.set(model.root, model.root.position.clone());
      model.root.position.x += ((index % 3) - 1) * pitch;
      model.root.position.z += Math.floor(index / 3) * 15;
      model.root.visible = true;
      model.root.userData.overviewId = environment.id;
    });
    overview = { positions, environments, onPick };
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    for (const model of cache.values())
      model.root.traverse((object) => {
        if (!object.isMesh) return;
        for (let parent = object; parent; parent = parent.parent)
          if (!parent.visible) return;
        bounds.union(new THREE.Box3().setFromObject(object));
      });
    const centre = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const distance =
      (Math.max(size.x / camera.aspect, size.z + size.y * 0.5) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
      1.14;
    controls.maxDistance = 500;
    camera.far = 700;
    camera.updateProjectionMatrix();
    camera.position
      .copy(centre)
      .add(new THREE.Vector3(0, 1, 0.35).normalize().multiplyScalar(distance));
    controls.target.copy(centre);
    controls.update();
    scene.fog.near = 200;
    scene.fog.far = 600;
  }
  function updateOverview(state, dt) {
    if (!overview) return;
    for (const environment of overview.environments) {
      const model = cache.get(environment.id);
      if (industry) {
        model.industry.update(state, dt);
        if (state.step.id !== environment.id)
          for (const item of [
            model.industry.model.bottle,
            model.industry.model.piece,
            model.industry.model.parcel,
          ])
            if (item) item.visible = false;
      } else {
        const cell = state.cells.find((cell) => cell.id === environment.id);
        updateLabModel(
          model,
          cell,
          product,
          dt,
          state.running,
          state.emergency,
          state.scope,
          onMotionBlocked,
        );
      }
    }
  }
  function overviewLabels() {
    if (!overview) return [];
    return overview.environments.map((environment) => {
      const model = cache.get(environment.id),
        point = new THREE.Vector3(0, 4.8, 0);
      model.root.localToWorld(point);
      point.project(camera);
      return {
        id: environment.id,
        x: (point.x + 1) * 50,
        y: (1 - point.y) * 50,
        visible: point.z < 1,
      };
    });
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();
  canvas.addEventListener("pointerdown", (e) => {
    pointerStart = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (
      !selected ||
      !pointerStart ||
      Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5
    )
      return;
    const r = canvas.getBoundingClientRect();
    mouse.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);
    if (overview) {
      const hits = raycaster.intersectObjects(
        [...cache.values()].map((model) => model.root),
        true,
      );
      const hit = hits.find((item) => {
        for (let o = item.object; o; o = o.parent) if (!o.visible) return false;
        return true;
      });
      if (hit) {
        let node = hit.object;
        while (node && !node.userData.overviewId) node = node.parent;
        if (node) overview.onPick(node.userData.overviewId);
      }
      return;
    }
    const hit = raycaster.intersectObjects(
      Object.values(selected.sensors),
      false,
    )[0];
    if (hit) onSensorPick(hit.object.userData.signal);
  });
  function update(cell, dt, running, emergency, scope = "bench") {
    if (overview) return;
    if (industry) {
      selected?.industry.update(cell, dt);
      return;
    }
    updateLabModel(
      selected,
      cell,
      product,
      dt,
      running,
      emergency,
      scope,
      onMotionBlocked,
    );
  }

  return {
    select,
    setView,
    showOverview,
    updateOverview,
    overviewLabels,
    get isOverview() {
      return !!overview;
    },
    update,
    setProduct(id) {
      closeOverview();
      if (industry) {
        industry.product =
          industry.definition.products.find((p) => p.id === id) ??
          industry.product;
      }
      for (const model of cache.values()) {
        model.industry?.dispose();
        model.assembler?.dispose?.();
        model.workstation?.dispose?.();
        model.receiving?.dispose?.();
        for (const material of model.truck?.materials ?? []) material.dispose();
        scene.remove(model.root);
        model.root.traverse((o) => o.geometry?.dispose());
      }
      cache.clear();
      const current = industry ? selected?.industry.stageId : selected?.id;
      selected = null;
      if (!industry) {
        product = getProduct(id);
        layout = getLayout(id);
      }
      if (current) select(current);
    },
    hotspots() {
      return [
        [-4, 1.5, 1.5],
        [0, ["finishing", "quality"].includes(selected?.id) ? 3.2 : 4.6, 0],
        [4, 1.5, 1.5],
      ].map((p) => {
        const v = new THREE.Vector3(...p).project(camera);
        return { x: (v.x + 1) * 50, y: (1 - v.y) * 50, visible: v.z < 1 };
      });
    },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    zoom(f) {
      camera.position
        .sub(controls.target)
        .multiplyScalar(f)
        .add(controls.target);
      controls.update();
    },
    dispose() {
      observer.disconnect();
      for (const m of cache.values()) {
        m.industry?.dispose();
        m.assembler?.dispose?.();
        m.workstation?.dispose?.();
        m.receiving?.dispose?.();
      }
      if (industry) {
        const geometries = new Set(),
          materials = new Set();
        scene.traverse((object) => {
          if (object.geometry) geometries.add(object.geometry);
          if (object.material)
            for (const material of [object.material].flat())
              materials.add(material);
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
      }
      controls.dispose();
      renderer.dispose();
      env.texture.dispose();
    },
    get camera() {
      return camera;
    },
  };
}
