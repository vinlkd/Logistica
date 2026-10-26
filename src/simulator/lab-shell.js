export const labIcon = (name) => {
  const paths = {
    play: "M9 5v14l10-7Z",
    pause: "M8 5v14M16 5v14",
    reset: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
    cube: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9",
    front: "M4 5h16v14H4zM4 9h16",
    top: "M4 4h16v16H4zM4 12h16M12 4v16",
    plus: "M12 5v14M5 12h14",
    minus: "M5 12h14",
    gear: "M4 19V9l5 3V6l6 4V3h5v16H4Zm4-3h1m3 0h1m3 0h1",
    signal: "M3 18h4V9h5v9h5V5h4",
    export: "M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5",
    step: "M6 5v14l10-7ZM19 5v14",
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.gear}"/></svg>`;
};

export function renderLabShell({
  ENVIRONMENTS,
  PRODUCTS,
  productIcon,
  staticDemo,
}) {
  const icon = labIcon;
  return `
  <header class="app-header"><div class="senai-signature"><img src="${import.meta.env.BASE_URL}senai-logo.png" alt="SENAI" width="126" height="48"></div><div class="brand"><strong>Simulador de Logística</strong><span>${staticDemo ? "Protótipo de demonstração" : "Laboratório de processos industriais"}</span></div><div class="header-context"><span id="product-context">Panela de cabo · 18 cm</span> <span class="context-separator">/</span> Do disco ao pedido expedido</div><button id="report" class="text-button">${icon("export")}<span>Relatório</span></button>${staticDemo ? "" : '<button id="logout" class="text-button">Sair</button>'}</header>
  <div class="workspace">
    <main class="laboratory">
      <div class="simulation-toolbar"><label class="environment-picker"><span class="sr-only">Ambiente</span><select id="environment-select" aria-label="Ambiente">${ENVIRONMENTS.map((e, i) => `<option value="${e.id}">${String(i + 1).padStart(2, "0")} · ${e.short}</option>`).join("")}</select></label><div class="transport"><button id="start" class="primary">${icon("play")}<span>Iniciar</span></button><button id="pause" class="icon-button" aria-label="Pausar simulação">${icon("pause")}</button><button id="step" class="icon-button" aria-label="Avançar 100 milissegundos">${icon("step")}</button><span class="toolbar-divider"></span><button id="new-batch" class="icon-button" aria-label="Preparar novo lote">${icon("reset")}</button></div><div class="simulation-settings"><label class="scope-label"><span class="sr-only">Abrangência da simulação</span><select id="scope"><option value="bench">Bancada individual</option><option value="line">Linha integrada</option></select></label><label><span class="sr-only">Velocidade da simulação</span><select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div></div>
      <section class="viewport" aria-label="Visualização tridimensional do equipamento"><div class="scene-host"><canvas id="world" aria-label="Equipamento industrial 3D. Arraste para girar, use a roda para aproximar e clique nos sensores para inspecionar." tabindex="0"></canvas></div><div class="scene-heading"><span class="section-counter" id="environment-number"></span><h1 id="environment-title"></h1><p id="machine-title"></p></div><div class="camera-tools" role="group" aria-label="Câmeras"><button data-camera="iso" aria-label="Câmera isométrica">${icon("cube")}</button><button data-camera="front" class="active" aria-label="Câmera frontal">${icon("front")}</button><button data-camera="top" aria-label="Câmera superior">${icon("top")}</button><span></span><button id="zoom-in" aria-label="Aproximar">${icon("plus")}</button><button id="zoom-out" aria-label="Afastar">${icon("minus")}</button></div><div class="process-hotspots" aria-hidden="true"><span id="hotspot-0">1 · Entrada</span><span id="hotspot-1">2 · Equipamento</span><span id="hotspot-2">3 · Saída</span></div><button id="scene-action" class="primary scene-action">Inserir unidade</button><div id="receiving-feedback" class="receiving-feedback" hidden><strong id="receiving-title"></strong><span id="receiving-detail"></span><progress id="receiving-progress" max="1" value="0" aria-label="Progresso da conferência"></progress></div><div class="viewport-state"><span id="run-indicator"></span><span id="scene-state">Pronto para iniciar</span></div><div class="scene-bottom"><div class="scene-hint">Arraste para girar · Role para aproximar</div><div class="scene-metrics"><div><span>Na entrada</span><strong id="queue-count">0</strong></div><div><span>Em processo</span><strong id="wip-count">0</strong></div><div><span>Concluídas</span><strong id="done-count">0</strong></div></div></div><div id="render-error" hidden><strong>Não foi possível abrir o ambiente 3D.</strong><p>Recarregue a página em um navegador com WebGL 2.</p><button id="retry">Recarregar</button></div></section>
      <div class="process-strip" aria-label="Fluxo logístico">${ENVIRONMENTS.map((e, i) => `<button data-environment="${e.id}" aria-label="Visualizar ${e.name}"><span>${String(i + 1).padStart(2, "0")}</span><span>${e.short}</span><b id="process-${e.id}">0</b></button>`).join("")}</div>
    </main>
    <aside class="inspector" aria-label="Painel do simulador"><div class="inspector-tabs" role="tablist"><button role="tab" data-tab="operation" aria-controls="panel-operation" aria-selected="true">Operação</button><button role="tab" data-tab="signals" aria-controls="panel-signals" aria-selected="false">Sinais</button><button role="tab" data-tab="practice" aria-controls="panel-practice" aria-selected="false">Prática</button></div>
      <section id="panel-operation" class="inspector-panel" role="tabpanel"><section class="product-picker" aria-label="Escolha sua panela"><div class="panel-heading"><h2>Qual panela vamos produzir?</h2></div><div class="product-options">${PRODUCTS.map((p) => `<button data-product="${p.id}" aria-pressed="${p.id === PRODUCTS[0].id}">${productIcon(p)}<span><strong>${p.name}</strong><small>${p.size}</small></span></button>`).join("")}</div><p id="product-description" class="muted"></p><p class="product-note">Trocar o modelo prepara um novo lote.</p></section><div class="interaction-card"><span id="action-state">Sua vez</span><button id="execute-action" class="primary">Inserir unidade</button><progress id="action-progress" max="1" value="0" aria-label="Progresso da ação"></progress><p id="action-help"></p></div><div class="panel-heading"><h2>Modo de operação</h2></div><div class="mode-selector" role="group" aria-label="Modo de operação"><button data-mode="guided" aria-pressed="true">Interativo</button><button data-mode="auto" aria-pressed="true">Automático</button><button data-mode="manual" aria-pressed="false">Manual</button></div><p id="mode-description" class="muted"></p><div class="panel-section"><div class="panel-heading"><h2>Atuadores</h2><span id="manual-badge">Controle automático</span></div><div class="actuator-list">${[
        ["motor", "Q.0", "Transportador"],
        ["work", "Q.1", "Processo da máquina"],
        ["transfer", "Q.2", "Transferência"],
      ]
        .map(
          ([key, address, name]) =>
            `<button data-command="${key}" class="actuator" aria-pressed="false"><span class="io-address" data-output-address="${key}">${address}</span><span>${name}</span><span class="toggle-switch"></span></button>`,
        )
        .join(
          "",
        )}</div><p class="control-caption" id="manual-help"></p></div><div class="panel-section"><h2>Condições do ambiente</h2><label class="condition"><span>Proteção fechada</span><input id="guard" type="checkbox" checked></label><label class="condition"><span>Simular saída obstruída</span><input id="fault" type="checkbox"></label></div><div class="safety-area"><button id="emergency"><span class="emergency-symbol"></span>Parada de emergência</button><button id="acknowledge" hidden>Rearmar segurança</button><p id="safety-message">Interrompe todos os atuadores da linha.</p></div></section>
      <section id="panel-signals" class="inspector-panel" role="tabpanel" hidden><h2>Entradas digitais</h2><p class="muted">Estados dos sensores do ambiente selecionado.</p><div class="signal-table">${[
        ["entry", "Sensor de entrada"],
        ["positioned", "Peça posicionada"],
        ["exit", "Sensor de saída"],
        ["guard", "Proteção fechada"],
        ["stroke", "Fim de curso"],
      ]
        .map(
          ([key, name], i) =>
            `<div class="signal-row" id="signal-${key}"><span class="io-address" data-input-address="${key}">I.${i}</span><span>${name}</span><b id="input-${key}">0</b></div>`,
        )
        .join(
          "",
        )}</div><div class="panel-section"><h2>Saídas digitais</h2><div class="signal-table">${[
        ["motor", "Transportador"],
        ["work", "Processo"],
        ["transfer", "Transferência"],
      ]
        .map(
          ([key, name], i) =>
            `<div class="signal-row"><span class="io-address" data-output-address="${key}">Q.${i}</span><span>${name}</span><b id="output-${key}">0</b></div>`,
        )
        .join(
          "",
        )}</div></div><p class="io-note">Monitoramento virtual. Esta versão funciona no navegador, sem conexão com CLP externo.</p></section>
      <section id="panel-practice" class="inspector-panel" role="tabpanel" hidden><h2>Prática sugerida</h2><p id="exercise" class="exercise-text"></p><div class="practice-steps"><div><span>1</span>Conduza as etapas no modo interativo.</div><div><span>2</span>Relacione os sensores com os atuadores.</div><div><span>3</span>Experimente o modo manual e os intertravamentos.</div></div><div class="panel-section"><h2>Registro de eventos</h2><ol id="event-list" class="event-list"></ol></div></section>
      <div class="inspector-summary"><span>Lote</span><strong id="batch-progress">0 / 12</strong><div class="batch-track"><span id="batch-bar"></span></div></div>
    </aside>
  </div>
  <footer class="statusbar"><div><span id="global-status-dot"></span><span id="global-status">Pronto</span></div><div><span id="scope-status">Bancada individual</span><span class="footer-divider"></span><span>Tempo simulado <b id="simulation-clock">00:00</b></span></div><span class="prototype-label">Protótipo didático</span></footer>
  <dialog id="batch-dialog"><form id="batch-form"><button type="button" id="cancel-batch" class="dialog-close" aria-label="Fechar">×</button><h2>Preparar novo lote</h2><p>Os contadores e o estado dos equipamentos serão reiniciados.</p><label>Quantidade de unidades<input id="batch-size" type="number" min="1" max="50" value="12" required></label><button type="submit" class="primary">Preparar lote</button></form></dialog>`;
}
