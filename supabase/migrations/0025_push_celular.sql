-- Notificações no celular (Web Push). Cada aparelho que a pessoa ativa vira uma inscrição.
-- Toda notificação nova dispara /api/push (via pg_net). O token da chamada fica no Vault com o nome 'push_token'
-- (criado fora deste arquivo para não ir ao repositório).
create extension if not exists pg_net;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamptz not null default now()
);
create index if not exists push_inscricoes_user on public.push_inscricoes (user_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_propria on public.push_inscricoes;
create policy push_propria on public.push_inscricoes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.disparar_push() returns trigger language plpgsql security definer set search_path = public as $$
declare tk text;
begin
  begin
    if not exists (select 1 from push_inscricoes where user_id = new.user_id) then return new; end if;
    select decrypted_secret into tk from vault.decrypted_secrets where name = 'push_token' limit 1;
    if tk is null then return new; end if;
    perform net.http_post(
      url := 'https://zxtsistem.vercel.app/api/push',
      body := jsonb_build_object('token', tk, 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000);
  exception when others then null;   -- nunca derruba a notificação
  end;
  return new;
end $$;
drop trigger if exists push_notificacoes on public.notificacoes;
create trigger push_notificacoes after insert on public.notificacoes for each row execute function public.disparar_push();
