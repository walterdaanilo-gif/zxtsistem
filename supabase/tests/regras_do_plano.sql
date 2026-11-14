-- Testes das regras do plano (limite semanal e modalidades). Tudo é desfeito no final.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  mt uuid := (select id from modalidades where slug = 'muay-thai');
  t1 uuid := (select id from turmas where nome = 'Muay Thai · Turma 1');
  t2 uuid := (select id from turmas where nome = 'Muay Thai · Turma 2');
  bx uuid := (select id from turmas where nome = 'Boxe · Turma 1');
  sp uuid := (select id from turmas where sparring limit 1);
  seg date := date_trunc('week', now() + interval '70 days')::date;
  p2 uuid; p1 uuid; a1 uuid; a2 uuid; a3 uuid; ab uuid; asp uuid; aovivo uuid; aontem uuid;
  r jsonb := '{}'::jsonb; ok boolean; m text;
  function_dummy int;
begin
  insert into auth.users (id, email, aud, role) values
    (x, 'x@zxt.test', 'authenticated', 'authenticated'), (y, 'y@zxt.test', 'authenticated', 'authenticated'), (z, 'z@zxt.test', 'authenticated', 'authenticated');
  update profiles set status = 'ativo' where id in (x, y, z);
  insert into matriculas values (x, t1), (x, t2), (x, bx), (y, t1), (y, t2), (z, t1), (z, t2);
  insert into planos (nome, valor_centavos, aulas_semana) values ('MT 2x teste', 10000, 2) returning id into p2;
  insert into planos (nome, valor_centavos, aulas_semana) values ('MT 1x teste', 8000, 1) returning id into p1;
  insert into plano_modalidades values (p2, mt), (p1, mt);
  insert into assinaturas (aluno_id, plano_id) values (x, p2), (y, p1);   -- z sem plano (bolsista)
  insert into aulas (turma_id, data, inicio, fim) values
    (t1, seg,     (seg + time '19:00') at time zone 'America/Fortaleza', (seg + time '20:00') at time zone 'America/Fortaleza') returning id into a1;
  insert into aulas (turma_id, data, inicio, fim) values
    (t2, seg + 2, (seg + 2 + time '20:00') at time zone 'America/Fortaleza', (seg + 2 + time '21:00') at time zone 'America/Fortaleza') returning id into a2;
  insert into aulas (turma_id, data, inicio, fim) values
    (t1, seg + 3, (seg + 3 + time '19:00') at time zone 'America/Fortaleza', (seg + 3 + time '20:00') at time zone 'America/Fortaleza') returning id into a3;
  insert into aulas (turma_id, data, inicio, fim) values
    (bx, seg + 1, (seg + 1 + time '07:00') at time zone 'America/Fortaleza', (seg + 1 + time '08:00') at time zone 'America/Fortaleza') returning id into ab;
  insert into aulas (turma_id, data, inicio, fim) values
    (sp, seg + 4, (seg + 4 + time '19:00') at time zone 'America/Fortaleza', (seg + 4 + time '20:00') at time zone 'America/Fortaleza') returning id into asp;
  -- aula acontecendo agora e outra já feita nesta semana (para o check-in)
  insert into aulas (turma_id, data, inicio, fim) values (t1, hoje_fortaleza() + 500, now() - interval '5 min', now() + interval '55 min') returning id into aovivo;
  insert into aulas (turma_id, data, inicio, fim) values (t2, hoje_fortaleza() + 501, date_trunc('week', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza' + interval '20 hours', date_trunc('week', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza' + interval '21 hours') returning id into aontem;
  insert into reservas (aula_id, aluno_id, status) values (aontem, y, 'presente');
  insert into qr_tokens (token) values ('tok-plano');

  -- ===== aluno X: plano Muay Thai 2x por semana =====
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(a1); perform reservar_aula(a2);
  r := r || jsonb_build_object('1_reserva_dentro_do_limite', (select count(*) from reservas where aluno_id = x and status = 'reservada') = 2);
  begin perform reservar_aula(a3); ok := false; exception when others then ok := sqlerrm like '%permite 2 aula(s) por semana%'; end;
  r := r || jsonb_build_object('2_bloqueia_3a_aula_da_semana', ok);
  begin perform reservar_aula(ab); ok := false; exception when others then ok := sqlerrm like '%não inclui Boxe%'; end;
  r := r || jsonb_build_object('3_bloqueia_modalidade_fora_do_plano', ok);
  perform reservar_aula(asp);
  r := r || jsonb_build_object('4_sparring_nao_conta_e_liberado', (select status from reservas where aluno_id = x and aula_id = asp) = 'reservada');
  r := r || jsonb_build_object('5_resumo_do_plano', (meu_plano()->0->>'plano') = 'MT 2x teste');
  perform cancelar_reserva(a1); perform reservar_aula(a3);
  r := r || jsonb_build_object('6_cancelar_libera_o_limite', (select status from reservas where aluno_id = x and aula_id = a3) = 'reservada');
  execute 'reset role';

  -- ===== aluno Z: sem plano (bolsista) =====
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(a1); perform reservar_aula(a2); perform reservar_aula(a3);
  r := r || jsonb_build_object('7_sem_plano_sem_limite', (select count(*) from reservas where aluno_id = z and status = 'reservada') = 3);
  execute 'reset role';

  -- ===== aluno Y: plano 1x, já treinou nesta semana =====
  perform set_config('request.jwt.claims', json_build_object('sub', y, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fazer_checkin('tok-plano'); ok := false; exception when others then ok := sqlerrm like '%permite 1 aula(s) por semana%'; end;
  r := r || jsonb_build_object('8_checkin_bloqueado_acima_do_limite', ok);
  execute 'reset role';

  -- ===== professor/admin pode marcar presença acima do limite, com alerta =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  m := alerta_plano(y, aovivo);
  perform marcar_presenca(aovivo, y, true);
  r := r || jsonb_build_object('9_chamada_mostra_alerta', m like '%permite 1%',
                               '10_chamada_permite_presenca', (select status from reservas where aluno_id = y and aula_id = aovivo) = 'presente');
  begin perform aprovar_aluno(x, p2, array[bx], 10); ok := false; exception when others then ok := sqlerrm like '%fora das modalidades%'; end;
  r := r || jsonb_build_object('11_aprovacao_bloqueia_turma_fora_do_plano', ok);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
