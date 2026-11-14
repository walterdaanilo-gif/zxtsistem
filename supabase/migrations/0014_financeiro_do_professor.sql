-- Professor vê o financeiro dos alunos matriculados nas turmas em que ele é o professor responsável.
-- Só leitura: baixa manual, planos, despesas e faturamento geral continuam com o admin.

create or replace function public.aluno_da_minha_turma(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matriculas m join turmas t on t.id = m.turma_id
                 where m.aluno_id = p_aluno and t.professor_id = auth.uid()) $$;
grant execute on function public.aluno_da_minha_turma to authenticated;

drop policy if exists cob_ler on public.cobrancas;
create policy cob_ler on public.cobrancas for select
  using (public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid() or public.aluno_da_minha_turma(aluno_id));

drop policy if exists ass_ler on public.assinaturas;
create policy ass_ler on public.assinaturas for select
  using (public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid() or public.aluno_da_minha_turma(aluno_id));

-- nome e valor dos planos (para mostrar o plano do aluno)
drop policy if exists pln_ler on public.planos;
create policy pln_ler on public.planos for select using (auth.uid() is not null);
