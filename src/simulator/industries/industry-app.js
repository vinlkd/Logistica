import { installLearningFeatures } from "../learning.js";
import "../style.css";
import { renderLabShell, labIcon as icon } from "../lab-shell.js";
import { createLabScene } from "../lab-scene.js";
import { createIndustrySession } from "./industry-session.js";
import { BEVERAGES, FURNITURE } from "./definitions.js";
import { PARCELS, buildParcelsModel } from "./parcels.js";
import { buildBeveragesModel, buildFurnitureModel } from "./factory-models.js";

export async function launchIndustry(id) {
  const definition = {
    beverages: BEVERAGES,
    furniture: FURNITURE,
    parcels: PARCELS,
  }[id];
  if (!definition) throw new Error("Ambiente desconhecido");
  const environments = definition.steps.map((s) => ({
    id: s.id,
    name: s.label,
    short: s.label,
  }));
  const products = definition.products.map((p) => ({
    ...p,
    size: p.volume
      ? `${p.volume} mL`
      : p.length
        ? `${p.length} cm`
        : p.description,
  }));
  const root = document.querySelector("#app"),
    staticDemo = import.meta.env.MODE === "pages";
  // Exactly the same DOM and CSS as cookware; only process content is supplied.
  root.innerHTML = renderLabShell({
    ENVIRONMENTS: environments,
    PRODUCTS: products,
    productIcon: () => icon("cube"),
    staticDemo,
  });
  const $ = (q) => root.querySelector(q),
    all = (q) => root.querySelectorAll(q);
  const text = (q, value) => {
    const e = $(q);
    if (e && e.textContent !== String(value)) e.textContent = String(value);
  };
  const session = createIndustrySession(definition);
  let learning = null;
  let selected = definition.steps[0].id,
    view = null,
    disposed = false,
    frameId = 0,
    previousTime = performance.now(),
    previousUi = 0,
    previousHistory = -1;
  text(
    ".product-picker h2",
    id === "parcels"
      ? "Qual rota vamos atender?"
      : id === "beverages"
        ? "Qual bebida vamos produzir?"
        : "Qual móvel vamos produzir?",
  );
  $(".product-picker").setAttribute("aria-label", "Escolha do produto");
  text(".product-note", "Trocar o produto prepara um novo lote.");
  $("#batch-size").max = "30";
  const context = $(".header-context");
  context.lastChild.textContent = ` ${definition.name}`;
  const conditions = $("#guard").closest(".panel-section");
  for (const control of definition.controls) {
    const label = document.createElement("label");
    label.className = "condition";
    const caption = document.createElement("span");
    caption.textContent = control.label;
    label.append(caption);
    const input = document.createElement(
      control.type === "select" ? "select" : "input",
    );
    input.dataset.setting = control.id;
    input.setAttribute("aria-label", control.label);
    if (control.type === "select") {
      for (const option of control.options) {
        const o = document.createElement("option");
        o.value = option.value;
        o.textContent = option.label;
        input.append(o);
      }
    } else {
      input.type = control.type;
      if (control.type === "checkbox") input.checked = !!control.value;
      else {
        input.min = control.min;
        input.max = control.max;
        input.step = control.step ?? 1;
        input.size = 5;
      }
    }
    if (control.type !== "checkbox") input.value = control.value;
    input.onchange = () => {
      session.setSetting(
        control.id,
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? Number(input.value)
            : input.value,
      );
      updateUi();
    };
    label.append(input);
    conditions.append(label);
  }
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
  function tab(name) {
    $(".workspace").classList.add("panel-open");
    panelToggle.setAttribute("aria-expanded", "true");
    panelToggle.innerHTML = icon("minus");
    all("[data-tab]").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tab === name)),
    );
    all(".inspector-panel").forEach(
      (p) => (p.hidden = p.id !== `panel-${name}`),
    );
  }
  function selectEnvironment(value, reset = true) {
    if (!definition.steps.some((s) => s.id === value)) return;
    const changed = selected !== value;
    selected = value;
    if (reset && changed) session.selectEnvironment(value);
    $("#environment-select").value = value;
    const step = definition.steps.find((s) => s.id === value),
      index = definition.steps.indexOf(step);
    text(
      "#environment-number",
      `${String(index + 1).padStart(2, "0")} / ${String(definition.steps.length).padStart(2, "0")}`,
    );
    text("#environment-title", step.label);
    text("#machine-title", definition.name);
    text("#exercise", step.help);
    all("[data-environment]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.environment === value);
      b.setAttribute("aria-current", String(b.dataset.environment === value));
    });
    for (const [i, key] of [
      "entry",
      "positioned",
      "exit",
      "guard",
      "stroke",
    ].entries())
      all(`[data-input-address="${key}"]`).forEach(
        (e) => (e.textContent = `I${index}.${i}`),
      );
    for (const [i, key] of ["motor", "work", "transfer"].entries())
      all(`[data-output-address="${key}"]`).forEach(
        (e) => (e.textContent = `Q${index}.${i}`),
      );
    view?.select(value);
    all("[data-camera]").forEach((b) =>
      b.classList.toggle("active", b.dataset.camera === "front"),
    );
    updateUi();
  }
  const clock = (t) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function updateUi() {
    learning?.render();
    const s = session.snapshot,
      step = definition.steps.find((p) => p.id === selected);
    if (selected !== s.selected) {
      selectEnvironment(s.selected, false);
      return;
    }
    const retry =
      s.scope === "line" &&
      id === "beverages" &&
      s.step.id === "label" &&
      !s.unit.capped;
    const status = s.emergency
      ? "Emergência acionada"
      : !s.ready
        ? "Intertravamento ativo"
        : s.phase === "complete"
          ? "Lote concluído"
          : s.fault
            ? s.fault
            : s.running
              ? "Em operação"
              : s.mode === "guided" && s.phase === "ready"
                ? "Aguardando sua ação"
                : "Pronto / pausado";
    const product = products.find((p) => p.id === s.product.id);
    text("#product-context", product.name);
    text(
      "#product-description",
      product.description ?? `${product.name} · ${product.size}`,
    );
    all("[data-product]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.product === s.product.id),
      ),
    );
    text("#global-status", status);
    text("#scene-state", status);
    text("#simulation-clock", clock(s.elapsed));
    text(
      "#queue-count",
      Math.max(0, s.total - s.done - (s.phase === "complete" ? 0 : 1)),
    );
    text("#wip-count", s.phase === "complete" ? 0 : 1);
    text("#done-count", s.done);
    text("#batch-progress", `${s.done} / ${s.total}`);
    $("#batch-bar").style.width = `${(s.done / s.total) * 100}%`;
    text(
      "#scope-status",
      s.scope === "bench" ? "Bancada individual" : "Linha integrada",
    );
    $("#start").disabled = s.running || !s.ready || s.phase === "complete";
    $("#pause").disabled = !s.running;
    $("#step").disabled = s.running || !s.ready || s.phase === "complete";
    text("#start span", retry ? "Repetir tampagem" : "Iniciar");
    $("#run-indicator").className =
      s.emergency || !s.ready || s.fault ? "fault" : s.running ? "running" : "";
    $("#global-status-dot").className = $("#run-indicator").className;
    $(".interaction-card").hidden = s.mode !== "guided";
    $("#scene-action").hidden = s.mode !== "guided";
    const action = retry
      ? "Repetir tampagem"
      : s.phase === "ready"
        ? step.label
        : s.phase === "complete"
          ? "Lote concluído"
          : "Executando…";
    text("#execute-action", action);
    text("#scene-action", action);
    text(
      "#action-state",
      !s.ready
        ? "Verifique a segurança"
        : s.phase === "ready"
          ? "Sua vez"
          : "Ação em andamento",
    );
    $("#execute-action").disabled = $("#scene-action").disabled =
      !s.ready || s.phase !== "ready";
    const readings = definition.readings?.(s) ?? [];
    text("#action-help", s.fault || step.help);
    $("#action-progress").value = s.progress;
    $("#receiving-feedback").hidden = !(
      s.step.id === selected &&
      s.phase === "operating" &&
      ["scan", "weigh", "fill", "inspect"].includes(selected)
    );
    text("#receiving-title", s.step.label);
    text(
      "#receiving-detail",
      readings.map((r) => `${r.label}: ${r.value}`).join(" · "),
    );
    $("#receiving-progress").value = s.progress;
    text(
      "#mode-description",
      s.mode === "guided"
        ? "Você autoriza cada etapa. Nenhuma etapa seguinte começa sozinha."
        : s.mode === "auto"
          ? "O ciclo coordena transporte, processo e transferência automaticamente."
          : "Acione os atuadores e observe os sensores para conduzir cada etapa.",
    );
    text(
      "#manual-badge",
      s.mode === "guided"
        ? "Controle por etapas"
        : s.mode === "auto"
          ? "Controle automático"
          : "Controle manual",
    );
    text(
      "#manual-help",
      s.mode === "manual"
        ? "Inicie a simulação e acione transporte, processo e transferência conforme os sensores."
        : "Selecione Manual para comandar os atuadores.",
    );
    all("[data-mode]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === s.mode)),
    );
    all("[data-command]").forEach((b) => {
      const key = b.dataset.command;
      b.disabled = s.mode !== "manual" || !s.ready;
      b.setAttribute(
        "aria-pressed",
        String(s.mode === "manual" ? s.commands[key] : s.outputs[key]),
      );
      b.classList.toggle("energized", s.outputs[key]);
    });
    for (const [key, value] of Object.entries(s.inputs)) {
      text(`#input-${key}`, value ? 1 : 0);
      $(`#input-${key}`)?.classList.toggle("on", value);
    }
    for (const [key, value] of Object.entries(s.outputs)) {
      text(`#output-${key}`, value ? 1 : 0);
      $(`#output-${key}`)?.classList.toggle("on", value);
    }
    $("#guard").checked = s.guard;
    $("#fault").checked = s.obstruction;
    $("#acknowledge").hidden = !s.emergency;
    $("#acknowledge").disabled = !s.guard || s.obstruction;
    text(
      "#safety-message",
      s.emergency
        ? "Elimine as falhas e rearme antes de iniciar."
        : s.fault || "Interrompe todos os atuadores da linha.",
    );
    definition.steps.forEach((p) =>
      text(
        `#process-${p.id}`,
        new Set(s.history.filter((e) => e.step === p.id).map((e) => e.unit))
          .size,
      ),
    );
    if (previousHistory !== s.history.length) {
      previousHistory = s.history.length;
      $("#event-list").replaceChildren();
      for (const e of s.history.slice(-9).reverse()) {
        const item = document.createElement("li"),
          stamp = document.createElement("time"),
          message = document.createElement("span");
        stamp.textContent = clock(e.time);
        message.textContent = `${e.unit} · ${definition.steps.find((p) => p.id === e.step)?.label ?? e.step}`;
        item.append(stamp, message);
        $("#event-list").append(item);
      }
    }
  }
  all("[data-tab]").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
  all("[data-environment]").forEach(
    (b) => (b.onclick = () => selectEnvironment(b.dataset.environment)),
  );
  $("#environment-select").onchange = (e) => selectEnvironment(e.target.value);
  all("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        session.setMode(b.dataset.mode);
        updateUi();
      }),
  );
  all("[data-command]").forEach(
    (b) =>
      (b.onclick = () => {
        session.toggleCommand(b.dataset.command);
        updateUi();
      }),
  );
  all("[data-product]").forEach(
    (b) =>
      (b.onclick = () => {
        session.setProduct(b.dataset.product);
        view?.setProduct(b.dataset.product);
        view?.select(selected);
        previousHistory = -1;
        updateUi();
      }),
  );
  $("#start").onclick = () => {
    session.start();
    if (session.snapshot.selected !== selected)
      selectEnvironment(session.snapshot.selected, false);
    updateUi();
  };
  $("#pause").onclick = () => {
    session.pause();
    updateUi();
  };
  $("#step").onclick = () => {
    session.advance();
    updateUi();
  };
  $("#execute-action").onclick = $("#scene-action").onclick = () => {
    session.perform();
    if (session.snapshot.selected !== selected)
      selectEnvironment(session.snapshot.selected, false);
    updateUi();
  };
  $("#speed").onchange = (e) => session.setSpeed(e.target.value);
  $("#scope").onchange = (e) => {
    session.setScope(e.target.value);
    previousHistory = -1;
    updateUi();
  };
  $("#guard").onchange = (e) => {
    session.setGuard(e.target.checked);
    updateUi();
  };
  $("#fault").onchange = (e) => {
    session.setObstruction(e.target.checked);
    updateUi();
  };
  $("#emergency").onclick = () => {
    session.emergencyStop();
    updateUi();
  };
  $("#acknowledge").onclick = () => {
    session.rearm();
    updateUi();
  };
  $("#new-batch").onclick = () => {
    $("#batch-size").value = session.snapshot.total;
    $("#batch-dialog").showModal();
  };
  $("#cancel-batch").onclick = () => $("#batch-dialog").close();
  $("#batch-form").onsubmit = (e) => {
    e.preventDefault();
    session.setQuantity($("#batch-size").value);
    previousHistory = -1;
    $("#batch-dialog").close();
    updateUi();
  };
  all("[data-camera]").forEach(
    (b) =>
      (b.onclick = () => {
        view?.setView(b.dataset.camera);
        all("[data-camera]").forEach((v) =>
          v.classList.toggle("active", v === b),
        );
      }),
  );
  $("#zoom-in").onclick = () => view?.zoom(0.85);
  $("#zoom-out").onclick = () => view?.zoom(1.15);
  $("#retry").onclick = () => location.reload();
  $("#logout")?.addEventListener("click", () =>
    document.dispatchEvent(new Event("auth:logout")),
  );
  $("#report").onclick = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title: definition.name,
            generatedAt: new Date().toISOString(),
            ...session.snapshot,
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
        row?.classList.add("highlight");
        row?.scrollIntoView({ block: "nearest" });
        setTimeout(() => row?.classList.remove("highlight"), 1200);
      },
      () => session.pause(),
      {
        definition,
        product: definition.products[0],
        build: {
          beverages: buildBeveragesModel,
          furniture: buildFurnitureModel,
          parcels: buildParcelsModel,
        }[id],
      },
    );
  } catch (error) {
    console.error(error);
    $("#render-error").hidden = false;
  }
  selectEnvironment(selected, false);
  function syncControls() {
    const checkpoint = session.exportState();
    $("#scope").value = checkpoint.scope;
    $("#speed").value = String(checkpoint.speed);
    for (const input of all("[data-setting]")) {
      const value = checkpoint.settings[input.dataset.setting];
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
    }
  }
  learning = installLearningFeatures({
    environment: id,
    steps: environments,
    getState: () => session.snapshot,
    exportSimulation: () => session.exportState(),
    getView: () => view,
    getSelected: () => selected,
    onSelect: (value) => selectEnvironment(value),
    onRefresh: updateUi,
    restoreSimulation(checkpoint, savedView) {
      if (!session.importState(checkpoint)) return false;
      selected = savedView.selected;
      view?.setProduct(session.snapshot.product.id);
      selectEnvironment(selected, false);
      syncControls();
      return true;
    },
    startMission(withFault) {
      session.setScope("line");
      session.setQuantity(12);
      session.setMode("auto");
      session.setGuard(true);
      session.setObstruction(false);
      session.rearm();
      const product = session.snapshot.product;
      for (const control of definition.controls)
        session.setSetting(control.id, control.value);
      if (id === "beverages") {
        session.setSetting("volume", product.volume);
        session.setSetting("missingCap", withFault);
      }
      if (id === "furniture") {
        session.setSetting("cutLength", product.length - (withFault ? 10 : 0));
        session.setSetting("drillDepth", 12);
      }
      if (id === "parcels") {
        const unit = definition.initialize(product);
        session.setSetting("destination", unit.destination);
        session.setSetting("address", unit.expectedAddress);
        session.setSetting("route", unit.destination);
        session.setSetting("barcodeReadable", !withFault);
      }
      session.selectEnvironment(definition.steps[0].id);
      selectEnvironment(definition.steps[0].id, false);
      syncControls();
    },
  });
  await learning.restore();
  function cleanup() {
    if (disposed) return;
    disposed = true;
    learning?.close();
    cancelAnimationFrame(frameId);
    session.pause();
    view?.dispose();
  }
  document.addEventListener("industry:leave", cleanup, { once: true });
  window.addEventListener("pagehide", cleanup, { once: true });
  function frame(now) {
    if (disposed) return;
    const dt = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    if (!document.hidden) {
      session.tick(dt);
      const state = session.snapshot;
      view?.update(state, dt, state.running, state.emergency, state.scope);
      view?.updateOverview(state, dt);
      view?.render();
      view?.hotspots().forEach((p, i) => {
        const label = $(`#hotspot-${i}`);
        label.style.left = `${p.x}%`;
        label.style.top = `${p.y}%`;
        label.hidden =
          !p.visible || p.x < 5 || p.x > 95 || p.y < 23 || p.y > 82;
      });
      if (now - previousUi > 100) {
        updateUi();
        learning?.tick(now);
        previousUi = now;
      }
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
}
