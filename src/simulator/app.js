import "./style.css";
import "./industries/industry.css";
const catalog = [
  {
    id: "cookware",
    name: "Panelas",
    subtitle: "Transformação do metal",
    description:
      "Da conferência dos discos de inox ao pedido expedido, em oito setores.",
    color: "#164193",
  },
  {
    id: "beverages",
    name: "Fábrica de bebidas",
    subtitle: "Envase e qualidade",
    description:
      "Lave, encha, tampe e confira as garrafas antes de encaixotar.",
    color: "#087f82",
  },
  {
    id: "parcels",
    name: "Centro de distribuição de encomendas",
    subtitle: "Destinos e endereços",
    description:
      "Leia etiquetas, confira a massa e encaminhe cada volume para sua rota.",
    color: "#2686ad",
  },
  {
    id: "furniture",
    name: "Fábrica de móveis",
    subtitle: "Medidas e montagem",
    description:
      "Corte, fure e monte a madeira com medidas e encaixes conferidos.",
    color: "#a76332",
  },
];
function illustration(id, color) {
  const base =
    '<path d="M35 188H325M55 188V158M300 188V158" stroke="#6a7f90" stroke-width="7"/><rect x="32" y="148" width="298" height="15" rx="4" fill="#364c60"/>';
  const drawings = {
    cookware:
      '<path d="M122 77L134 137Q180 157 226 137L238 77" fill="#bdcbd6" stroke="#6d899e" stroke-width="3"/><ellipse cx="180" cy="77" rx="58" ry="15" fill="#e6eef3" stroke="#6d899e" stroke-width="3"/><path d="M238 91L294 74" stroke="#263f55" stroke-width="13" stroke-linecap="round"/>',
    beverages: [92, 153, 214]
      .map(
        (x) =>
          `<path d="M${x} 143V83L${x + 12} 65V45H${x + 26}V65L${x + 38} 83V143Z" fill="#bde3e0" stroke="#457f83" stroke-width="3"/><path d="M${x + 4} 138V99H${x + 34}V138Z" fill="#efaf3f"/><rect x="${x + 9}" y="39" width="20" height="9" rx="2" fill="${color}"/>`,
      )
      .join(""),
    parcels:
      '<rect x="65" y="94" width="90" height="54" fill="#cba575"/><path d="M65 94L94 76H180L155 94M155 94V148L180 130V76" fill="#b68c5e"/><rect x="196" y="67" width="76" height="81" fill="#dfbb88"/><path d="M196 67L220 51H293L272 67M272 67V148L293 132V51" fill="#b68c5e"/><rect x="208" y="89" width="38" height="25" fill="#f8fbfd"/><path d="M215 95V108M220 95V108M226 95V108M232 95V108M238 95V108" stroke="#24455d" stroke-width="2"/>',
    furniture:
      '<path d="M91 85L213 53L289 81L164 115Z" fill="#c4935e" stroke="#855c36" stroke-width="3"/><path d="M91 85V98L164 130L289 95V81M164 115V130" fill="#a77443" stroke="#855c36" stroke-width="3"/><path d="M104 102V178M177 131V188M275 99V163M209 119V174" stroke="#855c36" stroke-width="13"/>',
  };
  return `<svg viewBox="0 0 360 220" role="img" aria-label="Ilustração da linha de ${id === "cookware" ? "panelas" : id === "beverages" ? "bebidas" : id === "parcels" ? "encomendas" : "móveis"}"><path d="M30 52L172 13L331 68V188H30Z" fill="${color}" opacity=".06"/>${base}${drawings[id]}</svg>`;
}
const selected = new URLSearchParams(location.search).get("industry");
const known = catalog.find((x) => x.id === selected);
document.body.classList.toggle("industry-page", !known);
if (known) {
  if (selected === "cookware") await import("./cookware-app.js");
  else {
    const { launchIndustry } = await import("./industries/industry-app.js");
    await launchIndustry(selected);
  }
  const back = document.createElement("a");
  back.className = "text-button industry-back";
  back.textContent = "Escolher ambiente";
  back.href = location.pathname;
  back.addEventListener("click", () =>
    document.dispatchEvent(new Event("industry:leave")),
  );
  document.querySelector(".app-header")?.append(back);
} else {
  const demo = import.meta.env.MODE === "pages";
  document.querySelector("#app").innerHTML =
    `<div class="hub"><header class="app-header"><img class="hub-logo" src="${import.meta.env.BASE_URL}senai-logo.png" alt="SENAI" width="126" height="48"><div class="brand"><strong>Laboratório de logística</strong><span>${demo ? "Protótipo de demonstração" : "Ambientes de aprendizagem"}</span></div>${demo ? "" : '<button id="hub-logout" class="text-button">Sair</button>'}</header><main class="hub-main"><div class="hub-intro"><p>Um laboratório, quatro processos</p><h1>Qual ambiente você quer explorar?</h1><div>Escolha uma linha e conduza suas operações. Você pode voltar aqui a qualquer momento.</div></div><div class="hub-grid">${catalog.map((c) => `<article class="hub-card" style="--industry:${c.color}"><div class="hub-art">${illustration(c.id, c.color)}</div><div class="hub-copy"><span>${c.subtitle}</span><h2>${c.name}</h2><p>${c.description}</p><a class="hub-enter" href="?industry=${c.id}" aria-label="Entrar em ${c.name}">Entrar no ambiente <span aria-hidden="true">↗</span></a></div></article>`).join("")}</div><p class="hub-note">Explore o processo, ajuste os parâmetros e observe o resultado de cada decisão.</p></main></div>`;
  document
    .querySelector("#hub-logout")
    ?.addEventListener("click", () =>
      document.dispatchEvent(new Event("auth:logout")),
    );
}
