import { buildWarehouseRoom } from "./warehouse-room.js";
import { COOKWARE_PACKING_LAYOUT } from "./cookware-packing.js";
import { buildDemandWarehouse } from "./demand-warehouse.js";
import { createCookwareReflection } from "./cookware-finish.js";
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
  options = {},
) {
  const circuit = options.circuit;
  const renderer =
    circuit?.renderer ?? new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dce4ed");
  scene.fog = new THREE.Fog("#dce4ed", 42, 95);
  let env;
  let cookwareReflection = circuit?.cookwareReflection;
  if (!circuit) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromScene(room, 0.04);
    if (!industry) cookwareReflection = createCookwareReflection(THREE, pmrem);
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
  }
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 130),
    controls = new OrbitControls(camera, canvas);
  controls.enabled = !circuit;
  let renderDirty = true;
  controls.addEventListener("change", () => {
    renderDirty = true;
  });
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI * 0.49;
  const mat = (color, metalness = 0, roughness = 0.6) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const m = {
    cookwareReflection: cookwareReflection?.texture,
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
  if (!circuit) scene.add(ground);
  const grid = new THREE.GridHelper(60, 60, "#aabccb", "#bfcedb");
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  if (!circuit) scene.add(grid);
  let product = getProduct("saucepan"),
    layout = getLayout(product.id),
    selected = null,
    pointerStart = null,
    overview = null;
  const cache = new Map(),
    raycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2();

  function ensurePracticeWarehouseRoom(model, id) {
    if (model.room) return;
    const anchor =
      industry && id === "seal"
        ? model.industry?.model.output?.warehouse?.group
        : !industry && id === "finished"
          ? model.warehouse?.group
          : null;
    if (!anchor) return;
    model.room = buildWarehouseRoom(
      { THREE, root: anchor },
      {
        wallZ: industry ? 13 : 9.6,
        floorBounds: {
          minX: -22,
          maxX: 30.5,
          minZ: industry ? -14 : -10.5,
          maxZ: industry ? 14 : 10.5,
        },
      },
    );
    model.room.setCutaway(true);
    const floor = model.root.getObjectByName("sector-floor");
    if (floor) floor.visible = false;
  }
  let selectedScope = "line";
  function select(id, scope = selectedScope) {
    selectedScope = scope;
    closeOverview();
    const warehouseStage = industry ? "seal" : "finished";
    const orderStage =
      options.onDemand &&
      scope !== "bench" &&
      (industry ? ["seal", "ship"] : ["finished", "shipping"]).includes(id);
    if (orderStage) {
      if (selected) selected.root.visible = false;
      selected = cache.get(warehouseStage);
      if (!selected) {
        const root = new THREE.Group();
        scene.add(root);
        selected = {
          id: warehouseStage,
          root,
          sensors: {},
          orderWarehouse: buildDemandWarehouse({
            THREE,
            root,
            materials: m,
            environment: industry ? "beverages" : "cookware",
            circuit: !!circuit,
          }),
        };
        cache.set(warehouseStage, selected);
      }
      selected.orderStage = id;
      selected.root.visible = true;
      setView("front");
      return;
    }
    controls.maxDistance = 50;
    scene.fog.near = 42;
    scene.fog.far = 95;

    const cacheId =
      options.onDemand &&
      scope === "bench" &&
      (industry ? ["seal", "ship"] : ["finished", "shipping"]).includes(id)
        ? `bench:${id}`
        : id;
    if (industry) {
      if (selected) selected.root.visible = false;
      selected = cache.get(cacheId);
      if (!selected) {
        selected = buildLabModel({ id: "industry", product, layout, m, scene });
        cache.set(cacheId, selected);
        selected.active.visible = false;
        selected.packed.visible = false;
        selected.blank.group.visible = false;
        selected.industry = buildIndustryStation({
          THREE,
          base: selected,
          materials: m,
          ...industry,
          circuit: !!circuit,
        });
      }
      selected.root.visible = true;
      selected.industry.selectStage(id);
      ensurePracticeWarehouseRoom(selected, id);
      setView("front");
      return;
    }
    if (selected) selected.root.visible = false;
    selected =
      cache.get(cacheId) ?? buildLabModel({ id, product, layout, m, scene });
    cache.set(cacheId, selected);
    selected.root.visible = true;
    ensurePracticeWarehouseRoom(selected, id);
    setView("front");
  }
  function setView(view) {
    if (circuit) return;
    const room = selected?.orderWarehouse?.room ?? selected?.room;
    if (room) {
      room.group.visible = true;
      room.setCutaway(selected.orderWarehouse ? view !== "front" : true);
    }
    if (selected?.orderWarehouse) {
      const shippingView = ["ship", "shipping"].includes(selected.orderStage);
      const views = {
        front: shippingView ? [22, 12, 24] : [-13.5, 4.4, 0],
        iso: [30, 23, 29],
        top: [7, 54, 0.01],
      };
      camera.position.set(...(views[view] ?? views.front));
      controls.target.set(
        view === "front" ? (shippingView ? 22 : 0) : 7,
        2.5,
        0,
      );
      controls.maxDistance = 90;
      scene.fog.near = 80;
      scene.fog.far = 160;
      controls.update();
      return;
    }
    const industryStage = selected?.industry?.stageId,
      industrySteps = industry?.definition?.steps ?? [],
      industryReceiving = !!industry && industryStage === industrySteps[0]?.id,
      industryShipping =
        !!industry && industryStage === industrySteps.at(-1)?.id,
      dock =
        ["receiving", "shipping"].includes(selected?.id) ||
        (selected?.id === "industry" &&
          (industryReceiving || industryShipping)),
      caseArea =
        industry?.definition?.id === "beverages" &&
        ["pack", "seal", "ship"].includes(industryStage),
      caseBench = caseArea && !industryShipping,
      cookwareWarehouse = !industry && selected?.id === "finished",
      cookwarePacking = !industry && selected?.id === "packing",
      warehouseSeal =
        industry?.definition?.id === "beverages" && industryStage === "seal",
      centreZ = warehouseSeal
        ? -1.5
        : caseArea
          ? industryStage === "pack"
            ? -5.15
            : -4.5
          : cookwareWarehouse
            ? -1.8
            : 0,
      dockScale =
        dock || caseBench
          ? Math.max(1, 1.3 / Math.max(0.45, camera.aspect))
          : 1,
      distance = warehouseSeal
        ? 24 * dockScale
        : dock || caseBench
          ? (industryStage === "pack" ? 30 : 20) * dockScale
          : cookwareWarehouse
            ? 14
            : cookwarePacking
              ? 24
              : 10,
      centre = dock
        ? selected.id === "shipping" || industryShipping
          ? 5
          : -5
        : caseBench && industryStage === "pack"
          ? 7.5
          : cookwarePacking
            ? 4.5
            : 0;
    const positions = {
      front: [
        centre,
        warehouseSeal
          ? 1.6 + 14.4 * dockScale
          : caseArea
            ? 1.6 + 12 * dockScale
            : dock
              ? 1.6 + 8.4 * dockScale
              : cookwareWarehouse
                ? 10
                : cookwarePacking
                  ? 11
                  : 6.5,
        centreZ + distance,
      ],
      iso: [
        centre + (dock || caseBench ? 15 * dockScale : 9),
        caseArea
          ? 1.6 + 14 * dockScale
          : dock
            ? 1.6 + 9.4 * dockScale
            : cookwarePacking
              ? 13
              : 8,
        centreZ +
          (dock || caseBench ? 23 * dockScale : cookwarePacking ? 23 : 14),
      ],
      top: [
        centre + 0.01,
        dock || caseBench ? 32 * dockScale : cookwarePacking ? 32 : 21,
        centreZ + 0.01,
      ],
    };
    camera.position.set(...(positions[view] ?? positions.front));
    controls.target.set(
      centre,
      warehouseSeal ? 2.4 : cookwareWarehouse ? 2.2 : 1.6,
      centreZ,
    );
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
    if (circuit) return;
    if (options.onDemand)
      environments = environments.filter(
        (e) => e.id !== (industry ? "ship" : "shipping"),
      );
    const current =
      selected?.orderStage ??
      (industry ? selected?.industry?.stageId : selected?.id);
    closeOverview();
    const currentScope = selectedScope;
    for (const environment of environments) select(environment.id, "line");
    if (current) select(current, currentScope);
    for (const model of cache.values()) {
      model.root.visible = false;
      const room = model.orderWarehouse?.room ?? model.room;
      if (room) room.group.visible = false;
    }
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
  const batchedModels = new WeakSet();
  function batchFixedBoxes(model) {
    if (batchedModels.has(model)) return;
    batchedModels.add(model);
    const moving = new Set([
      ...Object.values(model).filter((value) => value?.isObject3D),
      ...(model.inputs ?? []), ...(model.outputs ?? []), ...(model.cargo ?? []),
      ...(model.clamps ?? []).map((entry) => entry.object),
    ]);
    const batches = new Map();
    for (const mesh of model.root.children) {
      if (!mesh.isMesh || mesh.children.length || !mesh.visible || moving.has(mesh) ||
          mesh.name === "sector-floor" || mesh.geometry.type !== "BoxGeometry" ||
          mesh.material.transparent || mesh.material.map) continue;
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(mesh);
    }
    for (const [material, boxes] of batches) {
      if (boxes.length < 3) continue;
      const combined = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, boxes.length);
      combined.castShadow = boxes[0].castShadow;
      combined.receiveShadow = boxes[0].receiveShadow;
      boxes.forEach((box, index) => {
        const { width, height, depth } = box.geometry.parameters;
        box.updateMatrix();
        combined.setMatrixAt(index, box.matrix.clone().scale(new THREE.Vector3(width, height, depth)));
        box.geometry.dispose();
        box.removeFromParent();
      });
      model.root.add(combined);
    }
  }
  let mountedModels = null;
  let mountedScope;
  let lastSolidRefresh = -Infinity;
  let lastCircuitUpdate = -Infinity;
  let latestCircuitState;
  const detachReveal = circuit?.world.onReveal(() => {
    if (latestCircuitState) updateCircuit(latestCircuitState, 0, true);
  });
  function updateCircuit(state, dt, revealed = false) {
    latestCircuitState = state;
    const now = performance.now();
    const id = "beverages";
    const rebuild = !mountedModels || mountedScope !== state.scope;
    if (!rebuild && !revealed && state.running && now - lastCircuitUpdate < 29) return;
    lastCircuitUpdate = now;
    circuit.world.invalidate();
    if (rebuild) {
      const current = selected;
      const currentOrderStage = current?.orderStage;
      for (const model of cache.values()) model.root.visible = false;
      mountedModels = new Map();
      const stages = industry.definition.steps;
      for (const stage of stages) {
        select(stage.id, state.scope);
        if (!mountedModels.has(selected)) {
          batchFixedBoxes(selected);
          mountedModels.set(selected, stage.id);
          circuit.world.mount(id, stage.id, selected.root);
          selected.orderWarehouse?.room?.setCutaway(true);
        }
      }
      selected = current;
      if (selected?.orderWarehouse) selected.orderStage = currentOrderStage;
      mountedScope = state.scope;
      circuit.world.updateAccess(id, state.scope);
    }
    if (industry) circuit.world.updateBeverageCorner(state);
    for (const [model, stage] of mountedModels) {
      model.root.visible = true;
      if (!rebuild && !circuit.world.shouldUpdate(id, stage)) continue;
      if (model.orderWarehouse) {
        let warehouseState =
          industry && state.stations?.seal
            ? { ...state, ...state.stations.seal }
            : state;
        model.orderWarehouse.update(warehouseState);
      } else if (industry) {
        const inactive = state.scope === "bench" && state.step.id !== stage;
        model.industry.update(
          inactive
            ? { ...state, hasMaterial: false, running: false, outputs: {} }
            : state,
          dt,
          circuit.beverageTransfer,
        );
      }
    }
    if (rebuild || revealed || now - lastSolidRefresh >= 230) {
      circuit.world.refreshSolids(id, rebuild);
      lastSolidRefresh = now;
    }
  }
  function updateOverview(state, dt) {
    if (circuit) return updateCircuit(state, dt);
    if (!overview) return;
    for (const environment of overview.environments) {
      const model = cache.get(environment.id);
      if (model.orderWarehouse) {
        model.orderWarehouse.update(
          industry && state.stations?.seal
            ? { ...state, ...state.stations.seal }
            : state,
        );
        continue;
      }
      if (industry) {
        model.industry.update(state, dt);
        if (!state.stations && state.step.id !== environment.id)
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
    renderDirty = true;
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  const observer = circuit ? null : new ResizeObserver(resize);
  observer?.observe(canvas.parentElement);
  if (!circuit) resize();
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
    if (circuit || overview) return;
    if (selected?.orderWarehouse) {
      selected.orderWarehouse.update(
        industry && cell.stations?.seal
          ? { ...cell, ...cell.stations.seal }
          : cell,
      );
      return;
    }
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
    get isOrderWarehouse() {
      return !!selected?.orderWarehouse;
    },
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
        model.room?.dispose();
        model.orderWarehouse?.dispose();
        model.industry?.dispose();
        model.assembler?.dispose?.();
        model.workstation?.dispose?.();
        model.warehouse?.dispose?.();
        model.receiving?.dispose?.();
        for (const material of model.truck?.materials ?? []) material.dispose();
        model.root.removeFromParent();
        model.root.traverse((o) => o.geometry?.dispose());
      }
      cache.clear();
      mountedModels = null;
      const current =
        selected?.orderStage ??
        (industry ? selected?.industry?.stageId : selected?.id);
      selected = null;
      if (!industry) {
        product = getProduct(id);
        layout = getLayout(id);
      }
      if (current) select(current);
    },
    hotspots() {
      if (circuit) return [];
      return (
        selected?.orderWarehouse
          ? [
              [-5, 1.5, 1.5],
              [0, 5.8, -4.4],
              [20, 3, 1.4],
            ]
          : !industry && selected?.id === "packing"
            ? [
                [-4, 1.5, 1.5],
                [COOKWARE_PACKING_LAYOUT.boxX, 4.6, 0],
                [COOKWARE_PACKING_LAYOUT.exitX, 1.5, 1.5],
              ]
            : [
                [-4, 1.5, 1.5],
                [
                  0,
                  ["finishing", "quality"].includes(selected?.id) ? 3.2 : 4.6,
                  0,
                ],
                [4, 1.5, 1.5],
              ]
      ).map((p) => {
        const v = new THREE.Vector3(...p).project(camera);
        return { x: (v.x + 1) * 50, y: (1 - v.y) * 50, visible: v.z < 1 };
      });
    },
    render(force = true) {
      if (circuit) return;
      controls.update();
      if (force || renderDirty) {
        renderer.render(scene, camera);
        renderDirty = false;
      }
    },
    zoom(f) {
      if (circuit) return;
      camera.position
        .sub(controls.target)
        .multiplyScalar(f)
        .add(controls.target);
      controls.update();
    },
    dispose() {
      detachReveal?.();
      observer?.disconnect();
      for (const m of cache.values()) {
        m.room?.dispose();
        m.orderWarehouse?.dispose();
        m.industry?.dispose();
        m.assembler?.dispose?.();
        m.workstation?.dispose?.();
        m.warehouse?.dispose?.();
        m.receiving?.dispose?.();
      }
      if (circuit) {
        const materials = new Set();
        for (const model of cache.values()) {
          model.root.traverse((object) => {
            for (const material of [object.material].flat()) if (material) materials.add(material);
          });
          model.root.traverse((object) => object.geometry?.dispose());
          model.root.removeFromParent();
        }
        for (const material of materials) { material.map?.dispose(); material.dispose(); }
      } else if (industry) {
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
      if (!circuit) {
        renderer.dispose();
        cookwareReflection?.dispose();
        env.texture.dispose();
      }
    },
    get camera() {
      return camera;
    },
  };
}
