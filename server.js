"use strict";

/**
 * Backend do qr_code-producao.
 *
 * Continua servindo os arquivos estaticos originais (index.html, consulta.html,
 * app.js, consulta.js, styles.css). O handshake de SSO com o Gestao SBR: o
 * Gestao SBR (produto acoplador) gera um JWT curto assinado com um segredo
 * compartilhado (DOCKING_SECRET_QR_CODE_PRODUCAO) e redireciona o usuario
 * para GET /api/auth/sso?token=<jwt>. Este servidor valida o token e cria uma
 * sessao PROPRIA (cookie httpOnly assinado, sem nenhuma chamada ao Supabase
 * Auth Admin API), depois manda o navegador direto para /index.html.
 *
 * A permissao de quem chega aqui ja foi decidida no lado do Gestao SBR
 * (permissao industrial.alcool.read, concedida nominalmente) -- por isso este
 * fluxo nao reconfere nada contra app_administradores no Supabase. Esse e o
 * mesmo padrao usado pelos outros produtos acoplados (monitor-impressoras,
 * SBR-KPIS, SBR_LEADS): validar o token da gestao e abrir uma sessao local,
 * sem depender de um provedor de auth externo.
 *
 * DADOS (alcool_registros / alcool_registros_historico): moraram no Supabase
 * ate esta versao. Como o app ainda nao tinha dado real em producao, a
 * decisao foi tirar tambem o Supabase como BANCO DE DADOS (ja tinha saido
 * como provedor de Auth Admin, ver historico do repo) e usar SQLite local
 * (ver db.js), no mesmo padrao do monitor-impressoras (arquivo em
 * DATABASE_PATH, volume Docker persistente).
 *
 * LOGIN: nao ha login proprio. O app roda embutido no Gestao SBR e a UNICA
 * forma de acesso a tela administrativa e as rotas /api/registros* e a
 * sessao local criada pelo SSO acima. O login manual via Supabase Auth
 * (usuario/senha, troca de senha, app_administradores) foi removido -- este
 * backend nao depende mais do Supabase para nada. A consulta publica do QR
 * Code (GET /api/registros/:id/consulta) continua sem autenticacao.
 */

const path = require("path");
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");

const db = require("./db");

const PORT = process.env.PORT || 3000;
const DOCKING_SECRET = process.env.DOCKING_SECRET_QR_CODE_PRODUCAO;
// Endereco que vai dentro do QR Code (opcional). Sem ele, o front usa o
// endereco da propria pagina -- que rodando local e "localhost" e nao abre
// no celular. Ver .env.example.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

// Mesmos limites usados na validacao client-side de app.js (validateRecord /
// isAllowedExpiration). Mantidos em sincronia manualmente -- nao ha build
// step compartilhado entre o browser script e este backend, e agora e este
// backend (sem RLS do Supabase por tras) quem garante a forma dos dados.
const MIN_EXPIRATION_DATE = "2026-01-01";
const MAX_EXPIRATION_DATE = "2100-12-31";
const MAX_TEXT_LENGTH = 120;
const MAX_OBSERVACOES_LENGTH = 2000; // JSON serializado de area/solution/preparation/prepCode/notes
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Segredo dedicado a sessao local, separado do DOCKING_SECRET. O DOCKING_SECRET
// autentica o handshake entre dois sistemas (Gestao SBR -> qr_code-producao);
// o SESSION_SECRET assina uma sessao que nunca sai deste app. Manter os dois
// separados evita que o vazamento de um comprometa o outro e deixa explicito
// qual segredo protege qual fronteira de confianca.
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE_NAME = "qrcode_producao_session";
const SESSION_TTL = "8h";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const PRODUTO_ESPERADO = "qr-code-producao";
const FRAME_ANCESTORS_CSP =
  "frame-ancestors 'self' http://gestao.labsobralnet.ind https://gestao.laboratoriosobral.com.br";

const app = express();

// Necessario para res.cookie(..., { secure: true }) respeitar o esquema real
// quando o app roda atras de um proxy reverso que termina TLS.
app.set("trust proxy", 1);

// CSP (frame-ancestors) via header HTTP real em toda resposta. O <meta>
// CSP que ja existe em index.html/consulta.html continua valendo para as
// demais diretivas (default-src, connect-src etc.), pois frame-ancestors
// so tem efeito quando enviado como header.
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", FRAME_ANCESTORS_CSP);
  next();
});

