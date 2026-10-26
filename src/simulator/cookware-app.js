import { installLearningFeatures } from "./learning.js";
import { receivingState } from "./receiving.js";
import { PRODUCTS, getProduct, productIcon } from "./products.js";
import "./style.css";
import { ENVIRONMENTS, createSimulation, MATERIALS } from "./simulation.js";
import { createLabScene } from "./lab-scene.js";

import { labIcon as icon, renderLabShell } from "./lab-shell.js";
const staticDemo = true;
const root = document.querySelector("#app");
root.innerHTML = renderLabShell({
  ENVIRONMENTS,
  PRODUCTS,
  productIcon,
  staticDemo,
});

const $ = (selector) => document.querySelector(selector);
const panelToggle = document.createElement("button");
panelToggle.id = "toggle-panel";
panelToggle.setAttribute("aria-label", "Expandir painel de operação");
panelToggle.setAttribute("aria-expanded", "false");
panelToggle.innerHTML = icon("plus");
$(".inspector-tabs").append(panelToggle);
panelToggle.onclick = () => {
  const open = $(".workspace").classList.toggle("panel-open");
  panelToggle.setAttribute("aria-expanded", String(open));
  panelToggle.setAttribute(
    "aria-label",
    open ? "Recolher painel" : "Expandir painel de operação",
  );
  panelToggle.innerHTML = icon(open ? "minus" : "plus");
};
let selected = "receiving";
const simulation = createSimulation(12, {
  scope: "bench",
  environment: selected,
  mode: "auto",
});
let learning = null;
let view = null,
  lastTime = performance.now(),
  lastUi = 0,
  lastEvent = 0,
  activeTab = "operation";
