-- Professor ajuda no financeiro de qualquer aluno: vê mensalidades e assinaturas e dá baixa manual.
-- Planos/valores, despesas, faturamento geral e configurações continuam só com o admin.

drop policy if exists cob_ler on public.cobrancas;
create policy cob_ler on public.cobrancas for select
  using (public.is_staff() or public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());

drop policy if exists ass_ler on public.assinaturas;
create policy ass_ler on public.assinaturas for select
  using (public.is_staff() or public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());

create or replace function public.baixa_manual(p_cobranca uuid, p_forma public.forma_pagamento, p_obs text default null)
returns public.cobrancas language plpgsql security definer set search_path = public as $$
declare c cobrancas;
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  update cobrancas set status = 'pago', pago_em = now(), forma_pagamento = p_forma,
         baixa_manual_por = auth.uid(), baixa_obs = p_obs
  where id = p_cobranca and status in ('em_aberto','atrasado') returning * into c;
  if c.id is null then raise exception 'Cobrança não está em aberto'; end if;
  return c;
end $$;
