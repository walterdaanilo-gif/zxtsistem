-- /api/pagamento-aluno (servidor): o professor pode ver o pagamento deste aluno (só aluno da turma dele).
create or replace function public.prof_pode_ver_aluno(p_prof uuid, p_aluno uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  return public.prof_gere_aluno(p_prof, p_aluno);
end $$;
revoke execute on function public.prof_pode_ver_aluno from public, anon, authenticated;
grant execute on function public.prof_pode_ver_aluno to service_role;
