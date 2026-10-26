let resources;
const loadResources = () =>
  (resources ??= Promise.all([
    import("./lab-scene.js"),
    import("./simulation.js"),
    import("./industries/definitions.js"),
    import("./industries/factory-models.js"),
    import("./industries/industry-session.js"),
  ]));

// Each preview is rendered by the very same scene and models as its laboratory,
// then cached as an image. No simulation, account or saved checkpoint is changed.
export function installHubPreviews(root = document) {
  let queue = Promise.resolve(),
    stopped = false,
    activeView = null;
  const ready = new WeakMap();
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      activeView?.dispose();
      activeView = null;
    },
    { once: true },
  );
  function request(card) {
    if (ready.has(card)) return ready.get(card);
    const task = queue.then(async () => {
      const [sceneModule, simulation, definitions, models, sessions] =
        await loadResources();
      if (stopped) return;
      if (!["cookware", "beverages"].includes(card.dataset.industry)) return;
      const id = card.dataset.industry,
        host = card.querySelector(".hub-art"),
        canvas = document.createElement("canvas");
      canvas.className = "hub-preview-canvas";
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
      let view;
      try {
        const step = {
          cookware: "production",
          beverages: "wash",
        }[id];
        if (id === "cookware") {
          view = sceneModule.createLabScene(canvas);
          activeView = view;
          view.select(step);
          const engine = simulation.createSimulation(1, {
            scope: "bench",
            environment: step,
            mode: "auto",
          });
          engine.start();
          for (let i = 0; i < 1000; i++) {
            engine.step(0.025);
            const state = engine.snapshot,
              cell = state.cells.find((c) => c.id === step);
            if (cell.stage?.id === "draw" && cell.stage.progress >= 0.45) {
              view.update(cell, 0, false, false, "bench");
              break;
            }
          }
        } else {
          const definition = {
            beverages: definitions.BEVERAGES,
          }[id];
          const build = {
            beverages: models.buildBeveragesModel,
          }[id];
          view = sceneModule.createLabScene(
            canvas,
            () => {},
            () => {},
            { definition, product: definition.products[0], build },
          );
          activeView = view;
          view.select(step);
          const engine = sessions.createIndustrySession(definition);
          engine.selectEnvironment(step);
          engine.setQuantity(1);
          engine.start();
          for (let i = 0; i < 1000; i++) {
            engine.tick(0.025);
            const state = engine.snapshot;
            if (state.phase === "operating" && state.progress >= 0.53) {
              view.update(state, 0, state.running, false, "bench");
              break;
            }
          }
        }
        if (stopped) return;
        view.render();
        const image = new Image();
        image.className = "hub-preview-image";
        image.alt = `Prévia 3D de ${card.querySelector("h2").textContent}`;
        image.src = canvas.toDataURL("image/webp", 0.88);
        host.append(image);
        card.classList.add("preview-ready");
      } catch (error) {
        console.warn("Prévia indisponível; ilustração mantida.", error);
      } finally {
        view?.dispose();
        activeView = null;
        canvas.remove();
      }
    });
    ready.set(card, task);
    queue = task.catch(() => {});
    return task;
  }
  for (const card of root.querySelectorAll(".hub-card")) {
    card.addEventListener("mouseenter", () => request(card));
    card.addEventListener("focusin", () => request(card));
  }
  if (matchMedia("(hover: none)").matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            request(entry.target);
            observer.unobserve(entry.target);
          }
      },
      { rootMargin: "100px" },
    );
    root
      .querySelectorAll(".hub-card")
      .forEach((card) => observer.observe(card));
    window.addEventListener("pagehide", () => observer.disconnect(), {
      once: true,
    });
  }
}
