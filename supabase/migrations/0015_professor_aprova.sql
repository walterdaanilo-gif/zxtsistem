-- Professor aprova os alunos que escolheram turmas dele; aluno do plano livre (Plus) é de todos os professores.

-- trava do perfil: aceita a mudança quando vem das funções de aprovação
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_obs text := new.observacoes_professor;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if current_setting('zxt.aprovacao', true) = 'on' then return new; end if;   -- dentro de aprovar/recusar (já conferiu a permissão)
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

-- o aluno tem plano livre (escolhido no cadastro ou assinatura ativa)?
create or replace function public.aluno_plano_livre(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tem_plano_livre(p_aluno)
      or exists (select 1 from profiles pr join planos pl on pl.id = pr.plano_escolhido_id where pr.id = p_aluno and pl.turmas_livres) $$;

-- professor responsável pelo aluno: turma matriculada ou escolhida é dele, ou o aluno é do Plus
create or replace function public.aluno_da_minha_turma(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tem_papel('professor') and (
       exists (select 1 from matriculas m join turmas t on t.id = m.turma_id where m.aluno_id = p_aluno and t.professor_id = auth.uid())
    or exists (select 1 from profiles pr join turmas t on t.id = any(pr.turmas_escolhidas) where pr.id = p_aluno and t.professor_id = auth.uid())
    or public.aluno_plano_livre(p_aluno)) $$;

-- quem pode aprovar ou recusar este cadastro
create or replace function public.pode_aprovar(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.tem_papel('professor')
    and exists (select 1 from profiles where id = p_aluno and status = 'pendente' and tipo_cadastro = 'aluno')
    and public.aluno_da_minha_turma(p_aluno)) $$;

create or replace function public.aprovar_aluno(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int default 10)
returns void language plpgsql security definer set search_path = public as $$
declare motivo text; fora text;
begin
  if not public.pode_aprovar(p_aluno) then raise exception 'Sem permissão para aprovar este aluno'; end if;
  perform set_config('zxt.aprovacao', 'on', true);
  motivo := public.checar_turmas_do_plano(p_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  if p_plano is not null and exists (select 1 from plano_modalidades where plano_id = p_plano) then
    select string_agg(t.nome, ', ') into fora from turmas t
    where t.id = any(p_turmas) and not t.coletiva
      and t.modalidade_id not in (select modalidade_id from plano_modalidades where plano_id = p_plano);
    if fora is not null then raise exception 'Turma fora das modalidades do plano: %', fora; end if;
  end if;
  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null where id = p_aluno;
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
  if p_plano is not null then
    insert into assinaturas (aluno_id, plano_id, dia_vencimento) values (p_aluno, p_plano, p_dia_vencimento);
  end if;
  perform set_config('zxt.aprovacao', 'off', true);
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Bem-vindo à família ZxT 🥊', 'Seu cadastro foi aprovado. Bora treinar!', '/app');
end $$;

create or replace function public.aprovar_aluno_atual(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int,
                                                       p_em_dia boolean, p_vencimento_atraso date default null)
returns void language plpgsql security definer set search_path = public as $$
declare motivo text; pl planos; ass assinaturas; mes date := date_trunc('month', public.hoje_fortaleza())::date;
begin
  if not public.pode_aprovar(p_aluno) then raise exception 'Sem permissão para aprovar este aluno'; end if;
  perform set_config('zxt.aprovacao', 'on', true);
  if p_plano is null then raise exception 'Escolha o plano do aluno.'; end if;
  motivo := public.checar_turmas_do_plano(p_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  select * into pl from planos where id = p_plano;
  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null,
         plano_escolhido_id = p_plano, turmas_escolhidas = coalesce(p_turmas, '{}') where id = p_aluno;
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
  update assinaturas set ativa = false, fim = public.hoje_fortaleza() where aluno_id = p_aluno and ativa;
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
  perform set_config('zxt.aprovacao', 'off', true);
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Acesso liberado. Bem-vindo ao portal ZxT 🥊',
          case when p_em_dia then 'Seu cadastro foi confirmado. Suas mensalidades aparecem em Mensalidades.' else 'Seu cadastro foi confirmado. Você tem uma mensalidade em aberto em Mensalidades.' end, '/app');
end $$;

create or replace function public.recusar_aluno(p_aluno uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_aprovar(p_aluno) then raise exception 'Sem permissão'; end if;
  perform set_config('zxt.aprovacao', 'on', true);
  update profiles set status = 'recusado', motivo_recusa = p_motivo where id = p_aluno;
  perform set_config('zxt.aprovacao', 'off', true);
end $$;

grant execute on function public.aluno_plano_livre, public.pode_aprovar to authenticated;
