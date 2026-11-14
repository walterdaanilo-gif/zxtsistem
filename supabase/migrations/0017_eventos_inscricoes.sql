-- Eventos com formulário de inscrição por link, opções com valor e pagamento no próprio formulário.
-- Inscrição pública passa por /api/evento (chave do servidor). A equipe vê e trabalha pelo portal.

-- ---------------------------------------------------------------- eventos
alter table public.eventos
  add column if not exists slug text,
  add column if not exists fim timestamptz,
  add column if not exists inscricoes_ate timestamptz,
  add column if not exists pagamento text not null default 'online',
  add column if not exists campos jsonb not null default '{"cpf": true, "nascimento": true, "whatsapp": true, "email": false, "extras": []}'::jsonb,
  add column if not exists mensagem_confirmacao text,
  add column if not exists criado_por uuid references public.profiles(id);
alter table public.eventos drop constraint if exists eventos_pagamento_chk;
alter table public.eventos add constraint eventos_pagamento_chk check (pagamento in ('online', 'local'));
create unique index if not exists eventos_slug_unico on public.eventos (slug);

-- ---------------------------------------------------------------- opções de inscrição (cada uma com seu valor)
create table if not exists public.evento_opcoes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nome text not null,
  descricao text,
  valor_centavos int check (valor_centavos is null or valor_centavos >= 0),   -- null = valor a confirmar
  nivel_id uuid references public.graduacao_niveis(id),                          -- exame: prajied que a pessoa vai fazer
  ordem int not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists evento_opcoes_evento on public.evento_opcoes (evento_id, ordem);
alter table public.evento_opcoes enable row level security;
drop policy if exists eop_ler on public.evento_opcoes;
create policy eop_ler on public.evento_opcoes for select using (public.is_staff() or public.is_ativo());
drop policy if exists eop_admin on public.evento_opcoes;
create policy eop_admin on public.evento_opcoes for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- inscrições
alter table public.evento_inscricoes
  add column if not exists opcao_id uuid references public.evento_opcoes(id),
  add column if not exists nome text,
  add column if not exists cpf text,
  add column if not exists nascimento date,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists respostas jsonb not null default '{}'::jsonb,
  add column if not exists valor_centavos int,
  add column if not exists status text not null default 'pendente',
  add column if not exists forma_pagamento text,
  add column if not exists pago_em timestamptz,
  add column if not exists baixa_por uuid references public.profiles(id),
  add column if not exists asaas_payment_id text,
  add column if not exists asaas_customer_id text,
  add column if not exists link_pagamento text,
  add column if not exists recibo_url text,
  add column if not exists obs text,
  add column if not exists origem text not null default 'formulario',
  add column if not exists codigo text not null default substr(md5(gen_random_uuid()::text), 1, 12),
  add column if not exists updated_at timestamptz not null default now();
update public.evento_inscricoes set nome = nome_externo where nome is null and nome_externo is not null;
alter table public.evento_inscricoes drop constraint if exists evento_inscricoes_status_chk;
alter table public.evento_inscricoes add constraint evento_inscricoes_status_chk check (status in ('pendente', 'pago', 'isento', 'cancelado'));
create unique index if not exists evento_inscricoes_codigo on public.evento_inscricoes (codigo);
create unique index if not exists evento_inscricoes_payment on public.evento_inscricoes (asaas_payment_id) where asaas_payment_id is not null;
create unique index if not exists evento_inscricoes_cpf on public.evento_inscricoes (evento_id, cpf) where cpf is not null and status <> 'cancelado';

-- equipe lê tudo; só o admin altera direto. Professor trabalha pelas funções abaixo. Inscrição nova só pelas funções.
drop policy if exists ins_staff on public.evento_inscricoes;
drop policy if exists ins_propria on public.evento_inscricoes;
drop policy if exists ins_ler on public.evento_inscricoes;
create policy ins_ler on public.evento_inscricoes for select using (public.is_staff() or aluno_id = auth.uid());
drop policy if exists ins_admin on public.evento_inscricoes;
create policy ins_admin on public.evento_inscricoes for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists aud_evento_inscricoes on public.evento_inscricoes;
create trigger aud_evento_inscricoes after update of status, valor_centavos, opcao_id or delete on public.evento_inscricoes
  for each row execute function public.audita();

