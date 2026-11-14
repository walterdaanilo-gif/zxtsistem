-- =====================================================================
-- ZXT - Zulu Xtreme Team :: modelo de dados completo
-- RLS ativo em TODAS as tabelas. Dinheiro sempre em centavos (integer).
-- Fuso de negócio: America/Fortaleza.
-- =====================================================================

-- ---------- limpeza do esquema anterior (backup em supabase/backup) ----------
drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists comunidade_upload on storage.objects;
drop policy if exists comunidade_delete on storage.objects;
drop table if exists public.curtidas, public.comentarios, public.post_fotos, public.posts,
  public.exame_inscricoes, public.exames, public.graduacoes, public.presencas,
  public.mensalidades, public.profiles cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.perfis_publicos() cascade;
drop function if exists public.protect_profile_fields() cascade;

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type public.papel as enum ('admin','professor','aluno','responsavel');
create type public.status_aluno as enum ('pendente','ativo','trancado','inativo','recusado');
create type public.sistema_graduacao as enum ('prajied','faixa','nivel');
create type public.nivel_turma as enum ('iniciante','intermediario','avancado','kids','competicao','todos');
create type public.status_aula as enum ('prevista','cancelada','realizada');
create type public.status_reserva as enum ('reservada','espera','cancelada','presente','falta');
create type public.metodo_checkin as enum ('qr','professor');
create type public.periodicidade as enum ('mensal','trimestral','semestral','anual');
create type public.status_cobranca as enum ('em_aberto','pago','atrasado','cancelado','isento');
create type public.tipo_cobranca as enum ('mensalidade','evento','produto','diaria','particular','outro');
create type public.forma_pagamento as enum ('pix','boleto','cartao','dinheiro','pix_direto','outro');
create type public.tipo_desconto as enum ('percentual','valor');
create type public.tipo_evento as enum ('aulao','aulao_pre_graduacao','seminario','exame_graduacao','competicao','outro');
create type public.resultado_luta as enum ('vitoria','derrota','empate','sem_resultado');
create type public.origem_lead as enum ('instagram','whatsapp','indicacao','evento','passou_na_frente','site','outro');
create type public.status_lead as enum ('agendada','compareceu','matriculou','nao_compareceu','desistiu');
create type public.tipo_conversa as enum ('direta','grupo','equipe');

-- ---------- utilitários ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.hoje_fortaleza() returns date language sql stable as $$
  select (now() at time zone 'America/Fortaleza')::date $$;

-- =====================================================================
-- 1. ACADEMIA, PESSOAS E PAPÉIS
-- =====================================================================
create table public.academia_config (
  id boolean primary key default true check (id),
  nome text not null default 'ZXT - Zulu Xtreme Team',
  slogan text default 'A FÁBRICA DE CAMPEÕES!',
  endereco text default 'Av. Perimetral Sul, 500, Cidade da Esperança, Natal/RN, CEP 59071-550',
  whatsapp text,                      -- TODO_ZXT
  instagram text default 'zxtoficial',
  logo_url text default '/assets/logo.svg',
  cor_primaria text default '#e1141e',
  horario_funcionamento jsonb default '{}'::jsonb,
  horas_cancelamento_reserva int not null default 2,
  janela_checkin_min int not null default 30,      -- minutos antes/depois do início
  dias_bloqueio_atraso int,                        -- null = sem bloqueio
  lembrete_dias int[] not null default '{-3,0,3}', -- dias relativos ao vencimento
  termo_responsabilidade text not null default 'TODO_ZXT: texto do termo de responsabilidade',
  politica_privacidade text not null default 'TODO_ZXT: texto da política de privacidade',
  versao_termos int not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.academia_config default values;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text,
  whatsapp text,
  data_nascimento date,
  cpf text,
  foto_url text,
  contato_emergencia_nome text,
  contato_emergencia_telefone text,
  saude_obs text,
  modalidades_interesse text[] not null default '{}',
  status public.status_aluno not null default 'pendente',
  motivo_recusa text,
  aprovado_em timestamptz,
  aprovado_por uuid references public.profiles(id),
  aceite_termo_em timestamptz,
  aceite_privacidade_em timestamptz,
  versao_termos_aceita int,
  -- menor de idade
  responsavel_nome text,
  responsavel_cpf text,
  responsavel_whatsapp text,
  responsavel_aceite_em timestamptz,
  -- atleta
  federacao text,                    -- ex.: FAMERN
  federacao_registro text,
  -- crescimento
  codigo_indicacao text unique default lower(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  indicado_por uuid references public.profiles(id),
  origem public.origem_lead,
  observacoes_professor text,
  exclusao_solicitada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid references public.profiles(id) on delete cascade,
  papel public.papel not null,
  primary key (user_id, papel)
);

create table public.responsaveis_alunos (
  responsavel_id uuid references public.profiles(id) on delete cascade,
  aluno_id uuid references public.profiles(id) on delete cascade,
  primary key (responsavel_id, aluno_id)
);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(16),'hex'),
  papel public.papel not null default 'professor',
  email text,
  criado_por uuid references public.profiles(id),
  usado_por uuid references public.profiles(id),
  usado_em timestamptz,
  expira_em timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- ---------- funções de papel (security definer: evitam recursão no RLS) ----------
