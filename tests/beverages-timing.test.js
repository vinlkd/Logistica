import {bottleCaseTransferDuration} from '../src/simulator/industries/bottle-case-transfer.js';
import test from "node:test";
import assert from "node:assert/strict";
import {
  BEVERAGES,
  CONVEYOR_LINEAR_SPEED,
} from "../src/simulator/industries/definitions.js";
import {
  bottleShippingPose,
  bottleShippingDistance,
  caseApproachDistance,
  bottleReceivingDuration,
  bottleTruckSlot,
} from "../src/simulator/industries/bottle-crate-flow.js";
test("12 trajetos físicos compartilham tempos do motor, inclusive elevação superior", () => {
  for (let index = 0; index < 12; index++) {
    const duration = BEVERAGES.operationDuration(
      "ship",
      { caseIndex: index },
      { done: index * 9 },
    );
    assert.equal(
      duration,
      bottleShippingDistance(index) / CONVEYOR_LINEAR_SPEED,
    );
    assert.deepEqual(bottleShippingPose(1, index), bottleTruckSlot(index));
    const start = bottleShippingPose(0, index);
    assert.deepEqual(start, { x: BEVERAGES.steps.at(-1).x, y: 1.2, z: 0 });
    let previous = start,
      total = 0;
    for (let i = 1; i <= 1000; i++) {
      const current = bottleShippingPose(i / 1000, index);
      const d = Math.hypot(
        current.x - previous.x,
        current.y - previous.y,
        current.z - previous.z,
      );
      assert.ok(d <= (duration * CONVEYOR_LINEAR_SPEED) / 1000 + 1e-8);
      total += d;
      previous = current;
    }
    assert.ok(Math.abs(total - bottleShippingDistance(index)) < 0.03);
    assert.equal(
      BEVERAGES.movementDistance({
        phase: "moving",
        unit: { packed: true, caseIndex: index },
        done: index * 9,
        fromX: 4,
        toX: 6,
        step: "seal",
      }),
      bottleCaseTransferDuration(index)*CONVEYOR_LINEAR_SPEED,
    );
    if (index >= 6) assert.ok(bottleTruckSlot(index).y > 2.4);
  }
  for (let index = 0; index < 108; index++)
    assert.equal(
      BEVERAGES.operationDuration("receive", {}, { done: index }),
      bottleReceivingDuration(index),
    );
});
