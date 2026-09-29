"use strict";

/**
 * So para desenvolvimento local: simula o Gestao SBR gerando o mesmo token
 * de SSO que ele gera (JWT HS256 assinado com DOCKING_SECRET_QR_CODE_PRODUCAO)
 * e imprime a URL de handshake. Abrir essa URL no navegador cria a sessao
 * local e cai direto na tela administrativa -- o app nao tem login proprio.
 *
 * Uso: npm run dev-login [-- email@exemplo.com]
 */

require("dotenv").config();

const jwt = require("jsonwebtoken");

const secret = process.env.DOCKING_SECRET_QR_CODE_PRODUCAO;
if (!secret) {
  console.error("DOCKING_SECRET_QR_CODE_PRODUCAO nao definido no .env.");
  process.exit(1);
}

const email = process.argv[2] || "dev@local";
const port = process.env.PORT || 3000;

const token = jwt.sign({ produto: "qr-code-producao", email, sub: "dev-local" }, secret, {
  algorithm: "HS256",
  expiresIn: "5m",
});

console.log(`http://localhost:${port}/api/auth/sso?token=${token}`);