-- quem chama é o servidor (/api/evento)?
create or replace function public.eh_servidor() returns boolean language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
$$;

create or replace function public.normaliza_nome(t text) returns text language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(t, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g')
$$;

-- ---------------------------------------------------------------- inscrever (servidor ou equipe)
-- p: { evento_id | slug, opcao_id, nome, cpf, nascimento, whatsapp, email, respostas, aluno_id, origem, obs }
create or replace function public.inscrever_evento(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e eventos; o evento_opcoes; i evento_inscricoes; cfg jsonb; cpf_l text; n int; extra jsonb; resp jsonb;
  staff boolean := public.is_staff();
begin
  if not (public.eh_servidor() or staff) then raise exception 'Sem permissão'; end if;
  select * into e from eventos where id = nullif(p->>'evento_id', '')::uuid or (slug is not null and slug = p->>'slug') limit 1;
  if e.id is null then raise exception 'Evento não encontrado'; end if;
  if not staff then
    if not e.inscricoes_abertas then raise exception 'As inscrições deste evento estão encerradas.'; end if;
    if e.inscricoes_ate is not null and now() > e.inscricoes_ate then raise exception 'O prazo de inscrição terminou.'; end if;
  end if;
  cfg := coalesce(e.campos, '{}'::jsonb);
  cpf_l := nullif(regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g'), '');
  if length(trim(coalesce(p->>'nome', ''))) < 3 then raise exception 'Informe o nome completo.'; end if;
  if not staff then
    if coalesce((cfg->>'cpf')::boolean, false) and (cpf_l is null or length(cpf_l) <> 11) then raise exception 'Informe um CPF válido.'; end if;
    if coalesce((cfg->>'nascimento')::boolean, false) and nullif(p->>'nascimento', '') is null then raise exception 'Informe a data de nascimento.'; end if;
    if coalesce((cfg->>'whatsapp')::boolean, false) and length(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g')) < 10 then raise exception 'Informe o WhatsApp com DDD.'; end if;
    if coalesce((cfg->>'email')::boolean, false) and coalesce(p->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido.'; end if;
  end if;

  -- opção (obrigatória quando o evento tem opções)
  if exists (select 1 from evento_opcoes where evento_id = e.id and ativa) then
    select * into o from evento_opcoes where id = nullif(p->>'opcao_id', '')::uuid and evento_id = e.id and (ativa or staff);
    if o.id is null then raise exception 'Escolha uma opção de inscrição.'; end if;
  end if;

  -- perguntas extras obrigatórias
  resp := coalesce(p->'respostas', '{}'::jsonb);
  if not staff then
    for extra in select * from jsonb_array_elements(coalesce(cfg->'extras', '[]'::jsonb)) loop
      if coalesce((extra->>'obrigatorio')::boolean, false) and coalesce(trim(resp->>(extra->>'id')), '') = '' then
        raise exception 'Responda: %', extra->>'rotulo';
      end if;
    end loop;
  end if;

  -- já inscrito? (mesmo CPF; ou mesmo nome sem CPF, vindo da planilha antiga)
  if cpf_l is not null then
    select * into i from evento_inscricoes where evento_id = e.id and cpf = cpf_l and status <> 'cancelado' limit 1;
  end if;
  if i.id is null then
    select * into i from evento_inscricoes
    where evento_id = e.id and cpf is null and status <> 'cancelado' and normaliza_nome(nome) = normaliza_nome(p->>'nome') limit 1;
    if i.id is not null then
      update evento_inscricoes set cpf = cpf_l, nascimento = coalesce(nascimento, nullif(p->>'nascimento', '')::date),
        whatsapp = coalesce(whatsapp, nullif(p->>'whatsapp', '')), email = coalesce(email, nullif(p->>'email', '')),
        aluno_id = coalesce(aluno_id, nullif(p->>'aluno_id', '')::uuid), updated_at = now()
      where id = i.id returning * into i;
    end if;
  end if;
  if i.id is not null then
    return jsonb_build_object('ja_inscrito', true, 'codigo', i.codigo, 'id', i.id);
  end if;

  if e.vagas is not null then
    select count(*) into n from evento_inscricoes where evento_id = e.id and status <> 'cancelado';
    if n >= e.vagas and not staff then raise exception 'As vagas deste evento acabaram.'; end if;
  end if;

  insert into evento_inscricoes (evento_id, aluno_id, opcao_id, nome, cpf, nascimento, whatsapp, email, respostas, valor_centavos, status, origem, obs, nivel_alvo_id)
  values (e.id, nullif(p->>'aluno_id', '')::uuid, o.id, trim(p->>'nome'), cpf_l, nullif(p->>'nascimento', '')::date,
          nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '\D', '', 'g'), ''), nullif(lower(trim(p->>'email')), ''), resp,
          o.valor_centavos, case when o.id is not null and o.valor_centavos = 0 then 'isento' when o.id is null and coalesce(e.taxa_centavos, 0) = 0 then 'isento' else 'pendente' end,
          coalesce(nullif(p->>'origem', ''), case when staff and not public.eh_servidor() then 'manual' else 'formulario' end), nullif(p->>'obs', ''), o.nivel_id)
  returning * into i;
  return jsonb_build_object('ja_inscrito', false, 'codigo', i.codigo, 'id', i.id);
end $$;

-- situação pública de uma inscrição (pelo código do link)
create or replace function public.situacao_inscricao(p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('codigo', i.codigo, 'id', i.id, 'nome', i.nome, 'status', i.status, 'valor_centavos', i.valor_centavos,
    'opcao', o.nome, 'link_pagamento', i.link_pagamento, 'recibo_url', i.recibo_url, 'cpf', i.cpf, 'email', i.email, 'whatsapp', i.whatsapp,
    'asaas_payment_id', i.asaas_payment_id, 'asaas_customer_id', i.asaas_customer_id,
    'evento', jsonb_build_object('id', e.id, 'titulo', e.titulo, 'inicio', e.inicio, 'pagamento', e.pagamento, 'slug', e.slug))
  from evento_inscricoes i join eventos e on e.id = i.evento_id left join evento_opcoes o on o.id = i.opcao_id
  where i.codigo = p_codigo
$$;

-- servidor guarda a cobrança criada no Asaas
create or replace function public.vincular_pagamento_evento(p_inscricao uuid, p_payment text, p_customer text, p_link text, p_forma text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  update evento_inscricoes set asaas_payment_id = p_payment, asaas_customer_id = p_customer, link_pagamento = p_link,
    forma_pagamento = lower(p_forma), updated_at = now()
  where id = p_inscricao;
end $$;

-- webhook do Asaas para cobranças de evento (externalReference = 'evt:<id da inscrição>')
create or replace function public.processar_pagamento_evento(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare i evento_inscricoes; ev text := p->>'evento';
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  select * into i from evento_inscricoes where asaas_payment_id = p->>'payment_id'
     or id = nullif(replace(coalesce(p->>'referencia', ''), 'evt:', ''), '')::uuid limit 1;
  if i.id is null then return 'inscricao_nao_encontrada'; end if;
  if ev in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH') then
    update evento_inscricoes set status = 'pago', pago_em = coalesce(nullif(p->>'pago_em', '')::timestamptz, now()),
      forma_pagamento = coalesce(lower(nullif(p->>'forma', '')), forma_pagamento), recibo_url = coalesce(nullif(p->>'recibo_url', ''), recibo_url),
      asaas_payment_id = coalesce(asaas_payment_id, p->>'payment_id'), updated_at = now()
    where id = i.id and status <> 'cancelado';
    return 'pago';
  elsif ev in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') then
    update evento_inscricoes set status = 'pendente', pago_em = null, obs = concat_ws(' · ', obs, 'Pagamento estornado no Asaas'), updated_at = now() where id = i.id;
    return 'estornado';
  elsif ev = 'PAYMENT_DELETED' then
    update evento_inscricoes set asaas_payment_id = null, link_pagamento = null, updated_at = now() where id = i.id and status = 'pendente';
    return 'removido';
  end if;
  return 'ignorado';
end $$;

-- equipe: baixa manual (pagou na academia, Pix direto etc.)
create or replace function public.baixa_inscricao(p_inscricao uuid, p_forma text, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  update evento_inscricoes set status = 'pago', pago_em = now(), forma_pagamento = p_forma, baixa_por = auth.uid(),
    obs = case when nullif(p_obs, '') is null then obs else concat_ws(' · ', obs, p_obs) end, updated_at = now()
  where id = p_inscricao and status = 'pendente';
  if not found then raise exception 'Inscrição não está pendente'; end if;
end $$;

-- equipe: presença, resultado do exame e observação. Admin: também opção, valor e cancelamento.
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
  if p ?| array['opcao_id', 'valor_centavos', 'status', 'nome', 'cpf'] then
    if not public.is_admin() then raise exception 'Só a administração altera opção, valor, nome, CPF ou cancela.'; end if;
    if p ? 'opcao_id' and nullif(p->>'opcao_id', '')::uuid is distinct from i.opcao_id then
      select * into o from evento_opcoes where id = (p->>'opcao_id')::uuid and evento_id = i.evento_id;
      if o.id is null then raise exception 'Opção inválida'; end if;
      update evento_inscricoes set opcao_id = o.id, nivel_alvo_id = o.nivel_id,
        valor_centavos = case when status = 'pendente' then o.valor_centavos else valor_centavos end,
        status = case when status = 'pendente' and o.valor_centavos = 0 then 'isento' else status end
      where id = i.id;
    end if;
    update evento_inscricoes set
      valor_centavos = case when p ? 'valor_centavos' then nullif(p->>'valor_centavos', '')::int else valor_centavos end,
      status = case when p->>'status' in ('pendente', 'pago', 'isento', 'cancelado') then p->>'status' else status end,
      pago_em = case when p->>'status' = 'pendente' then null else pago_em end,
      nome = coalesce(nullif(trim(p->>'nome'), ''), nome),
      cpf = case when p ? 'cpf' then nullif(regexp_replace(p->>'cpf', '\D', '', 'g'), '') else cpf end
    where id = i.id;
  end if;
end $$;

-- quando o admin define o valor de uma opção, as inscrições pendentes sem cobrança gerada acompanham
create or replace function public.opcao_valor_propaga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valor_centavos is distinct from old.valor_centavos then
    update evento_inscricoes set valor_centavos = new.valor_centavos,
      status = case when new.valor_centavos = 0 then 'isento' else 'pendente' end, updated_at = now()
    where opcao_id = new.id and status in ('pendente', 'isento') and asaas_payment_id is null and pago_em is null;
  end if;
  return new;
end $$;
drop trigger if exists evento_opcao_valor on public.evento_opcoes;
create trigger evento_opcao_valor after update of valor_centavos on public.evento_opcoes for each row execute function public.opcao_valor_propaga();

revoke execute on function public.inscrever_evento, public.situacao_inscricao, public.vincular_pagamento_evento,
  public.processar_pagamento_evento, public.baixa_inscricao, public.atualizar_inscricao from public, anon;
grant execute on function public.inscrever_evento, public.baixa_inscricao, public.atualizar_inscricao to authenticated;
grant execute on function public.inscrever_evento, public.situacao_inscricao, public.vincular_pagamento_evento, public.processar_pagamento_evento to service_role;
