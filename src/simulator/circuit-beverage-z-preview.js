// Isolated spatial proposal. Connector paths match the visible equipment in the preview.
export function beverageZPreviewPlan() {
  const wallHeight = 4.8;
  const deckY = wallHeight + 0.16;
  const beltY = 1.22;
  const west = -44;
  const outboundZ = -5;
  const turnX = 34;
  const labelX = 25;
  const packX = labelX - 11;
  const sealX = packX - 23.5;
  const stages = [
    ["receive", -26, deckY, -29.5],
    ["wash", 4, deckY, -29.5],
    ["fill", 14, deckY, -29.5],
    ["cap", 24, deckY, -29.5],
    ["label", labelX, 0, outboundZ],
    ["pack", packX, 0, outboundZ],
    ["seal", sealX, 0, outboundZ],
    ["ship", sealX - 22, 0, outboundZ],
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
    bounds: { west, east: 36, north: -48, south: 32 },
    stages,
    deck: { west, east: 31, north: -36, south: -20, y: deckY },
    stairs: [
      { top: [-42, deckY, -20], bottom: [-42, 0, -9.8], width: 1.8, steps: 34 },
      { top: [27, deckY, -20], bottom: [27, 0, -9.8], width: 1.8, steps: 34 },
    ],
    connectors: [
      {
        from: "receive",
        to: "wash",
        kind: "belt",
        demonstrationOnly: true,
        points: [
          [-21.2, deckY + beltY, -29.5],
          [-0.8, deckY + beltY, -29.5],
        ],
      },
      {
        from: "wash",
        to: "fill",
        kind: "rollers",
        floorY: deckY,
        points: [
          [8.8, deckY + beltY, -29.5],
          [9.2, deckY + beltY, -29.5],
        ],
      },
      {
        from: "fill",
        to: "cap",
        kind: "rollers",
        floorY: deckY,
        points: [
          [18.8, deckY + beltY, -29.5],
          [19.2, deckY + beltY, -29.5],
        ],
      },
      {
        from: "cap",
        to: "label",
        kind: "belt",
        demonstrationOnly: true,
        points: [
          [28.8, deckY + beltY, -29.5],
          [turnX, deckY + beltY, -29.5],
          [turnX, beltY, outboundZ],
          [labelX + 4.8, beltY, outboundZ],
        ],
      },
      {
        from: "label",
        to: "pack",
        kind: "rollers",
        floorY: 0,
        points: [
          [labelX - 4.8, beltY, outboundZ],
          [packX + 4.8, beltY, outboundZ],
        ],
      },
    ],
    gates: [
      { side: "west", center: -29.5, width: 5, height: 5.6, sill: deckY, stage: "receive" },
      { side: "west", center: outboundZ, width: 5, height: 5.6, stage: "ship" },
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
