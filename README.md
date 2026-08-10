# Controle de Alcool 70%

Aplicacao web simples para cadastrar borrifadores, gerar QR Codes e abrir uma pagina de consulta com os dados atuais da solucao preparada.

## Como usar

Abra `index.html` no navegador ou use o GitHub Pages, cadastre os frascos e use `Imprimir QR` no registro desejado.

Os cadastros ficam salvos no Supabase. O navegador mantem uma copia local apenas como cache/backup caso a conexao falhe.

O QR Code leva apenas o identificador do registro e consulta o Supabase. Assim, quando a TAG e editada, a pagina do QR mostra a validade e os dados da ultima solucao preparada.

## Publicacao

O aplicativo esta preparado para ser publicado pelo GitHub Pages em:

`https://lab-sobral-dev.github.io/qr_code-producao/`

Quando aberto diretamente pelo arquivo local, os QR Codes tambem apontam para esse endereco publico.

## Campos

- TAG Borrifador
- Setor / area
- Responsavel
- Nome da solucao atual
- Data do preparo
- Data de validade
- Codigo do preparo (logbook)
- Observacoes
