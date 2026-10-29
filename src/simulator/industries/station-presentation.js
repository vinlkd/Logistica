const ease = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
// A cell view has a full-size incoming and outgoing conveyor. Logical station
// distances are mapped to that local conveyor instead of dropping the piece
// at the centre as soon as the next operation becomes ready.
export function stationPresentation(snapshot, definition, stageId) {
  if (snapshot.stations?.[stageId])
    snapshot = {
      ...snapshot,
      ...snapshot.stations[stageId],
      caseTransfer: snapshot.stations.seal,
      stations: undefined,
    };
  if (snapshot.hasMaterial === false)
    return { state: snapshot, visible: false };
  if (snapshot.scope !== "line") return { state: snapshot, visible: true };
  const index = definition.steps.findIndex((s) => s.id === stageId),
    current = definition.steps.findIndex((s) => s.id === snapshot.step.id),
    stage = definition.steps[index];
  const travel = definition.transportSpeed
    ? snapshot.progress
    : ease(snapshot.progress);
  let offset = 0,
    visible = false;
  if (index === current) {
    visible = true;
    if (snapshot.phase === "moving") offset = -4.35 * (1 - travel);
    else if (
      snapshot.phase === "ready" &&
      Math.abs(snapshot.position.x - stage.x) > 0.001
    )
      offset = -4.35;
    else if (snapshot.phase === "outgoing" || snapshot.phase === "complete")
      offset = snapshot.position.x - stage.x;
  } else if (
    current === index + 1 &&
    ["ready", "moving"].includes(snapshot.phase)
  ) {
    visible = true;
    offset = snapshot.phase === "moving" ? 4.35 * travel : 0;
  }
  return {
    visible,
    state: {
      ...snapshot,
      position: { ...snapshot.position, x: stage.x + offset },
    },
  };
}