create or replace function public.tem_papel(p public.papel) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and papel = p) $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select public.tem_papel('admin') $$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and papel in ('admin','professor')) $$;
create or replace function public.is_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'ativo') $$;
create or replace function public.pode_ver_aluno(aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select aluno = auth.uid() or public.is_staff()
      or exists (select 1 from responsaveis_alunos where responsavel_id = auth.uid() and aluno_id = aluno) $$;
create or replace function public.pode_ver_financeiro(aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select aluno = auth.uid() or public.is_admin()
      or exists (select 1 from responsaveis_alunos where responsavel_id = auth.uid() and aluno_id = aluno) $$;

-- ---------- novo usuário: perfil PENDENTE + papel aluno ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_indicador uuid; v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_meta ? 'indicacao' then
    select id into v_indicador from profiles where codigo_indicacao = v_meta->>'indicacao';
  end if;
  insert into profiles (id, email, nome, whatsapp, indicado_por)
  values (new.id, new.email,
          coalesce(v_meta->>'nome', v_meta->>'full_name', v_meta->>'name', ''),
          v_meta->>'whatsapp', v_indicador);
  insert into user_roles (user_id, papel) values (new.id, 'aluno');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- aluno não pode mudar status, aprovação, papel nem dados internos do próprio perfil
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_obs text := new.observacoes_professor;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;   -- servidor/admin
  if current_setting('zxt.obs_prof', true) = 'on' then                -- professor: só a observação
    new := old; new.observacoes_professor := v_obs; return new;
  end if;
  new.status := old.status; new.motivo_recusa := old.motivo_recusa;
  new.aprovado_em := old.aprovado_em; new.aprovado_por := old.aprovado_por;
  new.codigo_indicacao := old.codigo_indicacao; new.indicado_por := old.indicado_por;
  new.observacoes_professor := old.observacoes_professor; new.email := old.email;
  new.exclusao_solicitada_em := coalesce(new.exclusao_solicitada_em, old.exclusao_solicitada_em);
  return new;
end $$;
create trigger trg_protege_perfil before update on public.profiles
  for each row execute function public.protege_perfil();

create or replace function public.salvar_observacao_professor(p_aluno uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  perform set_config('zxt.obs_prof', 'on', true);
  update profiles set observacoes_professor = p_texto where id = p_aluno;
  perform set_config('zxt.obs_prof', 'off', true);
end $$;

-- =====================================================================
-- 2. MODALIDADES, GRADUAÇÃO
-- =====================================================================
create table public.modalidades (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  sistema public.sistema_graduacao not null default 'nivel',
  icone text,
  ativa boolean not null default true,
  ordem int not null default 0
);

create table public.graduacao_niveis (
  id uuid primary key default gen_random_uuid(),
  modalidade_id uuid not null references public.modalidades(id) on delete cascade,
  nome text not null,
  cor text,                       -- hex para exibir
  ordem int not null,
  graus_max int not null default 0,     -- Jiu-Jitsu: 4
  tempo_minimo_meses int not null default 0,
  aulas_minimas int not null default 0,
  infantil boolean not null default false,
  unique (modalidade_id, ordem, infantil)
);

create table public.graduacao_requisitos (
  id uuid primary key default gen_random_uuid(),
  nivel_id uuid not null references public.graduacao_niveis(id) on delete cascade, -- técnicas exigidas PARA chegar neste nível
  descricao text not null,
  ordem int not null default 0
);

create table public.graduacoes_aluno (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  modalidade_id uuid not null references public.modalidades(id),
  nivel_id uuid not null references public.graduacao_niveis(id),
  grau int not null default 0,
  data date not null default public.hoje_fortaleza(),
  professor_id uuid references public.profiles(id),
  evento_id uuid,
  certificado_codigo text unique default upper(substr(encode(gen_random_bytes(5),'hex'),1,10)),
  obs text,
  created_at timestamptz not null default now()
);
create index on public.graduacoes_aluno (aluno_id, modalidade_id, data desc);

create table public.aluno_tecnicas (
  aluno_id uuid references public.profiles(id) on delete cascade,
  requisito_id uuid references public.graduacao_requisitos(id) on delete cascade,
  marcado_por uuid references public.profiles(id),
  marcado_em timestamptz not null default now(),
  primary key (aluno_id, requisito_id)
);

-- =====================================================================
-- 3. TURMAS, AULAS, RESERVAS, CHECK-IN
-- =====================================================================
create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  modalidade_id uuid references public.modalidades(id),  -- null = coletiva (sparring)
  nome text not null,
  dias_semana smallint[] not null,     -- 0=domingo ... 6=sábado
  hora_inicio time not null,
  duracao_min int not null default 60,
  professor_id uuid references public.profiles(id),
  nivel public.nivel_turma not null default 'todos',
  capacidade int not null default 30,
  coletiva boolean not null default false,   -- aberta a alunos de todas as turmas
  sparring boolean not null default false,
  nova boolean not null default false,       -- "turma nova" para promoções
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.matriculas (
  aluno_id uuid references public.profiles(id) on delete cascade,
  turma_id uuid references public.turmas(id) on delete cascade,
  desde date not null default public.hoje_fortaleza(),
  primary key (aluno_id, turma_id)
);

create table public.aulas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id) on delete cascade,
  data date not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  professor_id uuid references public.profiles(id),
  status public.status_aula not null default 'prevista',
  motivo_cancelamento text,
  unique (turma_id, data)
);
create index on public.aulas (inicio);

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas(id) on delete cascade,
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  status public.status_reserva not null default 'reservada',
  checkin_em timestamptz,
  checkin_metodo public.metodo_checkin,
  checkin_por uuid references public.profiles(id),
  fez_sparring boolean not null default false,
  created_at timestamptz not null default now(),
  unique (aula_id, aluno_id)
);
create index on public.reservas (aluno_id, status);

create table public.qr_tokens (
  token text primary key default encode(gen_random_bytes(12),'hex'),
  criado_por uuid references public.profiles(id),
  expira_em timestamptz not null default now() + interval '1 day',
  created_at timestamptz not null default now()
);

-- gera aulas das turmas ativas para os próximos N dias (idempotente)
create or replace function public.gerar_aulas(p_dias int default 14) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into aulas (turma_id, data, inicio, fim, professor_id)
  select t.id, d::date,
         (d::date + t.hora_inicio) at time zone 'America/Fortaleza',
         (d::date + t.hora_inicio + make_interval(mins => t.duracao_min)) at time zone 'America/Fortaleza',
         t.professor_id
  from turmas t
  cross join generate_series(public.hoje_fortaleza(), public.hoje_fortaleza() + p_dias, interval '1 day') d
  where t.ativa and extract(dow from d)::smallint = any(t.dias_semana)
  on conflict (turma_id, data) do nothing;
  get diagnostics n = row_count; return n;
