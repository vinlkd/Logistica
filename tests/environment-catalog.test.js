import test from "node:test";
import assert from "node:assert/strict";
import {
  ENVIRONMENT_CATALOG,
  resolveEnvironment,
} from "../src/simulator/environment-catalog.js";
test("escolha disponibiliza somente panelas e bebidas", () => {
  assert.deepEqual(
    ENVIRONMENT_CATALOG.map((e) => e.id),
    ["cookware", "beverages"],
  );
  for (const e of ENVIRONMENT_CATALOG)
    assert.equal(resolveEnvironment(e.id), e);
});
test("links antigos e desconhecidos voltam à escolha sem resolver uma linha removida", () => {
  for (const id of ["furniture", "parcels", "inexistente", null, ""])
    assert.equal(resolveEnvironment(id), null);
});
