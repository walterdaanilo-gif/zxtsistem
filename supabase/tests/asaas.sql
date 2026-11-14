-- Testes da integração Asaas (0010). Nada fica gravado: termina com RAISE EXCEPTION.
-- Resultado na mensagem: "RESULTADO: {...}" (todos os itens devem ser true).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); plano uuid; ass_a uuid; ass_b uuid;
  r jsonb := '{}'::jsonb; ok boolean; res text; venc date := public.hoje_fortaleza() + 5;
  pg jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (a, 'asaas.a@zxt.test', '{"nome":"Aluno Asaas"}', 'authenticated', 'authenticated'),
    (b, 'asaas.b@zxt.test', '{"nome":"Aluno Manual"}', 'authenticated', 'authenticated');
  insert into planos (nome, valor_centavos) values ('Plano teste Asaas', 15000) returning id into plano;
  insert into assinaturas (aluno_id, plano_id, dia_vencimento, inicio, provider, provider_subscription_id)
    values (a, plano, 10, date_trunc('month', public.hoje_fortaleza())::date, 'asaas', 'sub_teste_1') returning id into ass_a;
  insert into assinaturas (aluno_id, plano_id, dia_vencimento, inicio)
    values (b, plano, 10, date_trunc('month', public.hoje_fortaleza())::date) returning id into ass_b;

  -- gerar_mensalidades ignora quem está no Asaas
  perform gerar_mensalidades();
  r := r || jsonb_build_object('1_gerar_ignora_asaas', not exists (select 1 from cobrancas where assinatura_id = ass_a));
  r := r || jsonb_build_object('2_gerar_mantem_manual', exists (select 1 from cobrancas where assinatura_id = ass_b));

  -- PAYMENT_CREATED cria a cobrança em aberto com link
  pg := jsonb_build_object('id','pay_1','subscription','sub_teste_1','status','PENDING','value',150,'dueDate',venc,
                           'billingType','UNDEFINED','invoiceUrl','https://sandbox.asaas.com/i/pay_1');
  res := asaas_aplicar_pagamento('PAYMENT_CREATED', pg);
  r := r || jsonb_build_object('3_criada', res = 'criada' and exists (select 1 from cobrancas where provider_id = 'pay_1'
        and status = 'em_aberto' and valor_final_centavos = 15000 and link_pagamento like 'https://%' and aluno_id = a));

  -- PAYMENT_RECEIVED marca pago, com forma Pix
  res := asaas_aplicar_pagamento('PAYMENT_RECEIVED', pg || '{"status":"RECEIVED","billingType":"PIX"}'::jsonb || jsonb_build_object('paymentDate', public.hoje_fortaleza()));
  r := r || jsonb_build_object('4_pago_pix', exists (select 1 from cobrancas where provider_id = 'pay_1' and status = 'pago' and forma_pagamento = 'pix' and pago_em is not null));

  -- evento repetido não duplica
  perform asaas_aplicar_pagamento('PAYMENT_RECEIVED', pg || '{"status":"RECEIVED","billingType":"PIX"}'::jsonb);
  r := r || jsonb_build_object('5_sem_duplicar', (select count(*) from cobrancas where assinatura_id = ass_a) = 1);

  -- PAYMENT_DELETED cancela
  pg := jsonb_build_object('id','pay_2','subscription','sub_teste_1','status','PENDING','value',150,'dueDate',(venc + 31),'billingType','UNDEFINED');
  perform asaas_aplicar_pagamento('PAYMENT_CREATED', pg);
  perform asaas_aplicar_pagamento('PAYMENT_DELETED', pg);
  r := r || jsonb_build_object('6_apagada_cancela', (select status from cobrancas where provider_id = 'pay_2') = 'cancelado');

  -- vencida
  pg := jsonb_build_object('id','pay_3','subscription','sub_teste_1','status','OVERDUE','value',150,'dueDate',(venc + 62),'billingType','UNDEFINED');
  perform asaas_aplicar_pagamento('PAYMENT_OVERDUE', pg);
  r := r || jsonb_build_object('7_vencida_atrasada', (select status from cobrancas where provider_id = 'pay_3') = 'atrasado');

  -- baixa manual não volta para em aberto
  update cobrancas set status = 'pago', pago_em = now(), forma_pagamento = 'dinheiro' where provider_id = 'pay_3';
  res := asaas_aplicar_pagamento('PAYMENT_UPDATED', pg || '{"status":"PENDING"}'::jsonb);
  r := r || jsonb_build_object('8_baixa_manual_mantida', (select status from cobrancas where provider_id = 'pay_3') = 'pago' and res like 'mantida%');

  -- cobrança lançada à mão no mesmo mês é vinculada, não duplicada
  update assinaturas set provider = 'asaas', provider_subscription_id = 'sub_teste_2' where id = ass_b;
  pg := jsonb_build_object('id','pay_b','subscription','sub_teste_2','status','PENDING','value',150,
                           'dueDate', make_date(extract(year from public.hoje_fortaleza())::int, extract(month from public.hoje_fortaleza())::int, 10),'billingType','UNDEFINED');
  perform asaas_aplicar_pagamento('PAYMENT_CREATED', pg);
  r := r || jsonb_build_object('9_vincula_manual', (select count(*) from cobrancas where assinatura_id = ass_b) = 1
        and exists (select 1 from cobrancas where assinatura_id = ass_b and provider_id = 'pay_b'));

  -- cobrança avulsa sem vínculo é ignorada
  res := asaas_aplicar_pagamento('PAYMENT_CREATED', '{"id":"pay_x","status":"PENDING","value":10,"dueDate":"2030-01-01"}'::jsonb);
  r := r || jsonb_build_object('10_sem_vinculo_ignora', res like 'ignorado%' and not exists (select 1 from cobrancas where provider_id = 'pay_x'));

  -- aluno logado não consegue chamar a função do webhook
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform asaas_aplicar_pagamento('PAYMENT_RECEIVED', pg); ok := false; exception when insufficient_privilege then ok := true; end;
  r := r || jsonb_build_object('11_aluno_nao_chama_webhook', ok);
  begin perform 1 from asaas_eventos; ok := (select count(*) from asaas_eventos) = 0; exception when others then ok := true; end;
  r := r || jsonb_build_object('12_aluno_nao_le_eventos', ok);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
