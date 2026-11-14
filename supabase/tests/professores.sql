-- Cadastro e aprovação de professor. Tudo é desfeito no final.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid();
  t1 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 1 limit 1);
  t2 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 0 limit 1);
  mt uuid := (select id from modalidades where slug = 'muay-thai');
  n12 uuid := (select id from graduacao_niveis where nome like '12º Khan%');
  r jsonb := '{}'::jsonb; ok boolean; n int;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'pf@zxt.test', 'authenticated', 'authenticated'), (al, 'al@zxt.test', 'authenticated', 'authenticated');
  -- o próprio professor preenche o cadastro (como faz a tela)
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update profiles set nome = 'Prof Teste', tipo_cadastro = 'professor', turmas_professor = array[t1, t2],
    graduacao_declarada = jsonb_build_array(jsonb_build_object('modalidade_id', mt, 'nivel_id', n12, 'grau', 0)), experiencia = '10 anos'
  where id = pf;
  begin perform aprovar_professor(pf, array[t1], true); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('1_professor_nao_se_aprova', ok);
  begin insert into user_roles values (pf, 'professor'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('2_nao_se_da_papel', ok);
  execute 'reset role';
  r := r || jsonb_build_object('3_fica_pendente_com_pedido', (select status = 'pendente' and tipo_cadastro = 'professor' and array_length(turmas_professor, 1) = 2 from profiles where id = pf));

  -- admin aprova só a Turma 1
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform aprovar_professor(pf, array[t1], true);
  execute 'reset role';
  r := r || jsonb_build_object(
    '4_vira_professor', exists (select 1 from user_roles where user_id = pf and papel = 'professor'),
    '5_sai_de_aluno', not exists (select 1 from user_roles where user_id = pf and papel = 'aluno'),
    '6_assume_a_turma_aprovada', (select professor_id from turmas where id = t1) = pf,
    '7_nao_assume_turma_nao_aprovada', (select professor_id is distinct from pf from turmas where id = t2),
    '8_graduacao_registrada', exists (select 1 from graduacoes_aluno where aluno_id = pf and nivel_id = n12),
    '9_status_ativo', (select status from profiles where id = pf) = 'ativo');

  -- admin troca as turmas e refaz a agenda de uma turma
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform definir_turmas_professor(pf, array[t2]);
  n := atualizar_aulas_turma(t2);
  execute 'reset role';
  r := r || jsonb_build_object('10_troca_turmas', (select professor_id from turmas where id = t2) = pf and (select professor_id is distinct from pf from turmas where id = t1),
                               '11_aulas_futuras_com_professor', not exists (select 1 from aulas where turma_id = t2 and inicio > now() and professor_id is distinct from pf));

  -- aluno comum não chama as funções de admin
  update profiles set status = 'ativo' where id = al;
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform definir_turmas_professor(al, array[t1]); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('12_aluno_nao_define_turmas', ok);
  begin update academia_config set nome = 'hack'; ok := (select nome from academia_config) <> 'hack'; exception when others then ok := true; end;
  r := r || jsonb_build_object('13_aluno_nao_mexe_na_config', ok);
  r := r || jsonb_build_object('14_aluno_ve_professor_da_turma', exists (select 1 from professores_das_turmas() where turma_id = t2 and professor_nome = 'Prof Teste'));
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
