-- Interações da Comunidade geram notificações certas. Tudo é desfeito no fim (raise exception).
do $$
declare a uuid; b uuid; post uuid; c1 uuid; c2 uuid; n int; r text := '';
begin
  select id into a from profiles where status = 'ativo' order by created_at limit 1;
  select id into b from profiles where status = 'ativo' and id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'SEM_PERFIS'; end if;
  insert into posts (autor_id, texto) values (a, 'teste interacao') returning id into post;
  delete from notificacoes where user_id in (a, b);
  insert into post_curtidas values (post, b);
  select count(*) into n from notificacoes where user_id = a and titulo like '%curtiu sua publicação'; r := r || 'curtida_post=' || n;
  insert into comentarios (post_id, autor_id, texto) values (post, b, 'oi') returning id into c1;
  select count(*) into n from notificacoes where user_id = a and titulo like '%comentou na sua publicação'; r := r || ' comentou=' || n;
  insert into comentario_curtidas values (c1, a);
  select count(*) into n from notificacoes where user_id = b and titulo like '%curtiu seu comentário'; r := r || ' curtida_com=' || n;
  insert into comentarios (post_id, autor_id, texto, resposta_de) values (post, a, 'resp', c1) returning id into c2;
  select count(*) into n from notificacoes where user_id = b and titulo like '%respondeu seu comentário'; r := r || ' resposta=' || n;
  insert into comentarios (post_id, autor_id, texto) values (post, a, 'proprio');
  select count(*) into n from notificacoes where user_id = a and titulo like '%comentou na sua publicação'; r := r || ' auto=' || n;
  raise exception 'RESULTADO: %', r;
end $$;
