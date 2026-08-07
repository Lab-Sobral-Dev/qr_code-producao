# Controle de Alcool 70%

Aplicacao web simples para cadastrar vidros de alcool 70%, gerar QR Codes e abrir uma pagina de consulta com tag, endereco, validade, status, responsavel e observacoes.

## Como usar

Abra `index.html` no navegador, cadastre os vidros e use o botao `Imprimir` para gerar as etiquetas com QR Code.

Os cadastros ficam salvos no navegador em `localStorage`. O QR Code leva tag, endereco, validade, responsavel e observacoes no proprio link, permitindo a consulta em outro celular quando a pagina estiver publicada.

Para uso em varios computadores com uma base unica de dados editavel por todos, sera necessario evoluir para uma versao com backend e banco de dados.

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
