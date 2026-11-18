-- Permissões de graduação. Tudo é desfeito no final.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  a uuid := gen_random_uuid(); p uuid := gen_random_uuid();
  mt uuid := (select id from modalidades where slug = 'muay-thai');
  n1 uuid := (select id from graduacao_niveis where modalidade_id = (select id from modalidades where slug = 'muay-thai') order by ordem limit 1);
  rq uuid; r jsonb := '{}'::jsonb; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values (a, 'ga@zxt.test', 'authenticated', 'authenticated'), (p, 'gp@zxt.test', 'authenticated', 'authenticated');
  update profiles set status = 'ativo' where id in (a, p);
  insert into user_roles values (p, 'professor');
  insert into matriculas (aluno_id, turma_id) select a, id from turmas where ativa and not coletiva order by id limit 1;
  update turmas set professor_id = p where id = (select turma_id from matriculas where aluno_id = a limit 1);   -- aluno da turma do professor
  insert into graduacao_requisitos (nivel_id, descricao) values (n1, 'Jab e direto com base') returning id into rq;

  -- professor registra graduação e marca técnica
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into graduacoes_aluno (aluno_id, modalidade_id, nivel_id, professor_id) values (a, mt, n1, p);
  insert into aluno_tecnicas (aluno_id, requisito_id, marcado_por) values (a, rq, p);
  update graduacao_niveis set nome = 'hack' where id = n1;
  execute 'reset role';
  r := r || jsonb_build_object(
    '1_professor_registra_graduacao', (select count(*) from graduacoes_aluno where aluno_id = a) = 1,
    '2_professor_marca_tecnica', (select count(*) from aluno_tecnicas where aluno_id = a) = 1,
    '3_professor_edita_sistema', (select nome from graduacao_niveis where id = n1) = 'hack',
    '4_auditoria_da_graduacao', (select count(*) from auditoria where tabela = 'graduacoes_aluno' and depois->>'aluno_id' = a::text) = 1);

  -- aluno não se gradua sozinho, mas vê a própria
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into graduacoes_aluno (aluno_id, modalidade_id, nivel_id) values (a, mt, n1); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('5_aluno_nao_se_gradua', ok, '6_aluno_ve_a_propria', (select count(*) from graduacoes_aluno where aluno_id = a) = 1);
  begin insert into aluno_tecnicas (aluno_id, requisito_id) values (a, rq); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('7_aluno_nao_marca_tecnica', ok);
  execute 'reset role';

  -- admin edita o sistema
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update graduacao_niveis set cor = '#123456' where id = n1;
  execute 'reset role';
  r := r || jsonb_build_object('8_admin_edita_sistema', (select cor from graduacao_niveis where id = n1) = '#123456');

  raise exception 'RESULTADO: %', r;
end $$;
