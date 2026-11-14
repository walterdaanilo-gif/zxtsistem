-- Baixa de inscrição também quando a opção está "a confirmar": o professor informa o valor recebido.
drop function if exists public.baixa_inscricao(uuid, text, text);
create or replace function public.baixa_inscricao(p_inscricao uuid, p_forma text, p_obs text default null, p_valor int default null)
returns void language plpgsql security definer set search_path = public as $$
declare i evento_inscricoes;
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  select * into i from evento_inscricoes where id = p_inscricao and status = 'pendente';
  if i.id is null then raise exception 'Inscrição não está pendente'; end if;
  if i.valor_centavos is null and coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor recebido.'; end if;
  update evento_inscricoes set status = 'pago', pago_em = now(), forma_pagamento = p_forma, baixa_por = auth.uid(),
    valor_centavos = coalesce(valor_centavos, p_valor),
    obs = case when nullif(p_obs, '') is null then obs else concat_ws(' · ', obs, p_obs) end, updated_at = now()
  where id = i.id;
end $$;
revoke execute on function public.baixa_inscricao from public, anon;
grant execute on function public.baixa_inscricao to authenticated;
