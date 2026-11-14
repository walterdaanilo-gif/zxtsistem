-- Professor aprova os alunos das turmas dele; Plus é de todos. Tudo é desfeito no final.
do $$
declare
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  minha uuid := gen_random_uuid(); outra uuid := gen_random_uuid(); plus_a uuid := gen_random_uuid(); profcad uuid := gen_random_uuid();
  t1 uuid := (select id from turmas where nome = 'Muay Thai · Turma 1'); bx uuid := (select id from turmas where nome = 'Boxe · Turma 2');
  basico uuid; plus uuid; r jsonb := '{}'::jsonb; ok boolean;
begin
  insert into planos (nome, valor_centavos, max_turmas) values ('T b', 7000, 1) returning id into basico;
  insert into planos (nome, valor_centavos, turmas_livres) values ('T plus', 15000, true) returning id into plus;
  insert into auth.users (id, email, aud, role) values
    (p1, 'ap1@zxt.test', 'authenticated', 'authenticated'), (p2, 'ap2@zxt.test', 'authenticated', 'authenticated'),
    (minha, 'am@zxt.test', 'authenticated', 'authenticated'), (outra, 'ao@zxt.test', 'authenticated', 'authenticated'),
    (plus_a, 'apl@zxt.test', 'authenticated', 'authenticated'), (profcad, 'apc@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (p1, 'professor'), (p2, 'professor');
  update profiles set status = 'ativo' where id in (p1, p2);
  update turmas set professor_id = p1 where id = t1;
  update turmas set professor_id = p2 where id = bx;
  update profiles set plano_escolhido_id = basico, turmas_escolhidas = array[t1], aluno_existente = true where id = minha;
  update profiles set plano_escolhido_id = basico, turmas_escolhidas = array[bx] where id = outra;
  update profiles set plano_escolhido_id = plus, aluno_existente = true where id = plus_a;
  update profiles set tipo_cadastro = 'professor' where id = profcad;

  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform aprovar_aluno_atual(minha, basico, array[t1], 10, true, null);
  begin perform aprovar_aluno(outra, basico, array[bx], 10); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('2_nao_aprova_aluno_de_outro_professor', ok);
  perform aprovar_aluno_atual(plus_a, plus, '{}', 10, false, hoje_fortaleza() - 3);
  begin perform recusar_aluno(profcad, 'x'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('5_nao_recusa_cadastro_de_professor', ok);
  execute 'reset role';
  r := r || jsonb_build_object(
    '1_aprova_aluno_da_turma_dele', (select status = 'ativo' and aprovado_por = p1 from profiles where id = minha),
    '3_aprova_aluno_plus', (select status from profiles where id = plus_a) = 'ativo',
    '4_outra_continua_pendente', (select status from profiles where id = outra) = 'pendente');

  -- o outro professor vê o financeiro do aluno Plus, mas não o do aluno da turma do p1
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('6_plus_aparece_para_todos_os_professores', (select count(*) from cobrancas where aluno_id = plus_a) = 1,
                               '7_nao_ve_financeiro_de_aluno_de_outro', (select count(*) from assinaturas where aluno_id = minha) = 0);
  perform aprovar_aluno(outra, basico, array[bx], 10);
  execute 'reset role';
  r := r || jsonb_build_object('8_dono_da_turma_aprova', (select status from profiles where id = outra) = 'ativo');

  raise exception 'RESULTADO: %', r;
end $$;
