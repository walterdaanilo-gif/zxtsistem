-- =====================================================================
-- 0010 · Integração com o Asaas
-- Mensalidade recorrente no Asaas (assinatura "pergunte ao cliente"):
-- o aluno escolhe Pix ou cartão na fatura; se pagar no cartão, as
-- próximas são debitadas sozinhas no cartão. O Asaas avisa o sistema
-- por webhook e o status da cobrança se atualiza aqui.
-- =====================================================================

alter table public.assinaturas
  add column if not exists provider text,                 -- 'asaas'
  add column if not exists provider_status text,          -- ATIVA | CANCELADA | ERRO
  add column if not exists provider_erro text,
  add column if not exists provider_sync_em timestamptz;

alter table public.cobrancas
  add column if not exists provider_status text;          -- status cru do Asaas (PENDING, RECEIVED...)

-- log de eventos recebidos do Asaas (idempotência e auditoria)
create table if not exists public.asaas_eventos (
  id text primary key,                 -- id do evento enviado pelo Asaas
  evento text not null,
  payment_id text,
  payload jsonb not null,
  processado_em timestamptz,
  erro text,
  recebido_em timestamptz not null default now()
);
create index if not exists asaas_eventos_payment on public.asaas_eventos (payment_id);
alter table public.asaas_eventos enable row level security;
drop policy if exists asaas_ev_admin on public.asaas_eventos;
create policy asaas_ev_admin on public.asaas_eventos for select using (public.is_admin());

