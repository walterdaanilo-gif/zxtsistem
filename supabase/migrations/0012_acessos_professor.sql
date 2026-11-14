-- Professor passa a cuidar do sistema de graduação e dos dados de treino do aluno.
-- Financeiro, plano, status e CPF continuam só com o admin.

-- graduação: professor (equipe) edita níveis e técnicas
drop policy if exists niv_admin on public.graduacao_niveis;
create policy niv_staff on public.graduacao_niveis for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists req_admin on public.graduacao_requisitos;
create policy req_staff on public.graduacao_requisitos for all using (public.is_staff()) with check (public.is_staff());

-- dados do aluno que a equipe pode editar
create or replace function public.atualizar_dados_aluno(p_aluno uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  update profiles set
    nome = coalesce(nullif(trim(p->>'nome'), ''), nome),
    whatsapp = case when p ? 'whatsapp' then nullif(trim(p->>'whatsapp'), '') else whatsapp end,
    data_nascimento = case when p ? 'data_nascimento' then nullif(p->>'data_nascimento', '')::date else data_nascimento end,
    contato_emergencia_nome = case when p ? 'contato_emergencia_nome' then nullif(trim(p->>'contato_emergencia_nome'), '') else contato_emergencia_nome end,
    contato_emergencia_telefone = case when p ? 'contato_emergencia_telefone' then nullif(trim(p->>'contato_emergencia_telefone'), '') else contato_emergencia_telefone end,
    saude_obs = case when p ? 'saude_obs' then nullif(trim(p->>'saude_obs'), '') else saude_obs end,
    federacao = case when p ? 'federacao' then nullif(trim(p->>'federacao'), '') else federacao end,
    federacao_registro = case when p ? 'federacao_registro' then nullif(trim(p->>'federacao_registro'), '') else federacao_registro end
  where id = p_aluno;
end $$;

-- turmas do aluno (equipe), dentro do limite do plano ativo dele
create or replace function public.definir_turmas_aluno(p_aluno uuid, p_turmas uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_plano uuid; motivo text;
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  select plano_id into v_plano from assinaturas where aluno_id = p_aluno and ativa and (fim is null or fim >= public.hoje_fortaleza())
  order by created_at desc limit 1;
  motivo := public.checar_turmas_do_plano(v_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  delete from matriculas m using turmas t
   where m.aluno_id = p_aluno and t.id = m.turma_id and not t.coletiva and not (m.turma_id = any(coalesce(p_turmas, '{}')));
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
end $$;

revoke execute on function public.atualizar_dados_aluno, public.definir_turmas_aluno from public, anon;
grant execute on function public.atualizar_dados_aluno, public.definir_turmas_aluno to authenticated;
