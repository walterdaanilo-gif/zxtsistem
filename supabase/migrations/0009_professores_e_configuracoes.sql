-- =====================================================================
-- Cadastro de professor, aprovação e configurações da academia
-- =====================================================================

alter table public.profiles add column if not exists tipo_cadastro text not null default 'aluno' check (tipo_cadastro in ('aluno','professor'));
alter table public.profiles add column if not exists turmas_professor uuid[] not null default '{}';     -- turmas que pediu para dar aula
alter table public.profiles add column if not exists graduacao_declarada jsonb not null default '[]';  -- [{modalidade_id, nivel_id, grau}]
alter table public.profiles add column if not exists experiencia text;

-- aprovação de professor: papel, turmas e graduação declarada
create or replace function public.aprovar_professor(p_prof uuid, p_turmas uuid[], p_registrar_graduacao boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare g jsonb; nv graduacao_niveis;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null where id = p_prof;
  insert into user_roles (user_id, papel) values (p_prof, 'professor') on conflict do nothing;
  -- quem se cadastrou como professor não entra como aluno
  if (select tipo_cadastro from profiles where id = p_prof) = 'professor' then
    delete from user_roles where user_id = p_prof and papel = 'aluno';
  end if;
  update turmas set professor_id = p_prof where id = any(coalesce(p_turmas, '{}'));
  update aulas set professor_id = p_prof where turma_id = any(coalesce(p_turmas, '{}')) and inicio > now();
  if p_registrar_graduacao then
    for g in select * from jsonb_array_elements((select graduacao_declarada from profiles where id = p_prof)) loop
      select * into nv from graduacao_niveis where id = (g->>'nivel_id')::uuid and modalidade_id = (g->>'modalidade_id')::uuid;
      if nv.id is not null and not exists (select 1 from graduacoes_aluno where aluno_id = p_prof and nivel_id = nv.id) then
        insert into graduacoes_aluno (aluno_id, modalidade_id, nivel_id, grau, professor_id, obs)
        values (p_prof, nv.modalidade_id, nv.id, least(coalesce((g->>'grau')::int, 0), nv.graus_max), auth.uid(), 'Declarada no cadastro e conferida na aprovação');
      end if;
    end loop;
  end if;
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_prof, 'Bem-vindo à equipe de professores ZxT 🥊', 'Seu acesso de professor foi liberado. Confira a chamada das suas turmas.', '/app');
end $$;

-- define as turmas de um professor (tira das que não estão na lista)
create or replace function public.definir_turmas_professor(p_prof uuid, p_turmas uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  update turmas set professor_id = null where professor_id = p_prof and not (id = any(coalesce(p_turmas, '{}')));
  update turmas set professor_id = p_prof where id = any(coalesce(p_turmas, '{}'));
  update aulas a set professor_id = t.professor_id from turmas t where t.id = a.turma_id and a.inicio > now();
end $$;

-- refaz as aulas futuras de uma turma depois de mudar dia/horário
create or replace function public.atualizar_aulas_turma(p_turma uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  delete from aulas a where a.turma_id = p_turma and a.inicio > now()
    and not exists (select 1 from reservas r where r.aula_id = a.id);
  update aulas a set professor_id = t.professor_id from turmas t where t.id = a.turma_id and a.turma_id = p_turma and a.inicio > now();
  n := public.gerar_aulas(14);
  return n;
end $$;

-- quem dá aula em cada turma (nome do professor é público para alunos ativos)
create or replace function public.professores_das_turmas()
returns table (turma_id uuid, professor_id uuid, professor_nome text)
language sql stable security definer set search_path = public as $$
  select t.id, p.id, p.nome from turmas t join profiles p on p.id = t.professor_id
  where public.is_ativo() or public.is_staff() $$;

revoke execute on function public.aprovar_professor, public.definir_turmas_professor, public.atualizar_aulas_turma, public.professores_das_turmas from public, anon;
grant execute on function public.aprovar_professor, public.definir_turmas_professor, public.atualizar_aulas_turma, public.professores_das_turmas to authenticated;
