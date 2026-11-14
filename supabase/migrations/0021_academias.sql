-- Academias e professores dos eventos: base do filtro "por academia" nos relatórios.
-- Cada nome de professor (como aparece nos formulários) fica ligado a uma academia.
create table if not exists public.academias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cidade text,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.professores_evento (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                                        -- como aparece no formulário (ex.: Thiago)
  academia_id uuid references public.academias(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists professores_evento_nome on public.professores_evento (lower(nome));
alter table public.academias enable row level security;
alter table public.professores_evento enable row level security;
drop policy if exists acad_ler on public.academias;
create policy acad_ler on public.academias for select using (public.is_staff());
drop policy if exists acad_admin on public.academias;
create policy acad_admin on public.academias for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists pev_ler on public.professores_evento;
create policy pev_ler on public.professores_evento for select using (public.is_staff());
drop policy if exists pev_admin on public.professores_evento;
create policy pev_admin on public.professores_evento for all using (public.is_admin()) with check (public.is_admin());

-- professores que já aparecem no formulário da graduação (sem academia: o admin define)
insert into public.professores_evento (nome)
select x from unnest(array['Thiago', 'Zulu', 'Ricardo', 'Mauriltom']) x
on conflict do nothing;
