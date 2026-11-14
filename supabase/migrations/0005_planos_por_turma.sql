-- =====================================================================
-- Planos por TURMA (regra da ZXT):
--   Básico = 1 turma | Pro = 2 turmas (mesma ou outra modalidade) | Plus = todas
--   Toda turma tem 2 aulas por semana. Sparring de sexta é de todos.
--   O aluno só reserva e faz check-in nas turmas do plano (ou em todas, no Plus).
-- =====================================================================

alter table public.planos add column if not exists max_turmas int check (max_turmas is null or max_turmas > 0);
alter table public.planos add column if not exists turmas_livres boolean not null default false;

alter table public.profiles add column if not exists plano_escolhido_id uuid references public.planos(id) on delete set null;
alter table public.profiles add column if not exists turmas_escolhidas uuid[] not null default '{}';

-- visitante vê os planos ativos para escolher no cadastro
drop policy if exists pln_publico on public.planos;
create policy pln_publico on public.planos for select to anon using (ativo);

-- o aluno tem plano livre (Plus) ativo?
create or replace function public.tem_plano_livre(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assinaturas s join planos p on p.id = s.plano_id
                 where s.aluno_id = p_aluno and s.ativa and (s.fim is null or s.fim >= public.hoje_fortaleza()) and p.turmas_livres) $$;

-- pode treinar nessa turma? coletiva (sparring), plano livre ou matriculado nela
create or replace function public.tem_acesso_turma(p_aluno uuid, p_turma uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from turmas where id = p_turma and coletiva)
      or public.tem_plano_livre(p_aluno)
      or exists (select 1 from matriculas where aluno_id = p_aluno and turma_id = p_turma) $$;

