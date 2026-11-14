-- =====================================================================
-- Pagamento no cadastro (Asaas): aluno pagou = acesso liberado sozinho.
-- As funções de pagamento só rodam com a chave secreta do servidor (service_role).
-- =====================================================================

alter table public.profiles add column if not exists asaas_customer_id text;
alter table public.profiles add column if not exists asaas_subscription_id text;
alter table public.profiles add column if not exists pagamento_forma text;          -- PIX | BOLETO | CREDIT_CARD
alter table public.profiles add column if not exists pagamento_iniciado_em timestamptz;

-- o aluno não pode mexer nos campos de pagamento do próprio perfil
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_obs text := new.observacoes_professor;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;   -- servidor/admin
  if current_setting('zxt.obs_prof', true) = 'on' then                -- professor: só a observação
    new := old; new.observacoes_professor := v_obs; return new;
  end if;
  new.status := old.status; new.motivo_recusa := old.motivo_recusa;
  new.aprovado_em := old.aprovado_em; new.aprovado_por := old.aprovado_por;
  new.codigo_indicacao := old.codigo_indicacao; new.indicado_por := old.indicado_por;
  new.observacoes_professor := old.observacoes_professor; new.email := old.email;
  new.asaas_customer_id := old.asaas_customer_id; new.asaas_subscription_id := old.asaas_subscription_id;
  new.pagamento_forma := old.pagamento_forma; new.pagamento_iniciado_em := old.pagamento_iniciado_em;
  -- depois de ativo, plano e turmas só mudam pela equipe
  if old.status <> 'pendente' then
    new.plano_escolhido_id := old.plano_escolhido_id; new.turmas_escolhidas := old.turmas_escolhidas;
    new.tipo_cadastro := old.tipo_cadastro;
  end if;
  new.exclusao_solicitada_em := coalesce(new.exclusao_solicitada_em, old.exclusao_solicitada_em);
  return new;
end $$;

-- mensalidades de quem assina pelo Asaas vêm do próprio Asaas (não duplicar)
create or replace function public.gerar_mensalidades(p_competencia date default date_trunc('month', public.hoje_fortaleza())::date)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; s record; v int; pr promocoes; desc_c int; primeira boolean; meses int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Sem permissão'; end if;
  for s in
    select a.*, p.valor_centavos as valor_plano, p.periodicidade, p.nome as plano_nome
    from assinaturas a join planos p on p.id = a.plano_id
    where a.ativa and a.provider_subscription_id is null
      and a.inicio <= (p_competencia + interval '1 month - 1 day')::date
      and (a.fim is null or a.fim >= p_competencia)
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

-- registra a assinatura criada no Asaas (chamado por /api/assinar)
create or replace function public.registrar_inicio_pagamento(p_aluno uuid, p_customer text, p_subscription text, p_forma text)
returns void language sql security definer set search_path = public as $$
  update profiles set asaas_customer_id = p_customer, asaas_subscription_id = p_subscription,
         pagamento_forma = p_forma, pagamento_iniciado_em = now()
  where id = p_aluno $$;

