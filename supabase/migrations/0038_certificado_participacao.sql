-- Branco (1º Khan) recebe certificado de PARTICIPAÇÃO no aulão de graduação (não é graduação oficial).
-- Libera quando o aluno é aprovado ou, no Branco, quando a presença está confirmada. As demais cores seguem só com a aprovação.
create or replace function public.meu_certificado(p_ins uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i evento_inscricoes; e eventos; g text; v_grau text; v_branco boolean; meses text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        d timestamp;
begin
  select * into i from evento_inscricoes where id = p_ins;
  if i.id is null or not public.inscricao_minha(i.aluno_id, i.cpf) then raise exception 'Certificado não encontrado.'; end if;
  select * into e from eventos where id = i.evento_id;
  select trim(regexp_replace(o.nome, '\(.*?\)', '', 'g')) into g from evento_opcoes o where o.id = i.opcao_id;
  v_grau := coalesce(nullif(trim(i.cert_grau), ''), g);
  v_branco := lower(coalesce(v_grau, '')) = 'branco';
  if e.tipo <> 'exame_graduacao' or i.status = 'cancelado' or not (i.aprovado is true or (v_branco and i.presente)) then
    raise exception 'O certificado fica disponível depois da aprovação no exame (no Branco, depois da presença confirmada).';
  end if;
  d := e.inicio at time zone 'America/Fortaleza';
  return jsonb_build_object('nome', coalesce(nullif(trim(i.cert_nome), ''), i.nome), 'cpf', coalesce(nullif(trim(i.cert_cpf), ''), i.cpf),
    'grau', v_grau, 'trat', coalesce(i.cert_trat, ''), 'ano', to_char(d, 'YYYY'),
    'modelo', case when v_branco then 'participacao' else 'graduacao' end,
    'data', extract(day from d)::int || ' de ' || meses[extract(month from d)::int] || ' de ' || to_char(d, 'YYYY'));
end $$;

create or replace function public.notif_aprovacao_exame() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; tipo text; g text; v_branco boolean; libera_apr boolean; libera_pres boolean;
begin
  begin
    libera_apr := new.aprovado is true and old.aprovado is distinct from true;
    libera_pres := new.presente is true and old.presente is distinct from true and new.aprovado is not true;
    if libera_apr or libera_pres then
      select e.tipo into tipo from eventos e where e.id = new.evento_id;
      select trim(regexp_replace(o.nome, '\(.*?\)', '', 'g')) into g from evento_opcoes o where o.id = new.opcao_id;
      v_branco := lower(coalesce(nullif(trim(new.cert_grau), ''), g, '')) = 'branco';
      if tipo = 'exame_graduacao' and (libera_apr or v_branco) then
        u := new.aluno_id;
        if u is null and nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '') is not null then
          select id into u from profiles where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = regexp_replace(new.cpf, '\D', '', 'g') limit 1;
        end if;
        perform notificar(u, 'graduacao',
          case when v_branco then 'Seu certificado de participação está liberado 🎓' else 'Parabéns! Seu certificado de graduação está liberado 🎓' end,
          'Abra Graduação para ver e baixar o certificado.', '/app#/graduacao');
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_aprovacao_exame on public.evento_inscricoes;
create trigger notif_aprovacao_exame after update of aprovado, presente on public.evento_inscricoes for each row execute function public.notif_aprovacao_exame();
