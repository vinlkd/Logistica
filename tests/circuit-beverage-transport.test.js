import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildCircuitZWorld } from "../src/simulator/circuit-z-world.js";
import { createBeverageURuntime } from "../src/simulator/circuit-beverage-u-runtime.js";

function assertPointsClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((point, index) =>
    point.forEach((value, axis) =>
      assert.ok(Math.abs(value - expected[index][axis]) < 1e-8),
    ),
  );
}

test("todas as transferências de garrafas têm roletes ou correia visível", () => {
  const previousDocument = globalThis.document;
  globalThis.document ??= {
    createElement: () => ({
      getContext: () =>
        new Proxy({ measureText: () => ({ width: 0 }) }, {
          get: (context, key) => context[key] ?? (() => {}),
        }),
    }),
  };
  const world = buildCircuitZWorld("beverages");
  const { connectors, stages } = world.plan;
  const { demos } = world.diagnostics();
  const runtime = createBeverageURuntime(world);
  assert.equal(runtime.blockedReason, "");
  const expected = [
    ["receive", "wash", "belt"],
    ["wash", "fill", "rollers"],
    ["fill", "cap", "rollers"],
    ["cap", "label", "belt"],
    ["label", "pack", "rollers"],
  ];

  assert.equal(connectors.length, expected.length);
  expected.forEach(([from, to, kind], index) => {
    const connector = connectors[index];
    assert.deepEqual([connector.from, connector.to, connector.kind], [from, to, kind]);
    const demo = demos[index];
    assert.ok(demo.samples.length > 1, `${from} → ${to} precisa ter um trajeto real`);
    assert.ok(demo.group.children.length > 0, `${from} → ${to} precisa de equipamento visível`);
    const start = stages.find((stage) => stage.stage === from);
    const end = stages.find((stage) => stage.stage === to);
    assert.ok(start && end);
    if (kind === "rollers") {
      assert.ok(demo.rollers.length > 0, `${from} → ${to} sem roletes de ligação`);
      assert.ok(demo.group.children.some((part) => part.name === "Pé da ligação de roletes"));
      assert.ok(demo.rollers.every((roller) => Math.abs(roller.position.y - (connector.floorY + 1.145)) < 1e-8));
    }
    if (from === "cap") {
      assert.ok(demo.group.children.some((part) => part.name === "Correia demonstrativa contínua"));
      assert.ok(demo.group.children.filter((part) => part.name === "Guia lateral da correia").length >= 2);
      assert.ok(demo.group.getObjectByName("Roletes de acionamento da correia inclinada"));
      assert.ok(Math.abs(demo.samples[0].y - demo.samples.at(-1).y) > 1);
      const rollers = demo.group.getObjectByName("Roletes de acionamento da correia inclinada");
      const matrix = new THREE.Matrix4();
      assert.ok(rollers.count > 100, "a correia inclinada precisa de roletes distribuídos");
      for (let i = 0; i < rollers.count; i++) {
        rollers.getMatrixAt(i, matrix);
        assert.ok(matrix.elements.every(Number.isFinite), "rolete da rampa com orientação inválida");
      }
      const previous = [];
      for (let step = 0; step <= 100; step++) {
        const transfer = runtime.beverageTransfer(to, {
          phase: "moving",
          progress: step / 100,
          hasMaterial: true,
        });
        assert.ok(transfer);
        assert.ok(transfer.point.toArray().every(Number.isFinite));
        assert.ok(transfer.normal.toArray().every(Number.isFinite));
        if (previous.length) assert.ok(transfer.point.distanceTo(previous[0]) < 3);
        previous[0] = transfer.point;
      }
    }
  });

  assertPointsClose(connectors[0].points, [
    [stages[0].x + 4.8, stages[0].y + 1.22, stages[0].z],
    [stages[1].x - 4.8, stages[1].y + 1.22, stages[1].z],
  ]);
  assertPointsClose([connectors[3].points[0]], [[stages[3].x + 4.8, stages[3].y + 1.22, stages[3].z]]);
  assertPointsClose([connectors[3].points.at(-1)], [[stages[4].x + 4.8, 1.22, stages[4].z]]);
  assertPointsClose(connectors[4].points, [
    [stages[4].x - 4.8, 1.22, stages[4].z],
    [stages[5].x + 4.8, 1.22, stages[5].z],
  ]);
  assert.ok(stages.every((stage) => stage.y === stages[0].y || stage.y === 0));
  if (previousDocument === undefined) delete globalThis.document;
});
