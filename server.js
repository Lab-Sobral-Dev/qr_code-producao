"use strict";

/**
 * Backend minimo do qr_code-producao.
 *
 * Continua servindo os arquivos estaticos originais (index.html, consulta.html,
 * app.js, consulta.js, styles.css) sem nenhuma alteracao neles. A unica
 * novidade e o handshake de SSO com o Gestao SBR: o Gestao SBR (produto
 * acoplador) gera um JWT curto assinado com um segredo compartilhado
 * (DOCKING_SECRET_QR_CODE_PRODUCAO) e redireciona o usuario para
 * GET /api/auth/sso?token=<jwt>. Este servidor valida o token, garante que o
 * usuario exista no Supabase Auth (auto-provisionando via magic link) e
 * garante o privilegio de administrador do app (tabela app_administradores),
 * depois manda o navegador para /sso-bridge.html, que troca o token de uso
 * unico por uma sessao real do Supabase no localStorage (mesmo formato que
 * app.js ja usa).
 */

const path = require("path");
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;
const DOCKING_SECRET = process.env.DOCKING_SECRET_QR_CODE_PRODUCAO;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://deierwldemkevanfxrwg.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PRODUTO_ESPERADO = "qr-code-producao";
const FRAME_ANCESTORS_CSP =
  "frame-ancestors 'self' http://gestao.labsobralnet.ind https://gestao.laboratoriosobral.com.br";

const app = express();

// CSP (frame-ancestors) via header HTTP real em toda resposta. O <meta>
// CSP que ja existe em index.html/consulta.html continua valendo para as
// demais diretivas (default-src, connect-src etc.), pois frame-ancestors
// so tem efeito quando enviado como header.
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", FRAME_ANCESTORS_CSP);
  next();
});

app.use(express.static(path.join(__dirname)));

app.get("/api/auth/sso", async (req, res) => {
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

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "SSO nao configurado neste ambiente." });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Cria o usuario no Supabase Auth automaticamente se ainda nao existir
    // e devolve um hashed_token de uso unico (magic link) no properties.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData) {
      console.error("[sso] generateLink falhou:", linkError);
      return res.status(502).json({ error: "Falha ao gerar acesso no Supabase." });
    }

    const hashedToken = linkData.properties && linkData.properties.hashed_token;
    const usuarioId = linkData.user && linkData.user.id;

    if (!hashedToken || !usuarioId) {
      console.error("[sso] resposta do Supabase sem hashed_token/user.id:", linkData);
      return res.status(502).json({ error: "Resposta inesperada do Supabase." });
    }

    // app_administradores e a mesma tabela que hoje gateia historico/cadastro
    // no app.js. Chave real e usuario_id (uuid do Supabase Auth), nao email
    // -- ver supabase-security.sql. Sem esse upsert a pessoa autentica mas
    // nao ganha o privilegio de admin que o acesso via Gestao SBR pressupoe.
    const { error: upsertError } = await supabaseAdmin
      .from("app_administradores")
      .upsert({ usuario_id: usuarioId, email, ativo: true }, { onConflict: "usuario_id" });

    if (upsertError) {
      console.error("[sso] upsert em app_administradores falhou:", upsertError);
      return res.status(502).json({ error: "Falha ao autorizar administrador." });
    }

    console.log(`[sso] handshake ok: ad_login=${payload.sub || "?"} email=${email}`);

    const redirectUrl =
      "/sso-bridge.html?email=" +
      encodeURIComponent(email) +
      "&token=" +
      encodeURIComponent(hashedToken);

    return res.redirect(302, redirectUrl);
  } catch (error) {
    console.error("[sso] erro inesperado:", error);
    return res.status(502).json({ error: "Falha ao processar SSO." });
  }
});

app.listen(PORT, () => {
  console.log(`qr_code-producao backend ouvindo na porta ${PORT}`);
});