end $$;

-- reservar vaga (entra na lista de espera se lotado)
create or replace function public.reservar_aula(p_aula uuid) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare a aulas; t turmas; ocupadas int; r reservas;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  select * into a from aulas where id = p_aula;
  if a.id is null or a.status = 'cancelada' then raise exception 'Aula indisponível'; end if;
  if a.inicio < now() then raise exception 'Essa aula já começou'; end if;
  select * into t from turmas where id = a.turma_id;
  if not t.coletiva and not exists (select 1 from matriculas where aluno_id = auth.uid() and turma_id = t.id)
     and not exists (select 1 from turmas t2 join matriculas m on m.turma_id = t2.id
                     where m.aluno_id = auth.uid() and t2.modalidade_id = t.modalidade_id) then
    raise exception 'Essa turma não faz parte da sua matrícula';
  end if;
  select count(*) into ocupadas from reservas where aula_id = p_aula and status in ('reservada','presente');
  insert into reservas (aula_id, aluno_id, status)
  values (p_aula, auth.uid(), case when ocupadas >= t.capacidade then 'espera' else 'reservada' end::status_reserva)
  on conflict (aula_id, aluno_id) do update
    set status = excluded.status, created_at = now()
    where reservas.status = 'cancelada'
  returning * into r;
  if r.id is null then select * into r from reservas where aula_id = p_aula and aluno_id = auth.uid(); end if;
  return r;
end $$;

-- cancelar respeitando a tolerância e promovendo a lista de espera
create or replace function public.cancelar_reserva(p_aula uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a aulas; horas int; prox uuid;
begin
  select * into a from aulas where id = p_aula;
  select horas_cancelamento_reserva into horas from academia_config;
  if a.inicio - make_interval(hours => horas) < now() then
    raise exception 'Cancelamento só até % h antes da aula', horas;
  end if;
  update reservas set status = 'cancelada' where aula_id = p_aula and aluno_id = auth.uid() and status in ('reservada','espera');
  select id into prox from reservas where aula_id = p_aula and status = 'espera' order by created_at limit 1;
  if prox is not null then
    update reservas set status = 'reservada' where id = prox;
    insert into notificacoes (user_id, titulo, corpo, link)
    select aluno_id, 'Abriu vaga, guerreiro 🔥', 'Sua vaga na aula saiu da lista de espera.', '/app/agenda' from reservas where id = prox;
  end if;
end $$;

-- check-in pelo QR da recepção: acha a aula do aluno que está acontecendo agora
create or replace function public.fazer_checkin(p_token text) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare jan int; a aulas; r reservas;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  if not exists (select 1 from qr_tokens where token = p_token and expira_em > now()) then
    raise exception 'QR code inválido ou vencido';
  end if;
  if public.bloqueado_por_atraso(auth.uid()) then raise exception 'Check-in bloqueado: mensalidade em atraso. Fale com a recepção.'; end if;
  select janela_checkin_min into jan from academia_config;
  -- prioridade: aula com reserva; senão aula da turma em que está matriculado; senão coletiva
  select a2.* into a from aulas a2
    join turmas t on t.id = a2.turma_id
    left join reservas rv on rv.aula_id = a2.id and rv.aluno_id = auth.uid() and rv.status in ('reservada','espera')
    left join matriculas m on m.turma_id = t.id and m.aluno_id = auth.uid()
  where a2.status <> 'cancelada'
    and now() between a2.inicio - make_interval(mins => jan) and a2.fim
    and (rv.id is not null or m.aluno_id is not null or t.coletiva)
  order by (rv.id is not null) desc, (m.aluno_id is not null) desc, a2.inicio
  limit 1;
  if a.id is null then raise exception 'Nenhuma aula sua acontecendo agora'; end if;
  insert into reservas (aula_id, aluno_id, status, checkin_em, checkin_metodo)
  values (a.id, auth.uid(), 'presente', now(), 'qr')
  on conflict (aula_id, aluno_id) do update set status = 'presente', checkin_em = now(), checkin_metodo = 'qr'
  returning * into r;
  return r;
end $$;

-- chamada pelo professor
create or replace function public.marcar_presenca(p_aula uuid, p_aluno uuid, p_presente boolean, p_sparring boolean default false)
returns public.reservas language plpgsql security definer set search_path = public as $$
declare r reservas;
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
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

-- =====================================================================
-- 4. FINANCEIRO (só admin; aluno/responsável veem o próprio)
-- =====================================================================
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_centavos int not null check (valor_centavos >= 0),
  periodicidade public.periodicidade not null default 'mensal',
  aulas_semana int,                       -- null = livre
  desconto_familia_pct numeric(5,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.plano_modalidades (
  plano_id uuid references public.planos(id) on delete cascade,
  modalidade_id uuid references public.modalidades(id) on delete cascade,
  primary key (plano_id, modalidade_id)
);

create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  pagador_id uuid references public.profiles(id),     -- responsável que paga (conta família)
  plano_id uuid not null references public.planos(id),
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  valor_centavos int,                                 -- null = valor do plano
  inicio date not null default public.hoje_fortaleza(),
  fim date,
  ativa boolean not null default true,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now()
);

create table public.promocoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text unique,                    -- null = aplica sozinha
  tipo public.tipo_desconto not null,
  valor numeric(10,2) not null,          -- % ou reais
  inicio date not null,
  fim date not null,
  turma_ids uuid[],                      -- null = todas
  apenas_primeira_mensalidade boolean not null default true,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  pagador_id uuid references public.profiles(id),
  assinatura_id uuid references public.assinaturas(id),
  tipo public.tipo_cobranca not null default 'mensalidade',
  descricao text not null,
  competencia date,                       -- 1º dia do mês de referência
  vencimento date not null,
  valor_centavos int not null check (valor_centavos >= 0),
  desconto_centavos int not null default 0,
  valor_final_centavos int generated always as (greatest(valor_centavos - desconto_centavos, 0)) stored,
  promocao_id uuid references public.promocoes(id),
  status public.status_cobranca not null default 'em_aberto',
  provider text,                          -- asaas | mercadopago
  provider_id text unique,
  pix_copia_cola text,
  pix_qr_base64 text,
  boleto_url text,
  link_pagamento text,
  pago_em timestamptz,
  forma_pagamento public.forma_pagamento,
  baixa_manual_por uuid references public.profiles(id),
  baixa_obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assinatura_id, competencia)
);
create index on public.cobrancas (status, vencimento);
create index on public.cobrancas (aluno_id, vencimento desc);
create trigger trg_cobrancas_updated before update on public.cobrancas for each row execute function public.set_updated_at();