// Serve SO os arquivos do front, por lista explicita. express.static na raiz
// do projeto expunha server.js, db.js, package.json, README etc. (e, rodando
// local, ate data/banco.db). Arquivo novo do front precisa entrar aqui.
const ARQUIVOS_PUBLICOS = {
  "/index.html": "index.html",
  "/consulta.html": "consulta.html",
  "/app.js": "app.js",
  "/consulta.js": "consulta.js",
  "/styles.css": "styles.css",
  // Gerador de QR Code no navegador (sem depender de servico externo).
  "/vendor/qrcode.js": "node_modules/qrcode-generator/dist/qrcode.js",
};

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
for (const [rota, arquivo] of Object.entries(ARQUIVOS_PUBLICOS)) {
  app.get(rota, (req, res) => res.sendFile(path.join(__dirname, arquivo)));
}

// So as rotas /api/registros* leem corpo JSON; limite baixo por serem
// formularios pequenos.
app.use(express.json({ limit: "100kb" }));

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(";").reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) return cookies;

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

// Le e valida o cookie de sessao local. Reaproveitada por /api/auth/session
// e pelo middleware requireDataAccess das rotas de dado -- unica leitura do
// cookie, nao duplicar essa logica em cada rota.
function readLocalSession(req) {
  if (!SESSION_SECRET) return { ok: false, reason: "unconfigured" };

  const token = parseCookies(req)[SESSION_COOKIE_NAME];
  if (!token) return { ok: false, reason: "missing" };

  try {
    const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ["HS256"] });
    return { ok: true, email: payload.email };
  } catch (error) {
    return { ok: false, reason: "invalid" };
  }
}

// Autoriza as rotas de dado: exige a sessao local criada pelo SSO do Gestao
// SBR (a permissao ja foi decidida la). Preenche req.actingUser para as
// rotas usarem no historico de auditoria.
function requireDataAccess(req, res, next) {
  const localSession = readLocalSession(req);
  if (!localSession.ok) {
    return res.status(401).json({ error: "Sem sessao valida." });
  }

  req.actingUser = { email: localSession.email };
  return next();
}

function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isAllowedDate(value) {
  return (
    typeof value === "string" &&
    DATE_ONLY_REGEX.test(value) &&
    value >= MIN_EXPIRATION_DATE &&
    value <= MAX_EXPIRATION_DATE
  );
}

// Espelha os campos que app.js/toDatabaseItem produz (tag, endereco,
// validade, responsavel, observacoes[, id]). Sem RLS do Supabase por tras,
// esta e a validacao de forma que os dados passam a ter.
function validateRegistroPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Corpo da requisicao invalido.";
  }
  if (!isNonEmptyString(payload.tag, MAX_TEXT_LENGTH)) {
    return "Campo 'tag' invalido.";
  }
  if (!isNonEmptyString(payload.endereco, MAX_TEXT_LENGTH)) {
    return "Campo 'endereco' invalido.";
  }
  if (!isAllowedDate(payload.validade)) {
    return "Campo 'validade' invalido.";
  }
  if (
    payload.responsavel != null &&
    (typeof payload.responsavel !== "string" || payload.responsavel.length > MAX_TEXT_LENGTH)
  ) {
    return "Campo 'responsavel' invalido.";
  }
  if (typeof payload.observacoes !== "string" || payload.observacoes.length > MAX_OBSERVACOES_LENGTH) {
    return "Campo 'observacoes' invalido.";
  }
  if (payload.id != null && (typeof payload.id !== "string" || !UUID_REGEX.test(payload.id))) {
    return "Campo 'id' invalido.";
  }
  return null;
}

// So repassa os campos conhecidos para o banco -- nunca o payload cru.
function sanitizeRegistroPayload(payload, { includeId = false } = {}) {
  const clean = {
    tag: payload.tag.trim(),
    endereco: payload.endereco.trim(),
    validade: payload.validade,
    responsavel: payload.responsavel ? payload.responsavel.trim() : null,
    observacoes: payload.observacoes,
  };

  if (includeId && payload.id) {
    clean.id = payload.id;
  }

  return clean;
}

