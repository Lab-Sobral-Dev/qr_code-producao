# Seguranca

## Estado atual

O app roda como servico Docker (Express + SQLite local), embutido no Gestao SBR. Nao ha login proprio nem dependencia do Supabase.

## Controles aplicados

- A tela administrativa e as rotas `/api/registros*` exigem a sessao local criada pelo SSO do Gestao SBR (`/api/auth/sso`): JWT HS256 validado com `DOCKING_SECRET_QR_CODE_PRODUCAO` e restrito ao produto `qr-code-producao`.
- A sessao local e um cookie httpOnly, `Secure`, `SameSite=None`, assinado com `SESSION_SECRET` (separado do segredo de SSO) e com validade de 8h.
- A permissao de acesso e decidida no Gestao SBR (`industrial.alcool.read`); quem chega pelo SSO pode cadastrar, editar, excluir e ver o historico.
- O header `Content-Security-Policy: frame-ancestors` so permite o app embutido no proprio host e no Gestao SBR.
- A consulta publica do QR Code (`GET /api/registros/:id/consulta`) retorna no maximo um registro pelo `id`, sem autenticacao.
- A tabela `alcool_registros_historico` registra criacao, edicao e exclusao com usuario, data/hora e valores antes/depois.
- O backend valida campos obrigatorios, tamanho de texto, datas e impede preparo posterior a validade.
- Parametros como `tag`, `validade` e `setor` na URL nao sao aceitos como fonte da verdade.
- As paginas tem Content Security Policy e sao marcadas como `noindex`.
- O backend serve so os arquivos do front, por lista explicita (`server.js`, `ARQUIVOS_PUBLICOS`); codigo do servidor, `package.json`, `.env` e o banco nunca sao servidos.
- O QR Code e gerado no navegador (`qrcode-generator`); o link de consulta nao e enviado a servico externo.
- O `.dockerignore` impede que `.env`, `data/`, `.git/` e o `node_modules` do host entrem na imagem.
- `npm test` cobre os controles acima (arquivos servidos, 401 sem sessao, SSO invalido, CRUD e auditoria).

## Segredos

`DOCKING_SECRET_QR_CODE_PRODUCAO` e `SESSION_SECRET` ficam so no `.env` do servidor (nunca commitados). O `DOCKING_SECRET_QR_CODE_PRODUCAO` deve ser identico ao configurado no Gestao SBR.
