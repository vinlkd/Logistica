export function createPreviewMenu(
  container,
  { industry, stations, plan, resume, pause, runtime, onCommand },
) {
  const dialog = document.createElement("dialog");
  dialog.className = "z-menu";
  dialog.setAttribute("aria-labelledby", "z-menu-title");
  container.append(dialog);
  const sections = ["Operação", "Equipamentos", "Configurações", "Ajuda"];
  let entered = false;
  let section;

  function view(wallClock, state = runtime.snapshot) {
    const { running, emergency, mode } = state;
    const blocked = runtime.blockedReason;
    return {
      wallClock,
      running,
      emergency,
      mode,
      fault: Boolean(blocked || state.fault),
      message: blocked ?? "",
      actions: {
        start: !blocked && !emergency && state.ready !== false && (!running || mode === "manual"),
        stop: running,
        reset: emergency || (!running && !blocked),
        mode: !emergency && !blocked,
        emergency: true,
      },
    };
  }

  function command(action) {
    if (!view().actions[action]) return;
    runtime.command(action);
    onCommand();
  }
  function render() {
    let content;
    switch (section) {
      case "Operação":
        const state = runtime.snapshot;
        content = `<p>${runtime.blockedReason ?? "Operação da linha simulada nesta visita."}</p>
          <div class="z-menu-grid">${[
            ["start", "Ligar"],
            ["stop", "Parar"],
            ["reset", "Reset"],
            ["mode", "Manual / auto"],
          ]
            .map(
              ([action, label]) =>
                `<button data-command="${action}" ${view(undefined, state).actions[action] ? "" : "disabled"}>${label}</button>`,
            )
            .join("")}</div>
          <button class="z-menu-emergency" data-command="emergency">Parada de emergência</button>
          <h3>Velocidade</h3><div class="z-menu-speed">${[1, 2, 4].map((value) => `<button data-speed="${value}" aria-pressed="${state.speed === value}">${value}×</button>`).join("")}</div>
          <h3>Últimos eventos</h3><ul>${(state.events ?? []).slice(0, 5).map(event => `<li>${event.text ?? event.message ?? ""}</li>`).join("") || "<li>Nenhum evento registrado.</li>"}</ul>`;
        break;
      case "Equipamentos":
        content = `<ol>${stations.map((station) => `<li>${station.name}<span>${station.y ? "Mezanino" : "Térreo"}</span></li>`).join("")}</ol>`;
        break;
      case "Configurações":
        content = `<dl><dt>Galpão</dt><dd>${plan.bounds.east - plan.bounds.west} × ${plan.bounds.south - plan.bounds.north} m</dd><dt>Altura da câmera</dt><dd>${plan.player.eyeHeight.toLocaleString("pt-BR")} m</dd></dl>`;
        break;
      case "Ajuda":
        content = `<ul class="z-help">
  <li><div><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></div><span>Andar</span></li>
  <li><kbd>Shift</kbd><span>Correr</span></li>
  <li><div><kbd>E</kbd> ou clique</div><span>Interagir</span></li>
  <li><kbd>Q</kbd><span>Balões das estações</span></li>
  <li><kbd>Esc</kbd><span>Menu</span></li>
</ul>
<p class="z-help-note">Mova o mouse sobre o cenário para olhar; clique para interagir.</p>`;
        break;
      default:
        content = `<button class="z-menu-enter" data-action="resume">${entered ? "Retomar visita" : "Entrar no galpão"}</button><nav aria-label="Opções">${sections.map((name) => `<button data-section="${name}">${name}<span aria-hidden="true">›</span></button>`).join("")}</nav>`;
    }
    dialog.innerHTML = `<header><strong>Laboratório de logística</strong><span>Prévia demonstrativa</span></header><div class="z-menu-content">${section ? '<button class="z-menu-back" data-action="back">‹ Voltar</button>' : ""}<h2 id="z-menu-title">${section ?? (industry === "cookware" ? "Galpão de Panelas" : "Galpão de Bebidas")}</h2>${content}</div>`;
  }

  function open(initialSection) {
    if (dialog.open) return;
    pause();
    section = initialSection;
    render();
    dialog.showModal();
    dialog.querySelector("button")?.focus();
  }

  function close() {
    dialog.close();
    resume(false);
  }

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "resume") {
      entered = true;
      dialog.close();
      resume(true);
      return;
    }
    if (button.dataset.action === "back") section = undefined;
    else if (button.dataset.section) section = button.dataset.section;
    else if (button.dataset.speed) {
      runtime.setSpeed(Number(button.dataset.speed));
      onCommand();
    } else if (button.dataset.command) command(button.dataset.command);
    render();
    dialog.querySelector("button")?.focus();
  });

  return {
    open,
    command,
    view,
    get isOpen() {
      return dialog.open;
    },
  };
}
