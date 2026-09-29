"use strict";

/**
 * Testes ponta a ponta do backend: sobe o server.js de verdade numa porta
 * livre, com banco SQLite temporario e segredos proprios do teste, e bate
 * nas rotas via HTTP. Rodar com: npm test
 */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const jwt = require("jsonwebtoken");

const DOCKING_SECRET = "segredo-docking-de-teste";
const SESSION_SECRET = "segredo-sessao-de-teste";

let server;
let baseUrl;
let tmpDir;
let registroId;
let cookie;

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function tokenSso(claims = {}, secret = DOCKING_SECRET) {
  return jwt.sign({ produto: "qr-code-producao", email: "teste@lab.com", sub: "teste", ...claims }, secret, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

function chamar(rota, { method = "GET", body, comSessao = false, headers = {} } = {}) {
  return fetch(baseUrl + rota, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(comSessao ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const registroValido = {
  tag: "TESTE-01",
  endereco: "Setor A",
  validade: "2026-12-31",
  responsavel: "Fulano",
  observacoes: JSON.stringify({ area: "Area 1", solution: "Alcool 70%", preparation: "2026-09-29", prepCode: "LB-1", notes: "" }),
};

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qrcode-producao-test-"));
  const port = await portaLivre();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path.join(tmpDir, "banco.db"),
      DOCKING_SECRET_QR_CODE_PRODUCAO: DOCKING_SECRET,
      SESSION_SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("servidor nao subiu em 10s")), 10000);
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("ouvindo")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on("exit", (code) => reject(new Error(`servidor saiu com codigo ${code}`)));
  });
});

after(async () => {
  // Espera o processo sair de fato antes de apagar o banco: no Windows o
  // arquivo SQLite fica travado (EBUSY) enquanto o servidor estiver vivo.
  if (server && server.exitCode === null) {
    const saiu = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await saiu;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test("serve so os arquivos do front", async () => {
  for (const rota of ["/", "/index.html", "/consulta.html", "/app.js", "/consulta.js", "/styles.css", "/vendor/qrcode.js"]) {
    assert.equal((await chamar(rota)).status, 200, rota);
  }
  for (const rota of ["/server.js", "/db.js", "/package.json", "/README.md", "/Dockerfile", "/.env", "/data/banco.db", "/scripts/dev-login.js"]) {
    assert.equal((await chamar(rota)).status, 404, rota);
  }
});

test("rotas de dado exigem sessao do SSO", async () => {
  assert.equal((await chamar("/api/registros")).status, 401);
  assert.equal((await chamar("/api/registros-historico")).status, 401);
  assert.equal((await chamar("/api/registros", { method: "POST", body: registroValido })).status, 401);
  assert.equal((await chamar("/api/auth/session")).status, 401);
  // O antigo caminho do Supabase (Bearer) nao abre mais nada.
  assert.equal((await chamar("/api/registros", { headers: { Authorization: "Bearer qualquer" } })).status, 401);
});

test("SSO recusa token invalido, de outro produto ou assinado com outro segredo", async () => {
  assert.equal((await chamar("/api/auth/sso")).status, 400);
  assert.equal((await chamar("/api/auth/sso?token=xyz")).status, 401);
  assert.equal((await chamar(`/api/auth/sso?token=${tokenSso({ produto: "outro" })}`)).status, 401);
  assert.equal((await chamar(`/api/auth/sso?token=${tokenSso({}, "segredo-errado")}`)).status, 401);
});

test("SSO valido cria sessao e redireciona para o painel", async () => {
  const res = await chamar(`/api/auth/sso?token=${tokenSso()}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/index.html");

  const setCookie = res.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  cookie = setCookie.split(";")[0];

  const sessao = await chamar("/api/auth/session", { comSessao: true });
  assert.equal(sessao.status, 200);
  assert.deepEqual(await sessao.json(), { email: "teste@lab.com" });
});

test("CRUD com sessao, consulta publica e historico com o e-mail do SSO", async () => {
  const criado = await chamar("/api/registros", { method: "POST", body: registroValido, comSessao: true });
  assert.equal(criado.status, 201);
  registroId = (await criado.json()).id;

  const lista = await (await chamar("/api/registros", { comSessao: true })).json();
  assert.ok(lista.some((r) => r.id === registroId));

  const editado = await chamar(`/api/registros/${registroId}`, {
    method: "PATCH",
    body: { ...registroValido, tag: "TESTE-01B" },
    comSessao: true,
  });
  assert.equal(editado.status, 200);

  const consulta = await chamar(`/api/registros/${registroId}/consulta`);
  assert.equal(consulta.status, 200);
  assert.equal((await consulta.json()).tag, "TESTE-01B");

  const historico = await (await chamar("/api/registros-historico", { comSessao: true })).json();
  const doRegistro = historico.filter((h) => h.registro_id === registroId);
  assert.equal(doRegistro.length, 2);
  assert.ok(doRegistro.every((h) => h.usuario_email === "teste@lab.com"));

  assert.equal((await chamar(`/api/registros/${registroId}`, { method: "DELETE", comSessao: true })).status, 204);
  assert.equal((await chamar(`/api/registros/${registroId}/consulta`)).status, 404);
});

test("backend valida o cadastro", async () => {
  const semTag = await chamar("/api/registros", { method: "POST", body: { ...registroValido, tag: "" }, comSessao: true });
  assert.equal(semTag.status, 400);

  const validadeForaDoLimite = await chamar("/api/registros", {
    method: "POST",
    body: { ...registroValido, validade: "2025-01-01" },
    comSessao: true,
  });
  assert.equal(validadeForaDoLimite.status, 400);
});
