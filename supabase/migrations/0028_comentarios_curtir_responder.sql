-- Comentários da Comunidade: responder (um nível, como no Instagram) e curtir.
alter table public.comentarios add column if not exists resposta_de uuid references public.comentarios(id) on delete cascade;
create index if not exists comentarios_resposta_idx on public.comentarios(resposta_de);

create table if not exists public.comentario_curtidas (
  comentario_id uuid not null references public.comentarios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comentario_id, user_id)
);
alter table public.comentario_curtidas enable row level security;
drop policy if exists ccur_ler on public.comentario_curtidas;
create policy ccur_ler on public.comentario_curtidas for select using (public.is_ativo() or public.is_staff());
drop policy if exists ccur_criar on public.comentario_curtidas;
create policy ccur_criar on public.comentario_curtidas for insert with check (user_id = auth.uid() and public.is_ativo());
drop policy if exists ccur_apagar on public.comentario_curtidas;
create policy ccur_apagar on public.comentario_curtidas for delete using (user_id = auth.uid());
