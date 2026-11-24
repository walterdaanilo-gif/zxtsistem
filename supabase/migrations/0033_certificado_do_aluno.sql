-- Exame de graduação: o aluno só enxerga a própria inscrição e, depois de aprovado, o próprio certificado.
-- O aluno deixa de consultar eventos: só eventos públicos (link de inscrição) e a equipe leem as tabelas de evento.

-- dados finais do certificado (o que a equipe conferiu e o aluno baixa)
alter table public.evento_inscricoes add column if not exists cert_nome text;
alter table public.evento_inscricoes add column if not exists cert_cpf text;
alter table public.evento_inscricoes add column if not exists cert_grau text;
alter table public.evento_inscricoes add column if not exists cert_trat text;

drop policy if exists evt_ler on public.eventos;
create policy evt_ler on public.eventos for select using (publico or public.is_staff());
drop policy if exists eop_ler on public.evento_opcoes;
create policy eop_ler on public.evento_opcoes for select using (public.is_staff());

-- a inscrição é minha: ligada à minha conta ou com o mesmo CPF do meu cadastro
create or replace function public.inscricao_minha(p_aluno uuid, p_cpf text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_aluno = auth.uid()
    or (nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '') is not null
        and regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') = (select regexp_replace(coalesce(cpf, ''), '\D', '', 'g') from profiles where id = auth.uid()))) $$;

-- minhas inscrições em eventos (sem CPF nem dados de outras pessoas) e o exame com inscrição aberta
create or replace function public.minhas_inscricoes_evento() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; aberto jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'evento', e.titulo, 'tipo', e.tipo, 'inicio', e.inicio, 'opcao', o.nome,
           'status', i.status, 'aprovado', i.aprovado, 'presente', i.presente, 'criado_em', i.created_at) order by e.inicio desc), '[]'::jsonb)
    into r
    from evento_inscricoes i join eventos e on e.id = i.evento_id left join evento_opcoes o on o.id = i.opcao_id
   where public.inscricao_minha(i.aluno_id, i.cpf);
  select jsonb_build_object('titulo', e.titulo, 'slug', e.slug) into aberto
    from eventos e
   where e.tipo = 'exame_graduacao' and e.inscricoes_abertas and e.slug is not null
     and (e.inscricoes_ate is null or e.inscricoes_ate > now()) and (e.fim is null or e.fim > now() or e.inicio > now() - interval '1 day')
   order by e.inicio desc limit 1;
  return jsonb_build_object('inscricoes', r, 'exame_aberto', aberto);
end $$;

-- certificado: só do próprio aluno e só depois de aprovado no exame
create or replace function public.meu_certificado(p_ins uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i evento_inscricoes; e eventos; g text;
begin
  select * into i from evento_inscricoes where id = p_ins;
  if i.id is null or not public.inscricao_minha(i.aluno_id, i.cpf) then raise exception 'Certificado não encontrado.'; end if;
  select * into e from eventos where id = i.evento_id;
  if e.tipo <> 'exame_graduacao' or i.aprovado is distinct from true or i.status = 'cancelado' then
    raise exception 'O certificado fica disponível depois da aprovação no exame.';
  end if;
  select trim(regexp_replace(o.nome, '\(.*?\)', '', 'g')) into g from evento_opcoes o where o.id = i.opcao_id;
  return jsonb_build_object('nome', coalesce(nullif(trim(i.cert_nome), ''), i.nome), 'cpf', coalesce(nullif(trim(i.cert_cpf), ''), i.cpf),
    'grau', coalesce(nullif(trim(i.cert_grau), ''), g), 'trat', coalesce(i.cert_trat, ''),
    'ano', to_char(e.inicio at time zone 'America/Fortaleza', 'YYYY'));
end $$;

grant execute on function public.minhas_inscricoes_evento, public.meu_certificado to authenticated;
revoke execute on function public.inscricao_minha from public, anon, authenticated;

-- aprovado no exame: avisa o aluno (conta ligada à inscrição ou com o mesmo CPF)
create or replace function public.notif_aprovacao_exame() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; tipo text;
begin
  begin
    if new.aprovado is true and old.aprovado is distinct from true then
      select e.tipo into tipo from eventos e where e.id = new.evento_id;
      if tipo = 'exame_graduacao' then
        u := new.aluno_id;
        if u is null and nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '') is not null then
          select id into u from profiles where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = regexp_replace(new.cpf, '\D', '', 'g') limit 1;
        end if;
        perform notificar(u, 'graduacao', 'Parabéns! Seu certificado de graduação está liberado 🎓', 'Abra Graduação para ver e baixar o certificado.', '/app#/graduacao');
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_aprovacao_exame on public.evento_inscricoes;
create trigger notif_aprovacao_exame after update of aprovado on public.evento_inscricoes for each row execute function public.notif_aprovacao_exame();
