-- Aluno atual: cadastro sem pagar, aprovação em dia ou atrasado. Tudo é desfeito no final.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  pro uuid; t1 uuid := (select id from turmas where nome = 'Muay Thai · Turma 1'); bx uuid := (select id from turmas where nome = 'Boxe · Turma 2');
  mes date := date_trunc('month', hoje_fortaleza())::date; r jsonb := '{}'::jsonb; ok boolean; n int;
begin
  insert into planos (nome, valor_centavos, max_turmas) values ('T pro', 12000, 2) returning id into pro;
  insert into auth.users (id, email, aud, role) values (a, 'ea@zxt.test', 'authenticated', 'authenticated'), (b, 'eb@zxt.test', 'authenticated', 'authenticated'), (c, 'ec@zxt.test', 'authenticated', 'authenticated');

  -- o próprio aluno marca que já treina (pendente pode)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update profiles set aluno_existente = true, plano_escolhido_id = pro, turmas_escolhidas = array[t1, bx] where id = a;
  execute 'reset role';
  r := r || jsonb_build_object('1_aluno_marca_que_ja_treina', (select aluno_existente from profiles where id = a));
  update profiles set aluno_existente = true where id in (b, c);

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform aprovar_aluno_atual(a, pro, array[t1, bx], 10, true, null);                       -- em dia
  perform aprovar_aluno_atual(b, pro, array[t1], 5, false, hoje_fortaleza() - 9);            -- atrasado
  begin perform aprovar_aluno_atual(c, pro, array[t1, bx, (select id from turmas where nome = 'Boxe · Turma 1')], 10, true, null); ok := false;
  exception when others then ok := sqlerrm like '%dá direito a 2 turma%'; end;
  r := r || jsonb_build_object('2_respeita_limite_do_plano', ok);
  execute 'reset role';

  r := r || jsonb_build_object(
    '3_em_dia_ativo_sem_cobranca_agora', (select status from profiles where id = a) = 'ativo' and not exists (select 1 from cobrancas where aluno_id = a),
    '4_em_dia_comeca_mes_que_vem', (select inicio from assinaturas where aluno_id = a and ativa) = (mes + interval '1 month')::date,
    '5_matriculado_nas_turmas', (select count(*) from matriculas where aluno_id = a) = 2,
    '6_atrasado_tem_mensalidade_atrasada', (select status = 'atrasado' and valor_centavos = 12000 from cobrancas where aluno_id = b));

  -- gerador do mês: não duplica o atrasado e não cobra o em dia neste mês
  perform set_config('request.jwt.claims', '', true);
  n := gerar_mensalidades(mes);
  r := r || jsonb_build_object('7_gerador_nao_duplica_atrasado', (select count(*) from cobrancas where aluno_id = b) = 1,
                               '8_gerador_nao_cobra_em_dia_neste_mes', not exists (select 1 from cobrancas where aluno_id = a));
  n := gerar_mensalidades((mes + interval '1 month')::date);
  r := r || jsonb_build_object('9_em_dia_cobrado_no_mes_seguinte', (select count(*) = 1 and min(vencimento) = make_date(extract(year from mes + interval '1 month')::int, extract(month from mes + interval '1 month')::int, 10) from cobrancas where aluno_id = a));

  -- aluno não consegue se aprovar
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform aprovar_aluno_atual(c, pro, array[t1], 10, true, null); ok := false; exception when others then ok := true; end;
  execute 'reset role';
  r := r || jsonb_build_object('10_aluno_nao_se_aprova', ok and (select status from profiles where id = c) = 'pendente');

  raise exception 'RESULTADO: %', r;
end $$;
