-- Cada professor só enxerga e mexe no que é da própria turma. Admin continua com tudo.
-- Aluno "da minha turma": matriculado em turma do professor, ou com turma dele escolhida no cadastro,
-- ou aluno do plano livre (Plus), que treina em todas as turmas.

-- ---------------------------------------------------------------- funções de permissão
create or replace function public.prof_gere_aluno(p_prof uuid, p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = p_prof and papel = 'professor') and (
       exists (select 1 from matriculas m join turmas t on t.id = m.turma_id where m.aluno_id = p_aluno and t.professor_id = p_prof)
    or exists (select 1 from profiles pr join turmas t on t.id = any(pr.turmas_escolhidas) where pr.id = p_aluno and t.professor_id = p_prof)
    or public.aluno_plano_livre(p_aluno)) $$;

create or replace function public.aluno_da_minha_turma(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.prof_gere_aluno(auth.uid(), p_aluno) $$;

create or replace function public.pode_gerir_aluno(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.aluno_da_minha_turma(p_aluno) $$;

-- turma do professor (ou turma coletiva sem professor definido, como o sparring)
create or replace function public.minha_turma(p_turma uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.tem_papel('professor') and exists (
    select 1 from turmas t where t.id = p_turma and (t.professor_id = auth.uid() or (t.coletiva and t.professor_id is null)))) $$;

create or replace function public.minha_aula(p_aula uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.tem_papel('professor') and exists (
    select 1 from aulas a join turmas t on t.id = a.turma_id
    where a.id = p_aula and (a.professor_id = auth.uid() or t.professor_id = auth.uid() or (t.coletiva and t.professor_id is null)))) $$;

-- aluno com reserva em aula minha (ex.: sparring): o professor vê o aluno na chamada daquela aula
create or replace function public.aluno_na_minha_aula(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tem_papel('professor') and exists (
    select 1 from reservas r join aulas a on a.id = r.aula_id join turmas t on t.id = a.turma_id
    where r.aluno_id = p_aluno and (a.professor_id = auth.uid() or t.professor_id = auth.uid() or (t.coletiva and t.professor_id is null))) $$;

create or replace function public.pode_ver_aluno(aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select aluno = auth.uid() or public.is_admin()
      or public.aluno_da_minha_turma(aluno) or public.aluno_na_minha_aula(aluno)
      or exists (select 1 from responsaveis_alunos where responsavel_id = auth.uid() and aluno_id = aluno) $$;

-- usada pelo servidor (/api/baixa): o professor pode dar baixa nesta mensalidade?
create or replace function public.prof_pode_baixar(p_prof uuid, p_cobranca uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_aluno uuid;
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  select aluno_id into v_aluno from cobrancas where id = p_cobranca;
  return v_aluno is not null and public.prof_gere_aluno(p_prof, v_aluno);
end $$;

revoke execute on function public.prof_gere_aluno, public.prof_pode_baixar from public, anon, authenticated;
grant execute on function public.prof_pode_baixar to service_role;
grant execute on function public.pode_gerir_aluno, public.minha_turma, public.minha_aula, public.aluno_na_minha_aula to authenticated;

-- ---------------------------------------------------------------- políticas (tabelas)
-- dados do aluno
drop policy if exists grad_staff on public.graduacoes_aluno;
create policy grad_staff on public.graduacoes_aluno for all using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));
drop policy if exists tec_staff on public.aluno_tecnicas;
create policy tec_staff on public.aluno_tecnicas for all using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));
drop policy if exists cq_staff on public.conquistas;
create policy cq_staff on public.conquistas for all using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));
drop policy if exists md_ler on public.medidas;
create policy md_ler on public.medidas for select using (aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));
drop policy if exists mt_ler on public.metas;
create policy mt_ler on public.metas for select using (aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));
drop policy if exists resp_ler on public.responsaveis_alunos;
create policy resp_ler on public.responsaveis_alunos for select
  using (responsavel_id = auth.uid() or aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));
drop policy if exists lib_ler on public.liberacoes_acesso;
create policy lib_ler on public.liberacoes_acesso for select using (aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));

-- financeiro
drop policy if exists cob_ler on public.cobrancas;
create policy cob_ler on public.cobrancas for select
  using (public.pode_gerir_aluno(aluno_id) or public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());