-- valida a escolha de turmas contra o plano; devolve NULL se ok
create or replace function public.checar_turmas_do_plano(p_plano uuid, p_turmas uuid[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare pl planos; n int;
begin
  if p_plano is null then return null; end if;
  select * into pl from planos where id = p_plano;
  if pl.id is null then return 'Plano não encontrado'; end if;
  if pl.turmas_livres then return null; end if;
  select count(*) into n from turmas where id = any(coalesce(p_turmas, '{}')) and not coletiva;
  if n = 0 then return 'Escolha a turma do plano ' || pl.nome || '.'; end if;
  if pl.max_turmas is not null and n > pl.max_turmas then
    return 'O plano ' || pl.nome || ' dá direito a ' || pl.max_turmas || ' turma(s). Foram escolhidas ' || n || '.';
  end if;
  return null;
end $$;

-- ---------- reserva: só nas turmas do plano ----------
create or replace function public.reservar_aula(p_aula uuid) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare a aulas; t turmas; ocupadas int; r reservas; motivo text;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  select * into a from aulas where id = p_aula;
  if a.id is null or a.status = 'cancelada' then raise exception 'Aula indisponível'; end if;
  if a.inicio < now() then raise exception 'Essa aula já começou'; end if;
  select * into t from turmas where id = a.turma_id;
  if not public.tem_acesso_turma(auth.uid(), t.id) then
    raise exception 'A turma % não faz parte do seu plano. Fale com a recepção para trocar de plano ou de turma.', t.nome;
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

-- ---------- check-in: só aulas das turmas do plano ----------
create or replace function public.fazer_checkin(p_token text) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare jan int; a aulas; r reservas; motivo text; livre boolean;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  if not exists (select 1 from qr_tokens where token = p_token and expira_em > now()) then
    raise exception 'QR code inválido ou vencido';
  end if;
  if public.bloqueado_por_atraso(auth.uid()) then raise exception 'Check-in bloqueado: mensalidade em atraso. Fale com a recepção.'; end if;
  select janela_checkin_min into jan from academia_config;
  livre := public.tem_plano_livre(auth.uid());
  select a2.* into a from aulas a2
    join turmas t on t.id = a2.turma_id
    left join reservas rv on rv.aula_id = a2.id and rv.aluno_id = auth.uid() and rv.status in ('reservada','espera')
    left join matriculas m on m.turma_id = t.id and m.aluno_id = auth.uid()
  where a2.status <> 'cancelada'
    and now() between a2.inicio - make_interval(mins => jan) and a2.fim
    and (rv.id is not null or m.aluno_id is not null or t.coletiva or livre)
  order by (rv.id is not null) desc, (m.aluno_id is not null) desc, a2.inicio
  limit 1;
  if a.id is null then raise exception 'Nenhuma aula das suas turmas acontecendo agora'; end if;
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

-- ---------- aprovação: confere turmas x plano ----------
create or replace function public.aprovar_aluno(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int default 10)
returns void language plpgsql security definer set search_path = public as $$
declare motivo text; fora text;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
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
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Bem-vindo à família ZxT 🥊', 'Seu cadastro foi aprovado. Bora treinar!', '/app');
end $$;

-- ---------- troca de plano e turmas (admin) ----------
create or replace function public.trocar_plano(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int default null)
returns void language plpgsql security definer set search_path = public as $$
declare motivo text; dia int;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  motivo := public.checar_turmas_do_plano(p_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  select coalesce(p_dia_vencimento, (select dia_vencimento from assinaturas where aluno_id = p_aluno and ativa order by created_at desc limit 1), 10) into dia;
  if not exists (select 1 from assinaturas where aluno_id = p_aluno and ativa and plano_id is not distinct from p_plano) then
    update assinaturas set ativa = false, fim = public.hoje_fortaleza() where aluno_id = p_aluno and ativa;
    if p_plano is not null then
      insert into assinaturas (aluno_id, plano_id, dia_vencimento) values (p_aluno, p_plano, dia);
    end if;
  end if;
  delete from matriculas where aluno_id = p_aluno and not (turma_id = any(coalesce(p_turmas, '{}')));
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Seu plano foi atualizado 🔥', 'Confira suas turmas na Agenda.', '/app#/agenda');
end $$;

-- ---------- resumo do plano para o aluno ----------
create or replace function public.meu_plano() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'plano', p.nome, 'aulas_semana', p.aulas_semana, 'max_turmas', p.max_turmas, 'turmas_livres', p.turmas_livres,
    'usadas', public.aulas_usadas_semana(auth.uid(), p.id, public.semana_de(now())),
    'modalidades', coalesce((select jsonb_agg(m.nome order by m.ordem) from plano_modalidades pm join modalidades m on m.id = pm.modalidade_id where pm.plano_id = p.id), '[]'::jsonb),
    'modalidade_ids', coalesce((select jsonb_agg(pm.modalidade_id) from plano_modalidades pm where pm.plano_id = p.id), '[]'::jsonb),
    'turmas', coalesce((select jsonb_agg(t.nome order by t.nome) from matriculas mt join turmas t on t.id = mt.turma_id where mt.aluno_id = auth.uid() and not t.coletiva), '[]'::jsonb)
  )), '[]'::jsonb)
  from assinaturas s join planos p on p.id = s.plano_id
  where s.aluno_id = auth.uid() and s.ativa and (s.fim is null or s.fim >= public.hoje_fortaleza()) $$;

revoke execute on function public.tem_plano_livre, public.tem_acesso_turma, public.checar_turmas_do_plano from public, anon, authenticated;
grant execute on function public.trocar_plano, public.meu_plano, public.reservar_aula, public.fazer_checkin, public.aprovar_aluno to authenticated;

-- ---------- regra dos 3 planos já cadastrados (valores não mudam) ----------
update public.planos set max_turmas = 1, turmas_livres = false, aulas_semana = null where nome ilike 'plano b_sico';
update public.planos set max_turmas = 2, turmas_livres = false, aulas_semana = null where nome ilike 'plano pro';
update public.planos set max_turmas = null, turmas_livres = true, aulas_semana = null where nome ilike 'plano plus';
