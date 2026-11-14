-- Alunos que já treinam na ZXT: cadastram sem pagar e o admin aprova com a situação da mensalidade.
alter table public.profiles add column if not exists aluno_existente boolean not null default false;

-- o aluno só marca "já sou aluno" enquanto está pendente
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_obs text := new.observacoes_professor;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if current_setting('zxt.obs_prof', true) = 'on' then
    new := old; new.observacoes_professor := v_obs; return new;
  end if;
  new.status := old.status; new.motivo_recusa := old.motivo_recusa;
  new.aprovado_em := old.aprovado_em; new.aprovado_por := old.aprovado_por;
  new.codigo_indicacao := old.codigo_indicacao; new.indicado_por := old.indicado_por;
  new.observacoes_professor := old.observacoes_professor; new.email := old.email;
  new.asaas_customer_id := old.asaas_customer_id; new.asaas_subscription_id := old.asaas_subscription_id;
  new.pagamento_forma := old.pagamento_forma; new.pagamento_iniciado_em := old.pagamento_iniciado_em;
  if old.status <> 'pendente' then
    new.plano_escolhido_id := old.plano_escolhido_id; new.turmas_escolhidas := old.turmas_escolhidas;
    new.tipo_cadastro := old.tipo_cadastro; new.aluno_existente := old.aluno_existente;
  end if;
  new.exclusao_solicitada_em := coalesce(new.exclusao_solicitada_em, old.exclusao_solicitada_em);
  return new;
end $$;

-- aprovação do aluno atual: em dia (cobra a partir do mês que vem) ou atrasado (gera a mensalidade em atraso)
create or replace function public.aprovar_aluno_atual(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int,
                                                       p_em_dia boolean, p_vencimento_atraso date default null)
returns void language plpgsql security definer set search_path = public as $$
declare motivo text; pl planos; ass assinaturas; mes date := date_trunc('month', public.hoje_fortaleza())::date;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  if p_plano is null then raise exception 'Escolha o plano do aluno.'; end if;
  motivo := public.checar_turmas_do_plano(p_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  select * into pl from planos where id = p_plano;

  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null,
         plano_escolhido_id = p_plano, turmas_escolhidas = coalesce(p_turmas, '{}') where id = p_aluno;
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
  update assinaturas set ativa = false, fim = public.hoje_fortaleza() where aluno_id = p_aluno and ativa;

  -- em dia: assinatura começa no mês que vem (o gerador do dia 1º cria a mensalidade)
  -- atrasado: começa neste mês e já entra a mensalidade em atraso
  insert into assinaturas (aluno_id, plano_id, dia_vencimento, inicio)
  values (p_aluno, p_plano, least(greatest(coalesce(p_dia_vencimento, 10), 1), 28),
          case when p_em_dia then (mes + interval '1 month')::date else mes end)
  returning * into ass;

  if not p_em_dia then
    insert into cobrancas (aluno_id, assinatura_id, tipo, descricao, competencia, vencimento, valor_centavos, status)
    values (p_aluno, ass.id, 'mensalidade', pl.nome || ' · ' || to_char(mes, 'MM/YYYY'), mes,
            coalesce(p_vencimento_atraso, public.hoje_fortaleza()), pl.valor_centavos,
            case when coalesce(p_vencimento_atraso, public.hoje_fortaleza()) < public.hoje_fortaleza() then 'atrasado' else 'em_aberto' end::status_cobranca);
  end if;

  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Acesso liberado. Bem-vindo ao portal ZxT 🥊',
          case when p_em_dia then 'Seu cadastro foi confirmado. Suas mensalidades aparecem em Mensalidades.' else 'Seu cadastro foi confirmado. Você tem uma mensalidade em aberto em Mensalidades.' end, '/app');
end $$;

revoke execute on function public.aprovar_aluno_atual from public, anon;
grant execute on function public.aprovar_aluno_atual to authenticated;
