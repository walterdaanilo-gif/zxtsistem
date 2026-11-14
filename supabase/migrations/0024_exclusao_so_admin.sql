-- Exclusão de cadastros: só o admin. (Excluir aula continua liberado para professores.)
create or replace function public.excluir_aluno_pode(p_por uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = p_por and papel = 'admin')
$$;
revoke execute on function public.excluir_aluno_pode from public, anon, authenticated;

create or replace function public.excluir_aluno(p_aluno uuid, p_por uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare p profiles; quem text; n_pagas int; n_canc int;
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  if not public.excluir_aluno_pode(p_por) then raise exception 'Só a administração exclui cadastros.'; end if;
  select * into p from profiles where id = p_aluno;
  if p.id is null then raise exception 'Aluno não encontrado'; end if;
  if exists (select 1 from user_roles where user_id = p_aluno and papel in ('admin', 'professor')) or p.tipo_cadastro = 'professor' then
    raise exception 'Professor não é excluído por aqui. Use a aba Professores.';
  end if;
  select nome into quem from profiles where id = p_por;

  -- financeiro: guarda o nome no que fica, cancela o que estava em aberto
  update cobrancas set aluno_nome = coalesce(aluno_nome, p.nome) where aluno_id = p_aluno;
  update cobrancas set status = 'cancelado', baixa_obs = concat_ws(' · ', baixa_obs, 'Cancelada na exclusão do aluno')
  where aluno_id = p_aluno and status in ('em_aberto', 'atrasado');
  get diagnostics n_canc = row_count;
  select count(*) into n_pagas from cobrancas where aluno_id = p_aluno and status = 'pago';
  update cobrancas set pagador_id = null where pagador_id = p_aluno;
  update assinaturas set pagador_id = null where pagador_id = p_aluno;
  update evento_inscricoes set obs = concat_ws(' · ', obs, 'Conta do aluno excluída') where aluno_id = p_aluno;

  -- referências que bloqueariam a exclusão
  update leads set aluno_id = null where aluno_id = p_aluno;
  update vendas set aluno_id = null where aluno_id = p_aluno;
  update profiles set indicado_por = null where indicado_por = p_aluno;
  update profiles set aprovado_por = null where aprovado_por = p_aluno;
  update reservas set checkin_por = null where checkin_por = p_aluno;
  update aluno_tecnicas set marcado_por = null where marcado_por = p_aluno;
  update convites set usado_por = null where usado_por = p_aluno;
  update conversas set criado_por = null where criado_por = p_aluno;

  insert into auditoria (user_id, acao, tabela, registro_id, antes, depois)
  values (p_por, 'EXCLUSAO_ALUNO', 'profiles', p_aluno::text,
          jsonb_build_object('nome', p.nome, 'email', p.email, 'status', p.status, 'criado_em', p.created_at),
          jsonb_build_object('motivo', p_motivo, 'excluido_por', quem, 'mensalidades_pagas_mantidas', n_pagas, 'cobrancas_canceladas', n_canc));

  delete from auth.users where id = p_aluno;          -- apaga conta e dados pessoais (cascata no perfil)
  delete from profiles where id = p_aluno;             -- garante, caso o perfil não tenha conta de login

  perform notificar_equipe('cadastro', 'Aluno excluído: ' || coalesce(p.nome, p.email),
    'Por ' || coalesce(quem, 'equipe') || coalesce(' · ' || nullif(p_motivo, ''), ''), '/app#/alunos', p_por);
  return jsonb_build_object('ok', true, 'nome', p.nome, 'mensalidades_pagas_mantidas', n_pagas, 'cobrancas_canceladas', n_canc);
end $$;
revoke execute on function public.excluir_aluno from public, anon, authenticated;
grant execute on function public.excluir_aluno to service_role;
