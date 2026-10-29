const COOKWARE_STAGES = [
  "receiving",
  "raw",
  "production",
  "finishing",
  "quality",
  "packing",
  "finished",
  "shipping",
];
const BEVERAGE_STAGES = [
  "receive",
  "wash",
  "fill",
  "cap",
  "label",
  "pack",
  "seal",
  "ship",
];
const ordinal = (id) =>
  Number(String(id).match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);

// Observe identities and station ownership, never timers or camera selection.
// An older unit keeps the camera even while another unit enters the line.
export function createStageFollower({ environment = "cookware" } = {}) {
  const beverages = environment === "beverages";
  const stages = beverages ? BEVERAGE_STAGES : COOKWARE_STAGES;
  let target = null,
    desired = null,
    lastTime = null,
    lot = null;
  function reset() {
    target = null;
    desired = null;
    lastTime = null;
    lot = null;
  }
  return {
    reset,
    next(snapshot) {
      if (!snapshot || snapshot.scope !== "line" || snapshot.practice)
        return null;
      const time = snapshot.elapsed ?? snapshot.time ?? 0;
      const currentLot = snapshot.inventory?.lotId ?? snapshot.lotId ?? null;
      if (
        (lot !== null && currentLot !== lot) ||
        (lastTime !== null && time < lastTime)
      )
        reset();
      lot = currentLot;
      lastTime = time;
      if (snapshot.fulfillment)
        return snapshot.fulfillment.action === "ship"
          ? beverages
            ? "ship"
            : "shipping"
          : beverages
            ? "seal"
            : "finished";
      const active = beverages
        ? snapshot.stations
          ? Object.values(snapshot.stations)
              .filter((s) => s.hasMaterial && s.unit?.id)
              .map((s) => ({ id: s.unit.id, stage: s.step.id }))
          : snapshot.unit?.id &&
              snapshot.phase !== "complete" &&
              snapshot.hasMaterial !== false
            ? [{ id: snapshot.unit.id, stage: snapshot.step.id }]
            : []
        : (snapshot.cells ?? [])
            .filter((c) => c.unit?.id)
            .map((c) => ({ id: c.unit.id, stage: c.id }));
      const matches = () => active.filter((u) => u.id === target);
      const queued = () =>
        (snapshot.cells ?? []).some((c) => c.stockIds?.includes(target));
      if (!target || (!matches().length && !queued())) {
        const oldest = [...active].sort(
          (a, b) => ordinal(a.id) - ordinal(b.id) || a.id.localeCompare(b.id),
        )[0];
        if (oldest) {
          target = oldest.id;
          desired = null;
        }
      }
      const targetStages = matches()
        .map((u) => stages.indexOf(u.stage))
        .filter((i) => i >= 0);
      if (targetStages.length) {
        const candidate = Math.max(...targetStages);
        if (desired === null || candidate >= stages.indexOf(desired))
          desired = stages[candidate];
      }
      return desired;
    },
  };
}

// This preference changes only the caller's navigation. No simulation method is
// referenced here, so toggling cannot pause, reset, or accelerate production.
export function installStageFollowToggle({
  scopeControl,
  storageKey = "logistica.follow-stages",
  onChange,
} = {}) {
  if (!scopeControl?.ownerDocument)
    throw new Error("O seletor de abrangência é obrigatório.");
  const document = scopeControl.ownerDocument;
  const label = document.createElement("label");
  label.className = "follow-stages";
  label.title = "Acompanha a câmera nas etapas reais; não altera a produção.";
  label.style.alignItems = "center";
  label.style.gap = ".4rem";
  label.style.whiteSpace = "nowrap";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("aria-label", "Acompanhar etapas automaticamente");
  input.checked = true;
  let storage;
  try {
    storage = document.defaultView?.localStorage;
    const value = storage?.getItem(storageKey);
    input.checked = value !== "false" && value !== "0";
  } catch {}
  const text = document.createElement("span");
  text.textContent = "Acompanhar etapas";
  label.append(input, text);
  const scopeLabel = scopeControl.closest("label");
  (scopeLabel ?? scopeControl).after(label);
  input.addEventListener("change", () => {
    try {
      storage?.setItem(storageKey, String(input.checked));
    } catch {}
    onChange?.(input.checked);
  });
  return {
    get enabled() {
      return input.checked;
    },
    element: label,
    render(scope, practice = false) {
      const shown = scope === "line" && !practice;
      label.hidden = !shown;
      label.style.display = shown ? "inline-flex" : "none";
    },
    dispose() {
      label.remove();
    },
  };
}
