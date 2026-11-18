-- Excluir aluno sem perder financeiro; professor não é excluído por aqui; excluir/restaurar aula. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid(); al2 uuid := gen_random_uuid();
  ev uuid; aula uuid; t1 uuid := (select id from turmas where ativa and not coletiva limit 1);
  r jsonb := '{}'::jsonb; x jsonb; ok boolean; n int;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'exp@zxt.test', 'authenticated', 'authenticated'), (al, 'exa@zxt.test', 'authenticated', 'authenticated'), (al2, 'exb@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update turmas set professor_id = pf where id = t1;   -- a aula é da turma dele
  update profiles set status = 'ativo', nome = 'Aluno Exclusao' where id = al;
  update profiles set status = 'ativo', nome = 'Prof Exclusao' where id = pf;
  update profiles set status = 'ativo', nome = 'Aluno Fica' where id = al2;
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status, pago_em) values (al, 'Paga', current_date - 30, 9000, 'pago', now() - interval '30 days');
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (al, 'Aberta', current_date + 5, 9000, 'em_aberto');
  insert into eventos (tipo, titulo, inicio, slug) values ('aulao', 'Ev excl', now() + interval '3 days', 'ev-excl-x') returning id into ev;
  insert into evento_inscricoes (evento_id, aluno_id, nome, valor_centavos, status) values (ev, al, 'Aluno Exclusao', 3000, 'pago');
  insert into leads (nome, whatsapp, aluno_id) values ('Lead X', '84999999999', al);
  insert into matriculas values (al2, t1);

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  begin perform excluir_aluno(al, pf, 'professor tentando'); ok := false; exception when others then ok := sqlerrm like 'Só a administração%'; end;
  r := r || jsonb_build_object('0_professor_nao_exclui', ok and exists (select 1 from profiles where id = al));
  x := excluir_aluno(al, (select user_id from user_roles where papel = 'admin' limit 1), 'Saiu da academia');
  r := r || jsonb_build_object(
    '1_aluno_excluido', not exists (select 1 from profiles where id = al) and not exists (select 1 from auth.users where id = al),
    '2_mensalidade_paga_mantida', exists (select 1 from cobrancas where aluno_nome = 'Aluno Exclusao' and status = 'pago' and aluno_id is null),
    '3_aberta_cancelada', exists (select 1 from cobrancas where aluno_nome = 'Aluno Exclusao' and descricao = 'Aberta' and status = 'cancelado'),
    '4_inscricao_mantida', exists (select 1 from evento_inscricoes where evento_id = ev and aluno_id is null and status = 'pago'),
    '5_auditoria', exists (select 1 from auditoria where acao = 'EXCLUSAO_ALUNO' and registro_id = al::text));
  begin perform excluir_aluno(pf, (select user_id from user_roles where papel = 'admin' limit 1), null); ok := false; exception when others then ok := sqlerrm like 'Professor não é excluído%'; end;
  r := r || jsonb_build_object('6_professor_nao_excluido_por_aqui', ok);
  perform set_config('request.jwt.claims', '', true);

  -- ninguém chama direto pelo navegador
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform excluir_aluno(al2, pf, null); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('7_so_pelo_servidor', ok);

  -- aula: professor exclui e restaura
  insert into aulas (turma_id, data, inicio, fim) values (t1, current_date + 40, now() + interval '40 days', now() + interval '40 days 1 hour') returning id into aula;
  n := excluir_aula(aula, 'Feriado');
  execute 'reset role';
  r := r || jsonb_build_object('8_aula_excluida', (select status = 'cancelada' and motivo_cancelamento = 'Feriado' from aulas where id = aula),
                               '9_aluno_avisado', exists (select 1 from notificacoes where user_id = al2 and tipo = 'aula'));
  perform set_config('request.jwt.claims', json_build_object('sub', al2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform restaurar_aula(aula); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('10_aluno_nao_mexe_em_aula', ok);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform restaurar_aula(aula);
  execute 'reset role';
  r := r || jsonb_build_object('11_aula_restaurada', (select status = 'prevista' from aulas where id = aula));
  raise exception 'RESULTADO: %', r;
end $$;
