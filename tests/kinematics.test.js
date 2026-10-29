import {
  RAW_PILE_X,
  getRawStock,
  getNextRawPickup,
} from "../src/simulator/raw-stock.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
import { PRODUCTS } from "../src/simulator/products.js";
import {
  getLayout,
  boundsForPose,
  overlaps,
  CONVEYOR_TOP,
  CLEARANCE,
  YAW,
} from "../src/simulator/kinematics.js";
import { getPresentation } from "../src/simulator/presentation.js";

const near = (a, b, message = "") =>
  assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} versus ${b}`);
function cell(product, id, step, t, extra = {}) {
  return {
    id,
    phase: "processing",
    progress: 0.5,
    done: 0,
    unit: {
      id: "UT-001",
      product: product.id,
      material:
        id === "raw"
          ? "checked-disc"
          : id === "production"
            ? "formed-pot"
            : "boxed-pot",
    },
    stage: { id: step, progress: t },
    ...extra,
  };
}
const pose = (product, id, step, t, extra) =>
  getPresentation(cell(product, id, step, t, extra), product.id);

test("ângulo do produto mantém cabo perpendicular à direção do transporte", () =>
  near(YAW, Math.PI / 2));

for (const product of PRODUCTS) {
  test(`${product.name}: embalagem inclui corpo e cabos com folga em todos os lados`, () => {
    const l = getLayout(product.id),
      p = l.package,
      f = l.footprint;
    near(l.yaw, Math.PI / 2);
    assert.ok(-p.width / 2 <= f.minX - 0.119);
    assert.ok(p.width / 2 >= f.maxX + 0.119);
    assert.ok(p.centerZ - p.depth / 2 <= f.minZ - 0.119);
    assert.ok(p.centerZ + p.depth / 2 >= f.maxZ + 0.119);
    assert.ok(p.height >= product.height - l.potBottom + 0.189);
    assert.ok(l.opening.minZ < p.centerZ - p.depth / 2);
    assert.ok(l.opening.maxZ > p.centerZ + p.depth / 2);
  });

  test(`${product.name}: disco e panela mantêm fundo na superfície de apoio durante a conformação`, () => {
    for (const t of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
      const p = pose(product, "production", "draw", t, {
        unit: { product: product.id, material: "sorted-disc" },
      });
      near(p.y + 0.21 - 0.39 * p.form, p.support + CLEARANCE, "datum do fundo");
      near(
        boundsForPose(p, product.id).minY,
        p.support + CLEARANCE,
        "limite inferior",
      );
      assert.ok(p.support <= CONVEYOR_TOP + 1e-8);
    }
    const flat = pose(product, "production", "down", 1, {
      unit: { product: product.id, material: "sorted-disc" },
    });
    near(flat.form, 0);
    near(flat.y + 0.21, CONVEYOR_TOP + CLEARANCE);
    const formed = pose(product, "production", "eject", 1);
    near(formed.form, 1);
    near(formed.y - 0.18, CONVEYOR_TOP + CLEARANCE);
  });

  test(`${product.name}: produção retorna punção e ejeta antes da montagem dos cabos`, () => {
    for (const [a, b] of [
      ["draw", "up"],
      ["up", "eject"],
    ]) {
      const end = pose(product, "production", a, 1),
        start = pose(product, "production", b, 0);
      for (const key of ["x", "y", "z", "support", "headY"])
        near(end[key], start[key], `${a}/${b} ${key}`);
    }
  });

  for (const id of ["finished"])
    test(`${product.name}: ${id} conserva posição e apoio nas fronteiras de armazenar e recuperar`, () => {
      for (const [a, b] of [
        ["raise", "store"],
        ["store", "retrieve"],
        ["retrieve", "lower"],
      ]) {
        const end = pose(product, id, a, 1),
          start = pose(product, id, b, 0);
        for (const key of ["x", "y", "z", "support", "forkZ", "forkLift"])
          near(end[key], start[key], `${id} ${a}/${b} ${key}`);
      }
      const onShelf = pose(product, id, "store", 1),
        underPart = pose(product, id, "retrieve", 0.45);
      near(onShelf.z, -3.6);
      near(onShelf.support + CLEARANCE, CONVEYOR_TOP + 1.6);
      near(onShelf.lift, 1.6 - CLEARANCE);
      near(underPart.z, onShelf.z);
      near(underPart.lift, onShelf.lift);
      const p = pose(product, id, "lower", 1);
      near(p.support, CONVEYOR_TOP);
      near(p.z, 0);
    });

  test(`${product.name}: raw reserva disco na prateleira e aproxima garfos vazios antes de retirar`, () => {
    const initial = pose(product, "raw", "feed", 0, {
      phase: "feeding",
      progress: 0,
      queue: 5,
    });
    near(initial.x, -2.8);
    near(initial.z, -3.6 + getLayout(product.id).package.centerZ);
    near(
      initial.y + 0.21,
      getRawStock(cell(product, "raw", "feed", 0, { queue: 5 }), product)
        .planeY,
    );
    near(initial.forkZ, 0);
    near(initial.forkLift, 0);
    for (const t of [0, 0.2, 0.6, 0.8, 1]) {
      const raised = pose(product, "raw", "raise", t);
      near(raised.z, -3.6);
      near(raised.lift, 1.6);
      near(raised.support, CONVEYOR_TOP + 1.6);
      if (t <= 0.6) near(raised.forkZ, 0);
      else near(raised.forkLift, 1.6);
    }
    const touching = pose(product, "raw", "retrieve", 0);
    near(touching.forkZ, touching.z);
    near(touching.forkLift, touching.lift);
    for (const t of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
      const taken = pose(product, "raw", "retrieve", t);
      near(taken.forkZ, taken.z);
      near(taken.forkLift, taken.lift);
      near(boundsForPose(taken, product.id).minY, taken.support + CLEARANCE);
      if (t <= 0.25) near(taken.z, -3.6);
      else near(taken.lift, 1.64);
    }
    const boundaries = [
      ["feed", "locate"],
      ["locate", "raise"],
      ["raise", "retrieve"],
      ["retrieve", "lower"],
      ["lower", "transfer"],
    ];
    for (const [a, b] of boundaries) {
      const end = pose(
        product,
        "raw",
        a,
        1,
        a === "feed" ? { phase: "feeding", progress: 0.5 } : {},
      );
      const start = pose(
        product,
        "raw",
        b,
        0,
        b === "transfer" ? { phase: "unloading", progress: 0.5 } : {},
      );
      for (const key of ["x", "y", "z", "support", "forkZ", "forkLift"])
        near(end[key], start[key], `${a}/${b} ${key}`);
    }
  });

  test(`${product.name}: doze caixas usam três níveis e quatro posições sem sobreposição de carga ou trajetória`, () => {
    const finals = [];
    for (let done = 0; done < 12; done++) {
      const end = pose(product, "shipping", "transfer", 1, {
        done,
        phase: "unloading",
        progress: 1,
      });
      const bounds = boundsForPose(end, product.id);
      for (const previous of finals)
        assert.equal(
          overlaps(bounds, previous),
          false,
          `caixa ${done} sobre caixa anterior`,
        );
      for (let i = 0; i <= 100; i++) {
        const progress = 0.9 + (0.1 * i) / 100;
        const moving = pose(product, "shipping", "transfer", i / 100, {
          done,
          phase: "unloading",
          progress,
        });
        for (const previous of finals)
          assert.equal(
            overlaps(boundsForPose(moving, product.id), previous, 0.000001),
            false,
            `trajeto caixa ${done}, amostra ${i}`,
          );
      }
      finals.push(bounds);
    }
    assert.equal(new Set(finals.map((b) => b.minX.toFixed(6))).size, 4);
    assert.equal(new Set(finals.map((b) => b.minY.toFixed(6))).size, 3);
    const lastPose = pose(product, "shipping", "transfer", 0, {
      phase: "unloading",
      progress: 0.9,
      done: 11,
    });
    near(lastPose.x, 3.48);
    near(lastPose.support, CONVEYOR_TOP);
  });

  test(`${product.name}: poses são determinísticas e não alteram o estado pausado`, () => {
    for (const id of [
      "production",
      "raw",
      "finished",
      "shipping",
      "finishing",
      "quality",
    ]) {
      const source = cell(
        product,
        id,
        id === "quality"
          ? "check"
          : id === "finishing"
            ? "polish"
            : id === "raw" || id === "finished"
              ? "retrieve"
              : "up",
        0.53,
      );
      const before = JSON.stringify(source),
        a = getPresentation(source, product.id),
        b = getPresentation(source, product.id);
      assert.deepEqual(a, b);
      assert.equal(JSON.stringify(source), before);
      for (const [key, value] of Object.entries(a))
        if (typeof value === "number")
          assert.ok(Number.isFinite(value), `${id}.${key}`);
    }
  });
}

test("raw retira sem guardar e lote integrado de doze unidades conserva rastreabilidade", () => {
  assert.deepEqual(
    ENVIRONMENTS.find((e) => e.id === "raw").recipe.map((s) => s.id),
    ["locate", "raise", "retrieve", "lower"],
  );
  const sim = createSimulation(12, { scope: "line", mode: "auto" });
  sim.setSpeed(4);
  sim.start();
  for (let i = 0; i < 12000 && sim.snapshot.running; i++) {
    sim.step(0.05);
    const state = sim.snapshot;
    assert.equal(
      state.cells.reduce((n, c) => n + c.queue + Number(c.part), 0) +
        state.completedUnits.length,
      12,
    );
  }
  const state = sim.snapshot;
  assert.equal(state.done, 12);
  assert.equal(new Set(state.completedUnits.map((u) => u.id)).size, 12);
  for (const unit of state.completedUnits)
    assert.deepEqual(
      unit.history.filter((h) => h.environment === "raw").map((h) => h.step),
      ["locate", "raise", "retrieve", "lower"],
    );
});

for (const product of PRODUCTS)
  test(`${product.name}: magnetic loader carries pile top to shelf without moving before capture`, () => {
    const l = getLayout(product.id);
    for (const queue of [0, 5, 11]) {
      const start = pose(product, "raw", "feed", 0, {
        phase: "feeding",
        progress: 0,
        queue,
      });
      for (const t of [0, 0.1, 0.15, 0.25, 0.35, 0.5, 0.65, 0.7, 0.8, 0.9, 1]) {
        const p = pose(product, "raw", "feed", t, {
          phase: "feeding",
          progress: t * 0.5,
          queue,
        });
        if (t <= 0.15) {
          near(p.x, start.x);
          near(p.z, start.z);
          near(p.y, start.y);
        }
        if (t >= 0.15 && t < 1) {
          assert.equal(p.loaderCaught, true);
          near(p.loaderX, p.x);
          near(p.loaderZ, p.z);
          near(p.loaderY, p.y + 0.21);
        }
        if (t > 0.35 && t < 0.8) near(p.support, CONVEYOR_TOP + 1.6 + 0.35);
        if (t > 0.35 && t < 0.65) near(p.z, -3.6 + l.package.centerZ);
      }
      for (const t of [0.15, 0.35, 0.65, 0.8]) {
        const a = pose(product, "raw", "feed", t - 1e-6, {
          phase: "feeding",
          progress: (t - 1e-6) * 0.5,
          queue,
        });
        const b = pose(product, "raw", "feed", t + 1e-6, {
          phase: "feeding",
          progress: (t + 1e-6) * 0.5,
          queue,
        });
        for (const key of ["x", "y", "z", "loaderX", "loaderY", "loaderZ"])
          assert.ok(Math.abs(a[key] - b[key]) < 0.001);
      }
    }
    const placed = pose(product, "raw", "feed", 1, {
      phase: "feeding",
      progress: 0.5,
      queue: 5,
    });
    const released = pose(product, "raw", "locate", 0),
      parked = pose(product, "raw", "locate", 1),
      raise = pose(product, "raw", "raise", 0);
    for (const key of [
      "x",
      "y",
      "z",
      "support",
      "loaderX",
      "loaderY",
      "loaderZ",
    ])
      near(placed[key], released[key]);
    for (const key of ["loaderX", "loaderY", "loaderZ"])
      near(parked[key], raise[key]);
    near(placed.support, CONVEYOR_TOP + 1.6);
    assert.equal(released.loaderCaught, false);
    near(
      parked.loaderX,
      getNextRawPickup(cell(product, "raw", "locate", 1), product).pickupX,
    );
    near(parked.loaderZ, -3.6 + l.package.centerZ);
  });

test("raw feeding takes over four seconds and does not progress after pause", () => {
  const sim = createSimulation(1, { scope: "bench", environment: "raw" });
  sim.start();
  for (let i = 0; i < 60; i++) sim.step(0.05);
  const current = sim.snapshot.cells[1];
  assert.equal(current.phase, "feeding");
  const before = getPresentation(current);
  sim.stop();
  for (let i = 0; i < 20; i++) sim.step(0.05);
  assert.deepEqual(getPresentation(sim.snapshot.cells[1]), before);
  sim.start();
  for (let i = 0; i < 25; i++) sim.step(0.05);
  assert.equal(sim.snapshot.cells[1].phase, "processing");
});

test("four raw piles use exact stock IDs rather than the total queue height", () => {
  assert.deepEqual([...RAW_PILE_X], [-2.8, -4.55, 2.8, 4.55]);
  const stockIds = ["UT-005", "UT-009", "UT-002", "UT-007", "UT-011", "UT-004"];
  for (let n = 1; n <= 4; n++) {
    const unit = {
      id: `UT-00${n}`,
      material: "checked-disc",
      product: "saucepan",
    };
    const c = {
      id: "raw",
      phase: "feeding",
      progress: 0,
      queue: stockIds.length,
      stockIds,
      unit,
      stage: { id: "feed", progress: 0 },
    };
    const r = getRawStock(c, "saucepan"),
      p = getPresentation(c);
    assert.deepEqual(r.counts, [2, 1, 2, 1]);
    assert.equal(r.pile, n - 1);
    near(p.x, RAW_PILE_X[n - 1]);
    near(p.y + 0.21, 0.8545 + r.counts[n - 1] * 0.026 + 0.0125);
    near(p.loaderX, p.x);
    const end = getPresentation({
      ...c,
      progress: 0.5,
      stage: { id: "feed", progress: 1 },
    });
    near(end.x, 0);
    near(end.z, -3.6);
    near(end.support, CONVEYOR_TOP + 1.6);
    const next = getPresentation({
      ...c,
      phase: "processing",
      stage: { id: "locate", progress: 0 },
    });
    for (const key of ["x", "y", "z", "loaderX", "loaderY", "loaderZ"])
      near(end[key], next[key]);
    const parked = getPresentation({
      ...c,
      phase: "processing",
      stage: { id: "locate", progress: 1 },
    });
    near(parked.loaderX, getNextRawPickup(c, "saucepan").pickupX);
  }
});

test("raw snapshot excludes the active disk from the exact remaining pile IDs", () => {
  const sim = createSimulation(12, { scope: "bench", environment: "raw" });
  sim.start();
  sim.step(0.025);
  const c = sim.snapshot.cells[1];
  assert.equal(c.unit.id, "UT-001");
  assert.equal(c.stockIds.length, 11);
  assert.equal(c.stockIds.includes(c.unit.id), false);
  assert.deepEqual(getRawStock(c, "saucepan").counts, [2, 3, 3, 3]);
  const copy = sim.snapshot.cells[1].stockIds;
  copy.pop();
  assert.equal(sim.snapshot.cells[1].stockIds.length, 11);
});
