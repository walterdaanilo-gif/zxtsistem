-- =====================================================================
-- Regras do plano aplicadas pelo banco:
--   1. só modalidades do plano (plano sem modalidade marcada = todas)
--   2. limite de aulas por semana (seg a dom, horário de Natal)
--      contam: reservas ativas e presenças | não contam: faltas, canceladas, espera
--   3. sparring/coletiva não conta e é aberto a todo aluno ativo
--   4. aluno sem assinatura ativa (bolsista/isento) = sem limite
--   5. professor na chamada pode passar do limite (decisão da equipe)
-- =====================================================================

create or replace function public.semana_de(ts timestamptz) returns date
language sql immutable set search_path = public as $$
  select date_trunc('week', ts at time zone 'America/Fortaleza')::date $$;

-- assinatura ativa que cobre a modalidade (a de limite mais folgado primeiro)
create or replace function public.assinatura_para(p_aluno uuid, p_modalidade uuid)
returns table (assinatura_id uuid, plano_id uuid, plano_nome text, aulas_semana int)
language sql stable security definer set search_path = public as $$
  select s.id, p.id, p.nome, p.aulas_semana
  from assinaturas s join planos p on p.id = s.plano_id
  where s.aluno_id = p_aluno and s.ativa and (s.fim is null or s.fim >= public.hoje_fortaleza())
    and (not exists (select 1 from plano_modalidades pm where pm.plano_id = p.id)
         or exists (select 1 from plano_modalidades pm where pm.plano_id = p.id and pm.modalidade_id = p_modalidade))
  order by p.aulas_semana desc nulls first
  limit 1 $$;

-- aulas já usadas na semana dentro das modalidades cobertas pelo plano
create or replace function public.aulas_usadas_semana(p_aluno uuid, p_plano uuid, p_semana date, p_ignorar_aula uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from reservas r join aulas a on a.id = r.aula_id join turmas t on t.id = a.turma_id
  where r.aluno_id = p_aluno and r.status in ('reservada','presente') and not t.coletiva
    and public.semana_de(a.inicio) = p_semana
    and (p_ignorar_aula is null or r.aula_id <> p_ignorar_aula)
    and (not exists (select 1 from plano_modalidades pm where pm.plano_id = p_plano)
         or t.modalidade_id in (select pm.modalidade_id from plano_modalidades pm where pm.plano_id = p_plano)) $$;

-- devolve NULL se pode treinar nessa aula; senão o motivo
create or replace function public.validar_plano(p_aluno uuid, p_aula uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare a aulas; t turmas; s record; usadas int;
begin
  select * into a from aulas where id = p_aula;
  select * into t from turmas where id = a.turma_id;
  if t.coletiva then return null; end if;
  if not exists (select 1 from assinaturas where aluno_id = p_aluno and ativa and (fim is null or fim >= public.hoje_fortaleza())) then
    return null;  -- sem plano: bolsista/isento
  end if;
  select * into s from public.assinatura_para(p_aluno, t.modalidade_id);
  if s.assinatura_id is null then
    return 'Seu plano não inclui ' || coalesce((select nome from modalidades where id = t.modalidade_id), 'essa modalidade') || '. Fale com a recepção para mudar de plano.';
  end if;
  if s.aulas_semana is null then return null; end if;
  usadas := public.aulas_usadas_semana(p_aluno, s.plano_id, public.semana_de(a.inicio), p_aula);
  if usadas >= s.aulas_semana then
    return 'Seu plano ' || s.plano_nome || ' permite ' || s.aulas_semana || ' aula(s) por semana e você já usou ' || usadas || ' nesta semana.';
  end if;
  return null;
end $$;

-- resumo para a tela do aluno
create or replace function public.meu_plano() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'plano', p.nome, 'aulas_semana', p.aulas_semana,
    'usadas', public.aulas_usadas_semana(auth.uid(), p.id, public.semana_de(now())),
    'modalidades', coalesce((select jsonb_agg(m.nome order by m.ordem) from plano_modalidades pm join modalidades m on m.id = pm.modalidade_id where pm.plano_id = p.id), '[]'::jsonb),
    'modalidade_ids', coalesce((select jsonb_agg(pm.modalidade_id) from plano_modalidades pm where pm.plano_id = p.id), '[]'::jsonb)
  )), '[]'::jsonb)
  from assinaturas s join planos p on p.id = s.plano_id
  where s.aluno_id = auth.uid() and s.ativa and (s.fim is null or s.fim >= public.hoje_fortaleza()) $$;

