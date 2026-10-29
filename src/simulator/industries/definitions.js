import {
  warehouseFinishedDuration,
  sealWarehouseProgress,
  warehouseFinishedPose,
} from "./bottle-warehouse-flow.js";
import { getFillPose } from "./bottle-fluid.js";
import {BOTTLE_PACK_X,BOTTLE_SEAL_X,BOTTLE_SHIP_X} from './bottle-packing-layout.js';
import {bottleCaseTransferDuration} from './bottle-case-transfer.js';
import {
  BOTTLE_STOCK,
  CASE_CONVEYOR_SPEED,
  bottleReceivingDuration,
  bottleReceivingState,
  bottlePackingDuration,
  bottleShippingDistance,
  caseApproachDistance,
} from "./bottle-crate-flow.js";
export const CONVEYOR_LINEAR_SPEED = CASE_CONVEYOR_SPEED;
export const BEVERAGES = {
  id: "beverages",
  layoutVersion:3,
  maxQuantity: BOTTLE_STOCK,
  defaultQuantity: BOTTLE_STOCK,
  name: "Fábrica de bebidas",
  short: "Bebidas",
  color: "#087f82",
  description:
    "Higienize, envase e confira cada garrafa antes de fechar o lote.",
  entryX: -8,
  exitX: BOTTLE_SHIP_X+3,
  transportSpeed: CONVEYOR_LINEAR_SPEED,
  transportDistance: 4.35,
  outgoingDuration: 0,
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
      "Recebimento",
      -6,
      12,
      "Retire a garrafa da caixa, apoie e solte na esteira. Os roletes a transportam até a lavagem.",
    ],
    [
      "wash",
      "Lavar",
      -4,
      4.8,
      "A garra mantém a garrafa apoiada. A lança entra pelo gargalo, enxágua por dentro e aspira a água antes de recuar e liberar.",
    ],
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
      BOTTLE_PACK_X,
      9,
      "A garra fixa o gargalo e coloca cada garrafa em uma das nove posições da caixa. Ao completar 9, inicia outra caixa.",
    ],
    [
      "seal",
      "Fechar e armazenar caixas",
      BOTTLE_SEAL_X,
      7,
      "Feche, sele e identifique a caixa; o armazém de produtos acabados guarda e recolhe o mesmo volume antes da expedição.",
    ],
    [
      "ship",
      "Expedir caixas",
      BOTTLE_SHIP_X,
      12,
      "Leve a caixa fechada e identificada ao endereço livre no caminhão.",
    ],
  ].map(([id, label, x, duration, help]) => ({ id, label, x, duration, help })),
  initialize(p) {
    return {
      received: false,
      volume: 0,
      target: p.volume,
      liquidColor: p.color,
      capped: false,
      washed: false,
      labeled: false,
      packed: false,
      caseSealed: false,
      caseTaped: false,
      caseIdentified: false,
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
  operationDuration(id, unit, { done }) {
    if (id === "receive") return bottleReceivingDuration(done);
    if (id === "pack") return bottlePackingDuration(done);
    if (id === "seal")
      return (
        7 + warehouseFinishedDuration(unit.caseIndex ?? Math.floor(done / 9))
      );
    if (id === "ship")
      return (
        bottleShippingDistance(unit.caseIndex ?? Math.floor(done / 9)) /
        CONVEYOR_LINEAR_SPEED
      );
    return undefined;
  },
  movementDistance({ phase, unit, done, fromX, toX, step, benchStage }) {
    const caseIndex = unit.caseIndex ?? Math.floor(done / 9);
    if (
      unit.packed &&
      ((phase === "moving" &&
        (step === "seal" || ["seal", "ship"].includes(benchStage))) ||
        (phase === "outgoing" && benchStage === "seal"))
    ) {
      return bottleCaseTransferDuration(caseIndex,benchStage==='ship'?BOTTLE_SHIP_X:BOTTLE_SEAL_X,BOTTLE_PACK_X)*CONVEYOR_LINEAR_SPEED;
    }
    if (unit.packed && step === "ship") return Math.abs(toX - fromX);
    return 4.35;
  },
  shouldRun(id, u, { done, total }) {
    return (
      !["seal", "ship"].includes(id) ||
      (done + 1) % 9 === 0 ||
      done + 1 === total
    );
  },
  apply(id, u, s, context = {}) {
    if (id === "receive") u.received = true;
    if (id === "wash") u.washed = true;
    if (id === "fill") u.volume = Number(s.volume);
    if (id === "cap") u.capped = !s.missingCap;
    if (id === "label") u.labeled = true;
    if (id === "pack") u.packed = true;
    if (id === "seal" || id === "ship") {
      const group = [
        ...(context.completedUnits ?? []).slice(
          Math.floor((context.done ?? 0) / 9) * 9,
        ),
        u,
      ];
      for (const item of group)
        if (id === "seal") {
          item.caseSealed = true;
          item.caseTaped = true;
          item.caseIdentified = true;
        } else item.shipped = true;
    }
  },
  readings(s) {
    if (s.step.id === "seal") {
      const index = s.unit.caseIndex ?? Math.floor(s.done / 9);
      const progress = sealWarehouseProgress(
        s.phase === "operating" ? s.progress : 0,
        index,
      );
      const warehouse = warehouseFinishedPose(
        progress.warehouseProgress,
        index,
      );
      return [
        { label: "Armazém de produtos acabados", value: warehouse.address.id },
        {
          label: "Operação",
          value:
            progress.closingProgress < 1
              ? "Fechando, selando e identificando a caixa"
              : warehouse.occupied
                ? "Caixa apoiada no endereço; aguardando retirada"
                : "Garfos armazenam e recolhem a caixa real",
        },
      ];
    }
    if (s.step.id === "receive") {
      const state = bottleReceivingState(s.done, s.phase, s.progress);
      const phase = Object.entries(state.phases).find(
        ([, progress]) => progress < 1,
      )?.[0];
      const actions = {
        lowerFork: "Posicionando o suporte da caixa",
        extendFork: "Apoiando a caixa por baixo",
        raiseDock: "Alinhando a doca",
        pullCrate: "Retirando a caixa fechada do caminhão",
        alignCrate: "Centralizando a caixa fora do caminhão",
        lowerCrate: "Apoiando a caixa na doca",
        releaseFork: "Liberando o suporte",
        raiseFork: "Recolhendo o suporte",
        parkFork: "Afastando o suporte",
        majorDown: "Aproximando o abridor",
        openMajor: "Abrindo as abas maiores",
        majorUp: "Recolhendo o abridor",
        minorDown: "Aproximando o abridor",
        openMinor: "Abrindo as abas menores",
        minorUp: "Liberando o topo da caixa",
        headApproachX: "Posicionando a pinça sobre a caixa",
        headApproachZ: "Alinhando a pinça com a garrafa",
        lowerHead: "Descendo a pinça pelo topo livre",
        grip: "Fixando a garrafa",
        liftMaterial: "Retirando a garrafa por cima",
        carryMaterialX: "Levando a garrafa à esteira",
        carryMaterialZ: "Alinhando a garrafa com a esteira",
        lowerMaterial: "Apoiando a garrafa na esteira",
        releaseMaterial: "Liberando a garrafa",
        retractHead: "Recolhendo a pinça",
        feedMaterial: "Transportando a garrafa pelos roletes",
        emptyForward: "Retirando a caixa vazia da doca",
        emptyLateral: "Afastando a caixa vazia",
        emptyPark: "Estacionando a caixa vazia",
      };
      return [
        {
          label: "Recebimento",
          value:
            s.phase === "complete"
              ? `${s.done} retiradas concluídas`
              : s.phase === "operating"
                ? (actions[phase] ?? "Concluindo retirada")
                : "Aguardando a próxima retirada",
        },
        {
          label: "Pedido",
          value: `${s.done} / ${s.bottleTotal ?? s.total} garrafas retiradas · caixa ${Math.min(12, state.caseIndex + 1)} de 12`,
        },
      ];
    }
    return [
      {
        label: "Volume",
        value: `${s.phase === "operating" && s.step.id === "fill" ? Math.round(getFillPose(s.progress).fraction * s.unit.target) : s.unit.volume} / ${s.unit.target} mL`,
      },
      {
        label: "Sensor de tampa",
        value: s.unit.capped ? "Tampa presente" : "Sem tampa",
      },
      {
        label: "Higienização",
        value: s.unit.washed
          ? "Concluída"
          : s.step.id === "wash" && s.phase === "operating"
            ? s.progress < 0.12
              ? "Fixando a garrafa apoiada"
              : s.progress < 0.3
                ? "Descendo a lança pelo gargalo"
                : s.progress < 0.6
                  ? "Enxaguando o interior"
                  : s.progress < 0.82
                    ? "Aspirando a água de lavagem"
                    : s.progress < 0.95
                      ? "Recolhendo a lança"
                      : "Liberando a garra"
            : "Aguardando lavagem",
      },
    ];
  },
};
export const FURNITURE = {
  id: "furniture",
  transferDuration: 12,
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
      12,
      "Confira a madeira apoiada na mesa de roletes.",
    ],
    [
      "cut",
      "Cortar",
      -3.6,
      6,
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
