-- Aluno só vê a própria inscrição e só baixa certificado depois de aprovado. Tudo é desfeito no final.
do $$
declare
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid(); ev uuid; op uuid; opb uuid; i1 uuid; i2 uuid; i3 uuid; r jsonb := '{}'::jsonb; ok boolean; j jsonb;
begin
  select e.id, o.id into ev, op from eventos e join evento_opcoes o on o.evento_id = e.id where e.slug = 'graduacao-2026' and o.nome like 'Amarelo (%' limit 1;
  select o.id into opb from evento_opcoes o where o.evento_id = ev and o.nome like 'Branco (%' limit 1;
  insert into auth.users (id, email, aud, role) values (a1, 'c1@zxt.test', 'authenticated', 'authenticated'), (a2, 'c2@zxt.test', 'authenticated', 'authenticated'), (a3, 'c3@zxt.test', 'authenticated', 'authenticated');
  update profiles set status = 'ativo', cpf = '999.888.777-66' where id = a3;
  insert into evento_inscricoes (evento_id, opcao_id, nome, cpf, status, origem) values (ev, opb, 'Aluno Branco Teste', '99988877766', 'pago', 'google_forms') returning id into i3;
  update profiles set status = 'ativo', cpf = '111.222.333-44' where id = a1;
  update profiles set status = 'ativo', cpf = '555.666.777-88' where id = a2;
  insert into evento_inscricoes (evento_id, opcao_id, nome, cpf, status, origem) values (ev, op, 'Aluno Um Teste', '11122233344', 'pago', 'google_forms') returning id into i1;
  insert into evento_inscricoes (evento_id, opcao_id, nome, cpf, status, origem) values (ev, op, 'Aluno Dois Teste', '55566677788', 'pago', 'google_forms') returning id into i2;

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := minhas_inscricoes_evento();
  r := r || jsonb_build_object('1_ve_so_a_propria_inscricao', jsonb_array_length(j->'inscricoes') = 1 and (j->'inscricoes'->0->>'id') = i1::text,
                               '2_resposta_sem_cpf', not (j::text like '%11122233344%'));
  begin perform meu_certificado(i1); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('3_sem_aprovacao_sem_certificado', ok);
  begin perform meu_certificado(i2); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('4_nao_pega_certificado_de_outro', ok);
  r := r || jsonb_build_object('5_nao_le_evento_nao_publico', (select count(*) from eventos where not publico) = 0,
                               '6_nao_le_opcoes_de_evento', (select count(*) from evento_opcoes) = 0,
                               '7_nao_le_inscricoes_de_outros', (select count(*) from evento_inscricoes where id = i2) = 0);
  execute 'reset role';

  update evento_inscricoes set aprovado = true, cert_nome = 'ALUNO UM CORRIGIDO', cert_trat = 'o Sr.' where id = i1;
  r := r || jsonb_build_object('8_aprovacao_gera_notificacao', exists (select 1 from notificacoes where user_id = a1 and tipo = 'graduacao'));

  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := meu_certificado(i1);
  r := r || jsonb_build_object('9_aprovado_baixa_certificado', j->>'nome' = 'ALUNO UM CORRIGIDO' and j->>'grau' = 'Amarelo' and j->>'trat' = 'o Sr.' and j->>'ano' = '2026',
                               '10_cpf_do_certificado', j->>'cpf' = '11122233344');
  begin update evento_inscricoes set aprovado = true where id = i2; exception when others then null; end;
  execute 'reset role';
  r := r || jsonb_build_object('11_aluno_nao_aprova_ninguem', (select aprovado from evento_inscricoes where id = i2) is distinct from true);
  -- Branco: sem presença não libera; com presença libera o certificado de participação
  perform set_config('request.jwt.claims', json_build_object('sub', a3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform meu_certificado(i3); ok := false; exception when others then ok := true; end;
  execute 'reset role';
  r := r || jsonb_build_object('12_branco_sem_presenca_nao_libera', ok);
  update evento_inscricoes set presente = true where id = i3;
  perform set_config('request.jwt.claims', json_build_object('sub', a3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := meu_certificado(i3);
  execute 'reset role';
  r := r || jsonb_build_object('13_branco_com_presenca_libera_participacao', j->>'modelo' = 'participacao' and (j->>'data') like '%de%de 2026',
                               '14_amarelo_continua_graduacao', (select (meu_certificado(i1))->>'modelo') = 'graduacao',
                               '15_aviso_de_participacao', exists (select 1 from notificacoes where user_id = a3 and titulo like '%participação%'));
  raise exception 'RESULTADO: %', jsonb_pretty(r);
end $$;
