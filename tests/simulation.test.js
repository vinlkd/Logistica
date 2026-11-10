import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";

function advance(simulation, seconds) {
  for (let i = 0; i < seconds * 20; i++) simulation.step(0.05);
}
test("um lote percorre os oito ambientes sem criar nem perder unidades", () => {
  const sim = createSimulation(3);
  sim.setSpeed(4);
  sim.start();
  for (let i = 0; i < 2500; i++) {
    sim.step(0.05);
    const s = sim.snapshot;
    assert.equal(
      s.cells.reduce((n, c) => n + c.queue + Number(c.part), 0) + s.done,
      s.batch,
    );
    if (s.done === s.batch) break;
  }
  assert.equal(sim.snapshot.done, 3);
  assert.equal(sim.snapshot.running, false);
  for (const cell of sim.snapshot.cells) assert.equal(cell.done, 3);
});
test("a bancada exercita somente o ambiente selecionado", () => {
  const sim = createSimulation(2, {
    scope: "bench",
    environment: "production",
  });
  sim.start();
  advance(sim, 30);
  assert.equal(sim.snapshot.done, 2);
  assert.equal(sim.snapshot.cells.find((c) => c.id === "production").done, 2);
  for (const c of sim.snapshot.cells.filter((c) => c.id !== "production"))
    assert.equal(c.done + c.queue + Number(c.part), 0);
});
test("a emergência desenergiza tudo e exige rearme e nova partida", () => {
  const sim = createSimulation(2, {
    scope: "bench",
    environment: "production",
  });
  sim.start();
  advance(sim, 2);
  sim.emergencyStop();
  const time = sim.snapshot.time;
  advance(sim, 4);
  assert.equal(sim.snapshot.time, time);
  assert.equal(sim.start(), false);
  for (const c of sim.snapshot.cells)
    assert.equal(Object.values(c.outputs).some(Boolean), false);
  assert.equal(sim.acknowledge(), true);
  assert.equal(sim.snapshot.running, false);
  assert.equal(sim.start(), true);
});
test("a proteção aberta interrompe a linha e bloqueia a partida", () => {
  const sim = createSimulation();
  sim.start();
  sim.setGuard("production", false);
  assert.equal(sim.snapshot.running, false);
  assert.equal(sim.start(), false);
  assert.equal(sim.acknowledge(), false);
  sim.setGuard("production", true);
  assert.equal(sim.start(), true);
});
test("o modo manual respeita posicionamento e sensor de saída", () => {
  const sim = createSimulation(1, {
    scope: "bench",
    environment: "production",
  });
  sim.setMode("production", "manual");
  sim.start();
  advance(sim, 1);
  assert.equal(sim.snapshot.cells[2].part, false);
  assert.equal(sim.command("production", "work", true), false);
  sim.command("production", "motor", true);
  advance(sim, 2.3);
  assert.equal(sim.snapshot.cells[2].phase, "processing");
  assert.equal(sim.command("production", "transfer", true), false);
  assert.equal(sim.command("production", "work", true), true);
  advance(sim, 9);
  assert.equal(sim.snapshot.cells[2].phase, "unloading");
  assert.equal(sim.snapshot.cells[2].inputs.exit, true);
  assert.equal(sim.command("production", "transfer", true), true);
  advance(sim, 1);
  assert.equal(sim.snapshot.done, 1);
});
test("saída obstruída gera alarme e impede a evolução", () => {
  const sim = createSimulation();
  sim.start();
  sim.setFault("packing", true);
  const time = sim.snapshot.time;
  advance(sim, 5);
  assert.equal(sim.snapshot.time, time);
  assert.equal(sim.start(), false);
  assert.equal(sim.snapshot.cells[5].inputs.exit, true);
  sim.setFault("packing", false);
  assert.equal(sim.start(), true);
});
test("o passo manual avança somente quando não há bloqueios de segurança", () => {
  const sim = createSimulation();
  sim.step(0.1, true);
  assert.ok(sim.snapshot.time > 0.09);
  assert.equal(sim.snapshot.running, false);
  sim.emergencyStop();
  const time = sim.snapshot.time;
  sim.step(0.1, true);
  assert.equal(sim.snapshot.time, time);
});
test("novo lote reinicia contadores, comandos e segurança", () => {
  const sim = createSimulation(1, { scope: "bench", environment: "packing" });
  sim.start();
  advance(sim, 20);
  sim.reset(5);
  assert.equal(sim.snapshot.batch, 5);
  assert.equal(sim.snapshot.done, 0);
  assert.equal(sim.snapshot.time, 0);
  assert.equal(sim.snapshot.cells[5].queue, 5);
  assert.throws(() => sim.reset(0));
  assert.throws(() => sim.reset(51));
  assert.equal(ENVIRONMENTS.length, 8);
});
