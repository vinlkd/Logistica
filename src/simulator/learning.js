import { createProgressStore } from "../progress.js";
import {
  createMission,
  missionDefinition,
  missionEvidence,
  diagnose,
} from "./missions.js";
import "./learning.css";

export function installLearningFeatures({
  environment,
  steps,
  getState,
  exportSimulation,
  restoreSimulation,
  startMission,
  continueOrder,
  getView,
  onSelect,
  getSelected,
  onRefresh,
}) {
  let definition = missionDefinition(environment, steps, undefined, {
      onDemand: getState().onDemand,
    }),
    mission = createMission(definition);
  const store = createProgressStore(environment, { demo: true });
  const host = document.querySelector(".inspector-panel"),
    panel = document.createElement("section");
  panel.className = "panel-section learning-panel";
  panel.innerHTML =
    '<h2>Missão do pedido</h2><p class="mission-objective"></p><progress class="mission-progress" max="1" value="0" aria-label="Progresso da missão"></progress><p class="mission-state" role="status"></p><div class="mission-actions"><button class="primary" data-mission-start>Iniciar missão</button><button data-mission-fault>Iniciar com falha</button></div><p class="muted">Iniciar uma missão prepara um novo lote de 12 unidades na linha integrada.</p><p class="learning-save" role="status" aria-live="polite"></p><button data-retry-save hidden>Tentar novamente</button><button data-exit-unsaved hidden>Sair sem salvar alterações</button><button data-restart-saved hidden>Substituir atividade salva e reiniciar</button><div class="learning-diagnostic" hidden><h2>Investigar a falha</h2><p data-fault-signals></p><label>Causa identificada<select aria-label="Causa identificada"></select></label><button data-check-diagnosis>Conferir diagnóstico</button><p data-diagnosis-result role="status"></p></div>';
  if (environment === "beverages") {
    const choice = document.createElement("label");
    choice.textContent = "Pedido da missão";
    const select = document.createElement("select");
    select.dataset.missionQuantity = "";
    select.setAttribute("aria-label", "Quantidade de garrafas da missão");
    for (const [value, text] of [
      [108, "108 garrafas · 12 caixas de 9"],
      [12, "Lote de teste · 12 garrafas (9 + 3)"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    choice.append(select);
    panel.querySelector(".mission-actions").before(choice);
    panel.querySelector(".muted").textContent =
      "Iniciar uma missão prepara o pedido escolhido na linha integrada.";
  }
  host.insertBefore(panel, host.querySelector(".interaction-card"));
  panel.querySelector(".mission-objective").textContent = definition.objective;
  const overviewButton = document.createElement("button");
  overviewButton.className = "overview-button";
  overviewButton.type = "button";
  overviewButton.textContent = "Visão geral";
  overviewButton.setAttribute("aria-label", "Visão geral do ambiente");
  document.querySelector(".camera-tools").append(overviewButton);
  const labels = document.createElement("div");
  labels.className = "overview-labels";
  document.querySelector(".viewport").append(labels);
  const labelButtons = new Map();
  for (const step of steps) {
    const b = document.createElement("button");
    b.type = "button";
    b.hidden = true;
    b.onclick = () => focus(step.id);
    labels.append(b);
    labelButtons.set(step.id, b);
  }
  const saveLabel = panel.querySelector(".learning-save");
  let ready = false,
    blocked = false,
    closed = false,
    saving = false,
    queued = false,
    replace = false,
    lastSave = 0,
    lastFault = "",
    lastResult = "",
    results = [],
    pending = null,
    pendingExit = null,
    lastSaved = "",
    failureCode = "";
  let camera = "front";
  function focus(id) {
    camera = "front";
    if (getState().scope === "bench") replace = true;
    onSelect(id);
    document.querySelector('[data-tab="operation"]').click();
    onRefresh();
  }
  overviewButton.onclick = () => {
    const view = getView();
    if (!view) return;
    view.showOverview(steps, focus);
    camera = "overview";
    render();
  };
  document.querySelectorAll("[data-camera]").forEach((b) =>
    b.addEventListener("click", () => {
      if (getView()?.isOverview) onSelect(getSelected());
      camera = b.dataset.camera;
      getView()?.setView(camera);
      document
        .querySelectorAll("[data-camera]")
        .forEach((button) => button.classList.toggle("active", button === b));
      render();
    }),
  );
  function envelope() {
    return {
      version: 1,
      simulation: exportSimulation(),
      mission: mission.exportState(),
      view: {
        selected: getSelected(),
        scope: getState().scope,
        camera: getView()?.isOverview
          ? "overview"
          : camera === "overview"
            ? "front"
            : camera,
      },
      results,
    };
  }
  async function save(force = false) {
    if (!ready || blocked) return;
    if (saving) {
      queued = true;
      return pending;
    }
    const snapshot = envelope(),
      fingerprint = JSON.stringify(snapshot);
    if (!replace && fingerprint === lastSaved) return;
    const replacing = replace;
    replace = false;
    saving = true;
    pending = (async () => {
      try {
        await store.save(snapshot, { replace: replacing });
        lastSaved = fingerprint;
        panel.querySelector("[data-retry-save]").hidden = true;
        saveLabel.textContent = true
          ? "Atividade salva neste navegador."
          : "Atividade salva na sua conta.";
      } catch (error) {
        failureCode = error.code;
        replace = replace || replacing;
        blocked = true;
        panel.querySelector("[data-retry-save]").hidden = false;
        panel.querySelector("[data-retry-save]").textContent = [
          "PROGRESS_CONFLICT",
          "ACCOUNT_CHANGED",
          "UNAUTHENTICATED",
          "INVALID_RESPONSE",
        ].includes(error.code)
          ? "Carregar atividade salva"
          : "Tentar novamente";
        saveLabel.textContent =
          error.code === "PROGRESS_CONFLICT"
            ? "Outra aba atualizou esta atividade. Recarregue para continuar a versão salva."
            : error.code === "ACCOUNT_CHANGED" ||
                error.code === "UNAUTHENTICATED"
              ? "A sessão mudou. Entre novamente para salvar na conta correta."
              : "Não foi possível salvar. Sua atividade continua aberta; tente novamente antes de sair.";
        panel.querySelector("[data-restart-saved]").hidden = ![
          "INCOMPATIBLE_PROGRESS",
          "PROGRESS_RESET_REQUIRED",
        ].includes(error.code);
      } finally {
        saving = false;
        if (queued && !blocked) {
          queued = false;
          return save(true);
        }
      }
    })();
    return pending;
  }
  async function begin(withFault) {
    const quantity = Number(
      panel.querySelector("[data-mission-quantity]")?.value ?? 12,
    );
    if (startMission(withFault, quantity) === false) {
      onRefresh();
      return;
    }
    definition = missionDefinition(environment, steps, quantity, {
      onDemand: getState().onDemand,
    });
    mission = createMission(definition);
    panel.querySelector(".mission-objective").textContent =
      definition.objective;
    mission.start(missionEvidence(getState(), definition).product);
    lastResult = "";
    replace = true;
    blocked = false;
    ready = true;
    panel.querySelector("[data-restart-saved]").hidden = true;
    onRefresh();
    render();
    await save(true);
  }
  panel.querySelector("[data-mission-start]").onclick = () => begin(false);
  panel.querySelector("[data-mission-fault]").onclick = () => begin(true);
  panel.querySelector("[data-restart-saved]").onclick = () => begin(false);
  panel.querySelector("[data-check-diagnosis]").onclick = () => {
    const d = diagnose(environment, getState());
    if (!d) return;
    const chosen = panel.querySelector(
      '[aria-label="Causa identificada"]',
    ).value;
    panel.querySelector("[data-diagnosis-result]").textContent =
      chosen === d.cause
        ? `Diagnóstico coerente. ${d.hint}`
        : "Esse diagnóstico não corresponde aos sinais. Confira a peça, os sensores e os parâmetros antes de tentar novamente.";
  };
  function render() {
    const state = getState(),
      evidence = missionEvidence(state, definition);
    if (!state.practice) mission.observe(evidence);
    const m = mission.snapshot;
    panel.querySelector(".mission-progress").value = m?.progress ?? 0;
    panel.querySelector(".mission-state").textContent = state.practice
      ? "Teste independente. A linha e a missão estão preservadas; volte à linha para continuar."
      : !m
        ? "Missão ainda não iniciada."
        : m.status === "interrupted"
          ? "Missão interrompida: o produto ou a abrangência mudou. Inicie um novo pedido para avaliar o fluxo completo."
          : m.completed
            ? `Pedido concluído: ${m.done} unidades passaram por todas as operações. ${m.faultsResolved.length} ocorrência(s) corrigida(s). Os sensores liberaram a saída após as verificações.`
            : `${m.done} / ${m.target} unidades entregues · ${Math.round(m.progress * 100)}% das operações concluídas.`;
    if (m?.completed && lastResult !== definition.id) {
      results = [
        ...results.slice(-99),
        {
          missionId: definition.id,
          status: "completed",
          completedAt: new Date().toISOString(),
          quantity: m.target,
          product: m.product,
          elapsed: m.elapsed,
          faultsResolved: m.faultsResolved.length,
        },
      ];
      lastResult = definition.id;
    }
    const d = diagnose(environment, state),
      diagnostic = panel.querySelector(".learning-diagnostic");
    diagnostic.hidden = !d;
    if (d) {
      panel.querySelector("[data-fault-signals]").textContent =
        `${d.title}. Observe os sinais da máquina e identifique a causa antes de ajustar os controles.`;
      if (lastFault !== d.code) {
        lastFault = d.code;
        const select = panel.querySelector('[aria-label="Causa identificada"]');
        select.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = "Escolha uma causa";
        select.append(first);
        for (const [value, text] of [...d.choices].sort((a, b) =>
          a[1].localeCompare(b[1]),
        )) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = text;
          select.append(o);
        }
        panel.querySelector("[data-diagnosis-result]").textContent = "";
      }
    } else if (lastFault) {
      lastFault = "";
      panel.querySelector("[data-diagnosis-result]").textContent =
        "Condição corrigida. Retome a operação para confirmar a liberação.";
    }
    const overview = getView()?.isOverview;
    document.querySelector(".process-hotspots").hidden = !!overview;
    if (overview) document.querySelector("#scene-action").hidden = true;
    document.querySelector("#environment-title").textContent = overview
      ? "Visão geral"
      : (steps.find((s) => s.id === getSelected())?.label ??
        steps.find((s) => s.id === getSelected())?.short ??
        "");
    overviewButton.classList.toggle("active", !!overview);
    const positions = overview ? getView().overviewLabels() : [];
    for (const step of steps) {
      const button = labelButtons.get(step.id),
        p = positions.find((p) => p.id === step.id);
      button.hidden = !p?.visible || !overview;
      if (button.hidden) continue;
      button.style.left = `${p.x}%`;
      button.style.top = `${p.y}%`;
      const cell = state.cells?.find((c) => c.id === step.id),
        active = cell
          ? cell.part
          : state.step.id === step.id && state.phase !== "complete";
      const queue = cell
        ? cell.queue
        : step.id === steps[0].id
          ? Math.max(0, state.total - state.done - 1)
          : 0;
      button.textContent = `${step.label ?? step.short}\nFila ${queue} · Em processo ${active ? 1 : 0} · Saída ${evidence.checkpoints[step.id] ?? 0}`;
      button.classList.toggle("current", !!active);
    }
  }
  async function restore() {
    saveLabel.textContent = "Carregando atividade deste navegador…";
    try {
      const saved = await store.load();
      if (saved) {
        definition = missionDefinition(
          environment,
          steps,
          saved.mission?.state?.target,
        );
        mission = createMission(definition);
        panel.querySelector(".mission-objective").textContent =
          definition.objective;
        const choice = panel.querySelector("[data-mission-quantity]");
        if (choice) choice.value = 108;
        if (
          !restoreSimulation(saved.simulation, saved.view) ||
          !mission.importState(
            saved.mission,
            missionEvidence(getState(), definition),
          )
        )
          throw Object.assign(new Error("incompatible"), {
            code: "INCOMPATIBLE_PROGRESS",
          });
        results = saved.results ?? [];
        lastResult = mission.snapshot?.completed ? definition.id : "";
        camera = saved.view.camera ?? "front";
        if (camera === "overview") getView()?.showOverview(steps, focus);
        else getView()?.setView(camera);
        saveLabel.textContent =
          "Atividade retomada no ponto salvo. Confira a linha e clique em Iniciar.";
        if (environment === "beverages" && saved.simulation.quantity < 108) {
          saveLabel.textContent = `Lote salvo de ${saved.simulation.quantity} garrafas preservado. Para preencher 12 caixas de 9, inicie um novo pedido de 108 garrafas. A caixa parcial já fechada pertence ao pedido anterior.`;
          panel.querySelector("[data-mission-start]").textContent =
            "Iniciar novo pedido de 108 garrafas";
          if (
            saved.simulation.scope === "bench" &&
            saved.simulation.selected === "receive" &&
            continueOrder
          ) {
            saveLabel.textContent = `Recebimento salvo de ${saved.simulation.quantity} garrafas preservado. Você pode continuar até 108 sem repetir as já retiradas.`;
            const resume = document.createElement("button");
            resume.textContent = "Continuar recebimento até 108 garrafas";
            resume.onclick = async () => {
              if (!continueOrder()) return;
              resume.remove();
              replace = true;
              onRefresh();
              render();
              await save(true);
            };
            saveLabel.after(resume);
          }
        }
      } else
        saveLabel.textContent = true
          ? "Seu progresso fica salvo neste navegador."
          : "Seu progresso será salvo nesta conta.";
      ready = true;
      lastSaved = JSON.stringify(envelope());
    } catch (error) {
      blocked = true;
      panel.querySelector("[data-retry-save]").hidden = false;
      saveLabel.textContent =
        error.code === "INCOMPATIBLE_PROGRESS"
          ? "A atividade salva é incompatível com esta versão e foi preservada."
          : "Não foi possível carregar sua atividade. O estado salvo foi preservado.";
      panel.querySelector("[data-restart-saved]").hidden =
        error.code !== "INCOMPATIBLE_PROGRESS";
    }
    render();
    onRefresh();
  }
  const onChange = () => {
    if (ready && !closed) {
      lastSave = performance.now();
      queueMicrotask(() => save());
    }
  };
  document.querySelector(".workspace").addEventListener("change", onChange);
  function finishExit(target) {
    closed = true;
    store.dispose().catch(() => {});
    document.removeEventListener("click", beforeExit, true);
    document.dispatchEvent(new Event("industry:leave"));
    if (target.id === "logout")
      document.dispatchEvent(new Event("auth:logout"));
    else location.assign(target.href);
  }
  panel.querySelector("[data-retry-save]").onclick = async () => {
    if (
      [
        "PROGRESS_CONFLICT",
        "ACCOUNT_CHANGED",
        "UNAUTHENTICATED",
        "INVALID_RESPONSE",
      ].includes(failureCode)
    ) {
      location.reload();
      return;
    }
    blocked = false;
    if (ready) await save(true);
    else await restore();
  };
  panel.querySelector("[data-exit-unsaved]").onclick = () => {
    if (pendingExit) finishExit(pendingExit);
  };
  document.querySelector(".workspace").addEventListener(
    "click",
    (event) => {
      if (event.target.closest("[data-product],[data-environment]"))
        replace = true;
    },
    true,
  );
  document.querySelector(".workspace").addEventListener(
    "change",
    (event) => {
      if (event.target.matches("#scope,#environment-select")) replace = true;
    },
    true,
  );
  document
    .querySelector("#batch-form")
    .addEventListener("submit", () => (replace = true), true);
  const beforeExit = async (event) => {
    const target = event.target.closest?.(".industry-back,#logout");
    if (!target || closed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Saving must never trap the learner inside a scene. Anonymous checkpoints
    // are local; bound the last flush and always honor the navigation request.
    await Promise.race([
      (async () => {
        try {
          await save(true);
          await store.flush();
        } catch {}
      })(),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
    finishExit(target);
  };
  document.addEventListener("click", beforeExit, true);
  return {
    restore,
    render,
    tick(now) {
      if (closed) return;
      render();
      if (ready && now - lastSave > 2000) {
        lastSave = now;
        save();
      }
    },
    async close() {
      if (closed) return;
      try {
        await save(true);
        await store.flush();
      } catch {}
      closed = true;
      store.dispose().catch(() => {});
      document.removeEventListener("click", beforeExit, true);
      document
        .querySelector(".workspace")
        ?.removeEventListener("change", onChange);
    },
  };
}
