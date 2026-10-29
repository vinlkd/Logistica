import { validateProgressState } from "../src/progress-format.js";
import {
  bottleCasePose,
  caseApproachPose,
} from "../src/simulator/industries/bottle-cases.js";
import test from "node:test";
import assert from "node:assert/strict";
import {bottleCaseTransferState} from '../src/simulator/industries/bottle-case-transfer.js';
import * as THREE from "three";
import {
  BEVERAGES,
  CONVEYOR_LINEAR_SPEED,
} from "../src/simulator/industries/definitions.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { stationPresentation } from "../src/simulator/industries/station-presentation.js";
import {
  createBottleFluid,
  setBottleFluidAmount,
  bottleLiquidLevel,
  bottleInnerRadius,
  getFillPose,
} from "../src/simulator/industries/bottle-fluid.js";
import { getRinsePose } from "../src/simulator/industries/bottle-rinser.js";
import {
  missionDefinition,
  missionEvidence,
  createMission,
} from "../src/simulator/missions.js";
test("líquido sobe desde o fundo, cabe dentro do ombro e deixa espaço sob a tampa", () => {
  const fluid = createBottleFluid(THREE, new THREE.MeshStandardMaterial());
  let previous = 0.025;
  for (let k = 0; k <= 100; k++) {
    const f = k / 100;
    setBottleFluidAmount(fluid, f);
    const level = bottleLiquidLevel(f);
    assert.ok(level >= previous - 1e-8);
    previous = level;
    const a = fluid.children[0].geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i),
        radius = Math.hypot(a.getX(i), a.getZ(i));
      assert.ok(y >= 0.02499 && y <= level + 0.00001);
      assert.ok(radius <= bottleInnerRadius(y) + 0.00001);
    }
  }
  assert.ok(previous > 0.83 && previous < 0.85);
  assert.ok(1 - previous > 0.1);
  for (let k = 0; k <= 100; k++) {
    const p = getFillPose(k / 100);
    if (p.flowing) {
      assert.ok(p.nozzleTip >= 2.225 - 1e-9);
      assert.ok(p.nozzleTip > 1.2 + p.level);
    }
  }
});
test("lavagem mantém a garra e a lança no gargalo, aspira antes de retirar", () => {
  let prev = getRinsePose(0);
  for (let i = 1; i <= 2000; i++) {
    const p = getRinsePose(i / 2000);
    assert.equal(p.angle, 0);
    assert.equal(p.baseY, 1.2);
    if (p.nozzleTip < 2.2) assert.ok(p.grip > 0.999);
    assert.ok(Math.abs(p.nozzleTip - prev.nozzleTip) < 0.03);
    if (i / 2000 > 0.82) assert.ok(p.waterLevel < 0.026);
    prev = p;
  }
  assert.deepEqual(prev, getRinsePose(0));
});
test("esteira mantém mesma velocidade física em todas as bancadas e na linha sem easing após metade", () => {
  for (const scope of ["bench", "line"]) {
    const s = createIndustrySession(BEVERAGES);
    s.setScope(scope);
    if (scope === "bench") s.selectEnvironment("label");
    s.setQuantity(1);
    s.start();
    let previous;
    const seen = new Set();
    for (let i = 0; i < 20000; i++) {
      s.tick(0.025);
      const state = s.snapshot;
      if (state.phase === "complete") break;
      if (
        state.phase === "moving" &&
        !state.unit.packed &&
        state.step.id !== "receive"
      ) {
        const x =
          scope === "line"
            ? stationPresentation(state, BEVERAGES, state.step.id).state
                .position.x
            : state.position.x;
        if (
          previous &&
          previous.id === state.step.id &&
          previous.unit === state.unit.id
        ) {
          assert.ok(
            Math.abs((x - previous.x) / 0.025 - CONVEYOR_LINEAR_SPEED) < 1e-6,
          );
          seen.add(state.step.id);
        }
        previous = { id: state.step.id, unit: state.unit.id, x };
      } else previous = null;
    }
    assert.ok(seen.has("label"));
  }
});
for (const qty of [1, 9, 12, 30])
  test(`${qty} garrafas selam/expedem apenas caixas completas ou a última parcial`, () => {
    const s = createIndustrySession(BEVERAGES);
    s.setScope("line");
    s.setQuantity(qty);
    s.start();
    for (let i = 0; i < 50000 && s.snapshot.phase !== "complete"; i++)
      s.tick(0.25);
    const end = s.snapshot;
    assert.equal(end.done, qty);
    assert.equal(
      end.history.filter((h) => h.step === "seal").length,
      Math.ceil(qty / 9),
    );
    assert.equal(
      end.history.filter((h) => h.step === "ship").length,
      Math.ceil(qty / 9),
    );
    assert.ok(
      end.completedUnits.every(
        (u) =>
          u.packed &&
          u.caseSealed &&
          u.caseTaped &&
          u.caseIdentified &&
          u.shipped,
      ),
    );
    if (qty === 12) {
      const def = missionDefinition("beverages", BEVERAGES.steps, 12),
        mission = createMission(def);
      mission.start("juice");
      mission.observe(missionEvidence(end, def));
      assert.equal(mission.snapshot.completed, true);
      assert.doesNotThrow(() =>
        validateProgressState("beverages", {
          version: 1,
          simulation: s.exportState(),
          mission: mission.exportState(),
          view: { selected: "seal", scope: "line", camera: "front" },
          results: [],
        }),
      );
    }
  });
