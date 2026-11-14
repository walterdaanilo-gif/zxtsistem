-- Eventos: inscrição pelo link, dedupe por CPF, valores, baixa, webhook e permissões. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid();
  ev uuid; op90 uuid; opconf uuid; r jsonb := '{}'::jsonb; x jsonb; y jsonb; ok boolean; i1 uuid; i2 uuid; n int;
  srv text := json_build_object('role', 'service_role')::text;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'evp@zxt.test', 'authenticated', 'authenticated'), (al, 'eva@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo' where id in (pf, al);
  insert into eventos (tipo, titulo, inicio, slug, pagamento, campos)
  values ('aulao', 'Teste evento', now() + interval '10 days', 'teste-evento-x', 'online',
          '{"cpf": true, "nascimento": false, "whatsapp": true, "email": false, "extras": [{"id": "professor", "rotulo": "Professor", "tipo": "opcoes", "obrigatorio": true, "opcoes": ["A", "B"]}]}')
  returning id into ev;
  insert into evento_opcoes (evento_id, nome, valor_centavos, ordem) values (ev, 'Normal', 9000, 1) returning id into op90;
  insert into evento_opcoes (evento_id, nome, valor_centavos, ordem) values (ev, 'A confirmar', null, 2) returning id into opconf;
  insert into evento_inscricoes (evento_id, opcao_id, nome, valor_centavos, origem) values (ev, op90, 'Fulano da Planilha', 9000, 'google_forms');

  -- servidor (/api/evento)
  perform set_config('request.jwt.claims', srv, true);
  x := inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'Maria Teste', 'cpf', '529.982.247-25', 'whatsapp', '84999990000', 'respostas', '{"professor": "A"}'::jsonb));
  i1 := (x->>'id')::uuid;
  r := r || jsonb_build_object('1_inscreve_pendente_com_valor', (select status = 'pendente' and valor_centavos = 9000 and cpf = '52998224725' from evento_inscricoes where id = i1));
  y := inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'Maria T', 'cpf', '52998224725', 'whatsapp', '84999990000', 'respostas', '{"professor": "A"}'::jsonb));
  r := r || jsonb_build_object('2_mesmo_cpf_nao_duplica', (y->>'ja_inscrito')::boolean and (select count(*) from evento_inscricoes where evento_id = ev) = 2);
  y := inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'fulano  da PLANILHA', 'cpf', '11144477735', 'whatsapp', '84988887777', 'respostas', '{"professor": "B"}'::jsonb));
  r := r || jsonb_build_object('3_planilha_sem_cpf_e_vinculada', (y->>'ja_inscrito')::boolean and (select cpf = '11144477735' from evento_inscricoes where id = (y->>'id')::uuid));
  begin perform inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'Sem Prof', 'cpf', '39053344705', 'whatsapp', '84911112222')); ok := false;
  exception when others then ok := sqlerrm like 'Responda: Professor%'; end;
  r := r || jsonb_build_object('4_pergunta_obrigatoria', ok);
  x := inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', opconf, 'nome', 'Joao Confirmar', 'cpf', '39053344705', 'whatsapp', '84911112222', 'respostas', '{"professor": "B"}'::jsonb));
  i2 := (x->>'id')::uuid;
  -- pagamento confirmado pelo Asaas
  perform vincular_pagamento_evento(i1, 'pay_teste_1', 'cus_teste', 'https://x', 'PIX');
  perform processar_pagamento_evento('{"evento": "PAYMENT_RECEIVED", "payment_id": "pay_teste_1", "forma": "PIX"}');
  r := r || jsonb_build_object('5_webhook_marca_pago', (select status = 'pago' and pago_em is not null from evento_inscricoes where id = i1));
  perform set_config('request.jwt.claims', '', true);

  -- valor definido depois acompanha quem estava a confirmar
  update evento_opcoes set valor_centavos = 6000 where id = opconf;
  r := r || jsonb_build_object('6_valor_novo_propaga', (select valor_centavos = 6000 and status = 'pendente' from evento_inscricoes where id = i2),
                               '7_pago_nao_muda', (select valor_centavos = 9000 from evento_inscricoes where id = i1));

  -- professor: vê, dá baixa, marca presença; não mexe em valor
  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from evento_inscricoes where evento_id = ev;
  r := r || jsonb_build_object('8_professor_ve_inscritos', n = 3);
  perform baixa_inscricao(i2, 'dinheiro', 'pagou na recepção');
  perform atualizar_inscricao(i2, '{"presente": true}');
  begin perform atualizar_inscricao(i2, '{"valor_centavos": 1}'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('9_professor_nao_altera_valor', ok);
  begin update evento_inscricoes set status = 'isento' where id = i1; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  r := r || jsonb_build_object('10_professor_nao_edita_direto', ok);
  execute 'reset role';
  r := r || jsonb_build_object('11_baixa_registrada', (select status = 'pago' and baixa_por = pf and presente and forma_pagamento = 'dinheiro' and valor_centavos = 6000 from evento_inscricoes where id = i2));

  -- aluno comum: não vê inscrição dos outros e não inscreve sem passar pelo servidor
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from evento_inscricoes where evento_id = ev;
  r := r || jsonb_build_object('12_aluno_nao_ve_outros', n = 0);
  begin perform inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'Hack', 'cpf', '16899535009', 'whatsapp', '84900000000', 'respostas', '{"professor": "A"}'::jsonb)); ok := false;
  exception when others then ok := true; end;
  r := r || jsonb_build_object('13_aluno_nao_chama_direto', ok);
  execute 'reset role';

  -- inscrições fechadas
  update eventos set inscricoes_abertas = false where id = ev;
  perform set_config('request.jwt.claims', srv, true);
  begin perform inscrever_evento(jsonb_build_object('slug', 'teste-evento-x', 'opcao_id', op90, 'nome', 'Atrasado Silva', 'cpf', '16899535009', 'whatsapp', '84900000000', 'respostas', '{"professor": "A"}'::jsonb)); ok := false;
  exception when others then ok := sqlerrm like '%encerradas%'; end;
  r := r || jsonb_build_object('14_encerrado_recusa', ok);

  raise exception 'RESULTADO: %', r;
end $$;
