import {
  ENVIRONMENT_CATALOG as catalog,
  resolveEnvironment,
} from "./environment-catalog.js";
import { installHubPreviews } from "./hub-previews.js";
import "./style.css";
import "./industries/industry.css";
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
  };
  return `<svg viewBox="0 0 360 220" role="img" aria-label="Ilustração da linha de ${id === "cookware" ? "panelas" : "bebidas"}"><path d="M30 52L172 13L331 68V188H30Z" fill="${color}" opacity=".06"/>${base}${drawings[id]}</svg>`;
}
const params = new URLSearchParams(location.search);
const selected = params.get("industry");
const known = resolveEnvironment(selected);
if (selected && !known) {
  history.replaceState(
    null,
    "",
    new URL(import.meta.env.BASE_URL, location.href),
  );
}
document.body.classList.toggle("industry-page", !known);
if (selected === "beverages" && params.get("planta") === "u") {
  const { launchCircuitZPreview } = await import("./circuit-z-preview.js");
  await launchCircuitZPreview("beverages");
} else if (known) {
  if (selected === "cookware") await import("./cookware-app.js");
  else {
    const { launchIndustry } = await import("./industries/industry-app.js");
    await launchIndustry(selected);
  }
  const back = document.createElement("a");
  back.className = "text-button industry-back";
  back.textContent = "Escolher ambiente";
  back.href = new URL(import.meta.env.BASE_URL, location.href).href;
  back.addEventListener("click", () =>
    document.dispatchEvent(new Event("industry:leave")),
  );
  document.querySelector(".app-header")?.append(back);
} else {
  const demo = true;
  document.querySelector("#app").innerHTML =
    `<div class="hub"><header class="app-header"><img class="hub-logo" src="${import.meta.env.BASE_URL}senai-logo.png" alt="SENAI" width="126" height="48"><div class="brand"><strong>Laboratório de logística</strong><span>${demo ? "Protótipo de demonstração" : "Ambientes de aprendizagem"}</span></div>${demo ? "" : '<button id="hub-logout" class="text-button">Sair</button>'}</header><main class="hub-main"><div class="hub-intro"><p>Um laboratório, dois processos</p><h1>Qual ambiente você quer explorar?</h1><div>Escolha uma linha e conduza suas operações. Você pode voltar aqui a qualquer momento.</div></div><div class="hub-grid">${catalog.map((c) => `<article class="hub-card" data-industry="${c.id}" style="--industry:${c.color}"><div class="hub-art">${illustration(c.id, c.color)}</div><div class="hub-copy"><span>${c.subtitle}</span><h2>${c.name}</h2><p>${c.description}</p><a class="hub-enter" href="?industry=${c.id}${c.id === "beverages" ? "&amp;planta=u" : ""}" aria-label="Entrar em ${c.name}">Entrar no ambiente <span aria-hidden="true">↗</span></a></div></article>`).join("")}</div><p class="hub-note">Explore o processo, ajuste os parâmetros e observe o resultado de cada decisão.</p></main></div>`;
  installHubPreviews(document.querySelector(".hub"));
  document
    .querySelector("#hub-logout")
    ?.addEventListener("click", () =>
      document.dispatchEvent(new Event("auth:logout")),
    );
}