-- evento de cobrança vindo do Asaas (chamado por /api/asaas-webhook)
-- p: { evento, payment_id, subscription_id, customer_id, valor_centavos, vencimento, forma, invoice_url, boleto_url, pago_em }
create or replace function public.processar_evento_asaas(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare pf profiles; pl planos; ass assinaturas; st status_cobranca; c cobrancas; fp forma_pagamento; novo_aluno boolean := false;
begin
  select * into pf from profiles where asaas_subscription_id = p->>'subscription_id' limit 1;
  if pf.id is null then select * into pf from profiles where asaas_customer_id = p->>'customer_id' limit 1; end if;
  if pf.id is null then return 'aluno não encontrado'; end if;

  st := case p->>'evento'
          when 'PAYMENT_CONFIRMED' then 'pago' when 'PAYMENT_RECEIVED' then 'pago'
          when 'PAYMENT_OVERDUE' then 'atrasado'
          when 'PAYMENT_DELETED' then 'cancelado' when 'PAYMENT_REFUNDED' then 'cancelado'
          else 'em_aberto' end;
  fp := case p->>'forma' when 'PIX' then 'pix' when 'BOLETO' then 'boleto' when 'CREDIT_CARD' then 'cartao' else null end;

  -- assinatura local (cria na primeira confirmação)
  select * into ass from assinaturas where aluno_id = pf.id and provider_subscription_id = p->>'subscription_id' limit 1;
  if ass.id is null and st = 'pago' and pf.plano_escolhido_id is not null then
    update assinaturas set ativa = false, fim = public.hoje_fortaleza() where aluno_id = pf.id and ativa;
    insert into assinaturas (aluno_id, plano_id, dia_vencimento, provider_customer_id, provider_subscription_id)
    values (pf.id, pf.plano_escolhido_id, least(extract(day from coalesce((p->>'vencimento')::date, public.hoje_fortaleza()))::int, 28),
            p->>'customer_id', p->>'subscription_id')
    returning * into ass;
  end if;
  select * into pl from planos where id = coalesce(ass.plano_id, pf.plano_escolhido_id);

  -- cobrança (uma por pagamento do Asaas)
  insert into cobrancas (aluno_id, assinatura_id, tipo, descricao, competencia, vencimento, valor_centavos, status,
                         provider, provider_id, link_pagamento, boleto_url, pago_em, forma_pagamento)
  values (pf.id, ass.id, 'mensalidade', coalesce(pl.nome, 'Mensalidade') || ' · ' || to_char(coalesce((p->>'vencimento')::date, public.hoje_fortaleza()), 'MM/YYYY'),
          date_trunc('month', coalesce((p->>'vencimento')::date, public.hoje_fortaleza()))::date,
          coalesce((p->>'vencimento')::date, public.hoje_fortaleza()), coalesce((p->>'valor_centavos')::int, pl.valor_centavos, 0), st,
          'asaas', p->>'payment_id', p->>'invoice_url', p->>'boleto_url',
          case when st = 'pago' then coalesce((p->>'pago_em')::timestamptz, now()) end, fp)
  on conflict (provider_id) do update set
    status = case when cobrancas.status = 'pago' and excluded.status in ('em_aberto','atrasado') then cobrancas.status else excluded.status end,
    assinatura_id = coalesce(cobrancas.assinatura_id, excluded.assinatura_id),
    pago_em = coalesce(excluded.pago_em, cobrancas.pago_em), forma_pagamento = coalesce(excluded.forma_pagamento, cobrancas.forma_pagamento),
    link_pagamento = coalesce(excluded.link_pagamento, cobrancas.link_pagamento), boleto_url = coalesce(excluded.boleto_url, cobrancas.boleto_url);

  -- pagou no cadastro: libera o aluno sozinho e matricula nas turmas escolhidas
  if st = 'pago' and pf.status = 'pendente' and pf.tipo_cadastro = 'aluno' then
    update profiles set status = 'ativo', aprovado_em = now(), motivo_recusa = null where id = pf.id;
    insert into matriculas (aluno_id, turma_id) select pf.id, unnest(coalesce(pf.turmas_escolhidas, '{}')) on conflict do nothing;
    insert into notificacoes (user_id, titulo, corpo, link)
    values (pf.id, 'Pagamento confirmado. Bem-vindo à família ZxT 🥊', 'Seu acesso foi liberado. Bora treinar!', '/app');
    novo_aluno := true;
  end if;
  return case when novo_aluno then 'aluno liberado' else 'cobrança ' || st end;
end $$;

-- só o servidor (service_role) chama estas duas
revoke execute on function public.registrar_inicio_pagamento, public.processar_evento_asaas from public, anon, authenticated;
grant execute on function public.registrar_inicio_pagamento, public.processar_evento_asaas to service_role;