const timeLabel = (time) =>
  `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
function text(selector, value) {
  const element = $(selector);
  if (element && element.textContent !== String(value))
    element.textContent = String(value);
}
function tab(name) {
  activeTab = name;
  $(".workspace").classList.add("panel-open");
  panelToggle.setAttribute("aria-expanded", "true");
  panelToggle.setAttribute("aria-label", "Recolher painel");
  panelToggle.innerHTML = icon("minus");
  for (const button of document.querySelectorAll("[data-tab]"))
    button.setAttribute("aria-selected", String(button.dataset.tab === name));
  for (const panel of document.querySelectorAll(".inspector-panel"))
    panel.hidden = panel.id !== `panel-${name}`;
}
function selectEnvironment(id) {
  if (!ENVIRONMENTS.some((e) => e.id === id)) return;
  const changed = selected !== id;
  selected = id;
  const state = simulation.snapshot;
  if (changed && state.scope === "bench") simulation.setScope("bench", id);
  const environment = ENVIRONMENTS.find((e) => e.id === id),
    index = ENVIRONMENTS.indexOf(environment);
  $("#environment-select").value = id;

  text("#input-material", MATERIALS[environment.input]);
  text("#output-material", MATERIALS[environment.output]);
  text("#environment-number", `${String(index + 1).padStart(2, "0")} / 08`);
  text("#environment-title", environment.name);
  text("#machine-title", environment.machine);
  text("#exercise", environment.exercise);
  for (const button of document.querySelectorAll("[data-environment]")) {
    button.classList.toggle("selected", button.dataset.environment === id);
    button.setAttribute(
      "aria-current",
      button.dataset.environment === id ? "true" : "false",
    );
  }
  for (const [i, key] of [
    "entry",
    "positioned",
    "exit",
    "guard",
    "stroke",
  ].entries())
    for (const element of document.querySelectorAll(
      `[data-input-address="${key}"]`,
    ))
      element.textContent = `I${index}.${i}`;
  for (const [i, key] of ["motor", "work", "transfer"].entries())
    for (const element of document.querySelectorAll(
      `[data-output-address="${key}"]`,
    ))
      element.textContent = `Q${index}.${i}`;
  view?.select(id);
  for (const button of document.querySelectorAll("[data-camera]"))
    button.classList.toggle("active", button.dataset.camera === "front");
  lastEvent = -1;
  updateUi();
}
function updateUi() {
  learning?.render();
  const state = simulation.snapshot,
    cell = state.cells.find((c) => c.id === selected);
  const environment = ENVIRONMENTS.find((e) => e.id === selected);
  const product = getProduct(state.product);
  text("#product-context", `${product.name} · ${product.size}`);
  text("#product-description", product.description);
  for (const b of document.querySelectorAll("[data-product]"))
    b.setAttribute("aria-pressed", String(b.dataset.product === product.id));
  const receiving = receivingState(cell, getProduct(state.product));
  $("#receiving-feedback").hidden = selected !== "receiving" || !cell.part;
  text("#receiving-title", receiving.title);
  text("#receiving-detail", receiving.detail);
  $("#receiving-progress").value = cell.stage?.progress ?? 0;
  const interactive = cell.mode === "guided";
  $(".interaction-card").hidden = !interactive;
  text(
    "#execute-action",
    cell.awaitingAction
      ? (cell.actionLabel ?? "Aguardar material")
      : "Executando…",
  );
  $("#execute-action").disabled =
    !state.ready || !cell.awaitingAction || !cell.actionAvailable;
  $("#scene-action").hidden = !interactive;
  $("#scene-action").disabled = $("#execute-action").disabled;
  text(
    "#scene-action",
    cell.awaitingAction
      ? (cell.actionLabel ?? "Aguardar material")
      : "Executando…",
  );
  text(
    "#action-state",
    !state.ready
      ? "Verifique a segurança"
      : cell.awaitingAction
        ? "Sua vez"
        : "Ação em andamento",
  );
  text(
    "#action-help",
    cell.awaitingAction
      ? "Autorize uma ação. O equipamento para ao terminar e espera seu próximo comando."
      : "Observe o movimento e o progresso. A próxima etapa depende de você.",
  );
  $("#action-progress").value = cell.stage?.progress ?? 0;
  text(
    "#cycle-action",
    cell.stage
      ? `${state.running ? "" : "Pausado · "}${cell.stage.label}`
      : state.done >= state.batch
        ? "Lote concluído"
        : "Como funciona",
  );
  text(
    "#cycle-explanation",
    cell.stage?.explanation ?? environment.description,
  );
  text(
    "#unit-status",
    cell.unit
      ? `${cell.unit.id} · ${MATERIALS[cell.unit.material]}`
      : `Lote de ${state.batch} panelas`,
  );
  for (const item of document.querySelectorAll("[data-step]")) {
    const i = Number(item.dataset.step);
    item.classList.toggle("active", i === cell.stageIndex);
    item.classList.toggle(
      "done",
      cell.stageIndex > i || state.done >= state.batch,
    );
  }
  const status = state.emergency
    ? "Emergência acionada"
    : !state.ready
      ? "Intertravamento ativo"
      : state.done >= state.batch
        ? "Lote concluído"
        : cell.mode === "guided" && cell.awaitingAction
          ? "Aguardando sua ação"
          : state.running
            ? "Em operação"
            : "Pronto / pausado";
  text("#global-status", status);
  text("#scene-state", state.running ? cell.status : status);
  text("#simulation-clock", timeLabel(state.time));
  text("#queue-count", cell.queue);
  text("#wip-count", cell.part ? 1 : 0);
  text("#done-count", cell.done);
  text("#batch-progress", `${state.done} / ${state.batch}`);
  $("#batch-bar").style.width = `${(state.done / state.batch) * 100}%`;
  $("#start").disabled =
    state.running || !state.ready || state.done >= state.batch;
  $("#pause").disabled = !state.running;
  $("#step").disabled =
    state.running || !state.ready || state.done >= state.batch;
  $("#run-indicator").className =
    state.emergency || !state.ready ? "fault" : state.running ? "running" : "";
  $("#global-status-dot").className = $("#run-indicator").className;
  text(
    "#scope-status",
    state.scope === "bench" ? "Bancada individual" : "Linha integrada",
  );
  $("#guard").checked = cell.guard;
  $("#fault").checked = cell.fault;
  $("#acknowledge").hidden = !state.emergency;
  $("#acknowledge").disabled = state.cells.some((c) => !c.guard || c.fault);
  text(
    "#safety-message",
    state.emergency
      ? "Elimine as falhas e rearme antes de iniciar."
      : !state.ready
        ? "Verifique proteções e obstruções nos ambientes."
        : "Interrompe todos os atuadores da linha.",
  );
  text(
    "#mode-description",
    cell.mode === "guided"
      ? "Você autoriza cada etapa. Nenhuma etapa seguinte começa sozinha."
      : cell.mode === "auto"
        ? "O ciclo coordena transporte, processo e transferência automaticamente."
        : "Acione os atuadores e observe os sensores para conduzir cada etapa.",
  );
  text(
    "#manual-badge",
    cell.mode === "guided"
      ? "Controle por etapas"
      : cell.mode === "auto"
        ? "Controle automático"
        : "Controle manual",
  );
  text(
    "#manual-help",
    cell.mode === "guided"
      ? "Use o botão de ação para conduzir cada operação."
      : cell.mode === "auto"
        ? "Selecione Manual para comandar os atuadores."
        : !state.running
          ? "Inicie a simulação para energizar os atuadores."
          : "Posicione a unidade antes de acionar o processo. Libere a transferência no sensor de saída.",
  );
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === cell.mode),
    );
  }
  for (const button of document.querySelectorAll("[data-command]")) {
    const key = button.dataset.command;
    button.disabled = cell.mode !== "manual" || !state.ready;
    button.setAttribute(
      "aria-pressed",
      String(cell.mode === "manual" ? cell.commands[key] : cell.outputs[key]),
    );
    button.classList.toggle("energized", cell.outputs[key]);
  }
  for (const [key, value] of Object.entries(cell.inputs)) {
    text(`#input-${key}`, value ? "1" : "0");
    $(`#input-${key}`).classList.toggle("on", value);
  }
  for (const [key, value] of Object.entries(cell.outputs)) {
    text(`#output-${key}`, value ? "1" : "0");
    $(`#output-${key}`).classList.toggle("on", value);
  }
  for (const c of state.cells) {
    text(`#process-${c.id}`, c.done);
    const dot = $(`#dot-${c.id}`);
    if (dot)
      dot.className = `environment-dot ${c.fault || !c.guard ? "error" : state.running && c.part ? "live" : ""}`;
  }
  if (state.events[0]?.id !== lastEvent) {
    lastEvent = state.events[0]?.id;
    $("#event-list").replaceChildren();
    for (const event of state.events
      .filter((e) => !e.environment || e.environment === selected)
      .slice(0, 9)) {
      const item = document.createElement("li");
      item.className = event.type;
      const stamp = document.createElement("time");
      stamp.textContent = timeLabel(event.time);
      const message = document.createElement("span");
      message.textContent = event.message;
      item.append(stamp, message);
      $("#event-list").append(item);
    }
  }
}
for (const button of document.querySelectorAll("[data-product]"))
  button.onclick = () => {
    simulation.setProduct(button.dataset.product);
    view?.setProduct(button.dataset.product);
    lastEvent = -1;
    updateUi();
  };
