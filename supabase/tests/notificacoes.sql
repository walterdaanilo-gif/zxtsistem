-- Notificações: mensalidade, comprovante, postagem, evento, preferências e privacidade. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid(); al2 uuid := gen_random_uuid();
  c1 uuid; ev uuid; r jsonb := '{}'::jsonb; n int;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'ntp@zxt.test', 'authenticated', 'authenticated'), (al, 'nta@zxt.test', 'authenticated', 'authenticated'), (al2, 'ntb@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo', nome = 'Aluno Notif' where id = al;
  update profiles set status = 'ativo', nome = 'Outro Aluno' where id = al2;
  update profiles set status = 'ativo', nome = 'Prof Notif' where id = pf;

  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (al, 'Mensalidade teste', current_date + 5, 9000, 'em_aberto') returning id into c1;
  r := r || jsonb_build_object('1_aluno_recebe_mensalidade_nova', exists (select 1 from notificacoes where user_id = al and tipo = 'cobranca' and corpo like '%R$ 90,00%'));

  insert into notif_prefs (user_id, desligados) values (al2, '{cobranca}');
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (al2, 'Mensalidade teste', current_date + 5, 9000, 'em_aberto');
  r := r || jsonb_build_object('2_preferencia_desligada_respeitada', not exists (select 1 from notificacoes where user_id = al2 and tipo = 'cobranca'));

  update cobrancas set status = 'pago', pago_em = now() where id = c1;
  r := r || jsonb_build_object('3_aluno_recebe_comprovante', exists (select 1 from notificacoes where user_id = al and tipo = 'comprovante'),
                               '4_professor_recebe_pagamento', exists (select 1 from notificacoes where user_id = pf and tipo = 'pagamento' and titulo like 'Aluno Notif pagou%'));

  insert into posts (autor_id, texto) values (al, 'Treino pesado hoje');
  r := r || jsonb_build_object('5_outros_recebem_postagem', exists (select 1 from notificacoes where user_id = al2 and tipo = 'post' and titulo = 'Nova postagem de Aluno'),
                               '6_autor_nao_recebe_a_propria', not exists (select 1 from notificacoes where user_id = al and tipo = 'post'));

  insert into eventos (tipo, titulo, inicio, slug) values ('aulao', 'Aulão notif', now() + interval '3 days', 'aulao-notif-x') returning id into ev;
  insert into evento_inscricoes (evento_id, nome, valor_centavos) values (ev, 'Inscrito Teste', 3000);
  r := r || jsonb_build_object('7_professor_recebe_inscricao', exists (select 1 from notificacoes where user_id = pf and tipo = 'evento_inscricao' and titulo = 'Nova inscrição: Inscrito Teste'));

  -- privacidade: cada um só vê e marca as próprias
  perform set_config('request.jwt.claims', json_build_object('sub', al2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from notificacoes where user_id <> al2;
  r := r || jsonb_build_object('8_so_ve_as_proprias', n = 0);
  update notificacoes set lida = true where user_id = al; get diagnostics n = row_count;
  r := r || jsonb_build_object('9_nao_marca_de_outro', n = 0);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
