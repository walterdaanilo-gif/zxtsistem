-- Pagamento pelo portal do aluno: pagar mensalidade avulsa, recibo e troca de forma.
alter table public.cobrancas add column if not exists recibo_url text;

-- liga uma cobrança local a um pagamento criado no Asaas (chamado por /api/pagar)
create or replace function public.vincular_cobranca_asaas(p_cobranca uuid, p_payment text, p_customer text, p_link text, p_boleto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cobrancas set provider = 'asaas', provider_id = p_payment, link_pagamento = coalesce(p_link, link_pagamento),
         boleto_url = coalesce(p_boleto, boleto_url)
  where id = p_cobranca and (provider_id is null or provider_id = p_payment);
  update profiles set asaas_customer_id = coalesce(asaas_customer_id, p_customer)
  where id = (select aluno_id from cobrancas where id = p_cobranca);
end $$;

-- guarda a forma escolhida para a assinatura (chamado por /api/pagar)
create or replace function public.definir_forma_pagamento(p_aluno uuid, p_forma text) returns void
language sql security definer set search_path = public as $$
  update profiles set pagamento_forma = p_forma where id = p_aluno $$;

-- evento do Asaas: agora também guarda o recibo e não cria assinatura para pagamento avulso
create or replace function public.processar_evento_asaas(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare pf profiles; pl planos; ass assinaturas; st status_cobranca; fp forma_pagamento; novo_aluno boolean := false; existente cobrancas;
begin
  select * into existente from cobrancas where provider_id = p->>'payment_id' limit 1;
  if existente.id is not null then select * into pf from profiles where id = existente.aluno_id; end if;
  if pf.id is null then select * into pf from profiles where asaas_subscription_id = p->>'subscription_id' limit 1; end if;
  if pf.id is null then select * into pf from profiles where asaas_customer_id = p->>'customer_id' limit 1; end if;
  if pf.id is null then return 'aluno não encontrado'; end if;

  st := case p->>'evento'
          when 'PAYMENT_CONFIRMED' then 'pago' when 'PAYMENT_RECEIVED' then 'pago'
          when 'PAYMENT_OVERDUE' then 'atrasado'
          when 'PAYMENT_DELETED' then 'cancelado' when 'PAYMENT_REFUNDED' then 'cancelado'
          else 'em_aberto' end;
  fp := case p->>'forma' when 'PIX' then 'pix' when 'BOLETO' then 'boleto' when 'CREDIT_CARD' then 'cartao' else null end;

  -- assinatura local: só para cobrança que vem de assinatura do Asaas
  if nullif(p->>'subscription_id', '') is not null then
    select * into ass from assinaturas where aluno_id = pf.id and provider_subscription_id = p->>'subscription_id' limit 1;
    if ass.id is null and st = 'pago' and pf.plano_escolhido_id is not null then
      update assinaturas set ativa = false, fim = public.hoje_fortaleza() where aluno_id = pf.id and ativa;
      insert into assinaturas (aluno_id, plano_id, dia_vencimento, provider_customer_id, provider_subscription_id)
      values (pf.id, pf.plano_escolhido_id, least(extract(day from coalesce((p->>'vencimento')::date, public.hoje_fortaleza()))::int, 28),
              p->>'customer_id', p->>'subscription_id')
      returning * into ass;
    end if;
  end if;
  select * into pl from planos where id = coalesce(ass.plano_id, pf.plano_escolhido_id);

  insert into cobrancas (aluno_id, assinatura_id, tipo, descricao, competencia, vencimento, valor_centavos, status,
                         provider, provider_id, link_pagamento, boleto_url, recibo_url, pago_em, forma_pagamento)
  values (pf.id, ass.id, 'mensalidade', coalesce(pl.nome, 'Mensalidade') || ' · ' || to_char(coalesce((p->>'vencimento')::date, public.hoje_fortaleza()), 'MM/YYYY'),
          date_trunc('month', coalesce((p->>'vencimento')::date, public.hoje_fortaleza()))::date,
          coalesce((p->>'vencimento')::date, public.hoje_fortaleza()), coalesce((p->>'valor_centavos')::int, pl.valor_centavos, 0), st,
          'asaas', p->>'payment_id', p->>'invoice_url', p->>'boleto_url', p->>'recibo_url',
          case when st = 'pago' then coalesce((p->>'pago_em')::timestamptz, now()) end, fp)
  on conflict (provider_id) do update set
    status = case when cobrancas.status = 'pago' and excluded.status in ('em_aberto','atrasado') then cobrancas.status else excluded.status end,
    assinatura_id = coalesce(cobrancas.assinatura_id, excluded.assinatura_id),
    pago_em = coalesce(excluded.pago_em, cobrancas.pago_em), forma_pagamento = coalesce(excluded.forma_pagamento, cobrancas.forma_pagamento),
    link_pagamento = coalesce(excluded.link_pagamento, cobrancas.link_pagamento), boleto_url = coalesce(excluded.boleto_url, cobrancas.boleto_url),
    recibo_url = coalesce(excluded.recibo_url, cobrancas.recibo_url);

  if st = 'pago' and pf.status = 'pendente' and pf.tipo_cadastro = 'aluno' then
    update profiles set status = 'ativo', aprovado_em = now(), motivo_recusa = null where id = pf.id;
    insert into matriculas (aluno_id, turma_id) select pf.id, unnest(coalesce(pf.turmas_escolhidas, '{}')) on conflict do nothing;
    insert into notificacoes (user_id, titulo, corpo, link)
    values (pf.id, 'Pagamento confirmado. Bem-vindo à família ZxT 🥊', 'Seu acesso foi liberado. Bora treinar!', '/app');
    novo_aluno := true;
  end if;
  return case when novo_aluno then 'aluno liberado' else 'cobrança ' || st end;
end $$;

revoke execute on function public.vincular_cobranca_asaas, public.definir_forma_pagamento, public.processar_evento_asaas from public, anon, authenticated;
grant execute on function public.vincular_cobranca_asaas, public.definir_forma_pagamento, public.processar_evento_asaas to service_role;