-- bloqueio por atraso (configurável)
create or replace function public.bloqueado_por_atraso(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select dias_bloqueio_atraso from academia_config) is not null and exists (
    select 1 from cobrancas c where c.aluno_id = p_aluno and c.status in ('em_aberto','atrasado')
      and c.vencimento + (select dias_bloqueio_atraso from academia_config) < public.hoje_fortaleza()), false) $$;

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,               -- aluguel, luz, água, equipamento, outros
  descricao text,
  valor_centavos int not null check (valor_centavos >= 0),
  data date not null default public.hoje_fortaleza(),
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'equipamento',   -- camiseta, luva, bandagem, caneleira, kimono, diaria, particular
  descricao text,
  preco_centavos int not null check (preco_centavos >= 0),
  controla_estoque boolean not null default true,
  ativo boolean not null default true,
  foto_url text
);
create table public.produto_variacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tamanho text not null default 'Único',
  estoque int not null default 0,
  unique (produto_id, tamanho)
);
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references public.profiles(id),
  cliente_nome text,
  total_centavos int not null default 0,
  forma_pagamento public.forma_pagamento,
  cobranca_id uuid references public.cobrancas(id),
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  variacao_id uuid not null references public.produto_variacoes(id),
  quantidade int not null check (quantidade > 0),
  preco_unit_centavos int not null
);
create or replace function public.baixa_estoque() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update produto_variacoes v set estoque = estoque - new.quantidade
  from produtos p where v.id = new.variacao_id and p.id = v.produto_id and p.controla_estoque;
  return new;
end $$;
create trigger trg_baixa_estoque after insert on public.venda_itens for each row execute function public.baixa_estoque();

-- baixa manual pelo admin (registra quem deu baixa; auditoria por trigger)
create or replace function public.baixa_manual(p_cobranca uuid, p_forma public.forma_pagamento, p_obs text default null)
returns public.cobrancas language plpgsql security definer set search_path = public as $$
declare c cobrancas;
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  update cobrancas set status = 'pago', pago_em = now(), forma_pagamento = p_forma,
         baixa_manual_por = auth.uid(), baixa_obs = p_obs
  where id = p_cobranca and status in ('em_aberto','atrasado') returning * into c;
  if c.id is null then raise exception 'Cobrança não está em aberto'; end if;
  return c;
end $$;

-- gera mensalidades do mês (idempotente) aplicando promoção automática na 1ª mensalidade
create or replace function public.gerar_mensalidades(p_competencia date default date_trunc('month', public.hoje_fortaleza())::date)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; s record; v int; pr promocoes; desc_c int; primeira boolean; meses int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Sem permissão'; end if;
  for s in
    select a.*, p.valor_centavos as valor_plano, p.periodicidade, p.nome as plano_nome
    from assinaturas a join planos p on p.id = a.plano_id
    where a.ativa and a.inicio <= (p_competencia + interval '1 month - 1 day')::date
      and (a.fim is null or a.fim >= p_competencia)
  loop
    meses := case s.periodicidade when 'mensal' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
    -- só cobra no mês de início do ciclo
    if ((extract(year from p_competencia)*12 + extract(month from p_competencia))
        - (extract(year from s.inicio)*12 + extract(month from s.inicio)))::int % meses <> 0 then continue; end if;
    if exists (select 1 from cobrancas where assinatura_id = s.id and competencia = p_competencia) then continue; end if;
    v := coalesce(s.valor_centavos, s.valor_plano);
    primeira := not exists (select 1 from cobrancas where assinatura_id = s.id);
    desc_c := 0; pr := null;
    if primeira then
      select pm.* into pr from promocoes pm
      where pm.ativa and pm.codigo is null and s.inicio between pm.inicio and pm.fim
        and (pm.turma_ids is null or exists (select 1 from matriculas m where m.aluno_id = s.aluno_id and m.turma_id = any(pm.turma_ids)))
      order by pm.valor desc limit 1;
      if pr.id is not null then
        desc_c := case pr.tipo when 'percentual' then round(v * pr.valor / 100.0)::int else round(pr.valor * 100)::int end;
      end if;
    end if;
    insert into cobrancas (aluno_id, pagador_id, assinatura_id, tipo, descricao, competencia, vencimento,
                           valor_centavos, desconto_centavos, promocao_id)
    values (s.aluno_id, s.pagador_id, s.id, 'mensalidade',
            s.plano_nome || ' · ' || to_char(p_competencia, 'MM/YYYY'), p_competencia,
            make_date(extract(year from p_competencia)::int, extract(month from p_competencia)::int, s.dia_vencimento),
            v, least(desc_c, v), pr.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- marca atrasadas (rodar todo dia)
create or replace function public.atualizar_atrasos() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update cobrancas set status = 'atrasado' where status = 'em_aberto' and vencimento < public.hoje_fortaleza();
  get diagnostics n = row_count; return n;
end $$;

-- =====================================================================
-- 5. EVENTOS E COMPETIÇÕES
-- =====================================================================
create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_evento not null,
  titulo text not null,
  descricao text,
  modalidade_id uuid references public.modalidades(id),
  inicio timestamptz not null,
  local_nome text,
  endereco text,
  referencia text,
  taxa_centavos int not null default 0,
  doacao_descricao text,                 -- ex.: 1 kg de alimento não perecível
  vagas int,
  inscricoes_abertas boolean not null default true,
  publico boolean not null default true,     -- aparece no site
  arte_url text,
  created_at timestamptz not null default now()
);
alter table public.graduacoes_aluno add constraint graduacoes_evento_fk foreign key (evento_id) references public.eventos(id);