-- para a chamada do professor: o aluno está acima do plano nessa aula?
create or replace function public.alerta_plano(p_aluno uuid, p_aula uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return null; end if;
  return public.validar_plano(p_aluno, p_aula);
end $$;

-- ---------- reserva respeita o plano ----------
create or replace function public.reservar_aula(p_aula uuid) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare a aulas; t turmas; ocupadas int; r reservas; motivo text;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  select * into a from aulas where id = p_aula;
  if a.id is null or a.status = 'cancelada' then raise exception 'Aula indisponível'; end if;
  if a.inicio < now() then raise exception 'Essa aula já começou'; end if;
  select * into t from turmas where id = a.turma_id;
  if not t.coletiva and not exists (select 1 from matriculas where aluno_id = auth.uid() and turma_id = t.id)
     and not exists (select 1 from turmas t2 join matriculas m on m.turma_id = t2.id
                     where m.aluno_id = auth.uid() and t2.modalidade_id = t.modalidade_id) then
    raise exception 'Essa turma não faz parte da sua matrícula';
  end if;
  if exists (select 1 from reservas where aula_id = p_aula and aluno_id = auth.uid() and status in ('reservada','presente','espera')) then
    select * into r from reservas where aula_id = p_aula and aluno_id = auth.uid();
    return r;
  end if;
  motivo := public.validar_plano(auth.uid(), p_aula);
  if motivo is not null then raise exception '%', motivo; end if;
  select count(*) into ocupadas from reservas where aula_id = p_aula and status in ('reservada','presente');
  insert into reservas (aula_id, aluno_id, status)
  values (p_aula, auth.uid(), case when ocupadas >= t.capacidade then 'espera' else 'reservada' end::status_reserva)
  on conflict (aula_id, aluno_id) do update
    set status = excluded.status, created_at = now()
    where reservas.status in ('cancelada','falta')
  returning * into r;
  if r.id is null then select * into r from reservas where aula_id = p_aula and aluno_id = auth.uid(); end if;
  return r;
end $$;

-- ---------- check-in respeita o plano (quem já reservou não conta de novo) ----------
create or replace function public.fazer_checkin(p_token text) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare jan int; a aulas; r reservas; motivo text;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  if not exists (select 1 from qr_tokens where token = p_token and expira_em > now()) then
    raise exception 'QR code inválido ou vencido';
  end if;
  if public.bloqueado_por_atraso(auth.uid()) then raise exception 'Check-in bloqueado: mensalidade em atraso. Fale com a recepção.'; end if;
  select janela_checkin_min into jan from academia_config;
  select a2.* into a from aulas a2
    join turmas t on t.id = a2.turma_id
    left join reservas rv on rv.aula_id = a2.id and rv.aluno_id = auth.uid() and rv.status in ('reservada','espera')
    left join matriculas m on m.turma_id = t.id and m.aluno_id = auth.uid()
  where a2.status <> 'cancelada'
    and now() between a2.inicio - make_interval(mins => jan) and a2.fim
    and (rv.id is not null or m.aluno_id is not null or t.coletiva)
  order by (rv.id is not null) desc, (m.aluno_id is not null) desc, a2.inicio
  limit 1;
  if a.id is null then raise exception 'Nenhuma aula sua acontecendo agora'; end if;
  if not exists (select 1 from reservas where aula_id = a.id and aluno_id = auth.uid() and status in ('reservada','presente')) then
    motivo := public.validar_plano(auth.uid(), a.id);
    if motivo is not null then raise exception '%', motivo; end if;
  end if;
  insert into reservas (aula_id, aluno_id, status, checkin_em, checkin_metodo)
  values (a.id, auth.uid(), 'presente', now(), 'qr')
  on conflict (aula_id, aluno_id) do update set status = 'presente', checkin_em = now(), checkin_metodo = 'qr'
  returning * into r;
  return r;
end $$;

-- ---------- aprovação: turmas precisam estar nas modalidades do plano ----------
create or replace function public.aprovar_aluno(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int default 10)
returns void language plpgsql security definer set search_path = public as $$
declare fora text;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  if p_plano is not null and exists (select 1 from plano_modalidades where plano_id = p_plano) then
    select string_agg(t.nome, ', ') into fora from turmas t
    where t.id = any(p_turmas) and not t.coletiva
      and t.modalidade_id not in (select modalidade_id from plano_modalidades where plano_id = p_plano);
    if fora is not null then raise exception 'Turma fora das modalidades do plano: %', fora; end if;
  end if;
  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null where id = p_aluno;
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(p_turmas) on conflict do nothing;
  if p_plano is not null then
    insert into assinaturas (aluno_id, plano_id, dia_vencimento) values (p_aluno, p_plano, p_dia_vencimento);
  end if;
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Bem-vindo à família ZxT 🥊', 'Seu cadastro foi aprovado. Bora treinar!', '/app');
end $$;

revoke execute on function public.semana_de, public.assinatura_para, public.aulas_usadas_semana, public.validar_plano from public, anon, authenticated;
grant execute on function public.meu_plano, public.alerta_plano, public.reservar_aula, public.fazer_checkin, public.aprovar_aluno to authenticated;
