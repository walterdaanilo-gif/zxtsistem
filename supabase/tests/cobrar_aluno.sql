-- Cobrar pelo sistema: notifica o aluno certo, só a equipe do aluno, sem repetir em 6 horas. Tudo é desfeito.
do $$
declare
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); novo uuid := gen_random_uuid();
  t1 uuid; t2 uuid; pl uuid; r jsonb := '{}'::jsonb; ok boolean; j jsonb;
begin
  select id into t1 from turmas where ativa and not coletiva order by id limit 1;
  select id into t2 from turmas where ativa and not coletiva and id <> t1 order by id limit 1;
  select id into pl from planos where ativo limit 1;
  insert into auth.users (id, email, aud, role) values (p1, 'cp1@zxt.test', 'authenticated', 'authenticated'), (p2, 'cp2@zxt.test', 'authenticated', 'authenticated'),
    (a1, 'ca1@zxt.test', 'authenticated', 'authenticated'), (a2, 'ca2@zxt.test', 'authenticated', 'authenticated'), (novo, 'cn@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (p1, 'professor'), (p2, 'professor');
  update profiles set status = 'ativo' where id in (p1, p2, a1, a2);
  update turmas set professor_id = p1 where id = t1; update turmas set professor_id = p2 where id = t2;
  insert into matriculas values (a1, t1), (a2, t2);
  update profiles set tipo_cadastro = 'aluno', status = 'pendente', aluno_existente = false, plano_escolhido_id = pl, turmas_escolhidas = array[t1] where id = novo;
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (a1, 'T', current_date - 3, 7000, 'atrasado'), (a2, 'T', current_date + 2, 7000, 'em_aberto');

  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := cobrar_aluno(a1);
  r := r || jsonb_build_object('1_prof_cobra_aluno_da_turma', (j->>'enviado')::boolean);
  begin perform cobrar_aluno(a1); ok := false; exception when others then ok := sqlerrm like '%menos de 6 horas%'; end;
  r := r || jsonb_build_object('2_nao_repete_em_6h', ok);
  begin perform cobrar_aluno(a2); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('3_prof_nao_cobra_outra_turma', ok);
  j := cobrar_aluno(novo);
  r := r || jsonb_build_object('4_cobra_aluno_novo_pendente', (j->>'enviado')::boolean);
  execute 'reset role';
  r := r || jsonb_build_object('5_notificacao_atraso', exists (select 1 from notificacoes where user_id = a1 and tipo = 'cobranca' and titulo like 'Mensalidade em atraso%' and link = '/app#/financeiro'),
                               '6_notificacao_novo', exists (select 1 from notificacoes where user_id = novo and tipo = 'cobranca' and titulo like 'Falta o pagamento%'),
                               '7_outro_aluno_nao_cobrado', not exists (select 1 from auditoria where acao = 'COBRANCA_ENVIADA' and registro_id = a2::text));
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform cobrar_aluno(a2); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('8_aluno_nao_cobra', ok);
  execute 'reset role';
  raise exception 'RESULTADO: %', jsonb_pretty(r);
end $$;
