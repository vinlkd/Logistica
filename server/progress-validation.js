import { createSimulation, ENVIRONMENTS } from "../src/simulator/simulation.js";
import { createIndustrySession } from "../src/simulator/industries/industry-session.js";
import { BEVERAGES, FURNITURE } from "../src/simulator/industries/definitions.js";
import { PARCELS } from "../src/simulator/industries/parcels.js";
import { missionDefinition, missionEvidence } from "../src/simulator/missions.js";

const definitions = { beverages: BEVERAGES, furniture: FURNITURE, parcels: PARCELS };
export function validateSavedSimulation(environment, snapshot, state) {
  if (!snapshot || snapshot.version !== 1 || snapshot.environment !== environment) throw new Error("Formato de simulação incompatível");
  const simulation = environment === "cookware" ? createSimulation() : definitions[environment] ? createIndustrySession(definitions[environment]) : null;
  if (!simulation || typeof simulation.importState !== "function" || simulation.importState(snapshot) !== true) throw new Error("Estado de simulação inválido");
  if (state && (state.view.scope !== snapshot.scope || (environment !== "cookware" || snapshot.scope === "bench") && state.view.selected !== (snapshot.selected ?? snapshot.focus) || state.mission?.state && state.mission.status !== "interrupted" && state.mission.state.product !== snapshot.product)) throw new Error("Progresso e simulação não correspondem");
  if (state?.mission?.status === "completed") {
    const definition = missionDefinition(environment, environment === "cookware" ? ENVIRONMENTS : definitions[environment].steps);
    const evidence = missionEvidence(simulation.snapshot, definition), mission = state.mission;
    // Current safety conditions do not undo deliveries already proved by the full history.
    if (mission.id !== definition.id || mission.state.target !== definition.target || evidence.product !== mission.state.product || evidence.scope !== "line" || evidence.quantity !== definition.target || evidence.done < definition.target || definition.steps.some((step) => (evidence.checkpoints[step.id] ?? 0) < definition.target || mission.state.checkpoints[step.id] !== definition.target)) throw new Error("A simulação não comprova a conclusão da missão");
  }
}
