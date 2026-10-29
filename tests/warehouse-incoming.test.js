import test from "node:test";
import assert from "node:assert/strict";
import { beverageStorageState } from "../src/simulator/warehouse-logistics.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { BEVERAGES } from "../src/simulator/industries/definitions.js";

test("armazém vazio não inventa caixa; entrada só aparece quando uma caixa real chega à selagem", () => {
  const session = createIndustrySession(BEVERAGES, {
    onDemand: true,
    storageDuration: 34.1,
  });
  session.setQuantity(9);
  session.selectEnvironment("seal");
  assert.equal(beverageStorageState(session.snapshot), null);
  session.start();
  assert.equal(beverageStorageState(session.snapshot), null);
  session.setSpeed(8);
  let arrived = false;
  for (let i = 0; i < 6000; i++) {
    session.tick(0.0125);
    const state = session.snapshot;
    const incoming = beverageStorageState(state);
    if (incoming) {
      assert.equal(state.unit.packed, true);
      assert.ok(state.unit.warehouseAddress);
      assert.equal(incoming.quantity, 9);
      assert.equal(state.inventory.counts.occupied, 0);
      session.pause();
      const paused = beverageStorageState(session.snapshot);
      session.tick(0.25);
      assert.deepEqual(beverageStorageState(session.snapshot), paused);
      arrived = true;
      break;
    }
  }
  assert.equal(arrived, true);
});