test("bancadas de caixas mantêm quantidade original e restauram caixa parcial", () => {
  for (const id of ["seal", "ship"]) {
    const s = createIndustrySession(BEVERAGES);
    s.setQuantity(12);
    s.selectEnvironment(id);
    assert.equal(s.snapshot.total, 2);
    assert.equal(s.snapshot.bottleTotal, 12);
    s.start();
    for (let i = 0; i < 5000 && s.snapshot.done < 1; i++) s.tick(0.1);
    assert.equal(s.snapshot.unit.caseIndex, 1);
    assert.equal(s.snapshot.unit.caseQuantity, 3);
    const saved = s.exportState(),
      restored = createIndustrySession(BEVERAGES);
    assert.equal(restored.importState(saved), true);
    assert.equal(restored.snapshot.unit.caseQuantity, 3);
    assert.equal(restored.snapshot.running, false);
  }
});

test("caixas aguardam a pega, seguem apoiadas e respeitam a velocidade no transporte e no baú", () => {
  for (let index = 0; index < 4; index++)
    for (const phase of ["moving", "operating"]) {
      const dur =
        phase === "moving"
          ? BEVERAGES.movementDistance({
              phase: "moving",
              unit: { packed: true },
              done: index * 9,
              fromX: 4,
              toX: 6,
              step: "seal",
            }) / CONVEYOR_LINEAR_SPEED
          : BEVERAGES.operationDuration(
              "ship",
              { caseIndex: index },
              { done: index * 9 },
            );
      const pose = (t) =>
        phase === "moving"
          ? caseApproachPose(t, index)
          : bottleCasePose(
              {
                phase: "operating",
                step: { id: "ship" },
                scope: "line",
                progress: t,
              },
              {
                index,
                sealed: true,
                taped: true,
                identified: true,
                units: Array(9),
                expected: 9,
              },
              index,
              BEVERAGES,
            );
      let previous = pose(0);
      for (let i = 1; i <= 2000; i++) {
        const p = pose(i / 2000),
          distance = Math.hypot(p.x - previous.x, p.z - previous.z),
          expected = (CONVEYOR_LINEAR_SPEED * dur) / 2000;
        assert.ok(distance <= expected * 1.001);
        if(phase==='operating')assert.ok(distance >= expected * 0.7);
        else if(distance>1e-8){
          const current=bottleCaseTransferState(i/2000,index),before=bottleCaseTransferState((i-1)/2000,index);
          assert.ok(current.holding||before.holding,'Caixa só avança sustentada pelos garfos');
        }
        previous = p;
      }
    }
});

test("pausa e retomada preservam nível do envase e todo líquido nas etapas seguintes", () => {
  for (const product of BEVERAGES.products) {
    const session = createIndustrySession(BEVERAGES);
    session.setProduct(product.id);
    session.setSetting("volume", product.volume);
    session.selectEnvironment("fill");
    session.setQuantity(1);
    session.start();
    for (let i = 0; i < 1000; i++) {
      session.tick(0.025);
      if (
        session.snapshot.phase === "operating" &&
        session.snapshot.progress >= 0.5
      )
        break;
    }
    session.pause();
    const before = session.snapshot,
      level = getFillPose(before.progress).level;
    session.tick(0.2);
    assert.equal(getFillPose(session.snapshot.progress).level, level);
    const restored = createIndustrySession(BEVERAGES);
    assert.equal(restored.importState(session.exportState()), true);
    assert.equal(restored.snapshot.running, false);
    assert.equal(getFillPose(restored.snapshot.progress).level, level);
    restored.start();
    for (let i = 0; i < 2000 && restored.snapshot.phase !== "complete"; i++)
      restored.tick(0.05);
    assert.equal(restored.snapshot.unit.volume, product.volume);
    assert.ok(
      bottleLiquidLevel(
        restored.snapshot.unit.volume / restored.snapshot.unit.target,
      ) > 0.83,
    );
  }
});
