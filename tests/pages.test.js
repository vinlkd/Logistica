import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
let configurationId = 0;
async function withRepository(repository, run) {
  const previous = process.env.GITHUB_REPOSITORY;
  if (repository === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = repository;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previous;
  }
}
async function configuration(mode) {
  const url = new URL("../vite.config.js", import.meta.url);
  url.searchParams.set("pages-test", String(++configurationId));
  const { default: factory } = await import(url.href);
  return typeof factory === "function"
    ? factory({ mode, command: "build" })
    : factory;
}
function outputs(result) {
  return (Array.isArray(result) ? result : [result]).flatMap(
    (bundle) => bundle.output,
  );
}

test("Pages default targets Prototipo-Logistica subdirectory and separate output", async () => {
  await withRepository(undefined, async () => {
    const pages = await configuration("pages");
    assert.equal(pages.base, "/Prototipo-Logistica/");
    assert.equal(pages.build.outDir, "dist-pages");
    const normal = await configuration("production");
    assert.equal(normal.base, "./");
    assert.equal(normal.build.outDir, "dist");
  });
});

test("Pages derives its path from GitHub repository metadata instead of an old repository name", async () => {
  await withRepository("vinlkd/outro-repositorio", async () => {
    assert.equal((await configuration("pages")).base, "/outro-repositorio/");
    assert.equal((await configuration("development")).base, "./");
  });
});

test("compiled Pages demo uses hashed subdirectory assets and excludes backend authentication", async () => {
  await withRepository("vinlkd/Prototipo-Logistica", async () => {
    const result = await build({
      root,
      mode: "pages",
      logLevel: "silent",
      build: { write: false },
    });
    const files = outputs(result),
      index = files.find((file) => file.fileName === "index.html");
    assert.ok(index, "Compiled HTML must be emitted");
    const html = String(index.source),
      javascript = files
        .filter((file) => file.type === "chunk")
        .map((file) => file.code)
        .join("\n");
    assert.match(html, /\/Prototipo-Logistica\/assets\/[^" ]+\.js/);
    assert.equal(
      html.includes("/src/main.js"),
      false,
      "Source entry must not be published as the runtime entry",
    );
    assert.equal(
      javascript.includes("/api/auth/"),
      false,
      "Demo must not call a missing backend",
    );
    assert.equal(
      javascript.includes("current-password"),
      false,
      "Login form must not be loaded into the demo",
    );
    assert.ok(javascript.includes("Recebimento"), "Simulator must be included");
    assert.equal(
      javascript.includes("senai-truck-logo"),
      false,
      "Published demo must not contain SENAI truck decals",
    );
    assert.ok(
      javascript.includes("senai-signature") &&
        javascript.includes("senai-logo.png"),
      "The header SENAI logo must remain",
    );
    for (const privateMarker of [
      "AUTH_JWT_SECRET",
      "SMTP_PASSWORD",
      "node:sqlite",
    ])
      assert.equal(javascript.includes(privateMarker), false);
  });
});

test("normal production build retains authentication and keeps server-only secrets out of client files", async () => {
  const files = outputs(
    await build({
      root,
      mode: "production",
      logLevel: "silent",
      build: { write: false },
    }),
  );
  const javascript = files
    .filter((file) => file.type === "chunk")
    .map((file) => file.code)
    .join("\n");
  assert.ok(
    javascript.includes("/api/auth/"),
    "Normal build must retain the authenticated entry",
  );
  assert.ok(
    javascript.includes("current-password"),
    "Normal build must retain the login form",
  );
  for (const privateMarker of [
    "AUTH_JWT_SECRET",
    "SMTP_PASSWORD",
    "node:sqlite",
  ])
    assert.equal(javascript.includes(privateMarker), false);
});