drop policy if exists ass_ler on public.assinaturas;
create policy ass_ler on public.assinaturas for select
  using (public.pode_gerir_aluno(aluno_id) or public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());

-- aulas, chamada e treinos da turma
drop policy if exists aula_staff on public.aulas;
create policy aula_staff on public.aulas for all using (public.minha_aula(id)) with check (public.minha_turma(turma_id));
drop policy if exists res_staff on public.reservas;
create policy res_staff on public.reservas for all using (public.minha_aula(aula_id)) with check (public.minha_aula(aula_id));
drop policy if exists at_ler on public.atribuicoes_treino;
create policy at_ler on public.atribuicoes_treino for select using (
  aluno_id = auth.uid()
  or (turma_id is not null and public.minha_turma(turma_id))
  or (aluno_id is not null and public.pode_gerir_aluno(aluno_id))
  or exists (select 1 from matriculas m where m.turma_id = atribuicoes_treino.turma_id and m.aluno_id = auth.uid()));
drop policy if exists at_staff on public.atribuicoes_treino;
create policy at_staff on public.atribuicoes_treino for all
  using ((turma_id is not null and public.minha_turma(turma_id)) or (aluno_id is not null and public.pode_gerir_aluno(aluno_id)) or public.is_admin())
  with check ((turma_id is not null and public.minha_turma(turma_id)) or (aluno_id is not null and public.pode_gerir_aluno(aluno_id)) or public.is_admin());

-- interessados (leads): só os da turma do professor
drop policy if exists lead_staff on public.leads;
create policy lead_staff on public.leads for all
  using (public.is_admin() or (turma_id is not null and public.minha_turma(turma_id)))
  with check (public.is_admin() or (turma_id is not null and public.minha_turma(turma_id)));

-- fotos de evolução no Storage (pasta = id do aluno)
drop policy if exists st_evo_ler on storage.objects;
create policy st_evo_ler on storage.objects for select to authenticated
  using (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text
         or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.pode_gerir_aluno(((storage.foldername(name))[1])::uuid))));