-- Mensalidades de quem está no Asaas são criadas pelo próprio Asaas (webhook).
-- gerar_mensalidades passa a ignorar essas assinaturas para não duplicar.
create or replace function public.gerar_mensalidades(p_competencia date default date_trunc('month', public.hoje_fortaleza())::date)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; s record; v int; pr promocoes; desc_c int; primeira boolean; meses int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Sem permissão'; end if;
  for s in
    select a.*, p.valor_centavos as valor_plano, p.periodicidade, p.nome as plano_nome
    from assinaturas a join planos p on p.id = a.plano_id
    where a.ativa and a.inicio <= (p_competencia + interval '1 month - 1 day')::date
      and (a.fim is null or a.fim >= p_competencia)
      and a.provider_subscription_id is null
  loop
    meses := case s.periodicidade when 'mensal' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
    if ((extract(year from p_competencia)*12 + extract(month from p_competencia))
        - (extract(year from s.inicio)*12 + extract(month from s.inicio)))::int % meses <> 0 then continue; end if;
    if exists (select 1 from cobrancas where assinatura_id = s.id and competencia = p_competencia) then continue; end if;
    v := coalesce(s.valor_centavos, s.valor_plano);
    primeira := not exists (select 1 from cobrancas where assinatura_id = s.id);
    desc_c := 0; pr := null;
    if primeira then
      select pm.* into pr from promocoes pm
      where pm.ativa and pm.codigo is null and s.inicio between pm.inicio and pm.fim
        and (pm.turma_ids is null or exists (select 1 from matriculas m where m.aluno_id = s.aluno_id and m.turma_id = any(pm.turma_ids)))
      order by pm.valor desc limit 1;
      if pr.id is not null then
        desc_c := case pr.tipo when 'percentual' then round(v * pr.valor / 100.0)::int else round(pr.valor * 100)::int end;
      end if;
    end if;
    insert into cobrancas (aluno_id, pagador_id, assinatura_id, tipo, descricao, competencia, vencimento,
                           valor_centavos, desconto_centavos, promocao_id)
    values (s.aluno_id, s.pagador_id, s.id, 'mensalidade',
            s.plano_nome || ' · ' || to_char(p_competencia, 'MM/YYYY'), p_competencia,
            make_date(extract(year from p_competencia)::int, extract(month from p_competencia)::int, s.dia_vencimento),
            v, least(desc_c, v), pr.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Aplica um pagamento vindo do Asaas. Só a Edge Function (service role) chama.
create or replace function public.asaas_aplicar_pagamento(p_evento text, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  a assinaturas; c cobrancas; st text := p->>'status'; novo public.status_cobranca;
  venc date := (p->>'dueDate')::date; comp date := date_trunc('month', (p->>'dueDate')::date)::date;
  forma public.forma_pagamento; pago timestamptz; plano_nome text;
begin
  novo := case
    when p_evento = 'PAYMENT_DELETED' then 'cancelado'
    when st in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH','DUNNING_RECEIVED') then 'pago'
    when st = 'OVERDUE' then 'atrasado'
    when st in ('REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL') then 'cancelado'
    else case when venc < public.hoje_fortaleza() then 'atrasado' else 'em_aberto' end
  end::public.status_cobranca;
  forma := case p->>'billingType' when 'PIX' then 'pix' when 'BOLETO' then 'boleto'
                                  when 'CREDIT_CARD' then 'cartao' when 'DEBIT_CARD' then 'cartao' else null end::public.forma_pagamento;
  pago := case when novo = 'pago' then coalesce((p->>'clientPaymentDate')::date, (p->>'paymentDate')::date, (p->>'confirmedDate')::date, public.hoje_fortaleza())::timestamptz end;

  select * into c from cobrancas where provider_id = p->>'id';
  if c.id is null then
    select * into a from assinaturas
    where (p->>'subscription' is not null and provider_subscription_id = p->>'subscription')
       or (p->>'externalReference' is not null and id::text = p->>'externalReference')
    limit 1;
    if a.id is null then return 'ignorado: cobrança sem vínculo com aluno do sistema'; end if;
    -- cobrança já lançada à mão para o mesmo mês: vincula em vez de duplicar
    select * into c from cobrancas where assinatura_id = a.id and competencia = comp and provider_id is null;
    if c.id is null then
      select pl.nome into plano_nome from planos pl where pl.id = a.plano_id;
      insert into cobrancas (aluno_id, pagador_id, assinatura_id, tipo, descricao, competencia, vencimento,
                             valor_centavos, status, provider, provider_id, provider_status, link_pagamento, boleto_url,
                             pago_em, forma_pagamento)
      values (a.aluno_id, a.pagador_id, a.id, 'mensalidade',
              coalesce(plano_nome, 'Mensalidade') || ' · ' || to_char(comp, 'MM/YYYY'), comp, venc,
              round((p->>'value')::numeric * 100)::int, novo, 'asaas', p->>'id', st, p->>'invoiceUrl', p->>'bankSlipUrl',
              pago, case when novo = 'pago' then forma end);
      return 'criada';
    end if;
  end if;

  -- baixa manual já registrada não volta para "em aberto" por causa do Asaas
  if c.status in ('pago','isento') and novo in ('em_aberto','atrasado') then
    update cobrancas set provider = 'asaas', provider_id = p->>'id', provider_status = st where id = c.id;
    return 'mantida (já paga no sistema)';
  end if;

  update cobrancas set
    provider = 'asaas', provider_id = p->>'id', provider_status = st, status = novo, vencimento = venc,
    valor_centavos = round((p->>'value')::numeric * 100)::int, desconto_centavos = 0,
    link_pagamento = coalesce(p->>'invoiceUrl', link_pagamento), boleto_url = coalesce(p->>'bankSlipUrl', boleto_url),
    pago_em = case when novo = 'pago' then coalesce(pago_em, pago) else null end,
    forma_pagamento = case when novo = 'pago' then coalesce(forma_pagamento, forma) else forma_pagamento end
  where id = c.id;
  return 'atualizada';
end $$;

revoke execute on function public.asaas_aplicar_pagamento(text, jsonb) from public, anon, authenticated;
grant execute on function public.asaas_aplicar_pagamento(text, jsonb) to service_role;
