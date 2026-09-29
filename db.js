"use strict";

/**
 * Banco de dados PROPRIO do qr_code-producao (SQLite via better-sqlite3),
 * substituindo o Supabase como armazenamento de dado de negocio.
 *
 * Continua nao havendo dependencia de conta/chave externa para os dados de
 * `alcool_registros`/`alcool_registros_historico`: tudo vive num arquivo
 * local, no mesmo padrao usado pelo monitor-impressoras (SQLite local com
 * volume Docker persistente, ver DATABASE_PATH no Dockerfile).
 *
 * A autenticacao (so SSO do Gestao SBR, sem login proprio) fica em server.js.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "banco.db");

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS alcool_registros (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL,
    endereco TEXT NOT NULL,
    validade TEXT NOT NULL,
    responsavel TEXT,
    observacoes TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alcool_registros_historico (
    id TEXT PRIMARY KEY,
    registro_id TEXT,
    acao TEXT NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
    tag TEXT,
    usuario_id TEXT,
    usuario_email TEXT,
    valor_antigo TEXT,
    valor_novo TEXT,
    alterado_em TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_historico_alterado_em
    ON alcool_registros_historico (alterado_em DESC);
`);

function novoId() {
  return crypto.randomUUID();
}

function agora() {
  return new Date().toISOString();
}

// Grava uma linha de auditoria. Antes (via Supabase/trigger), quem alterou so
// era capturado para quem logava direto no Supabase (auth.uid()/auth.jwt());
// alteracoes via sessao local ficavam com usuario_id/usuario_email nulos.
// Agora o backend e o unico dono do dado, entao capturamos quemAlterou dos
// dois caminhos de login igualmente.
function registrarHistorico({ registroId, acao, tag, quemAlterou, valorAntigo, valorNovo }) {
  db.prepare(
    `INSERT INTO alcool_registros_historico
      (id, registro_id, acao, tag, usuario_id, usuario_email, valor_antigo, valor_novo, alterado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    novoId(),
    registroId,
    acao,
    tag || null,
    quemAlterou?.id || null,
    quemAlterou?.email || null,
    valorAntigo ? JSON.stringify(valorAntigo) : null,
    valorNovo ? JSON.stringify(valorNovo) : null,
    agora()
  );
}

function listarRegistros() {
  return db.prepare("SELECT * FROM alcool_registros ORDER BY criado_em DESC").all();
}

function buscarRegistro(id) {
  return db.prepare("SELECT * FROM alcool_registros WHERE id = ?").get(id) || null;
}

function criarRegistro(payload, quemAlterou) {
  const id = payload.id || novoId();
  const timestamp = agora();
  const registro = {
    id,
    tag: payload.tag,
    endereco: payload.endereco,
    validade: payload.validade,
    responsavel: payload.responsavel || null,
    observacoes: payload.observacoes || null,
    criado_em: timestamp,
    atualizado_em: timestamp,
  };

  db.prepare(
    `INSERT INTO alcool_registros
      (id, tag, endereco, validade, responsavel, observacoes, criado_em, atualizado_em)
     VALUES (@id, @tag, @endereco, @validade, @responsavel, @observacoes, @criado_em, @atualizado_em)`
  ).run(registro);

  registrarHistorico({
    registroId: id,
    acao: "INSERT",
    tag: registro.tag,
    quemAlterou,
    valorAntigo: null,
    valorNovo: registro,
  });

  return registro;
}

// Retorna null quando o id nao existe (o chamador decide o 404).
function atualizarRegistro(id, payload, quemAlterou) {
  const existente = buscarRegistro(id);
  if (!existente) return null;

  const atualizado = {
    ...existente,
    tag: payload.tag,
    endereco: payload.endereco,
    validade: payload.validade,
    responsavel: payload.responsavel || null,
    observacoes: payload.observacoes || null,
    atualizado_em: agora(),
  };

  db.prepare(
    `UPDATE alcool_registros
        SET tag = @tag, endereco = @endereco, validade = @validade,
            responsavel = @responsavel, observacoes = @observacoes, atualizado_em = @atualizado_em
      WHERE id = @id`
  ).run(atualizado);

  registrarHistorico({
    registroId: id,
    acao: "UPDATE",
    tag: atualizado.tag,
    quemAlterou,
    valorAntigo: existente,
    valorNovo: atualizado,
  });

  return atualizado;
}

function excluirRegistro(id, quemAlterou) {
  const existente = buscarRegistro(id);
  if (!existente) return false;

  db.prepare("DELETE FROM alcool_registros WHERE id = ?").run(id);

  registrarHistorico({
    registroId: id,
    acao: "DELETE",
    tag: existente.tag,
    quemAlterou,
    valorAntigo: existente,
    valorNovo: null,
  });

  return true;
}

function listarHistorico(limit = 100) {
  return db
    .prepare("SELECT * FROM alcool_registros_historico ORDER BY alterado_em DESC LIMIT ?")
    .all(limit)
    .map((row) => ({
      ...row,
      valor_antigo: row.valor_antigo ? JSON.parse(row.valor_antigo) : null,
      valor_novo: row.valor_novo ? JSON.parse(row.valor_novo) : null,
    }));
}

module.exports = {
  DATABASE_PATH,
  listarRegistros,
  buscarRegistro,
  criarRegistro,
  atualizarRegistro,
  excluirRegistro,
  listarHistorico,
};
