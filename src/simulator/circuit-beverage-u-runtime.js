import { Vector3 } from "three";
import { BEVERAGES } from "./industries/definitions.js";
import { createIndustrySession } from "./industries/industry-session.js";
import {
  DEMAND_BEVERAGE_STORAGE_DURATION,
  getOrderPickDuration,
  getOrderShipDuration,
} from "./warehouse-logistics.js";

function bottleRoutes(world) {
  const { stages, connectors } = world.plan;
  const { demos } = world.diagnostics();
  const routes = new Map();
  const center = ({ x, y, z }) => new Vector3(x, y + 1.225, z);
  for (let i = 1; i <= 5; i++) {
    const from = stages[i - 1], to = stages[i];
    const connector = connectors.findIndex((item) => item.from === from.stage && item.to === to.stage);
    const belt = connector < 0 ? [] : demos[connector]?.samples;
    if (!belt || (connector < 0 && Math.abs(from.y - to.y) > 0.001)) continue;
    const points = [center(from), ...belt, center(to)];
    const distances = [0];
    for (let j = 1; j < points.length; j++)
      distances.push(distances.at(-1) + points[j].distanceTo(points[j - 1]));
    routes.set(to.stage, { points, distances, length: distances.at(-1) });
  }
  return routes;
}

export function createBeverageURuntime(world) {
  const routes = bottleRoutes(world);
  const missing = world.plan.stages.slice(1, 6).find(({ stage }) => !routes.has(stage));
  let blockedReason = missing ? `Falta a transferência física até ${missing.stage}.` : "";
  const session = createIndustrySession(BEVERAGES, {
    onDemand: true,
    circuit: true,
    movementDistance: ({ step }) => routes.get(step)?.length,
    storageDuration: DEMAND_BEVERAGE_STORAGE_DURATION,
    fulfillmentDuration: (action, box, index) => action === "pick"
      ? getOrderPickDuration(box, index)
      : getOrderShipDuration(box, index),
  });
  session.setQuantity(9);
  let requestedRun = false;
  let snapshot = session.snapshot;

  function fulfill() {
    if (!requestedRun || snapshot.mode !== "auto" || snapshot.phase !== "complete" || snapshot.fulfillment || !snapshot.ready) return;
    const order = snapshot.inventory.orders.find((item) => item.status !== "shipped");
    let result;
    if (!order) {
      if (!snapshot.inventory.counts.available) return;
      result = session.generateOrder({ quantity: 1 });
      if (result.ok) result = session.pickOrder(result.order.id, result.order.boxIds);
    } else if (order.status === "reserved") {
      result = session.pickOrder(order.id, order.boxIds);
    } else if (order.status === "picked") {
      result = session.checkOrder(order.id, order);
      if (result.ok) result = session.dispatchOrder(order.id);
    } else if (order.status === "checked") {
      result = session.dispatchOrder(order.id);
    }
    if (!result) return;
    if (result.ok) session.start();
    else {
      requestedRun = false;
      blockedReason = result.message;
      session.pause();
    }
    snapshot = session.snapshot;
  }

  return {
    get snapshot() { return snapshot; },
    get blockedReason() { return blockedReason; },
    tick(dt) {
      if (blockedReason || !requestedRun) return;
      session.tick(dt);
      snapshot = session.snapshot;
      fulfill();
    },
    setSpeed(value) {
      session.setSpeed(value);
      snapshot = session.snapshot;
    },
    command(action) {
      let accepted = true;
      if (action === "start") {
        if (blockedReason || !snapshot.ready || snapshot.emergency) return false;
        requestedRun = true;
        session.start();
        snapshot = session.snapshot;
        fulfill();
      } else if (action === "stop") {
        requestedRun = false;
        session.pause();
      } else if (action === "emergency") {
        requestedRun = false;
        session.emergencyStop();
      } else if (action === "reset") {
        if (snapshot.emergency) session.rearm();
        else accepted = !snapshot.fulfillment && session.reset();
        if (accepted) requestedRun = false;
      } else if (action === "mode") {
        requestedRun = false;
        session.pause();
        session.setMode(snapshot.mode === "auto" ? "manual" : "auto");
      } else return false;
      snapshot = session.snapshot;
      return accepted;
    },
    beverageTransfer(stage, state) {
      const route = routes.get(stage);
      if (!route || state.hasMaterial === false || state.unit?.packed || !["moving", "ready"].includes(state.phase)) return null;
      const distance = route.length * (state.phase === "moving" ? state.progress : 0);
      const next = Math.max(1, route.distances.findIndex((at) => at >= distance));
      const before = route.distances[next - 1];
      const fraction = (distance - before) / (route.distances[next] - before);
      const point = route.points[next - 1].clone().lerp(route.points[next], fraction);
      const direction = route.points[next].clone().sub(route.points[next - 1]).normalize();
      const across = new Vector3(0, 1, 0).cross(direction);
      if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
      across.normalize();
      const normal = direction.cross(across).normalize();
      return { point: point.addScaledVector(normal, 0.006), normal, distance };
    },
  };
}
