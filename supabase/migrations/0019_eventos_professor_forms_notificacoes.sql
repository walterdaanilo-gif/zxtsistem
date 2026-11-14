-- 1) Professores criam e gerenciam eventos como o admin.
-- 2) Importação de respostas do Google Forms (enquanto o formulário antigo estiver no ar).
-- 3) Notificações com tipo e preferências por pessoa.

-- ================================================================ 1. eventos para toda a equipe
drop policy if exists evt_admin on public.eventos;
drop policy if exists evt_staff on public.eventos;
create policy evt_staff on public.eventos for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists eop_admin on public.evento_opcoes;
drop policy if exists eop_staff on public.evento_opcoes;
create policy eop_staff on public.evento_opcoes for all using (public.is_staff()) with check (public.is_staff());

-- equipe toda altera opção, valor, nome, CPF e situação (fica na auditoria)
create or replace function public.atualizar_inscricao(p_inscricao uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare i evento_inscricoes; o evento_opcoes;
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  select * into i from evento_inscricoes where id = p_inscricao;
  if i.id is null then raise exception 'Inscrição não encontrada'; end if;
  update evento_inscricoes set
    presente = coalesce((p->>'presente')::boolean, presente),
    aprovado = case when p ? 'aprovado' then (p->>'aprovado')::boolean else aprovado end,
    obs = case when p ? 'obs' then nullif(p->>'obs', '') else obs end,
    whatsapp = case when p ? 'whatsapp' then nullif(regexp_replace(p->>'whatsapp', '\D', '', 'g'), '') else whatsapp end,
    respostas = case when p ? 'respostas' then p->'respostas' else respostas end,
    updated_at = now()
  where id = i.id;
  if p ? 'opcao_id' and nullif(p->>'opcao_id', '')::uuid is distinct from i.opcao_id then
    select * into o from evento_opcoes where id = (p->>'opcao_id')::uuid and evento_id = i.evento_id;
    if o.id is null then raise exception 'Opção inválida'; end if;
    update evento_inscricoes set opcao_id = o.id, nivel_alvo_id = o.nivel_id,
      valor_centavos = case when status in ('pendente', 'isento') then o.valor_centavos else valor_centavos end,
      status = case when status in ('pendente', 'isento') then (case when o.valor_centavos = 0 then 'isento' else 'pendente' end) else status end
    where id = i.id;
  end if;
  update evento_inscricoes set
    valor_centavos = case when p ? 'valor_centavos' then nullif(p->>'valor_centavos', '')::int else valor_centavos end,
    status = case when p->>'status' in ('pendente', 'pago', 'isento', 'cancelado') then p->>'status' else status end,
    pago_em = case when p->>'status' = 'pendente' then null when p->>'status' = 'pago' and pago_em is null then now() else pago_em end,
    baixa_por = case when p->>'status' = 'pago' and i.status <> 'pago' then auth.uid() else baixa_por end,
    nome = coalesce(nullif(trim(p->>'nome'), ''), nome),
    cpf = case when p ? 'cpf' then nullif(regexp_replace(p->>'cpf', '\D', '', 'g'), '') else cpf end
  where id = i.id;
end $$;

-- ================================================================ 2. importação (Google Forms)
-- inscrever_evento com p.importacao = true (só o servidor): não exige campos do formulário novo nem inscrições abertas
create or replace function public.inscrever_evento(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e eventos; o evento_opcoes; i evento_inscricoes; cfg jsonb; cpf_l text; n int; extra jsonb; resp jsonb;
  staff boolean := public.is_staff();
  livre boolean;     -- equipe ou importação: sem as travas do formulário público
begin
  if not (public.eh_servidor() or staff) then raise exception 'Sem permissão'; end if;
  livre := staff or (public.eh_servidor() and coalesce((p->>'importacao')::boolean, false));
  select * into e from eventos where id = nullif(p->>'evento_id', '')::uuid or (slug is not null and slug = p->>'slug') limit 1;
  if e.id is null then raise exception 'Evento não encontrado'; end if;
  if not livre then
    if not e.inscricoes_abertas then raise exception 'As inscrições deste evento estão encerradas.'; end if;
    if e.inscricoes_ate is not null and now() > e.inscricoes_ate then raise exception 'O prazo de inscrição terminou.'; end if;
  end if;
  cfg := coalesce(e.campos, '{}'::jsonb);
  cpf_l := nullif(regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g'), '');
  if cpf_l is not null and length(cpf_l) <> 11 then cpf_l := null; end if;
  if length(trim(coalesce(p->>'nome', ''))) < 3 then raise exception 'Informe o nome completo.'; end if;
  if not livre then
    if coalesce((cfg->>'cpf')::boolean, false) and cpf_l is null then raise exception 'Informe um CPF válido.'; end if;
    if coalesce((cfg->>'nascimento')::boolean, false) and nullif(p->>'nascimento', '') is null then raise exception 'Informe a data de nascimento.'; end if;
    if coalesce((cfg->>'whatsapp')::boolean, false) and length(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g')) < 10 then raise exception 'Informe o WhatsApp com DDD.'; end if;
    if coalesce((cfg->>'email')::boolean, false) and coalesce(p->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido.'; end if;
  end if;

  if exists (select 1 from evento_opcoes where evento_id = e.id and ativa) then
    select * into o from evento_opcoes where id = nullif(p->>'opcao_id', '')::uuid and evento_id = e.id and (ativa or livre);
    if o.id is null then raise exception 'Escolha uma opção de inscrição.'; end if;
  end if;

  resp := coalesce(p->'respostas', '{}'::jsonb);
  if not livre then
    for extra in select * from jsonb_array_elements(coalesce(cfg->'extras', '[]'::jsonb)) loop
      if coalesce((extra->>'obrigatorio')::boolean, false) and coalesce(trim(resp->>(extra->>'id')), '') = '' then
        raise exception 'Responda: %', extra->>'rotulo';
      end if;
    end loop;
  end if;

  if cpf_l is not null then
    select * into i from evento_inscricoes where evento_id = e.id and cpf = cpf_l and status <> 'cancelado' limit 1;
  end if;
  if i.id is null then
    select * into i from evento_inscricoes
    where evento_id = e.id and status <> 'cancelado' and normaliza_nome(nome) = normaliza_nome(p->>'nome')
      and (cpf is null or cpf_l is null) limit 1;
    if i.id is not null then
      update evento_inscricoes set cpf = coalesce(cpf, cpf_l), nascimento = coalesce(nascimento, nullif(p->>'nascimento', '')::date),
        whatsapp = coalesce(whatsapp, nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g'), '')), email = coalesce(email, nullif(p->>'email', '')),
        aluno_id = coalesce(aluno_id, nullif(p->>'aluno_id', '')::uuid), updated_at = now()
      where id = i.id returning * into i;
    end if;
  end if;
  if i.id is not null then
    return jsonb_build_object('ja_inscrito', true, 'codigo', i.codigo, 'id', i.id);
  end if;

  if e.vagas is not null and not livre then
    select count(*) into n from evento_inscricoes where evento_id = e.id and status <> 'cancelado';
    if n >= e.vagas then raise exception 'As vagas deste evento acabaram.'; end if;
  end if;

  insert into evento_inscricoes (evento_id, aluno_id, opcao_id, nome, cpf, nascimento, whatsapp, email, respostas, valor_centavos, status, origem, obs, nivel_alvo_id, created_at)
  values (e.id, nullif(p->>'aluno_id', '')::uuid, o.id, trim(p->>'nome'), cpf_l, nullif(p->>'nascimento', '')::date,
          nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g'), ''), nullif(lower(trim(p->>'email')), ''), resp,
          o.valor_centavos, case when o.id is not null and o.valor_centavos = 0 then 'isento' when o.id is null and coalesce(e.taxa_centavos, 0) = 0 then 'isento' else 'pendente' end,
          coalesce(nullif(p->>'origem', ''), case when staff and not public.eh_servidor() then 'manual' else 'formulario' end), nullif(p->>'obs', ''), o.nivel_id,
          coalesce(nullif(p->>'criado_em', '')::timestamptz, now()))
  returning * into i;
  return jsonb_build_object('ja_inscrito', false, 'codigo', i.codigo, 'id', i.id);
end $$;
revoke execute on function public.inscrever_evento from public, anon;
grant execute on function public.inscrever_evento to authenticated, service_role;

-- ================================================================ 3. notificações
alter table public.notificacoes add column if not exists tipo text not null default 'geral';
create table if not exists public.notif_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  desligados text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.notif_prefs enable row level security;
drop policy if exists np_propria on public.notif_prefs;
create policy np_propria on public.notif_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nt_apagar on public.notificacoes;
create policy nt_apagar on public.notificacoes for delete using (user_id = auth.uid());

-- grava uma notificação se a pessoa não desligou aquele tipo. Nunca derruba a operação principal.
create or replace function public.notificar(p_user uuid, p_tipo text, p_titulo text, p_corpo text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if exists (select 1 from notif_prefs where user_id = p_user and p_tipo = any(desligados)) then return; end if;
  insert into notificacoes (user_id, tipo, titulo, corpo, link) values (p_user, p_tipo, left(p_titulo, 140), left(p_corpo, 400), p_link);
exception when others then null;
end $$;

create or replace function public.notificar_equipe(p_tipo text, p_titulo text, p_corpo text, p_link text, p_exceto uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select distinct r.user_id from user_roles r join profiles p on p.id = r.user_id
           where r.papel in ('admin', 'professor') and (r.papel = 'admin' or p.status = 'ativo') and r.user_id is distinct from p_exceto loop
    perform notificar(u, p_tipo, p_titulo, p_corpo, p_link);
  end loop;
exception when others then null;
end $$;

create or replace function public.brl(c int) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(c, 0) / 100.0, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.')
$$;

-- mensalidades
create or replace function public.notif_cobranca() returns trigger language plpgsql security definer set search_path = public as $$
declare nome text; quem uuid[];
begin
  begin
    select p.nome into nome from profiles p where p.id = new.aluno_id;
    quem := array_remove(array[new.aluno_id, case when new.pagador_id is distinct from new.aluno_id then new.pagador_id end], null);
    if tg_op = 'INSERT' and new.status in ('em_aberto', 'atrasado') then
      perform notificar(x, 'cobranca', case when new.status = 'atrasado' then 'Mensalidade em atraso' else 'Nova mensalidade' end,
        new.descricao || ': ' || brl(new.valor_final_centavos) || ', vencimento ' || to_char(new.vencimento, 'DD/MM') || '.', '/app#/financeiro') from unnest(quem) x;
    elsif tg_op = 'UPDATE' and new.status = 'pago' and old.status is distinct from 'pago' then
      perform notificar(x, 'comprovante', 'Pagamento confirmado ✅',
        new.descricao || ': ' || brl(new.valor_final_centavos) || ' recebido. Toque para ver o comprovante.', coalesce(new.recibo_url, '/app#/financeiro')) from unnest(quem) x;
      perform notificar_equipe('pagamento', coalesce(nome, 'Aluno') || ' pagou ' || brl(new.valor_final_centavos),
        new.descricao || case when new.baixa_manual_por is not null then ' · baixa manual' else ' · Asaas' end, '/app#/cobrancas?st=pago', new.baixa_manual_por);
    elsif tg_op = 'UPDATE' and new.status = 'atrasado' and old.status = 'em_aberto' then
      perform notificar(x, 'cobranca', 'Mensalidade em atraso',
        new.descricao || ' venceu em ' || to_char(new.vencimento, 'DD/MM') || '. Pague pelo portal para manter o acesso em dia.', '/app#/financeiro') from unnest(quem) x;
      perform notificar_equipe('pagamento', coalesce(nome, 'Aluno') || ' ficou em atraso', new.descricao || ' · ' || brl(new.valor_final_centavos), '/app#/cobrancas?st=atrasado');
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_cobrancas on public.cobrancas;
create trigger notif_cobrancas after insert or update of status on public.cobrancas for each row execute function public.notif_cobranca();

-- postagens do feed
create or replace function public.notif_post() returns trigger language plpgsql security definer set search_path = public as $$
declare nome text; u uuid; titulo text; trecho text;
begin
  begin
    select p.nome into nome from profiles p where p.id = new.autor_id;
    titulo := case when new.fixado then 'Novo aviso da equipe ZXT' else 'Nova postagem de ' || coalesce(nullif(split_part(nome, ' ', 1), ''), 'um membro') end;
    trecho := coalesce(nullif(left(regexp_replace(coalesce(new.texto, ''), '\s+', ' ', 'g'), 110), ''), 'Foto ou vídeo novo no feed');
    for u in select id from profiles where status = 'ativo' and id <> new.autor_id
             union select user_id from user_roles where papel = 'admin' and user_id <> new.autor_id loop
      perform notificar(u, 'post', titulo, trecho, '/app#/comunidade');
    end loop;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_posts on public.posts;
create trigger notif_posts after insert on public.posts for each row execute function public.notif_post();

-- eventos
create or replace function public.notif_inscricao() returns trigger language plpgsql security definer set search_path = public as $$
declare ev eventos; op text;
begin
  begin
    select * into ev from eventos where id = new.evento_id;
    select nome into op from evento_opcoes where id = new.opcao_id;
    if tg_op = 'INSERT' then
      perform notificar_equipe('evento_inscricao', 'Nova inscrição: ' || coalesce(new.nome, ''),
        ev.titulo || coalesce(' · ' || op, '') || coalesce(' · ' || brl(new.valor_centavos), ''), '/app#/eventos?e=' || ev.id);
    elsif new.status = 'pago' and old.status is distinct from 'pago' then
      perform notificar_equipe('evento_pagamento', coalesce(new.nome, '') || ' pagou a inscrição',
        ev.titulo || ' · ' || brl(new.valor_centavos) || case when new.baixa_por is not null then ' · baixa manual' else ' · Asaas' end, '/app#/eventos?e=' || ev.id, new.baixa_por);
      if new.aluno_id is not null then
        perform notificar(new.aluno_id, 'comprovante', 'Inscrição paga ✅', ev.titulo || ': ' || brl(new.valor_centavos) || ' recebido.',
          coalesce(new.recibo_url, '/evento/' || ev.slug || '?i=' || new.codigo));
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_inscricoes on public.evento_inscricoes;
create trigger notif_inscricoes after insert or update of status on public.evento_inscricoes for each row execute function public.notif_inscricao();

-- novo cadastro aguardando aprovação
create or replace function public.notif_cadastro() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'pendente' and new.cpf is not null and old.cpf is null then   -- cadastro completo (o portal grava o CPF no fim)
      perform notificar_equipe('cadastro', 'Novo cadastro: ' || coalesce(nullif(new.nome, ''), new.email),
        case when new.tipo_cadastro = 'professor' then 'Professor aguardando aprovação' when new.aluno_existente then 'Aluno atual aguardando aprovação' else 'Aluno novo' end,
        case when new.tipo_cadastro = 'professor' then '/app#/professores' else '/app#/aprovacoes' end);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_cadastros on public.profiles;
create trigger notif_cadastros after update of cpf on public.profiles for each row execute function public.notif_cadastro();

-- lembrete diário: mensalidade vence em 3 dias
create or replace function public.lembrar_vencimentos() returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select * from cobrancas where status = 'em_aberto' and vencimento = hoje_fortaleza() + 3 loop
    perform notificar(c.aluno_id, 'cobranca', 'Mensalidade vence em 3 dias',
      c.descricao || ': ' || brl(c.valor_final_centavos) || ', vencimento ' || to_char(c.vencimento, 'DD/MM') || '. Pague pelo portal com Pix, cartão ou boleto.', '/app#/financeiro');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notificar, public.notificar_equipe, public.lembrar_vencimentos from public, anon, authenticated;
select cron.schedule('zxt-lembretes', '10 12 * * *', 'select public.lembrar_vencimentos()');
