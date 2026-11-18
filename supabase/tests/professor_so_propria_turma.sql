-- Cada professor só vê e mexe no que é da própria turma. Tudo é desfeito no final (raise exception com o resultado).
do $$
declare
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  t1 uuid; t2 uuid; au1 uuid; au2 uuid; c1 uuid; c2 uuid; r jsonb := '{}'::jsonb; ok boolean; n int;
begin
  select id into t1 from turmas where ativa and not coletiva order by id limit 1;
  select id into t2 from turmas where ativa and not coletiva and id <> t1 order by id limit 1;
  if t1 is null or t2 is null then raise exception 'SEM_TURMAS'; end if;
  insert into auth.users (id, email, aud, role) values
    (p1, 'tp1@zxt.test', 'authenticated', 'authenticated'), (p2, 'tp2@zxt.test', 'authenticated', 'authenticated'),
    (adm, 'tadm@zxt.test', 'authenticated', 'authenticated'),
    (a1, 'ta1@zxt.test', 'authenticated', 'authenticated'), (a2, 'ta2@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (p1, 'professor'), (p2, 'professor'), (adm, 'admin');
  update profiles set status = 'ativo' where id in (p1, p2, adm, a1, a2);
  update turmas set professor_id = p1 where id = t1;
  update turmas set professor_id = p2 where id = t2;
  insert into matriculas (aluno_id, turma_id) values (a1, t1), (a2, t2);
  insert into aulas (turma_id, data, inicio, fim) values (t1, current_date + 400, now() + interval '400 days', now() + interval '400 days 1 hour') returning id into au1;
  insert into aulas (turma_id, data, inicio, fim) values (t2, current_date + 400, now() + interval '400 days', now() + interval '400 days 1 hour') returning id into au2;
  insert into cobrancas (aluno_id, tipo, descricao, vencimento, valor_centavos, status) values (a1, 'mensalidade', 'T1', current_date - 5, 5000, 'atrasado') returning id into c1;
  insert into cobrancas (aluno_id, tipo, descricao, vencimento, valor_centavos, status) values (a2, 'mensalidade', 'T2', current_date - 5, 5000, 'atrasado') returning id into c2;

  -- ===== professor 1
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '01_ve_perfil_do_aluno_dele', (select count(*) from profiles where id = a1) = 1,
    '02_nao_ve_perfil_de_aluno_de_outra_turma', (select count(*) from profiles where id = a2) = 0,
    '03_ve_cobranca_do_aluno_dele', (select count(*) from cobrancas where id = c1) = 1,
    '04_nao_ve_cobranca_de_outra_turma', (select count(*) from cobrancas where id = c2) = 0,
    '05_nao_ve_matricula_de_outra_turma', (select count(*) from matriculas where aluno_id = a2) = 0,
    '06_nao_ve_aula_de_outra_turma_na_lista_de_gestao', (select count(*) from aulas where id = au2 and public.minha_aula(id)) = 0);
  begin perform baixa_manual(c2, 'dinheiro'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('07_nao_da_baixa_em_outra_turma', ok);
  begin perform baixa_manual(c1, 'dinheiro'); ok := true; exception when others then ok := false; end;
  r := r || jsonb_build_object('08_da_baixa_na_propria_turma', ok);
  begin perform liberar_acesso(a2, current_date + 3, 'x'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('09_nao_libera_acesso_de_outra_turma', ok);
  begin perform atualizar_dados_aluno(a2, '{"nome":"hack"}'::jsonb); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('10_nao_edita_dados_de_outra_turma', ok);
  begin perform marcar_presenca(au2, a2, true); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('11_nao_marca_presenca_em_aula_de_outra_turma', ok);
  begin perform marcar_presenca(au1, a1, true); ok := true; exception when others then ok := false; end;
  r := r || jsonb_build_object('12_marca_presenca_na_propria_aula', ok);
  begin perform salvar_observacao_professor(a2, 'x'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('13_nao_escreve_observacao_de_outra_turma', ok);
  begin perform definir_turmas_aluno(a2, array[t1]); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('14_nao_muda_turmas_de_aluno_de_outra_turma', ok);
  begin insert into graduacoes_aluno (aluno_id, modalidade_id, nivel_id, grau) select a2, modalidade_id, id, 0 from graduacao_niveis limit 1; ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('15_nao_gradua_aluno_de_outra_turma', ok);
  r := r || jsonb_build_object('16_lista_inadimplencia_so_da_turma', (select count(*) from lista_inadimplencia() x where x.aluno_id = a2) = 0);
  execute 'reset role';

  -- ===== admin vê tudo
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('17_admin_ve_os_dois', (select count(*) from profiles where id in (a1, a2)) = 2 and (select count(*) from cobrancas where id in (c1, c2)) = 2);
  begin perform baixa_manual(c2, 'dinheiro'); ok := true; exception when others then ok := false; end;
  r := r || jsonb_build_object('18_admin_da_baixa_em_qualquer_turma', ok);
  execute 'reset role';

  -- ===== professor 2 não vê o aluno do professor 1
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('19_prof2_nao_ve_aluno_do_prof1', (select count(*) from profiles where id = a1) = 0 and (select count(*) from cobrancas where id = c1) = 0);
  execute 'reset role';
  raise exception 'RESULTADO: %', jsonb_pretty(r);
end $$;
