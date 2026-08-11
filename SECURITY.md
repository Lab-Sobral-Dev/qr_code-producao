# Seguranca

## Estado atual

O site e estatico no GitHub Pages e usa a chave publica do Supabase. Essa chave pode ficar no navegador, mas a seguranca real depende das politicas RLS do Supabase.

## Correcoes aplicadas no codigo

- A pagina de consulta do QR Code agora busca dados somente pelo `id` no Supabase.
- A consulta publica usa a funcao RPC `consultar_alcool_registro`, que retorna no maximo um registro pelo `id`.
- A tela administrativa exige login Supabase para listar, cadastrar, editar e excluir.
- Usuarios criados no Supabase entram com a senha definida pelo administrador e precisam trocar a senha no primeiro acesso.
- O histórico é restrito aos usuários cadastrados como administradores em `app_administradores`.
- A tabela `alcool_registros_historico` registra criacao, edicao e exclusao com usuario, data/hora e valores antes/depois.
- Parametros como `tag`, `validade` e `setor` na URL nao sao mais aceitos como fonte da verdade.
- Foi adicionada uma Content Security Policy nas paginas.
- O cadastro valida campos obrigatorios, tamanho de texto e impede preparo posterior a validade.
- As paginas foram marcadas como `noindex` para reduzir indexacao por buscadores.

## Acao obrigatoria no Supabase

Execute `supabase-security.sql` no SQL Editor do Supabase para bloquear leitura direta e escrita anonima na tabela. Sem isso, qualquer pessoa com conhecimento tecnico ainda pode chamar a API publica e listar, cadastrar, editar ou excluir registros.

Depois de aplicar esse SQL, crie os usuarios em Authentication no Supabase usando uma senha padrao temporaria. No primeiro acesso, o sistema exige a troca da senha antes de liberar os cadastros. Para liberar acesso ao histórico, adicione o `usuario_id` do administrador na tabela `app_administradores`. A leitura publica dos QR Codes continua funcionando somente por `id`, via `consultar_alcool_registro`.
