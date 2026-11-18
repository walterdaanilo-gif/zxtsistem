-- Professor edita dados de treino e turmas do aluno; não mexe em status, CPF nem financeiro. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid(); outro uuid := gen_random_uuid();
  basico uuid; t1 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 1 limit 1); t2 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 0 limit 1);
  r jsonb := '{}'::jsonb; ok boolean;
begin
  insert into planos (nome, valor_centavos, max_turmas) values ('T básico', 1, 1) returning id into basico;
  insert into auth.users (id, email, aud, role) values (pf, 'pf2@zxt.test', 'authenticated', 'authenticated'), (al, 'al2@zxt.test', 'authenticated', 'authenticated'), (outro, 'ou2@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo', cpf = '11122233344' where id in (pf, al, outro);
  insert into assinaturas (aluno_id, plano_id) values (al, basico);
  insert into matriculas values (al, t1);
  update turmas set professor_id = pf where id in (t1, t2);   -- turmas dele: pode mover o aluno entre elas

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform atualizar_dados_aluno(al, '{"nome":"Aluno Editado","saude_obs":"Joelho direito","cpf":"999","status":"inativo"}'::jsonb);
  perform definir_turmas_aluno(al, array[t2]);
  begin perform definir_turmas_aluno(al, array[t1, t2]); ok := false; exception when others then ok := sqlerrm like '%dá direito a 1 turma%'; end;
  r := r || jsonb_build_object('4_respeita_limite_do_plano', ok);
  begin update profiles set status = 'inativo' where id = al; exception when others then null; end;
  r := r || jsonb_build_object('5_professor_ve_financeiro_do_aluno', (select count(*) from assinaturas where aluno_id = al) = 1);
  execute 'reset role';
  r := r || jsonb_build_object(
    '1_professor_edita_dados', (select nome = 'Aluno Editado' and saude_obs = 'Joelho direito' from profiles where id = al),
    '2_nao_mexe_cpf_nem_status', (select cpf = '11122233344' and status = 'ativo' from profiles where id = al),
    '3_troca_turma', exists (select 1 from matriculas where aluno_id = al and turma_id = t2) and not exists (select 1 from matriculas where aluno_id = al and turma_id = t1));

  -- aluno comum não usa as funções da equipe
  perform set_config('request.jwt.claims', json_build_object('sub', outro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform atualizar_dados_aluno(al, '{"nome":"hack"}'::jsonb); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('6_aluno_nao_edita_outro', ok);
  begin perform definir_turmas_aluno(al, array[t1]); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('7_aluno_nao_troca_turma_de_outro', ok);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