-- ---------------------------------------------------------------- funções que agem sobre aluno
create or replace function public.alerta_plano(p_aluno uuid, p_aula uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.minha_aula(p_aula) then return null; end if;
  return public.validar_plano(p_aluno, p_aula);
end $$;

create or replace function public.alunos_bloqueados() returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query select distinct c.aluno_id from cobrancas c where c.aluno_id is not null and c.status in ('em_aberto', 'atrasado')
    and c.vencimento < public.hoje_fortaleza() and public.bloqueado_por_atraso(c.aluno_id) and public.pode_gerir_aluno(c.aluno_id);
end $$;

create or replace function public.lista_inadimplencia()
returns table(aluno_id uuid, nome text, whatsapp text, total_centavos bigint, qtd integer, vencimento date, dias_atraso integer, bloqueado boolean, liberado_ate date, asaas boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  return query
  select p.id, p.nome, coalesce(p.responsavel_whatsapp, p.whatsapp), sum(c.valor_final_centavos)::bigint, count(*)::int, min(c.vencimento),
         (public.hoje_fortaleza() - min(c.vencimento))::int, public.bloqueado_por_atraso(p.id),
         (select max(l.ate) from liberacoes_acesso l where l.aluno_id = p.id and l.ate >= public.hoje_fortaleza()),
         bool_or(c.provider_id is not null)
  from cobrancas c join profiles p on p.id = c.aluno_id
  where c.status in ('em_aberto', 'atrasado') and c.vencimento < public.hoje_fortaleza() and public.pode_gerir_aluno(p.id)
  group by p.id
  order by min(c.vencimento);
end $$;

create or replace function public.baixa_manual(p_cobranca uuid, p_forma public.forma_pagamento, p_obs text default null)
returns public.cobrancas language plpgsql security definer set search_path = public as $$
declare c cobrancas; v_aluno uuid;
begin
  select aluno_id into v_aluno from cobrancas where id = p_cobranca;
  if not public.is_staff() or not public.pode_gerir_aluno(v_aluno) then raise exception 'Sem permissão'; end if;
  update cobrancas set status = 'pago', pago_em = now(), forma_pagamento = p_forma,
         baixa_manual_por = auth.uid(), baixa_obs = p_obs
  where id = p_cobranca and status in ('em_aberto','atrasado') returning * into c;
  if c.id is null then raise exception 'Cobrança não está em aberto'; end if;
  return c;
end $$;

create or replace function public.liberar_acesso(p_aluno uuid, p_ate date, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception 'Sem permissão'; end if;
  if p_ate < public.hoje_fortaleza() or p_ate > public.hoje_fortaleza() + 30 then raise exception 'Escolha uma data entre hoje e 30 dias.'; end if;
  insert into liberacoes_acesso (aluno_id, ate, motivo, criado_por) values (p_aluno, p_ate, nullif(p_motivo, ''), auth.uid());
  insert into auditoria (user_id, acao, tabela, registro_id, depois)
  values (auth.uid(), 'LIBERACAO_ACESSO', 'liberacoes_acesso', p_aluno::text, jsonb_build_object('ate', p_ate, 'motivo', p_motivo));
  perform notificar(p_aluno, 'cobranca', 'Acesso às aulas liberado até ' || to_char(p_ate, 'DD/MM'),
    'Regularize a mensalidade até essa data para não bloquear de novo.', '/app#/financeiro');
end $$;

create or replace function public.encerrar_liberacao(p_aluno uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception 'Sem permissão'; end if;
  update liberacoes_acesso set ate = public.hoje_fortaleza() - 1 where aluno_id = p_aluno and ate >= public.hoje_fortaleza();
end $$;

create or replace function public.salvar_observacao_professor(p_aluno uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception 'Sem permissão'; end if;
  perform set_config('zxt.obs_prof', 'on', true);
  update profiles set observacoes_professor = p_texto where id = p_aluno;
  perform set_config('zxt.obs_prof', 'off', true);
end $$;

create or replace function public.definir_turmas_aluno(p_aluno uuid, p_turmas uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_plano uuid; motivo text;
begin
  if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception 'Sem permissão'; end if;
  select plano_id into v_plano from assinaturas where aluno_id = p_aluno and ativa and (fim is null or fim >= public.hoje_fortaleza())
  order by created_at desc limit 1;
  motivo := public.checar_turmas_do_plano(v_plano, p_turmas);
  if motivo is not null then raise exception '%', motivo; end if;
  delete from matriculas m using turmas t
   where m.aluno_id = p_aluno and t.id = m.turma_id and not t.coletiva and not (m.turma_id = any(coalesce(p_turmas, '{}')));
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(coalesce(p_turmas, '{}')) on conflict do nothing;
end $$;

create or replace function public.marcar_presenca(p_aula uuid, p_aluno uuid, p_presente boolean, p_sparring boolean default false)
returns public.reservas language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  if not public.is_staff() or not public.minha_aula(p_aula) then raise exception 'Sem permissão'; end if;
  insert into reservas (aula_id, aluno_id, status, checkin_em, checkin_metodo, checkin_por, fez_sparring)
  values (p_aula, p_aluno, case when p_presente then 'presente' else 'falta' end::status_reserva,
          case when p_presente then now() end, 'professor', auth.uid(), p_sparring)
  on conflict (aula_id, aluno_id) do update
    set status = excluded.status, checkin_em = coalesce(reservas.checkin_em, excluded.checkin_em),
        checkin_metodo = coalesce(reservas.checkin_metodo, 'professor'), checkin_por = auth.uid(),
        fez_sparring = excluded.fez_sparring
  returning * into r;
  return r;
end $$;

create or replace function public.restaurar_aula(p_aula uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() or not public.minha_aula(p_aula) then raise exception 'Sem permissão'; end if;
  update aulas set status = 'prevista', motivo_cancelamento = null where id = p_aula and status = 'cancelada';
end $$;

-- excluir_aula: mesma regra (só aula da própria turma)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'excluir_aula' and p.pronamespace = 'public'::regnamespace;
  d := replace(d, 'if not public.is_staff() then raise exception ''Sem permissão''; end if;',
                  'if not public.is_staff() or not public.minha_aula(p_aula) then raise exception ''Sem permissão''; end if;');
  execute d;
end $$;

-- atualizar_dados_aluno: mesma regra (só aluno da própria turma)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'atualizar_dados_aluno' and p.pronamespace = 'public'::regnamespace;
  d := replace(d, 'if not public.is_staff() then raise exception ''Sem permissão''; end if;',
                  'if not public.is_staff() or not public.pode_gerir_aluno(p_aluno) then raise exception ''Sem permissão''; end if;');
  execute d;
end $$;
