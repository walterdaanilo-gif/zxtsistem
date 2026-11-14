-- Correções apontadas pelo verificador de segurança do Supabase
drop view if exists public.perfis_publicos;
create or replace function public.perfis_publicos()
returns table (id uuid, nome text, foto_url text, aniversario_hoje boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.foto_url,
         p.data_nascimento is not null and to_char(p.data_nascimento,'MM-DD') = to_char(public.hoje_fortaleza(),'MM-DD')
  from profiles p
  where p.status = 'ativo' and (public.is_ativo() or public.is_staff()) $$;
revoke execute on function public.perfis_publicos() from public, anon;
grant execute on function public.perfis_publicos() to authenticated;
alter function public.set_updated_at() set search_path = public;
alter function public.hoje_fortaleza() set search_path = public;
