-- Sparring (turma coletiva) é de toda a equipe: qualquer professor vê as aulas, as reservas, os alunos que
-- reservaram e os interessados em aula experimental, mesmo que a turma tenha um professor definido.
create or replace function public.minha_turma(p_turma uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.tem_papel('professor') and exists (
    select 1 from turmas t where t.id = p_turma and (t.professor_id = auth.uid() or t.coletiva or t.sparring))) $$;

create or replace function public.minha_aula(p_aula uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.tem_papel('professor') and exists (
    select 1 from aulas a join turmas t on t.id = a.turma_id
    where a.id = p_aula and (a.professor_id = auth.uid() or t.professor_id = auth.uid() or t.coletiva or t.sparring))) $$;

create or replace function public.aluno_na_minha_aula(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tem_papel('professor') and exists (
    select 1 from reservas r join aulas a on a.id = r.aula_id join turmas t on t.id = a.turma_id
    where r.aluno_id = p_aluno and (a.professor_id = auth.uid() or t.professor_id = auth.uid() or t.coletiva or t.sparring)) $$;
