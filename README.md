# Controle de Alcool 70%

Aplicacao web simples para cadastrar vidros de alcool 70%, gerar QR Codes e abrir uma pagina de consulta com tag, endereco, validade, status, responsavel e observacoes.

## Como usar

Abra `index.html` no navegador ou use o GitHub Pages, cadastre os vidros e use `Imprimir QR` no registro desejado.

Os cadastros ficam salvos no Supabase. O navegador mantem uma copia local apenas como cache/backup caso a conexao falhe.

O QR Code leva tag, endereco, validade, responsavel e observacoes no proprio link, permitindo a consulta em outro celular quando a pagina estiver publicada.

## Publicacao

O aplicativo esta preparado para ser publicado pelo GitHub Pages em:

`https://lab-sobral-dev.github.io/qr_code-producao/`

Quando aberto diretamente pelo arquivo local, os QR Codes tambem apontam para esse endereco publico.

## Campos

- Tag do alcool
- Endereco / setor
- Validade
- Responsavel
- Observacoes
