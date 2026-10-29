import test from "node:test";
import assert from "node:assert/strict";
import {
  bottleCaseSlot,
  bottlePackingPose,
  BOTTLES_PER_CASE,
  CASE_INNER,
} from "../src/simulator/industries/bottle-packing.js";
import { bottleLabelPose } from "../src/simulator/industries/bottle-labeler.js";
test("Cada caixa recebe no máximo nove garrafas, sem sobreposição e dentro das paredes", () => {
  assert.equal(BOTTLES_PER_CASE, 9);
  const counts = new Map();
  for (let i = 0; i < 108; i++) {
    const a = bottleCaseSlot(i);
    counts.set(a.caseIndex, (counts.get(a.caseIndex) ?? 0) + 1);
    assert.ok(Math.abs(a.x - a.cx) + 0.18 < CASE_INNER / 2);
    assert.ok(Math.abs(a.z - a.cz) + 0.18 < CASE_INNER / 2);
    for (let j = 0; j < i; j++) {
      const b = bottleCaseSlot(j);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.36);
    }
  }
  assert.deepEqual([...counts.values()], Array(12).fill(9));
});
test("Garra fixa antes de elevar, cruza acima das caixas e solta só apoiada em 30 destinos", () => {
  for (let i = 0; i < 108; i++) {
    let prev = bottlePackingPose(0, i);
    for (let k = 1; k <= 2000; k++) {
      const t = k / 2000,
        p = bottlePackingPose(t, i);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.04);
      assert.ok(
        Math.hypot(
          p.toolX - prev.toolX,
          p.toolY - prev.toolY,
          p.toolZ - prev.toolZ,
        ) < 0.15,
      );
      if (p.gripping) assert.equal(p.jawGap, 0);
      if (p.released) {
        assert.equal(p.y, p.target.y);
        assert.equal(p.x, p.target.x);
        assert.equal(p.z, p.target.z);
      }
      if (p.phases.travelX>0&&p.phases.lower===0) assert.ok(p.y >= 2.3999);
      for (let j = 0; j < i; j++) {
        const b = bottleCaseSlot(j);
        if (p.y < b.y + 1.07)
          assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= 0.36 - 1e-8);
      }
      prev = p;
    }
  }
});
test("Rótulo percorre trajeto contínuo e permanece na garrafa enquanto aplicador recua", () => {
  let prev = bottleLabelPose(0);
  for (let k = 1; k <= 2000; k++) {
    const p = bottleLabelPose(k / 2000);
    assert.ok(Math.abs(p.labelZ - prev.labelZ) < 0.005);
    if (p.applied) assert.equal(p.labelZ, 0);
    prev = p;
  }
  assert.equal(prev.labelZ, 0);
  assert.equal(prev.toolZ, 0.8);
});