create table public.evento_inscricoes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  aluno_id uuid references public.profiles(id) on delete cascade,
  nome_externo text,
  cobranca_id uuid references public.cobrancas(id),
  doacao_entregue boolean not null default false,
  presente boolean not null default false,
  nivel_alvo_id uuid references public.graduacao_niveis(id),
  aprovado boolean,
  created_at timestamptz not null default now(),
  unique (evento_id, aluno_id)
);

create table public.lutas (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.profiles(id) on delete cascade,
  modalidade_id uuid references public.modalidades(id),
  evento_nome text not null,
  data date not null,
  categoria_peso text,
  resultado public.resultado_luta not null,
  metodo text,                             -- pontos, nocaute, finalização...
  obs text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 6. FUNIL DE AULA EXPERIMENTAL
-- =====================================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  idade int,
  modalidade_id uuid references public.modalidades(id),
  turma_id uuid references public.turmas(id),
  data_aula date,
  origem public.origem_lead not null default 'site',
  indicado_por uuid references public.profiles(id),
  experiencia text,
  saude_obs text,
  status public.status_lead not null default 'agendada',
  aluno_id uuid references public.profiles(id),
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_leads_updated before update on public.leads for each row execute function public.set_updated_at();

-- inserção pública (anon) controlada
create or replace function public.criar_lead(p_nome text, p_whatsapp text, p_idade int, p_modalidade text,
  p_turma uuid, p_origem public.origem_lead, p_indicacao text default null, p_experiencia text default null, p_saude text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ind uuid;
begin
  if length(coalesce(p_nome,'')) < 3 then raise exception 'Nome inválido'; end if;
  if p_indicacao is not null then select id into v_ind from profiles where codigo_indicacao = p_indicacao; end if;
  insert into leads (nome, whatsapp, idade, modalidade_id, turma_id, origem, indicado_por, experiencia, saude_obs)
  values (left(p_nome,120), left(p_whatsapp,20), p_idade, (select id from modalidades where slug = p_modalidade),
          p_turma, coalesce(p_origem,'site'), v_ind, left(p_experiencia,60), left(p_saude,500))
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- 7. COMUNIDADE
-- =====================================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.profiles(id) on delete cascade,
  texto text,
  modalidade_id uuid references public.modalidades(id),
  fixado boolean not null default false,
  oculto boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.post_midias (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null,
  tipo text not null default 'imagem' check (tipo in ('imagem','video')),
  ordem int not null default 0
);
create table public.post_curtidas (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  oculto boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  comentario_id uuid references public.comentarios(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  motivo text,
  resolvida boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.conquistas (
  aluno_id uuid references public.profiles(id) on delete cascade,
  tipo text not null,           -- treinos_10, treinos_50, treinos_100, streak_4, graduacao
  referencia text not null default '',
  conquistado_em timestamptz not null default now(),
  primary key (aluno_id, tipo, referencia)
);

-- =====================================================================
-- 8. CHAT
-- =====================================================================
create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_conversa not null,
  titulo text,
  modalidade_id uuid references public.modalidades(id),
  turma_id uuid references public.turmas(id),
  criado_por uuid references public.profiles(id),
  ultima_mensagem_em timestamptz,
  created_at timestamptz not null default now()
);
create table public.conversa_membros (
  conversa_id uuid references public.conversas(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  ultima_leitura timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  texto text,
  midia_url text,
  midia_tipo text check (midia_tipo in ('imagem','video','audio')),
  created_at timestamptz not null default now()
);
create index on public.mensagens (conversa_id, created_at desc);
create or replace function public.toca_conversa() returns trigger language plpgsql security definer set search_path = public as $$
begin update conversas set ultima_mensagem_em = new.created_at where id = new.conversa_id; return new; end $$;
create trigger trg_toca_conversa after insert on public.mensagens for each row execute function public.toca_conversa();

create or replace function public.membro_conversa(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversa_membros where conversa_id = c and user_id = auth.uid())
      or (public.is_staff() and exists (select 1 from conversas where id = c and tipo = 'equipe')) $$;

create table public.faq (
  id uuid primary key default gen_random_uuid(),
  pergunta text not null,
  resposta text not null,
  ordem int not null default 0
);

-- =====================================================================
-- 9. TREINO EM CASA E ACOMPANHAMENTO
-- =====================================================================
create table public.exercicios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  modalidade_id uuid references public.modalidades(id),
  nivel public.nivel_turma not null default 'todos',
  video_url text,
  descricao text,
  series int,
  repeticoes int,
  tempo_seg int,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.planos_treino (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  modalidade_id uuid references public.modalidades(id),
  nivel public.nivel_turma not null default 'iniciante',
  semanas int not null default 4,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.plano_sessoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_treino(id) on delete cascade,
  semana int not null default 1,
  dia int not null,                 -- 1..7 dentro da semana
  titulo text not null,
  rounds int not null default 3,
  round_seg int not null default 180,
  descanso_seg int not null default 60,
  unique (plano_id, semana, dia)
);
create table public.sessao_exercicios (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.plano_sessoes(id) on delete cascade,
  exercicio_id uuid not null references public.exercicios(id),
  ordem int not null default 0,
  series int, repeticoes int, tempo_seg int
);
create table public.atribuicoes_treino (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_treino(id) on delete cascade,
  aluno_id uuid references public.profiles(id) on delete cascade,
  turma_id uuid references public.turmas(id) on delete cascade,
  inicio date not null default public.hoje_fortaleza(),
  atribuido_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (aluno_id is not null or turma_id is not null)
);
create table public.treinos_feitos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  sessao_id uuid not null references public.plano_sessoes(id) on delete cascade,
  atribuicao_id uuid references public.atribuicoes_treino(id) on delete set null,
  feito_em timestamptz not null default now(),
  esforco int check (esforco between 1 and 10),
  comentario text
);
create table public.medidas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default public.hoje_fortaleza(),
  peso_kg numeric(5,2),
  medidas jsonb not null default '{}'::jsonb,   -- {cintura: 80, braco: 35}
  foto_url text,
  created_at timestamptz not null default now()
);
create table public.metas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  descricao text not null,
  prazo date,
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 10. NOTIFICAÇÕES, AUDITORIA, LGPD
-- =====================================================================
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  corpo text,
  link text,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notificacoes (user_id, lida, created_at desc);

create table public.auditoria (
  id bigint generated always as identity primary key,
  user_id uuid,
  acao text not null,
  tabela text not null,
  registro_id text,
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.audita() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (user_id, acao, tabela, registro_id, antes, depois)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'user_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger aud_cobrancas after update of status, valor_centavos, desconto_centavos or delete on public.cobrancas for each row execute function public.audita();
create trigger aud_assinaturas after insert or update or delete on public.assinaturas for each row execute function public.audita();
create trigger aud_profiles_status after update of status on public.profiles for each row execute function public.audita();
create trigger aud_graduacoes after insert or update or delete on public.graduacoes_aluno for each row execute function public.audita();
create trigger aud_roles after insert or delete on public.user_roles for each row execute function public.audita();

-- aprovação / recusa de cadastro
create or replace function public.aprovar_aluno(p_aluno uuid, p_plano uuid, p_turmas uuid[], p_dia_vencimento int default 10)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  update profiles set status = 'ativo', aprovado_em = now(), aprovado_por = auth.uid(), motivo_recusa = null where id = p_aluno;
  insert into matriculas (aluno_id, turma_id) select p_aluno, unnest(p_turmas) on conflict do nothing;
  if p_plano is not null then
    insert into assinaturas (aluno_id, plano_id, dia_vencimento) values (p_aluno, p_plano, p_dia_vencimento);
  end if;
  insert into notificacoes (user_id, titulo, corpo, link)
  values (p_aluno, 'Bem-vindo à família ZxT 🥊', 'Seu cadastro foi aprovado. Bora treinar!', '/app');
end $$;
create or replace function public.recusar_aluno(p_aluno uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  update profiles set status = 'recusado', motivo_recusa = p_motivo where id = p_aluno;
end $$;

-- usar convite de professor
create or replace function public.usar_convite(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare c convites;
begin
  select * into c from convites where token = p_token and usado_em is null and expira_em > now();
  if c.id is null then raise exception 'Convite inválido ou vencido'; end if;
  insert into user_roles (user_id, papel) values (auth.uid(), c.papel) on conflict do nothing;
  update profiles set status = 'ativo', aprovado_em = now() where id = auth.uid();
  update convites set usado_por = auth.uid(), usado_em = now() where id = c.id;
end $$;

-- LGPD: exportar meus dados
create or replace function public.exportar_meus_dados() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'perfil', (select to_jsonb(p) from profiles p where id = auth.uid()),
    'papeis', (select jsonb_agg(papel) from user_roles where user_id = auth.uid()),
    'matriculas', (select jsonb_agg(to_jsonb(m)) from matriculas m where aluno_id = auth.uid()),
    'presencas', (select jsonb_agg(to_jsonb(r)) from reservas r where aluno_id = auth.uid()),
    'cobrancas', (select jsonb_agg(to_jsonb(c)) from cobrancas c where aluno_id = auth.uid()),
    'graduacoes', (select jsonb_agg(to_jsonb(g)) from graduacoes_aluno g where aluno_id = auth.uid()),
    'lutas', (select jsonb_agg(to_jsonb(l)) from lutas l where atleta_id = auth.uid()),
    'treinos', (select jsonb_agg(to_jsonb(t)) from treinos_feitos t where aluno_id = auth.uid()),
    'medidas', (select jsonb_agg(to_jsonb(m)) from medidas m where aluno_id = auth.uid()),
    'posts', (select jsonb_agg(to_jsonb(p)) from posts p where autor_id = auth.uid()),
    'mensagens', (select jsonb_agg(to_jsonb(m)) from mensagens m where autor_id = auth.uid()),
    'gerado_em', now()) $$;

-- =====================================================================
-- 11. VIEWS DE APOIO (security_invoker: respeitam o RLS de quem consulta)
-- =====================================================================
create view public.perfis_publicos with (security_invoker = false) as
  select id, nome, foto_url, data_nascimento is not null and to_char(data_nascimento,'MM-DD') = to_char(public.hoje_fortaleza(),'MM-DD') as aniversario_hoje
  from public.profiles where status = 'ativo';
revoke all on public.perfis_publicos from anon;

create view public.frequencia_mensal with (security_invoker = true) as
  select r.aluno_id, date_trunc('month', a.inicio at time zone 'America/Fortaleza')::date as mes, count(*) as treinos,
         count(*) filter (where r.fez_sparring) as sparrings
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.status = 'presente' group by 1, 2;

-- =====================================================================
-- 12. RLS
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- config: todos autenticados leem; admin altera
create policy cfg_ler on public.academia_config for select using (true);
create policy cfg_admin on public.academia_config for update using (public.is_admin());

-- profiles
create policy prof_ler on public.profiles for select using (public.pode_ver_aluno(id));
create policy prof_editar_proprio on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy prof_admin_del on public.profiles for delete using (public.is_admin());

-- papéis
create policy roles_ler on public.user_roles for select using (user_id = auth.uid() or public.is_staff());
create policy roles_admin on public.user_roles for all using (public.is_admin()) with check (public.is_admin());

create policy resp_ler on public.responsaveis_alunos for select using (responsavel_id = auth.uid() or aluno_id = auth.uid() or public.is_staff());
create policy resp_admin on public.responsaveis_alunos for all using (public.is_admin()) with check (public.is_admin());

create policy conv_admin on public.convites for all using (public.is_admin()) with check (public.is_admin());

-- catálogo (modalidades, níveis, requisitos, turmas, eventos públicos, produtos, faq): leitura aberta
create policy mod_ler on public.modalidades for select using (true);
create policy mod_admin on public.modalidades for all using (public.is_admin()) with check (public.is_admin());
create policy niv_ler on public.graduacao_niveis for select using (true);
create policy niv_admin on public.graduacao_niveis for all using (public.is_admin()) with check (public.is_admin());
create policy req_ler on public.graduacao_requisitos for select using (auth.uid() is not null);
create policy req_admin on public.graduacao_requisitos for all using (public.is_admin()) with check (public.is_admin());
create policy tur_ler on public.turmas for select using (true);
create policy tur_admin on public.turmas for all using (public.is_admin()) with check (public.is_admin());
create policy faq_ler on public.faq for select using (auth.uid() is not null);
create policy faq_admin on public.faq for all using (public.is_admin()) with check (public.is_admin());
create policy prd_ler on public.produtos for select using (true);
create policy prd_admin on public.produtos for all using (public.is_admin()) with check (public.is_admin());
create policy var_ler on public.produto_variacoes for select using (true);
create policy var_admin on public.produto_variacoes for all using (public.is_admin()) with check (public.is_admin());
create policy evt_ler on public.eventos for select using (publico or public.is_ativo() or public.is_staff());
create policy evt_admin on public.eventos for all using (public.is_admin()) with check (public.is_admin());

-- graduação do aluno
create policy grad_ler on public.graduacoes_aluno for select using (public.pode_ver_aluno(aluno_id));
create policy grad_staff on public.graduacoes_aluno for all using (public.is_staff()) with check (public.is_staff());
create policy tec_ler on public.aluno_tecnicas for select using (public.pode_ver_aluno(aluno_id));
create policy tec_staff on public.aluno_tecnicas for all using (public.is_staff()) with check (public.is_staff());

-- agenda
create policy mat_ler on public.matriculas for select using (public.pode_ver_aluno(aluno_id));
create policy mat_admin on public.matriculas for all using (public.is_admin()) with check (public.is_admin());
create policy aula_ler on public.aulas for select using (auth.uid() is not null);
create policy aula_staff on public.aulas for all using (public.is_staff()) with check (public.is_staff());
create policy res_ler on public.reservas for select using (public.pode_ver_aluno(aluno_id));
create policy res_staff on public.reservas for all using (public.is_staff()) with check (public.is_staff());
create policy qr_staff on public.qr_tokens for all using (public.is_staff()) with check (public.is_staff());

-- financeiro: professor NÃO entra
create policy pln_ler on public.planos for select using (auth.uid() is not null and (public.is_admin() or not public.is_staff() or public.tem_papel('aluno')));
create policy pln_admin on public.planos for all using (public.is_admin()) with check (public.is_admin());
create policy plm_ler on public.plano_modalidades for select using (auth.uid() is not null);
create policy plm_admin on public.plano_modalidades for all using (public.is_admin()) with check (public.is_admin());
create policy ass_ler on public.assinaturas for select using (public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());
create policy ass_admin on public.assinaturas for all using (public.is_admin()) with check (public.is_admin());
create policy pro_admin on public.promocoes for all using (public.is_admin()) with check (public.is_admin());
create policy cob_ler on public.cobrancas for select using (public.pode_ver_financeiro(aluno_id) or pagador_id = auth.uid());
create policy cob_admin on public.cobrancas for all using (public.is_admin()) with check (public.is_admin());
create policy des_admin on public.despesas for all using (public.is_admin()) with check (public.is_admin());
create policy ven_ler on public.vendas for select using (public.is_admin() or aluno_id = auth.uid());
create policy ven_admin on public.vendas for all using (public.is_admin()) with check (public.is_admin());
create policy vit_ler on public.venda_itens for select using (public.is_admin() or exists (select 1 from public.vendas v where v.id = venda_id and v.aluno_id = auth.uid()));
create policy vit_admin on public.venda_itens for all using (public.is_admin()) with check (public.is_admin());

-- eventos
create policy ins_ler on public.evento_inscricoes for select using (public.is_staff() or public.pode_ver_aluno(aluno_id));
create policy ins_propria on public.evento_inscricoes for insert with check (aluno_id = auth.uid() and public.is_ativo());
create policy ins_staff on public.evento_inscricoes for all using (public.is_staff()) with check (public.is_staff());
create policy lut_ler on public.lutas for select using (public.is_ativo() or public.is_staff());
create policy lut_staff on public.lutas for all using (public.is_staff()) with check (public.is_staff());

-- leads: só staff (inserção pública via criar_lead)
create policy lead_staff on public.leads for all using (public.is_staff()) with check (public.is_staff());

-- comunidade: só alunos ativos e equipe
create policy post_ler on public.posts for select using ((public.is_ativo() and not oculto) or public.is_staff() or autor_id = auth.uid());
create policy post_criar on public.posts for insert with check (autor_id = auth.uid() and public.is_ativo() and (not fixado or public.is_admin()));
create policy post_editar on public.posts for update using (autor_id = auth.uid() or public.is_staff());
create policy post_apagar on public.posts for delete using (autor_id = auth.uid() or public.is_admin());
create policy pm_ler on public.post_midias for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy pm_criar on public.post_midias for insert with check (exists (select 1 from public.posts p where p.id = post_id and p.autor_id = auth.uid()));
create policy pm_apagar on public.post_midias for delete using (exists (select 1 from public.posts p where p.id = post_id and (p.autor_id = auth.uid() or public.is_staff())));
create policy cur_ler on public.post_curtidas for select using (public.is_ativo() or public.is_staff());
create policy cur_criar on public.post_curtidas for insert with check (user_id = auth.uid() and public.is_ativo());
create policy cur_apagar on public.post_curtidas for delete using (user_id = auth.uid());
create policy com_ler on public.comentarios for select using ((public.is_ativo() and not oculto) or public.is_staff() or autor_id = auth.uid());
create policy com_criar on public.comentarios for insert with check (autor_id = auth.uid() and public.is_ativo());
create policy com_editar on public.comentarios for update using (autor_id = auth.uid() or public.is_staff());
create policy com_apagar on public.comentarios for delete using (autor_id = auth.uid() or public.is_admin());
create policy den_criar on public.denuncias for insert with check (autor_id = auth.uid());
create policy den_staff on public.denuncias for select using (public.is_staff() or autor_id = auth.uid());
create policy den_staff_upd on public.denuncias for update using (public.is_staff());
create policy cq_ler on public.conquistas for select using (public.is_ativo() or public.is_staff());
create policy cq_staff on public.conquistas for all using (public.is_staff()) with check (public.is_staff());

-- chat
create policy cv_ler on public.conversas for select using (public.membro_conversa(id) or public.is_admin());
create policy cv_criar on public.conversas for insert with check (criado_por = auth.uid() and (public.is_ativo() or public.is_staff()));
create policy cv_staff on public.conversas for update using (public.is_staff());
create policy cm_ler on public.conversa_membros for select using (user_id = auth.uid() or public.membro_conversa(conversa_id) or public.is_admin());
create policy cm_criar on public.conversa_membros for insert with check (
  public.is_staff() or exists (select 1 from public.conversas c where c.id = conversa_id and c.criado_por = auth.uid()));
create policy cm_leitura on public.conversa_membros for update using (user_id = auth.uid());
create policy msg_ler on public.mensagens for select using (public.membro_conversa(conversa_id) or public.is_admin());
create policy msg_criar on public.mensagens for insert with check (autor_id = auth.uid() and public.membro_conversa(conversa_id));

-- treino em casa
create policy ex_ler on public.exercicios for select using (public.is_ativo() or public.is_staff());
create policy ex_staff on public.exercicios for all using (public.is_staff()) with check (public.is_staff());
create policy pt_ler on public.planos_treino for select using (public.is_ativo() or public.is_staff());
create policy pt_staff on public.planos_treino for all using (public.is_staff()) with check (public.is_staff());
create policy ps_ler on public.plano_sessoes for select using (public.is_ativo() or public.is_staff());
create policy ps_staff on public.plano_sessoes for all using (public.is_staff()) with check (public.is_staff());
create policy se_ler on public.sessao_exercicios for select using (public.is_ativo() or public.is_staff());
create policy se_staff on public.sessao_exercicios for all using (public.is_staff()) with check (public.is_staff());
create policy at_ler on public.atribuicoes_treino for select using (
  public.is_staff() or aluno_id = auth.uid()
  or exists (select 1 from public.matriculas m where m.turma_id = atribuicoes_treino.turma_id and m.aluno_id = auth.uid()));
create policy at_staff on public.atribuicoes_treino for all using (public.is_staff()) with check (public.is_staff());
create policy tf_ler on public.treinos_feitos for select using (public.pode_ver_aluno(aluno_id));
create policy tf_criar on public.treinos_feitos for insert with check (aluno_id = auth.uid());
create policy tf_apagar on public.treinos_feitos for delete using (aluno_id = auth.uid());
-- medidas e metas: privadas, só aluno e equipe técnica
create policy md_ler on public.medidas for select using (aluno_id = auth.uid() or public.is_staff());
create policy md_proprio on public.medidas for all using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());
create policy mt_ler on public.metas for select using (aluno_id = auth.uid() or public.is_staff());
create policy mt_proprio on public.metas for all using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());

-- notificações, auditoria
create policy nt_ler on public.notificacoes for select using (user_id = auth.uid());
create policy nt_lida on public.notificacoes for update using (user_id = auth.uid());
create policy nt_admin on public.notificacoes for insert with check (public.is_staff());
create policy aud_admin on public.auditoria for select using (public.is_admin());

-- =====================================================================
-- 13. GRANTS DE FUNÇÕES
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.criar_lead, public.tem_papel, public.is_admin, public.is_staff, public.is_ativo,
  public.pode_ver_aluno, public.pode_ver_financeiro, public.membro_conversa, public.hoje_fortaleza to anon, authenticated;
revoke execute on function public.gerar_mensalidades, public.atualizar_atrasos, public.gerar_aulas from authenticated;
grant execute on function public.gerar_mensalidades to authenticated; -- checa is_admin internamente
grant select on public.perfis_publicos to authenticated;

-- =====================================================================
-- 14. STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars','avatars', true, 2097152, '{image/jpeg,image/png,image/webp}'),
  ('comunidade','comunidade', false, 26214400, '{image/jpeg,image/png,image/webp,video/mp4,video/quicktime}'),
  ('chat','chat', false, 26214400, '{image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/webm,audio/mpeg,audio/mp4,audio/ogg}'),
  ('evolucao','evolucao', false, 5242880, '{image/jpeg,image/png,image/webp}'),
  ('treinos','treinos', false, 52428800, '{video/mp4,video/quicktime,image/jpeg,image/png}'),
  ('eventos','eventos', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- cada usuário grava na própria pasta: <bucket>/<user_id>/arquivo
create policy st_avatar_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy st_avatar_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy st_com_ler on storage.objects for select to authenticated
  using (bucket_id = 'comunidade' and (public.is_ativo() or public.is_staff()));
create policy st_com_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'comunidade' and (storage.foldername(name))[1] = auth.uid()::text and public.is_ativo());
create policy st_chat_ler on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.membro_conversa(((storage.foldername(name))[1])::uuid));
create policy st_chat_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.membro_conversa(((storage.foldername(name))[1])::uuid));
create policy st_evo_ler on storage.objects for select to authenticated
  using (bucket_id = 'evolucao' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy st_evo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'evolucao' and (storage.foldername(name))[1] = auth.uid()::text);
create policy st_trn_ler on storage.objects for select to authenticated
  using (bucket_id = 'treinos' and (public.is_ativo() or public.is_staff()));
create policy st_trn_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'treinos' and public.is_staff());
create policy st_evt_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'eventos' and public.is_admin());

-- =====================================================================
-- 15. REALTIME (chat e notificações)
-- =====================================================================
alter publication supabase_realtime add table public.mensagens, public.notificacoes, public.reservas;
