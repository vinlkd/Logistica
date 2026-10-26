export const BEVERAGES = {
  id: "beverages",
  name: "Fábrica de bebidas",
  short: "Bebidas",
  color: "#087f82",
  description:
    "Higienize, envase e confira cada garrafa antes de fechar o lote.",
  entryX: -8,
  exitX: 9,
  products: [
    {
      id: "juice",
      name: "Suco de laranja · 500 mL",
      volume: 500,
      color: "#efa638",
    },
    { id: "water", name: "Água · 350 mL", volume: 350, color: "#6bcbec" },
  ],
  controls: [
    {
      id: "volume",
      label: "Volume programado (mL)",
      type: "number",
      value: 500,
      min: 100,
      max: 600,
      step: 10,
    },
    {
      id: "missingCap",
      label: "Simular falta de tampa",
      type: "checkbox",
      value: false,
    },
  ],
  steps: [
    [
      "receive",
      "Receber garrafa",
      -6,
      1.1,
      "Confira a garrafa vazia na mesa de entrada.",
    ],
    ["wash", "Lavar", -4, 2.2, "Os bicos lavam a garrafa antes do envase."],
    [
      "fill",
      "Encher",
      -2,
      3.2,
      "Programe o volume do produto e acompanhe o nível.",
    ],
    ["cap", "Tampar", 0, 3.2, "A pinça retira a tampa e a assenta no gargalo."],
    [
      "label",
      "Rotular e conferir",
      2,
      1.8,
      "O sensor exige tampa e volume correto antes de liberar a rotulagem.",
    ],
    [
      "pack",
      "Encaixotar",
      4,
      2.3,
      "A embalagem sobe ao redor da garrafa e fecha suas abas.",
    ],
    ["ship", "Expedir", 6, 1.4, "Registre o volume pronto na saída."],
  ].map(([id, label, x, duration, help]) => ({ id, label, x, duration, help })),
  initialize(p) {
    return {
      volume: 0,
      target: p.volume,
      liquidColor: p.color,
      capped: false,
      washed: false,
      labeled: false,
      packed: false,
    };
  },
  validate(id, s, u) {
    if (id === "fill" && Number(s.volume) !== u.target)
      return `Programe ${u.target} mL para este produto.`;
    if (id === "label" && !u.capped)
      return "Sensor: garrafa sem tampa. Desative a falta de tampa e use Repetir tampagem.";
    if (id === "label" && u.volume !== u.target)
      return "Volume fora da especificação.";
    return null;
  },
  apply(id, u, s) {
    if (id === "wash") u.washed = true;
    if (id === "fill") u.volume = Number(s.volume);
    if (id === "cap") u.capped = !s.missingCap;
    if (id === "label") u.labeled = true;
    if (id === "pack") u.packed = true;
    if (id === "ship") u.shipped = true;
  },
  readings(s) {
    return [
      {
        label: "Volume",
        value: `${s.phase === "operating" && s.step.id === "fill" ? Math.round(s.progress * s.unit.target) : s.unit.volume} / ${s.unit.target} mL`,
      },
      {
        label: "Sensor de tampa",
        value: s.unit.capped ? "Tampa presente" : "Sem tampa",
      },
      {
        label: "Higienização",
        value: s.unit.washed ? "Concluída" : "Aguardando lavagem",
      },
    ];
  },
};
export const FURNITURE = {
  id: "furniture",
  name: "Fábrica de móveis",
  short: "Móveis",
  color: "#a76332",
  description:
    "Transforme painéis de madeira em uma mesa com encaixes e medidas conferidos.",
  entryX: -8,
  exitX: 9,
  products: [
    { id: "desk", name: "Mesa de estudo · 120 cm", length: 120 },
    { id: "side-table", name: "Mesa auxiliar · 80 cm", length: 80 },
  ],
  controls: [
    {
      id: "cutLength",
      label: "Comprimento de corte (cm)",
      type: "number",
      value: 120,
      min: 60,
      max: 140,
      step: 1,
    },
    {
      id: "drillDepth",
      label: "Profundidade de furação (mm)",
      type: "number",
      value: 12,
      min: 4,
      max: 25,
      step: 1,
    },
    {
      id: "guardClosed",
      label: "Proteção da serra fechada",
      type: "checkbox",
      value: true,
    },
  ],
  steps: [
    [
      "receive",
      "Receber madeira",
      -6,
      1,
      "Confira a madeira apoiada na mesa de roletes.",
    ],
    [
      "cut",
      "Cortar",
      -3.6,
      2.8,
      "Ajuste a régua, feche a proteção e avance a serra pelo painel.",
    ],
    [
      "drill",
      "Furar",
      -1.2,
      2.6,
      "O cabeçote executa quatro furos de 12 mm, com recuo entre pontos.",
    ],
    [
      "assemble",
      "Montar",
      1.2,
      3.2,
      "Os montantes sobem da bandeja e encaixam nos furos do tampo.",
    ],
    [
      "inspect",
      "Inspecionar",
      3.6,
      1.8,
      "O paquímetro confere comprimento e o sensor verifica os quatro encaixes.",
    ],
    [
      "pack",
      "Embalar",
      6,
      2.6,
      "As cantoneiras e as abas protegem a mesa para transporte.",
    ],
  ].map(([id, label, x, duration, help]) => ({ id, label, x, duration, help })),
  initialize(p) {
    return {
      targetLength: p.length,
      cut: false,
      drilled: false,
      assembled: false,
      packed: false,
    };
  },
  validate(id, s, u) {
    if (id === "cut" && !s.guardClosed)
      return "Feche a proteção da serra para continuar.";
    if (id === "cut" && Number(s.cutLength) !== u.targetLength)
      return `A régua precisa estar em ${u.targetLength} cm.`;
    if (id === "drill" && Number(s.drillDepth) !== 12)
      return "Programe os furos de 12 mm para não atravessar o tampo.";
    return null;
  },
  apply(id, u) {
    if (id === "cut") u.cut = true;
    if (id === "drill") u.drilled = true;
    if (id === "assemble") u.assembled = true;
    if (id === "inspect") u.approved = true;
    if (id === "pack") u.packed = true;
  },
  readings(s) {
    return [
      { label: "Comprimento", value: `${s.unit.targetLength} cm` },
      {
        label: "Furação",
        value: s.unit.drilled ? "4 furos · 12 mm" : "Ainda não executada",
      },
      {
        label: "Encaixes",
        value: s.unit.assembled
          ? "4 montantes posicionados"
          : "Aguardando montagem",
      },
    ];
  },
};
