# Controle de Alcool 70%

Aplicacao web simples para cadastrar borrifadores, gerar QR Codes e abrir uma pagina de consulta com os dados atuais da solução preparada.

## Como usar

Rode via `npm start` (ver "Rodando localmente" abaixo) e acesse `http://localhost:3000`, cadastre os frascos e use `Imprimir QR` no registro desejado.

Os cadastros ficam salvos num banco SQLite local (arquivo `DATABASE_PATH`, ver Dockerfile/`.env.example`), servido pelo proprio backend Express (`server.js`/`db.js`). O navegador mantem uma copia local apenas como cache/backup caso a conexao falhe.

Antes dos cards de edicao, a tela mostra uma tabela de controle com recipiente, setor, area, solução atual, validade, status calculado e código do preparo.

O QR Code leva apenas o identificador do registro e consulta o backend (`GET /api/registros/:id/consulta`, sem autenticacao). Assim, quando a TAG e editada, a pagina do QR mostra a validade e os dados da ultima solução preparada. A imagem do QR e gerada no proprio navegador (`qrcode-generator`, servido em `/vendor/qrcode.js`), sem servico externo.

## Publicacao

Este app roda como servico Docker (`Dockerfile`), tipicamente atras do mesmo host que serve o `qr_code-producao` acoplado ao Gestao SBR. **Importante:** como o cadastro agora vive num banco SQLite local ao backend, o modo antigo de publicar como pagina 100% estatica (GitHub Pages, `https://lab-sobral-dev.github.io/qr_code-producao/`) deixou de funcionar para tela administrativa e consulta publica -- ambas dependem de `/api/registros*`, que so existe quando o Express esta rodando. GitHub Pages so serve para abrir os arquivos estaticos sem nenhum dado.

## Rodando localmente

```
npm install
cp .env.example .env   # preencher DOCKING_SECRET_QR_CODE_PRODUCAO e SESSION_SECRET
npm start               # sobe em http://localhost:3000
npm run dev-login       # imprime a URL de SSO para entrar localmente (ver abaixo)
npm test                # testes ponta a ponta do backend (sobe o server.js com banco temporario)
```

**Windows:** `better-sqlite3@13` nao publica binario pronto para Windows e compila via `node-gyp`, o que exige o Visual Studio Build Tools ("Desktop development with C++"). Sem ele, o `npm install` falha. Contorno so para desenvolvimento local, sem alterar `package.json`/lock: `npm install --no-save better-sqlite3@12` (tem binario pronto e a mesma API). A imagem Docker continua compilando a v13.

O backend serve **so** os arquivos do front, por lista explicita (`ARQUIVOS_PUBLICOS` em `server.js`): `index.html`, `consulta.html`, `app.js`, `consulta.js`, `styles.css` e `vendor/qrcode.js`. Arquivo novo do front precisa entrar nessa lista. Alem disso:

- `/api/auth/sso` (handshake de SSO com o Gestao SBR) e `/api/auth/session` (confere a sessao local), alem do header de CSP `frame-ancestors`.
- `/api/registros` (GET lista, POST cria), `/api/registros/:id` (PATCH edita, DELETE exclui), `/api/registros-historico` (GET) e `/api/registros/:id/consulta` (GET publico, usado pelo QR Code) -- todos batendo no SQLite local (`db.js`).

## Acesso (sem login proprio)

O app roda embutido no Gestao SBR (`/industrial/qr-code-alcool`) e **nao tem tela de login**. A unica forma de acesso a tela administrativa e o SSO: o Gestao SBR gera um JWT curto assinado com `DOCKING_SECRET_QR_CODE_PRODUCAO` e redireciona para `/api/auth/sso?token=...`, que cria uma sessao local (cookie httpOnly assinado com `SESSION_SECRET`, validade de 8h). A permissao ja foi decidida no Gestao SBR, entao quem chega por ali pode listar, cadastrar, editar, excluir e ver o historico.

Quem abre o app fora do Gestao SBR, ou com a sessao expirada, ve apenas a mensagem "Acesse pelo Gestao SBR". A consulta publica do QR Code continua sem autenticacao.

Para testar localmente sem o Gestao SBR, rode `npm run dev-login [email]`: o script gera um token de SSO assinado com o `DOCKING_SECRET_QR_CODE_PRODUCAO` do seu `.env` e imprime a URL de handshake. Abra essa URL no navegador (vale por 5 minutos) e voce cai direto na tela administrativa.

O historico de auditoria (`alcool_registros_historico`) e gravado pelo proprio backend a cada INSERT/UPDATE/DELETE, com o `usuario_email` vindo da sessao do SSO.

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
