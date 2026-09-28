"use strict";

/**
 * Backend minimo do qr_code-producao.
 *
 * Continua servindo os arquivos estaticos originais (index.html, consulta.html,
 * app.js, consulta.js, styles.css) sem nenhuma alteracao neles. A novidade e o
 * handshake de SSO com o Gestao SBR: o Gestao SBR (produto acoplador) gera um
 * JWT curto assinado com um segredo compartilhado (DOCKING_SECRET_QR_CODE_PRODUCAO)
 * e redireciona o usuario para GET /api/auth/sso?token=<jwt>. Este servidor
 * valida o token e cria uma sessao PROPRIA (cookie httpOnly assinado, sem
 * nenhuma chamada ao Supabase Auth Admin API), depois manda o navegador direto
 * para /index.html.
 *
 * A permissao de quem chega aqui ja foi decidida no lado do Gestao SBR
 * (permissao industrial.alcool.read, concedida nominalmente) -- por isso este
 * fluxo nao reconfere nada contra app_administradores no Supabase. Esse e o
 * mesmo padrao usado pelos outros produtos acoplados (monitor-impressoras,
 * SBR-KPIS, SBR_LEADS): validar o token da gestao e abrir uma sessao local,
 * sem depender de um provedor de auth externo.
 *
 * IMPORTANTE (limitacao conhecida, ver PR): a tela administrativa deste app
 * fala diretamente com o PostgREST do Supabase a partir do navegador
 * (app.js/supabaseRequest) e as policies de RLS em alcool_registros /
 * app_administradores / app_perfis_usuarios exigem `to authenticated`, ou
 * seja, um JWT real do Supabase Auth (auth.uid() populado). Um usuario
 * autenticado so por esta sessao local NAO tem esse JWT, entao listar/cadastrar
 * /editar/excluir registros e ver o historico continuam exigindo o login
 * Supabase de fato (usuario/senha) feito direto em app.js. Este endpoint apenas
 * reconhece a sessao vinda da gestao para liberar a casca da UI (ver
 * `/api/auth/session` e o trecho novo em app.js); ele nao substitui o login
 * Supabase para quem precisa gravar dados.
 */

const path = require("path");
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 3000;
const DOCKING_SECRET = process.env.DOCKING_SECRET_QR_CODE_PRODUCAO;

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

app.use(express.static(path.join(__dirname)));

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

  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
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

  const token = parseCookies(req)[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Sem sessao." });
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ["HS256"] });
    return res.json({ email: payload.email });
  } catch (error) {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  return res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`qr_code-producao backend ouvindo na porta ${PORT}`);
});