app.get("/api/auth/sso", (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).json({ error: "Parametro 'token' e obrigatorio." });
  }

  if (!DOCKING_SECRET) {
    return res.status(503).json({ error: "SSO nao configurado neste ambiente." });
  }

  let payload;
  try {
    payload = jwt.verify(token, DOCKING_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    return res.status(401).json({ error: "Token invalido ou expirado." });
  }

  if (payload.produto !== PRODUTO_ESPERADO) {
    return res.status(401).json({ error: "Token nao autorizado para este produto." });
  }

  const email = payload.email;
  if (!email) {
    return res.status(401).json({ error: "Token sem claim 'email'." });
  }

  if (!SESSION_SECRET) {
    return res.status(503).json({ error: "Sessao local nao configurada neste ambiente." });
  }

  const sessionToken = jwt.sign({ email }, SESSION_SECRET, {
    algorithm: "HS256",
    expiresIn: SESSION_TTL,
  });

  // SameSite=None e obrigatorio: este app roda embutido num iframe cross-site
  // dentro do Gestao SBR (dominio diferente). Cookie Lax so e enviado em
  // navegacao de TOPO da aba inteira -- uma navegacao acontecendo dentro do
  // iframe (como este proprio redirect) e cross-site do ponto de vista do
  // browser, entao Lax nunca persiste aqui (achado ao vivo 2026-09-29: sessao
  // nunca sobrevivia, app.js sempre caia na tela de login). None exige Secure,
  // por isso o vhost SSL interno (labsobralnet-wildcard.crt) e obrigatorio,
  // nao so cosmetico -- Secure fixo em vez de req.secure para nunca setar
  // cookie sem a flag pelo caminho HTTP puro (porta 80) por engano.
  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  console.log(`[sso] sessao local criada: ad_login=${payload.sub || "?"} email=${email}`);

  return res.redirect(302, "/index.html");
});

app.get("/api/auth/session", (req, res) => {
  if (!SESSION_SECRET) {
    return res.status(503).json({ error: "Sessao local nao configurada neste ambiente." });
  }

  const session = readLocalSession(req);
  if (!session.ok) {
    const message = session.reason === "missing" ? "Sem sessao." : "Sessao invalida ou expirada.";
    return res.status(401).json({ error: message });
  }

  return res.json(PUBLIC_BASE_URL ? { email: session.email, publicBaseUrl: PUBLIC_BASE_URL } : { email: session.email });
});

// --- Dados (alcool_registros) -------------------------------------------
// Ver comentario no topo do arquivo. Cada rota (exceto a consulta publica)
// exige a sessao do SSO e grava quem alterou no historico de auditoria.

app.get("/api/registros", requireDataAccess, (req, res) => {
  return res.json(db.listarRegistros());
});

app.post("/api/registros", requireDataAccess, (req, res) => {
  const validationError = validateRegistroPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const payload = sanitizeRegistroPayload(req.body, { includeId: true });
  const registro = db.criarRegistro(payload, req.actingUser);
  return res.status(201).json(registro);
});

app.patch("/api/registros/:id", requireDataAccess, (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador invalido." });
  }

  const validationError = validateRegistroPayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const payload = sanitizeRegistroPayload(req.body);
  const registro = db.atualizarRegistro(req.params.id, payload, req.actingUser);
  if (!registro) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  return res.json(registro);
});

app.delete("/api/registros/:id", requireDataAccess, (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador invalido." });
  }

  const removido = db.excluirRegistro(req.params.id, req.actingUser);
  if (!removido) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  return res.status(204).end();
});

app.get("/api/registros-historico", requireDataAccess, (req, res) => {
  return res.json(db.listarHistorico(100));
});

// Consulta publica por QR Code: sem autenticacao, mesmo espirito da RPC
// anonima que existia no Supabase (consultar_alcool_registro). So devolve o
// registro em si, nunca historico nem dado de outro usuario.
app.get("/api/registros/:id/consulta", (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  const registro = db.buscarRegistro(req.params.id);
  if (!registro) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  return res.json(registro);
});

// Handler generico de erro: nunca deixa detalhe de implementacao vazar pro
// cliente.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[erro]", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: "Erro interno." });
});

app.listen(PORT, () => {
  console.log(`qr_code-producao backend ouvindo na porta ${PORT} (banco: ${db.DATABASE_PATH})`);
});
