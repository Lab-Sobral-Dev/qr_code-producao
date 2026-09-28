# Controle de Alcool 70%

Aplicacao web simples para cadastrar borrifadores, gerar QR Codes e abrir uma pagina de consulta com os dados atuais da solução preparada.

## Como usar

Abra `index.html` no navegador ou use o GitHub Pages, cadastre os frascos e use `Imprimir QR` no registro desejado.

Os cadastros ficam salvos no Supabase. O navegador mantem uma copia local apenas como cache/backup caso a conexao falhe.

Antes dos cards de edicao, a tela mostra uma tabela de controle com recipiente, setor, area, solução atual, validade, status calculado e código do preparo.

O QR Code leva apenas o identificador do registro e consulta o Supabase. Assim, quando a TAG e editada, a pagina do QR mostra a validade e os dados da ultima solução preparada.

## Publicacao

O aplicativo esta preparado para ser publicado pelo GitHub Pages em:

`https://lab-sobral-dev.github.io/qr_code-producao/`

Quando aberto diretamente pelo arquivo local, os QR Codes tambem apontam para esse endereco publico.

## Rodando localmente (backend de SSO)

```
npm install
cp .env.example .env   # preencher DOCKING_SECRET_QR_CODE_PRODUCAO e SESSION_SECRET
npm start               # sobe em http://localhost:3000, servindo os mesmos arquivos estaticos
```

O backend adiciona o endpoint `/api/auth/sso` (handshake de SSO com o Gestao SBR), `/api/auth/session` (confere a sessao local) e `/api/auth/logout`, alem do header de CSP `frame-ancestors`. Sem essas variaveis configuradas, o app continua funcionando normalmente como pagina estatica (so o SSO fica indisponivel).

O handshake de SSO nao fala com o Supabase Auth Admin API: ele so valida o JWT assinado pelo Gestao SBR e abre uma sessao propria (cookie httpOnly assinado com `SESSION_SECRET`, valida por 8h). Essa sessao libera a casca da tela administrativa, mas **nao concede acesso direto ao Supabase**: cadastrar, editar, excluir e ver o historico continuam exigindo o login Supabase (usuario/senha) feito em `app.js`, porque as policies de RLS em `alcool_registros`/`app_administradores`/`app_perfis_usuarios` exigem um usuario `authenticated` de verdade (ver `supabase-security.sql`).

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
