import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCircuitZWorld } from "./circuit-z-world.js";
import { createLabScene } from "./lab-scene.js";
import { createBeverageURuntime } from "./circuit-beverage-u-runtime.js";
import { BEVERAGES } from "./industries/definitions.js";
import { buildBeveragesModel } from "./industries/factory-models.js";

import { createPreviewMenu } from "./circuit-z-menu.js";
import { createPreviewLook } from "./circuit-z-look.js";
import { stylePreviewDisplays } from "./circuit-z-displays.js";
import "./circuit-z-menu.css";
import "./circuit.css";
import "./circuit-z.css";

export async function launchCircuitZPreview(industry) {
  const root = document.querySelector("#app"),
    home = new URL(import.meta.env.BASE_URL, location.href);
  root.innerHTML = `<main class="circuit circuit-z"><canvas class="circuit-view" tabindex="0" aria-label="Prévia em U. WASD ou setas para andar, mouse para olhar, E para operar o monitor."></canvas><a class="circuit-home" href="${home.href}" aria-label="Escolher ambiente">‹</a><button class="z-plan" aria-label="Abrir menu">Menu <kbd>Esc</kbd></button><button class="circuit-operate" hidden><kbd>E</kbd><span>Operar monitor</span></button></main>`;
  const canvas = root.querySelector("canvas"),
    operate = root.querySelector(".circuit-operate");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  const world = buildCircuitZWorld(industry),
    { scene, plan } = world;
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.72;
  room.dispose();
  pmrem.dispose();
  const runtime = createBeverageURuntime(world);
  let state = runtime.snapshot;
  let refresh = false;
  const lab = createLabScene(
    document.createElement("canvas"),
    undefined,
    undefined,
    {
          definition: BEVERAGES,
          product: BEVERAGES.products[0],
          build: buildBeveragesModel,
    },
    { onDemand: true, circuit: { world, renderer, cookwareTransfer: false, beverageTransfer: runtime.beverageTransfer } },
  );
  lab.updateOverview(state, 0);
  stylePreviewDisplays(scene, THREE);
  world.refreshSolids();
  const camera = new THREE.PerspectiveCamera(64, 1, 0.075, 250);
  camera.rotation.order = "YXZ";
  const start = world.stations[0],
    position = { ...(plan.spawn ?? { ...start.interaction, y: start.y }) };
  let yaw = start.yaw,
    pitch = -0.08;
  const clockFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let lastClockMinute = -1;
  let wallClock, lastPanelState;
  let showBalloons = false;
  const balloons = world.stations.map((station) => {
    const label = document.createElement("span");
    label.className = "z-station-balloon";
    label.textContent = station.name;
    label.hidden = true;
    canvas.parentElement.append(label);
    return {
      label,
      anchor: new THREE.Vector3(station.x, station.y + 4.3, station.z),
    };
  });
  const projection = new THREE.Vector3();
  const keys = new Set(),
    directions = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
    ]);
  root.querySelector(".z-plan").onclick = () => menu.open();
  operate.onclick = () => menu.open("Operação");
  function keydown(e) {
    if (menu.isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      menu.open();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (directions.has(e.code)) {
      e.preventDefault();
      keys.add(e.code);
    }
    if (e.code === "KeyQ" && !e.repeat) showBalloons = !showBalloons;
    if (e.code === "KeyE" && !e.repeat) {
      const s = world.stationNear(position);
      if (s) menu.open("Operação");
    }
  }
  function keyup(e) {
    keys.delete(e.code);
  }
  function blur() {
    keys.clear();
  }
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  const menu = createPreviewMenu(canvas.closest(".circuit"), {
    industry,
    stations: world.stations,
    plan,
    runtime,
    onCommand() { refresh = true; },
    pause() {
      keys.clear();
      look.release();
    },
    resume(capture) {
      canvas.focus({ preventScroll: true });
      if (capture) look.capture();
    },
  });
  const look = createPreviewLook(canvas, {
    available: () => !menu.isOpen,
    rotate(dx, dy) {
      yaw -= dx * 0.004;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -1.15, 1.15);
    },
    select(pointer = { x: 0, y: 0 }) {
      camera.updateMatrixWorld();
      const hit = world.pickControl(camera, pointer, position);
      if (hit?.action) menu.command(hit.action);
    },
  });
  let previous = performance.now(),
    raf,
    width,
    height;
  function frame(now) {
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (!menu.isOpen) {
      const f =
          Number(keys.has("KeyW") || keys.has("ArrowUp")) -
          Number(keys.has("KeyS") || keys.has("ArrowDown")),
        s =
          Number(keys.has("KeyD") || keys.has("ArrowRight")) -
          Number(keys.has("KeyA") || keys.has("ArrowLeft")),
        scale =
          ((keys.has("ShiftLeft") || keys.has("ShiftRight") ? 13 : 8) * dt) /
          Math.max(1, Math.hypot(f, s));
      if (f || s)
        world.movePlayer(
          position,
          (Math.cos(yaw) * s - Math.sin(yaw) * f) * scale,
          (-Math.sin(yaw) * s - Math.cos(yaw) * f) * scale,
        );
    }
    operate.hidden = !world.stationNear(position);
    if (width !== canvas.clientWidth || height !== canvas.clientHeight) {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }
    camera.position.set(
      position.x,
      position.y + plan.player.eyeHeight,
      position.z,
    );
    camera.rotation.set(pitch, yaw, 0);
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== lastClockMinute) {
      lastClockMinute = minute;
      wallClock = "Brasília " + clockFormat.format(minute * 60000);
    }
    if (state.running || refresh) {
      runtime.tick(dt);
      state = runtime.snapshot;
      lab.updateOverview(state, dt);
      refresh = false;
    }
    world.updateConveyors(dt, state.running);
    const view = menu.view(wallClock, state);
    const panelState = JSON.stringify(view);
    if (panelState !== lastPanelState) {
      world.updateHmi(view);
      lastPanelState = panelState;
    }
    if (showBalloons) camera.updateMatrixWorld();
    for (const { label, anchor } of balloons) {
      if (showBalloons) projection.copy(anchor).project(camera);
      label.hidden =
        !showBalloons ||
        menu.isOpen ||
        Math.abs(projection.x) > 0.98 ||
        Math.abs(projection.y) > 0.98 ||
        projection.z < -1 ||
        projection.z > 1;
      if (!label.hidden) {
        label.style.left = (projection.x + 1) * 50 + "%";
        label.style.top = (1 - projection.y) * 50 + "%";
      }
    }
    world.updateShadows(position);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  canvas.focus();
  raf = requestAnimationFrame(frame);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      previous = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  window.addEventListener(
    "pagehide",
    (event) => {
      cancelAnimationFrame(raf);
      keys.clear();
      if (event.persisted) return;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      lab.dispose();
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        for (const m of [o.material].flat()) if (m) materials.add(m);
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) {
        m.map?.dispose();
        m.dispose();
      }
      env.dispose();
      renderer.dispose();
    },
    { once: false },
  );
}
