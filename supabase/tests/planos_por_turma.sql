-- Regra Básico (1 turma) / Pro (2 turmas) / Plus (todas). Tudo é desfeito no final.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  b uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); pl uuid := gen_random_uuid(); n uuid := gen_random_uuid();
  basico uuid; pro uuid; plus uuid;
  t1 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 1 limit 1);
  t2 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 0 limit 1);
  bx uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'boxe') order by nome, hora_inicio limit 1);
  sp uuid := (select id from turmas where sparring limit 1);
  seg date := date_trunc('week', now() + interval '80 days')::date;
  a1 uuid; a2 uuid; ab uuid; asp uuid; aovivo uuid;
  r jsonb := '{}'::jsonb; ok boolean;
begin
  -- planos de teste com a mesma regra dos reais
  insert into planos (nome, valor_centavos, max_turmas) values ('T básico', 1, 1) returning id into basico;
  insert into planos (nome, valor_centavos, max_turmas) values ('T pro', 1, 2) returning id into pro;
  insert into planos (nome, valor_centavos, turmas_livres) values ('T plus', 1, true) returning id into plus;
  insert into auth.users (id, email, aud, role) values
    (b, 'b@zxt.test', 'authenticated', 'authenticated'), (pr, 'pr@zxt.test', 'authenticated', 'authenticated'),
    (pl, 'pl@zxt.test', 'authenticated', 'authenticated'), (n, 'n@zxt.test', 'authenticated', 'authenticated');
  insert into aulas (turma_id, data, inicio, fim) values (t1, seg, (seg + time '19:00') at time zone 'America/Fortaleza', (seg + time '20:00') at time zone 'America/Fortaleza') returning id into a1;
  insert into aulas (turma_id, data, inicio, fim) values (t2, seg, (seg + time '20:00') at time zone 'America/Fortaleza', (seg + time '21:00') at time zone 'America/Fortaleza') returning id into a2;
  insert into aulas (turma_id, data, inicio, fim) values (bx, seg + 1, (seg + 1 + time '18:00') at time zone 'America/Fortaleza', (seg + 1 + time '19:00') at time zone 'America/Fortaleza') returning id into ab;
  insert into aulas (turma_id, data, inicio, fim) values (sp, seg + 4, (seg + 4 + time '19:00') at time zone 'America/Fortaleza', (seg + 4 + time '20:00') at time zone 'America/Fortaleza') returning id into asp;
  insert into aulas (turma_id, data, inicio, fim) values (bx, hoje_fortaleza() + 600, now() - interval '5 min', now() + interval '50 min') returning id into aovivo;
  insert into qr_tokens (token) values ('tok-turma');

  -- ===== admin aprova respeitando o plano =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform aprovar_aluno(b, basico, array[t1, t2], 10); ok := false; exception when others then ok := sqlerrm like '%dá direito a 1 turma%'; end;
  r := r || jsonb_build_object('1_basico_recusa_2_turmas', ok);
  begin perform aprovar_aluno(pr, pro, array[t1, t2, bx], 10); ok := false; exception when others then ok := sqlerrm like '%dá direito a 2 turma%'; end;
  r := r || jsonb_build_object('2_pro_recusa_3_turmas', ok);
  begin perform aprovar_aluno(b, basico, '{}', 10); ok := false; exception when others then ok := sqlerrm like '%Escolha a turma%'; end;
  r := r || jsonb_build_object('3_basico_exige_turma', ok);
  perform aprovar_aluno(b, basico, array[t1], 10);
  perform aprovar_aluno(pr, pro, array[t1, bx], 10);    -- modalidades diferentes
  perform aprovar_aluno(pl, plus, '{}', 10);            -- plus não escolhe turma
  r := r || jsonb_build_object('4_aprovacoes_validas', (select count(*) from profiles where id in (b, pr, pl) and status = 'ativo') = 3);
  execute 'reset role';

  -- ===== Básico: só a turma escolhida + sparring =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(a1);
  begin perform reservar_aula(a2); ok := false; exception when others then ok := sqlerrm like '%não faz parte do seu plano%'; end;
  perform reservar_aula(asp);
  r := r || jsonb_build_object('5_basico_reserva_sua_turma', (select status from reservas where aluno_id = b and aula_id = a1) = 'reservada',
                               '6_basico_bloqueia_outra_turma_mesma_modalidade', ok,
                               '7_basico_tem_sparring', (select status from reservas where aluno_id = b and aula_id = asp) = 'reservada',
                               '8_resumo_mostra_turma', (meu_plano()->0->'turmas'->>0) = 'Muay Thai · Turma 1');
  execute 'reset role';

  -- ===== Pro: duas turmas de modalidades diferentes =====
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(a1); perform reservar_aula(ab);
  begin perform reservar_aula(a2); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('9_pro_reserva_as_2_turmas', (select count(*) from reservas where aluno_id = pr and status = 'reservada') = 2,
                               '10_pro_bloqueia_3a_turma', ok);
  execute 'reset role';

  -- ===== Plus: qualquer turma, sem matrícula, e check-in em qualquer aula =====
  perform set_config('request.jwt.claims', json_build_object('sub', pl, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(a1); perform reservar_aula(a2); perform reservar_aula(ab);
  r := r || jsonb_build_object('11_plus_reserva_qualquer_turma', (select count(*) from reservas where aluno_id = pl and status = 'reservada') = 3);
  perform fazer_checkin('tok-turma');
  r := r || jsonb_build_object('12_plus_checkin_qualquer_aula', (select status from reservas where aluno_id = pl and aula_id = aovivo) = 'presente');
  execute 'reset role';

  -- ===== troca de plano: Básico -> Pro =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform trocar_plano(b, pro, array[t1, t2]);
  execute 'reset role';
  r := r || jsonb_build_object('13_troca_encerra_plano_antigo', (select count(*) from assinaturas where aluno_id = b and plano_id = basico and not ativa) = 1,
                               '14_troca_cria_plano_novo', (select count(*) from assinaturas where aluno_id = b and plano_id = pro and ativa) = 1,
                               '15_troca_atualiza_turmas', (select count(*) from matriculas where aluno_id = b) = 2);

  -- ===== visitante vê os planos ativos no cadastro =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  r := r || jsonb_build_object('16_visitante_ve_planos', (select count(*) from planos where id in (basico, pro, plus)) = 3);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
