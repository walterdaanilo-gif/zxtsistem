-- Pagamento no cadastro: avisos do Asaas liberam o aluno. Tudo é desfeito no final.
do $$
declare
  a uuid := gen_random_uuid(); pf uuid := gen_random_uuid();
  basico uuid := (select id from planos where max_turmas = 1 and not turmas_livres order by valor_centavos limit 1);
  t1 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 1 limit 1);
  r jsonb := '{}'::jsonb; ok boolean; res text;
begin
  insert into auth.users (id, email, aud, role) values (a, 'pg@zxt.test', 'authenticated', 'authenticated'), (pf, 'pgp@zxt.test', 'authenticated', 'authenticated');
  update profiles set plano_escolhido_id = basico, turmas_escolhidas = array[t1], tipo_cadastro = 'aluno' where id = a;
  update profiles set tipo_cadastro = 'professor' where id = pf;
  perform registrar_inicio_pagamento(a, 'cus_teste', 'sub_teste', 'PIX');
  perform registrar_inicio_pagamento(pf, 'cus_prof', 'sub_prof', 'PIX');

  -- aluno não consegue forjar campos de pagamento nem chamar o processamento
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update profiles set asaas_subscription_id = 'hack' where id = a;
  begin perform processar_evento_asaas('{"evento":"PAYMENT_RECEIVED"}'::jsonb); ok := false; exception when others then ok := true; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);   -- daqui para frente: servidor (service_role)
  r := r || jsonb_build_object('1_aluno_nao_forja_pagamento', (select asaas_subscription_id from profiles where id = a) = 'sub_teste',
                               '2_aluno_nao_chama_processamento', ok);

  -- cobrança criada: continua pendente
  res := processar_evento_asaas(jsonb_build_object('evento', 'PAYMENT_CREATED', 'payment_id', 'pay_1', 'subscription_id', 'sub_teste', 'customer_id', 'cus_teste',
           'valor_centavos', 7000, 'vencimento', current_date, 'forma', 'PIX'));
  r := r || jsonb_build_object('3_cobranca_criada_pendente', (select status from cobrancas where provider_id = 'pay_1') = 'em_aberto' and (select status from profiles where id = a) = 'pendente');

  -- pagamento recebido: libera sozinho
  res := processar_evento_asaas(jsonb_build_object('evento', 'PAYMENT_RECEIVED', 'payment_id', 'pay_1', 'subscription_id', 'sub_teste', 'customer_id', 'cus_teste',
           'valor_centavos', 7000, 'vencimento', current_date, 'forma', 'PIX'));
  r := r || jsonb_build_object('4_resposta', res = 'aluno liberado',
    '5_aluno_ativo', (select status from profiles where id = a) = 'ativo',
    '6_matriculado_na_turma_escolhida', exists (select 1 from matriculas where aluno_id = a and turma_id = t1),
    '7_assinatura_com_id_do_asaas', exists (select 1 from assinaturas where aluno_id = a and ativa and provider_subscription_id = 'sub_teste' and plano_id = basico),
    '8_cobranca_paga', (select status = 'pago' and forma_pagamento = 'pix' from cobrancas where provider_id = 'pay_1'));

  -- aviso repetido não duplica; próxima mensalidade entra em aberto
  res := processar_evento_asaas(jsonb_build_object('evento', 'PAYMENT_RECEIVED', 'payment_id', 'pay_1', 'subscription_id', 'sub_teste', 'customer_id', 'cus_teste', 'valor_centavos', 7000, 'vencimento', current_date, 'forma', 'PIX'));
  res := processar_evento_asaas(jsonb_build_object('evento', 'PAYMENT_CREATED', 'payment_id', 'pay_2', 'subscription_id', 'sub_teste', 'customer_id', 'cus_teste', 'valor_centavos', 7000, 'vencimento', current_date + 30, 'forma', 'PIX'));
  r := r || jsonb_build_object('9_sem_duplicar', (select count(*) from cobrancas where provider_id = 'pay_1') = 1 and (select count(*) from assinaturas where aluno_id = a) = 1,
                               '10_proxima_mensalidade_em_aberto', (select status from cobrancas where provider_id = 'pay_2') = 'em_aberto');
  -- o gerador do mês não duplica quem paga pelo Asaas
  perform gerar_mensalidades();
  r := r || jsonb_build_object('11_gerador_nao_duplica', (select count(*) from cobrancas where aluno_id = a) = 2);

  -- professor que pagou não é liberado sozinho
  res := processar_evento_asaas(jsonb_build_object('evento', 'PAYMENT_RECEIVED', 'payment_id', 'pay_p', 'subscription_id', 'sub_prof', 'customer_id', 'cus_prof', 'valor_centavos', 100, 'forma', 'PIX'));
  r := r || jsonb_build_object('12_professor_continua_manual', (select status from profiles where id = pf) = 'pendente');

  raise exception 'RESULTADO: %', r;
end $$;