const logoutButton = $("#logout");
if (logoutButton)
  logoutButton.onclick = () => document.dispatchEvent(new Event("auth:logout"));
for (const button of document.querySelectorAll("[data-environment]"))
  button.onclick = () => selectEnvironment(button.dataset.environment);
for (const button of document.querySelectorAll("[data-tab]"))
  button.onclick = () => tab(button.dataset.tab);
for (const button of document.querySelectorAll("[data-mode]"))
  button.onclick = () => {
    simulation.setMode(selected, button.dataset.mode);
    updateUi();
  };
for (const button of document.querySelectorAll("[data-command]"))
  button.onclick = () => {
    const cell = simulation.snapshot.cells.find((c) => c.id === selected);
    simulation.command(
      selected,
      button.dataset.command,
      !cell.commands[button.dataset.command],
    );
    updateUi();
  };
for (const button of document.querySelectorAll("[data-camera]"))
  button.onclick = () => {
    view?.setView(button.dataset.camera);
    for (const other of document.querySelectorAll("[data-camera]"))
      other.classList.toggle("active", other === button);
  };
$("#environment-select").onchange = (e) => selectEnvironment(e.target.value);
$("#execute-action").onclick = $("#scene-action").onclick = () => {
  simulation.performNext(selected);
  updateUi();
};
$("#start").onclick = () => {
  simulation.snapshot.cells.find((c) => c.id === selected).mode === "guided"
    ? simulation.performNext(selected)
    : simulation.start();
  updateUi();
};
$("#pause").onclick = () => {
  simulation.stop();
  updateUi();
};
$("#step").onclick = () => {
  simulation.step(0.1, true);
  updateUi();
};
$("#speed").onchange = (e) => {
  simulation.setSpeed(Number(e.target.value));
};
$("#scope").onchange = (e) => {
  simulation.setScope(e.target.value, selected);
  lastEvent = -1;
  updateUi();
};
$("#emergency").onclick = () => {
  simulation.emergencyStop();
  updateUi();
};
$("#acknowledge").onclick = () => {
  simulation.acknowledge();
  updateUi();
};
$("#guard").onchange = (e) => {
  simulation.setGuard(selected, e.target.checked);
  updateUi();
};
$("#fault").onchange = (e) => {
  simulation.setFault(selected, e.target.checked);
  updateUi();
};
$("#new-batch").onclick = () => {
  $("#batch-size").value = String(simulation.snapshot.batch);
  $("#batch-dialog").showModal();
};
$("#cancel-batch").onclick = () => $("#batch-dialog").close();
$("#batch-form").onsubmit = (e) => {
  e.preventDefault();
  simulation.reset(Number($("#batch-size").value));
  lastEvent = -1;
  $("#batch-dialog").close();
  updateUi();
};
$("#zoom-in").onclick = () => view?.zoom(0.85);
$("#zoom-out").onclick = () => view?.zoom(1.15);
$("#retry").onclick = () => location.reload();
if ($("#report"))
  $("#report").onclick = () => {
    const state = simulation.snapshot;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title: "Relatório da simulação logística",
            generatedAt: new Date().toISOString(),
            selectedEnvironment: selected,
            ...state,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-logistica.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
try {
  view = createLabScene(
    $("#world"),
    (key) => {
      tab("signals");
      const row = $(`#signal-${key}`);
      row.classList.add("highlight");
      row.scrollIntoView({ block: "nearest" });
      setTimeout(() => row.classList.remove("highlight"), 1200);
    },
    (id, reason) => {
      simulation.haltMotion(id, reason);
      updateUi();
    },
  );
} catch (error) {
  console.error(error);
  $("#render-error").hidden = false;
}
selectEnvironment(selected);
learning = installLearningFeatures({
  environment: "cookware",
  steps: ENVIRONMENTS,
  getState: () => simulation.snapshot,
  exportSimulation: () => simulation.exportState(),
  getView: () => view,
  getSelected: () => selected,
  onSelect: selectEnvironment,
  onRefresh: updateUi,
  restoreSimulation(checkpoint, savedView) {
    if (!simulation.importState(checkpoint)) return false;
    selected =
      checkpoint.scope === "bench" ? checkpoint.focus : savedView.selected;
    view?.setProduct(simulation.snapshot.product);
    selectEnvironment(selected);
    $("#scope").value = simulation.snapshot.scope;
    $("#speed").value = String(simulation.snapshot.speed);
    return true;
  },
  startMission(withFault) {
    simulation.setScope("line", "receiving");
    simulation.reset(12);
    for (const environment of ENVIRONMENTS) {
      simulation.setMode(environment.id, "auto");
      simulation.setGuard(environment.id, true);
      simulation.setFault(environment.id, false);
    }
    simulation.acknowledge();
    selected = "receiving";
    selectEnvironment(selected);
    $("#scope").value = "line";
    if (withFault) simulation.setFault("receiving", true);
  },
});
await learning.restore();
let frameId = 0,
  leavingIndustry = false;
function frame(now) {
  if (leavingIndustry) return;
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
  lastTime = now;
  if (!document.hidden) {
    simulation.step(dt);
    const state = simulation.snapshot;
    view?.update(
      state.cells.find((c) => c.id === selected),
      dt,
      state.running,
      state.emergency,
      state.scope,
    );
    view?.updateOverview(state, dt);
    view?.render();
    if (view) {
      for (const [i, p] of view.hotspots().entries()) {
        const label = $(`#hotspot-${i}`);
        label.style.left = `${p.x}%`;
        label.style.top = `${p.y}%`;
        label.hidden =
          !p.visible || p.x < 5 || p.x > 95 || p.y < 23 || p.y > 82;
        label.classList.toggle(
          "live",
          state.running &&
            ((i === 0 &&
              state.cells.find((c) => c.id === selected).phase === "feeding") ||
              (i === 1 &&
                state.cells.find((c) => c.id === selected).phase ===
                  "processing") ||
              (i === 2 &&
                state.cells.find((c) => c.id === selected).phase ===
                  "unloading")),
        );
      }
    }
    if (now - lastUi > 100) {
      updateUi();
      learning?.tick(now);
      lastUi = now;
    }
  }
  frameId = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
});
frameId = requestAnimationFrame(frame);

function closeCookwareScene() {
  leavingIndustry = true;
  learning?.close();
  cancelAnimationFrame(frameId);
  simulation.stop();
  view?.dispose();
}
document.addEventListener("industry:leave", closeCookwareScene, { once: true });
window.addEventListener("pagehide", closeCookwareScene, { once: true });
