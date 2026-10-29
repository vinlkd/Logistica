import test from "node:test";
import assert from "node:assert/strict";
import {
  createStageFollower,
  installStageFollowToggle,
} from "../src/simulator/stage-follow.js";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { BEVERAGES } from "../src/simulator/industries/definitions.js";

for (const environment of ["cookware", "beverages"])
  test(`${environment}: acompanha as transições reais de uma unidade sem alterar o motor`, () => {
    const cookware = environment === "cookware";
    const engine = cookware
      ? createSimulation(1, { onDemand: true, scope: "line" })
      : createIndustrySession(BEVERAGES, { onDemand: true });
    if (!cookware) engine.setQuantity(1);
    if (cookware)
      for (const step of ENVIRONMENTS) engine.setMode(step.id, "auto");
    else engine.setMode("auto");
    engine.setSpeed(8);
    const follower = createStageFollower({ environment });
    const sequence = [];
    engine.start();
    for (let i = 0; i < 5000; i++) {
      cookware ? engine.step(0.1) : engine.tick(0.1);
      const state = engine.snapshot;
      const before = engine.exportState();
      const stage = follower.next(state);
      if (stage && sequence.at(-1) !== stage) sequence.push(stage);
      assert.deepEqual(
        engine.exportState(),
        before,
        "acompanhar não pode alterar o motor",
      );
      if (state.inventory?.counts.available === 1) break;
    }
    assert.deepEqual(
      sequence,
      cookware
        ? [
            "receiving",
            "raw",
            "production",
            "finishing",
            "quality",
            "packing",
            "finished",
          ]
        : ["receive", "wash", "fill", "cap", "label", "pack", "seal"],
    );
  });

test("mantém o alvo mais antigo e avança apenas sua etapa, mesmo com outras unidades concorrentes", () => {
  const follower = createStageFollower({ environment: "beverages" });
  const station = (stage, id) => ({
    step: { id: stage },
    unit: { id },
    hasMaterial: true,
  });
  const state = {
    scope: "line",
    elapsed: 1,
    stations: {
      receive: station("receive", "LOT-001"),
      label: station("label", "LOT-002"),
    },
  };
  assert.equal(follower.next(state), "receive");
  for (let i = 0; i < 20; i++)
    assert.equal(
      follower.next({
        ...state,
        elapsed: 2 + i,
        selected: i % 2 ? "label" : "receive",
      }),
      "receive",
    );
  const washing = {
    ...state,
    elapsed: 25,
    stations: {
      wash: station("wash", "LOT-001"),
      pack: station("pack", "LOT-002"),
      receive: station("receive", "LOT-003"),
    },
  };
  assert.equal(follower.next(washing), "wash");
  assert.equal(follower.next({ ...washing, running: false }), "wash");
  assert.equal(
    follower.next({
      ...washing,
      elapsed: 26,
      stations: {
        fill: station("fill", "LOT-001"),
        pack: station("pack", "LOT-002"),
      },
    }),
    "fill",
  );
  assert.equal(
    follower.next({
      ...washing,
      elapsed: 27,
      stations: { pack: station("pack", "LOT-002") },
    }),
    "pack",
  );
});

test("não pula para outra panela enquanto o alvo está aguardando na fila", () => {
  const follower = createStageFollower({ environment: "cookware" });
  const state = {
    scope: "line",
    time: 1,
    cells: [{ id: "receiving", unit: { id: "UT-001" } }],
  };
  assert.equal(follower.next(state), "receiving");
  assert.equal(
    follower.next({
      ...state,
      time: 2,
      cells: [
        { id: "raw", stockIds: ["UT-001"] },
        { id: "receiving", unit: { id: "UT-002" } },
      ],
    }),
    "receiving",
  );
  assert.equal(
    follower.next({
      ...state,
      time: 3,
      cells: [
        { id: "raw", unit: { id: "UT-001" } },
        { id: "receiving", unit: { id: "UT-002" } },
      ],
    }),
    "raw",
  );
});

test("bancada nunca acompanha; expedição real tem prioridade e novo lote reinicia o alvo", () => {
  for (const environment of ["cookware", "beverages"]) {
    const follower = createStageFollower({ environment });
    assert.equal(follower.next({ scope: "bench", practice: true }), null);
    assert.equal(follower.next({ scope: "line", practice: true }), null);
    assert.equal(
      follower.next({ scope: "line", fulfillment: { action: "pick" } }),
      environment === "beverages" ? "seal" : "finished",
    );
    assert.equal(
      follower.next({ scope: "line", fulfillment: { action: "ship" } }),
      environment === "beverages" ? "ship" : "shipping",
    );
  }
  const follower = createStageFollower({ environment: "cookware" });
  assert.equal(
    follower.next({
      scope: "line",
      time: 100,
      inventory: { lotId: "L1" },
      cells: [{ id: "finished", unit: { id: "UT-001" } }],
    }),
    "finished",
  );
  assert.equal(
    follower.next({
      scope: "line",
      time: 101,
      inventory: { lotId: "L2" },
      cells: [{ id: "receiving", unit: { id: "UT-001" } }],
    }),
    "receiving",
  );
});

function toggleFixture(initial) {
  const values = new Map(initial === undefined ? [] : [["follow", initial]]);
  const makeElement = (tag) => ({
    tag,
    style: {},
    children: [],
    handlers: {},
    setAttribute(key, value) {
      this[key] = value;
    },
    append(...items) {
      this.children.push(...items);
    },
    addEventListener(key, handler) {
      this.handlers[key] = handler;
    },
    remove() {
      this.removed = true;
    },
  });
  const document = {
    createElement: makeElement,
    defaultView: {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    },
  };
  const scopeControl = {
    ownerDocument: document,
    closest: () => null,
    after(element) {
      this.next = element;
    },
  };
  return { scopeControl, values };
}
test("preferência do acompanhamento começa ligada, pode ser desligada e não muda ao ocultar a bancada", () => {
  const fixture = toggleFixture();
  const changes = [];
  const toggle = installStageFollowToggle({
    ...fixture,
    storageKey: "follow",
    onChange: (enabled) => changes.push(enabled),
  });
  assert.equal(toggle.enabled, true);
  toggle.render("line");
  assert.equal(toggle.element.hidden, false);
  const checkbox = toggle.element.children[0];
  checkbox.checked = false;
  checkbox.handlers.change();
  assert.deepEqual(changes, [false]);
  assert.equal(fixture.values.get("follow"), "false");
  toggle.render("bench", true);
  assert.equal(toggle.element.hidden, true);
  assert.equal(toggle.enabled, false);
  toggle.render("line");
  assert.equal(toggle.element.hidden, false);
  assert.equal(toggle.enabled, false);
  toggle.dispose();
  assert.equal(toggle.element.removed, true);
});
test("preferência desligada é recuperada; falha no armazenamento não bloqueia o controle", () => {
  const fixture = toggleFixture("false");
  assert.equal(
    installStageFollowToggle({ ...fixture, storageKey: "follow" }).enabled,
    false,
  );
  Object.defineProperty(
    fixture.scopeControl.ownerDocument.defaultView,
    "localStorage",
    {
      get() {
        throw new Error("disabled");
      },
    },
  );
  assert.equal(
    installStageFollowToggle({ ...fixture, storageKey: "follow" }).enabled,
    true,
  );
});
