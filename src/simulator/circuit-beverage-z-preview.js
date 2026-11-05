// Isolated spatial proposal. This module does not import or run production.
// Connector points are demonstration belt surfaces, not real handoffs.
export function beverageZPreviewPlan() {
  const wallHeight = 4.8;
  const deckY = wallHeight + 0.16;
  const beltY = 1.22;
  const stages = [
    ["receive", -26, deckY, -29.5],
    ["wash", 4, deckY, -29.5],
    ["fill", 14, deckY, -29.5],
    ["cap", 24, deckY, -29.5],
    ["label", 37, 0, 28],
    ["pack", 26, 0, 28],
    ["seal", 2.5, 0, 28],
    ["ship", -19.5, 0, 28],
  ].map(([stage, x, y, z], index) => ({
    stage,
    index: index + 1,
    x,
    y,
    z,
    yaw: index >= 4 ? Math.PI : 0,
    // The warehouse model owns the shipping truck as well as stage 7.
    sharedVisualRoot: stage === "ship" ? "seal" : null,
  }));
  return {
    industry: "beverages",
    previewOnly: true,
    productionConnected: false,
    height: 12.4,
    spawn: { x: -42, y: 0, z: -8.6 },
    bounds: { west: -48, east: 48, north: -48, south: 48 },
    stages,
    deck: { west: -48, east: 31, north: -36, south: -20, y: deckY },
    stairs: [
      { top: [-42, deckY, -20], bottom: [-42, 0, -9.8], width: 1.8, steps: 34 },
      { top: [27, deckY, -20], bottom: [27, 0, -9.8], width: 1.8, steps: 34 },
    ],
    connectors: [
      {
        from: "receive",
        to: "wash",
        demonstrationOnly: true,
        points: [
          [-20.925, deckY + beltY, -29.5],
          [-1, deckY + beltY, -29.5],
        ],
      },
      {
        from: "cap",
        to: "label",
        demonstrationOnly: true,
        points: [
          [29, deckY + beltY, -29.5],
          [44, deckY + beltY, -29.5],
          [44, beltY, 28],
          [42, beltY, 28],
        ],
      },
      {
        from: "label",
        to: "pack",
        demonstrationOnly: true,
        empty: true,
        points: [[31.925, beltY, 28], [31, beltY, 28]],
      },
    ],
    gates: [
      { side: "west", center: -29.5, width: 5, height: 5.6, sill: deckY, stage: "receive" },
      { side: "west", center: 28, width: 5, height: 5.6, stage: "ship" },
    ],
    player: { height: 3, eyeHeight: 2.85, radius: 0.4 },
    hmiStages: ["receive", "label"],
    pending: [
      "Render reused machine instances at these poses in the opt-in preview.",
      "Validate rounded connector triangles and demonstration cargo support.",
      "Validate gates against the moving trucks and raised forks.",
      "Validate stairs, guard openings and both HMI approaches in the browser.",
      "Real production transfers have not been adapted to this proposal.",
    ],
  };
}
