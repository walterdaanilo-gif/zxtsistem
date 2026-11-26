-- Botão "Cobrar pelo sistema": manda uma notificação (sino e celular) ao aluno. Admin, ou professor do aluno.
-- Aluno novo pendente: lembra de pagar para liberar o acesso. Aluno ativo: mensalidade em aberto ou atrasada.
create or replace function public.cobrar_aluno(p_aluno uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_valor bigint := 0; v_venc date; n int := 0; pend boolean; v_nome text; plano record; v_titulo text; v_corpo text; v_link text; atras boolean; push boolean;
begin
  if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception 'Sem permissão'; end if;
  select nome, (status = 'pendente' and tipo_cadastro = 'aluno' and not coalesce(aluno_existente, false)) into v_nome, pend from profiles where id = p_aluno;
  if v_nome is null and pend is null then raise exception 'Aluno não encontrado.'; end if;
  if pend then
    select pl.nome, pl.valor_centavos into plano from profiles p join planos pl on pl.id = p.plano_escolhido_id where p.id = p_aluno;
    v_titulo := 'Falta o pagamento para liberar seu acesso';
    v_corpo := coalesce(plano.nome || ' · ' || public.brl(plano.valor_centavos) || '. ', '') || 'Entre no portal e escolha Pix, cartão ou boleto.';
    v_link := '/app';
  else
    select coalesce(sum(valor_final_centavos), 0), min(vencimento), count(*) into v_valor, v_venc, n
      from cobrancas where aluno_id = p_aluno and status in ('em_aberto', 'atrasado');
    if n = 0 then raise exception 'Esse aluno não tem mensalidade em aberto.'; end if;
    atras := v_venc < public.hoje_fortaleza();
    v_titulo := case when atras then 'Mensalidade em atraso: ' else 'Mensalidade em aberto: ' end || public.brl(v_valor::int);
    v_corpo := (case when atras then 'Venceu em ' else 'Vence em ' end) || to_char(v_venc, 'DD/MM') || '. Pague pelo portal em Mensalidades (Pix, cartão ou boleto).';
    v_link := '/app#/financeiro';
  end if;
  if exists (select 1 from notificacoes where user_id = p_aluno and tipo = 'cobranca' and titulo = left(v_titulo, 140) and created_at > now() - interval '6 hours') then
    raise exception 'Esse aluno já foi cobrado há menos de 6 horas.';
  end if;
  perform notificar(p_aluno, 'cobranca', v_titulo, v_corpo, v_link);
  if not exists (select 1 from notificacoes where user_id = p_aluno and tipo = 'cobranca' and titulo = left(v_titulo, 140) and created_at > now() - interval '1 minute') then
    return jsonb_build_object('enviado', false, 'motivo', 'O aluno desligou os avisos de mensalidade.');
  end if;
  push := exists (select 1 from push_inscricoes where user_id = p_aluno);
  insert into auditoria (user_id, acao, tabela, registro_id, depois)
  values (auth.uid(), 'COBRANCA_ENVIADA', 'profiles', p_aluno::text, jsonb_build_object('titulo', v_titulo));
  return jsonb_build_object('enviado', true, 'celular', push);
end $$;
grant execute on function public.cobrar_aluno to authenticated;
