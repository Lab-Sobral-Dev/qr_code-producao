# Controle de Alcool 70%

Aplicacao web simples para cadastrar borrifadores, gerar QR Codes e abrir uma pagina de consulta com os dados atuais da solução preparada.

## Como usar

Rode via `npm start` (ver "Rodando localmente" abaixo) e acesse `http://localhost:3000`, cadastre os frascos e use `Imprimir QR` no registro desejado.

Os cadastros ficam salvos num banco SQLite local (arquivo `DATABASE_PATH`, ver Dockerfile/`.env.example`), servido pelo proprio backend Express (`server.js`/`db.js`). O navegador mantem uma copia local apenas como cache/backup caso a conexao falhe.

Antes dos cards de edicao, a tela mostra uma tabela de controle com recipiente, setor, area, solução atual, validade, status calculado e código do preparo.

O QR Code leva apenas o identificador do registro e consulta o backend (`GET /api/registros/:id/consulta`, sem autenticacao). Assim, quando a TAG e editada, a pagina do QR mostra a validade e os dados da ultima solução preparada.

## Publicacao

Este app roda como servico Docker (`Dockerfile`), tipicamente atras do mesmo host que serve o `qr_code-producao` acoplado ao Gestao SBR. **Importante:** como o cadastro agora vive num banco SQLite local ao backend, o modo antigo de publicar como pagina 100% estatica (GitHub Pages, `https://lab-sobral-dev.github.io/qr_code-producao/`) deixou de funcionar para tela administrativa e consulta publica -- ambas dependem de `/api/registros*`, que so existe quando o Express esta rodando. GitHub Pages so serve para abrir os arquivos estaticos sem nenhum dado.

## Rodando localmente

```
npm install
cp .env.example .env   # preencher DOCKING_SECRET_QR_CODE_PRODUCAO e SESSION_SECRET
npm start               # sobe em http://localhost:3000
```

O backend adiciona:

- `/api/auth/sso` (handshake de SSO com o Gestao SBR), `/api/auth/session` (confere a sessao local) e `/api/auth/logout`, alem do header de CSP `frame-ancestors`.
- `/api/registros` (GET lista, POST cria), `/api/registros/:id` (PATCH edita, DELETE exclui), `/api/registros-historico` (GET, restrito a administrador) e `/api/registros/:id/consulta` (GET publico, usado pelo QR Code) -- todos batendo no SQLite local (`db.js`), nunca no Supabase.

**Login continua dual**, sem mudanca nesta parte:

- Login manual (usuario/senha, `app.js`/`state.session`) continua no Supabase Auth. `app_administradores`/`app_perfis_usuarios` tambem continuam no Supabase (RLS de verdade, ver `supabase-security.sql`): sao metadado de autorizacao amarrado a `auth.users`, nao dado de negocio, entao ficaram fora da migracao para SQLite.
- Sessao local (SSO do Gestao SBR) continua no cookie httpOnly assinado com `SESSION_SECRET`.

**As rotas de dado aceitam as duas sessoes** (mesma regra que as RLS antigas expressavam: qualquer usuario autenticado pode listar/cadastrar/editar/excluir; so o historico e restrito a administrador). Para quem loga manual, o backend valida o `access_token` direto contra o Supabase Auth (`GET /auth/v1/user`) e, para o historico, confere `app_administradores` -- sem nenhuma `service_role key`, so a chave publica (anon/publishable) ja hardcoded em `app.js`.

O historico de auditoria (`alcool_registros_historico`) agora e gravado pelo proprio backend a cada INSERT/UPDATE/DELETE, capturando `usuario_email` tanto para quem loga manual quanto para quem entra via SSO -- antes, alteracoes via SSO ficavam com esse campo nulo porque a service_role key (removida) nao carregava contexto de autenticacao do Supabase.

## Campos

- TAG Borrifador
- Setor
- Área
- Responsável
- Nome da solução atual
- Data do preparo
- Data de validade
- Código do preparo (logbook)
- Observacoes
