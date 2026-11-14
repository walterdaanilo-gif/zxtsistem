-- Inadimplência: bloqueio no 3º dia após o vencimento, liberação temporária e baixa em mãos. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid();
  t1 uuid := (select id from turmas where ativa and not coletiva limit 1); aula uuid; c1 uuid;
  r jsonb := '{}'::jsonb; ok boolean; n int; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'blp@zxt.test', 'authenticated', 'authenticated'), (al, 'bla@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo', nome = 'Aluno Bloqueio' where id = al;
  update profiles set status = 'ativo' where id = pf;
  insert into planos (nome, valor_centavos, turmas_livres) values ('T livre bloq', 1, true);
  insert into assinaturas (aluno_id, plano_id) values (al, (select id from planos where nome = 'T livre bloq'));
  insert into aulas (turma_id, data, inicio, fim) values (t1, current_date + 41, now() + interval '41 days', now() + interval '41 days 1 hour') returning id into aula;

  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (al, 'Mensalidade', hoje_fortaleza() - 2, 9000, 'atrasado') returning id into c1;
  r := r || jsonb_build_object('1_dois_dias_nao_bloqueia', not bloqueado_por_atraso(al));
  update cobrancas set vencimento = hoje_fortaleza() - 3 where id = c1;
  r := r || jsonb_build_object('2_terceiro_dia_bloqueia', bloqueado_por_atraso(al));

  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform reservar_aula(aula); ok := false; exception when others then ok := sqlerrm like 'Acesso às aulas bloqueado%'; end;
  r := r || jsonb_build_object('3_reserva_bloqueada', ok);
  j := meu_bloqueio();
  r := r || jsonb_build_object('4_aluno_ve_o_proprio_bloqueio', (j->>'bloqueado')::boolean and (j->>'total_centavos')::int = 9000);
  begin perform liberar_acesso(al, hoje_fortaleza() + 2, 'eu mesmo'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('5_aluno_nao_se_libera', ok);
  begin perform * from lista_inadimplencia(); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('6_aluno_nao_ve_lista', ok);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from lista_inadimplencia() where aluno_id = al and bloqueado;
  r := r || jsonb_build_object('7_professor_ve_bloqueado', n = 1);
  perform liberar_acesso(al, hoje_fortaleza() + 2, 'paga na sexta');
  execute 'reset role';
  r := r || jsonb_build_object('8_liberacao_temporaria', not bloqueado_por_atraso(al));
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform reservar_aula(aula);
  execute 'reset role';
  r := r || jsonb_build_object('9_liberado_reserva', exists (select 1 from reservas where aula_id = aula and aluno_id = al));
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform encerrar_liberacao(al);
  execute 'reset role';
  r := r || jsonb_build_object('10_encerrar_volta_a_bloquear', bloqueado_por_atraso(al));

  -- recebeu em mãos (servidor dá a baixa)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform baixa_manual_servidor(c1, 'dinheiro', 'em mãos', pf);
  r := r || jsonb_build_object('11_baixa_desbloqueia', not bloqueado_por_atraso(al) and (select status = 'pago' and baixa_manual_por = pf from cobrancas where id = c1));
  raise exception 'RESULTADO: %', r;
end $$;
