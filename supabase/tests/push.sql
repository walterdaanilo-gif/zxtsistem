-- Notificações no celular: cada um só cadastra e vê os próprios aparelhos; notificação nova continua gravando. Tudo é desfeito.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r jsonb := '{}'::jsonb; n int; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values (a, 'pua@zxt.test', 'authenticated', 'authenticated'), (b, 'pub@zxt.test', 'authenticated', 'authenticated');
  update profiles set status = 'ativo' where id in (a, b);
  insert into push_inscricoes (user_id, endpoint, p256dh, auth) values (b, 'https://push.teste/b', 'x', 'y');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into push_inscricoes (user_id, endpoint, p256dh, auth) values (a, 'https://push.teste/a', 'x', 'y');
  select count(*) into n from push_inscricoes;
  r := r || jsonb_build_object('1_cadastra_e_ve_so_o_proprio', n = 1);
  begin insert into push_inscricoes (user_id, endpoint, p256dh, auth) values (b, 'https://push.teste/hack', 'x', 'y'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('2_nao_cadastra_para_outro', ok);
  perform notificacao_teste();
  execute 'reset role';
  r := r || jsonb_build_object('3_notificacao_grava_com_push', exists (select 1 from notificacoes where user_id = a and titulo like 'Teste da ZXT%'),
                               '4_chamada_ao_servidor_enfileirada', exists (select 1 from net.http_request_queue where url = 'https://zxtsistem.vercel.app/api/push'));
  raise exception 'RESULTADO: %', r;
end $$;
