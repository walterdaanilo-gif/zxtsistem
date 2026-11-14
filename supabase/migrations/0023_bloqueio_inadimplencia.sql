-- Inadimplência: bloqueia reserva e check-in a partir do 3º dia depois do vencimento.
-- Desbloqueio: pagando pelo portal (automático), baixa de pagamento em mãos, ou liberação temporária pela equipe.

update public.academia_config set dias_bloqueio_atraso = 3 where dias_bloqueio_atraso is null;

create table if not exists public.liberacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  ate date not null,
  motivo text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists liberacoes_aluno on public.liberacoes_acesso (aluno_id, ate desc);
alter table public.liberacoes_acesso enable row level security;
drop policy if exists lib_ler on public.liberacoes_acesso;
create policy lib_ler on public.liberacoes_acesso for select using (public.is_staff() or aluno_id = auth.uid());

-- bloqueado = mensalidade em aberto vencida há N dias ou mais (N = dias_bloqueio_atraso) e sem liberação vigente
create or replace function public.bloqueado_por_atraso(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select dias_bloqueio_atraso from academia_config) is not null
    and exists (select 1 from cobrancas c where c.aluno_id = p_aluno and c.status in ('em_aberto', 'atrasado')
                and c.vencimento + (select dias_bloqueio_atraso from academia_config) <= public.hoje_fortaleza())
    and not exists (select 1 from liberacoes_acesso l where l.aluno_id = p_aluno and l.ate >= public.hoje_fortaleza()),
  false)
$$;
revoke execute on function public.bloqueado_por_atraso from public, anon;
grant execute on function public.bloqueado_por_atraso to authenticated;

-- situação do próprio aluno (portal)
create or replace function public.meu_bloqueio() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bloqueado', public.bloqueado_por_atraso(auth.uid()),
    'dias', (select dias_bloqueio_atraso from academia_config),
    'total_centavos', coalesce((select sum(valor_final_centavos) from cobrancas where aluno_id = auth.uid() and status in ('em_aberto', 'atrasado') and vencimento < public.hoje_fortaleza()), 0),
    'vencimento', (select min(vencimento) from cobrancas where aluno_id = auth.uid() and status in ('em_aberto', 'atrasado')),
    'liberado_ate', (select max(ate) from liberacoes_acesso where aluno_id = auth.uid() and ate >= public.hoje_fortaleza()))
$$;
grant execute on function public.meu_bloqueio to authenticated;

-- lista para a equipe: quem está vencido (bloqueado ou perto de bloquear)
create or replace function public.lista_inadimplencia() returns table (
  aluno_id uuid, nome text, whatsapp text, total_centavos bigint, qtd int, vencimento date, dias_atraso int, bloqueado boolean, liberado_ate date, asaas boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  return query
  select p.id, p.nome, coalesce(p.responsavel_whatsapp, p.whatsapp), sum(c.valor_final_centavos)::bigint, count(*)::int, min(c.vencimento),
         (public.hoje_fortaleza() - min(c.vencimento))::int, public.bloqueado_por_atraso(p.id),
         (select max(l.ate) from liberacoes_acesso l where l.aluno_id = p.id and l.ate >= public.hoje_fortaleza()),
         bool_or(c.provider_id is not null)
  from cobrancas c join profiles p on p.id = c.aluno_id
  where c.status in ('em_aberto', 'atrasado') and c.vencimento < public.hoje_fortaleza()
  group by p.id
  order by min(c.vencimento);
end $$;
revoke execute on function public.lista_inadimplencia from public, anon;
grant execute on function public.lista_inadimplencia to authenticated;

-- liberação temporária (ex.: combinou de pagar até sexta)
create or replace function public.liberar_acesso(p_aluno uuid, p_ate date, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
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
  if not public.is_staff() then raise exception 'Sem permissão'; end if;
  update liberacoes_acesso set ate = public.hoje_fortaleza() - 1 where aluno_id = p_aluno and ate >= public.hoje_fortaleza();
end $$;
revoke execute on function public.liberar_acesso, public.encerrar_liberacao from public, anon;
grant execute on function public.liberar_acesso, public.encerrar_liberacao to authenticated;

-- baixa feita pelo servidor (/api/baixa), depois de marcar "recebido em dinheiro" no Asaas
create or replace function public.baixa_manual_servidor(p_cobranca uuid, p_forma public.forma_pagamento, p_obs text, p_por uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_servidor() then raise exception 'Sem permissão'; end if;
  update cobrancas set status = 'pago', pago_em = now(), forma_pagamento = p_forma, baixa_manual_por = p_por, baixa_obs = p_obs
  where id = p_cobranca and status in ('em_aberto', 'atrasado');
end $$;
revoke execute on function public.baixa_manual_servidor from public, anon, authenticated;
grant execute on function public.baixa_manual_servidor to service_role;

-- reserva também respeita o bloqueio (o check-in já respeitava)
create or replace function public.reservar_aula(p_aula uuid) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare a aulas; t turmas; ocupadas int; r reservas; motivo text;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  if public.bloqueado_por_atraso(auth.uid()) then raise exception 'Acesso às aulas bloqueado: mensalidade em atraso. Pague em Mensalidades para liberar na hora.'; end if;
  select * into a from aulas where id = p_aula;
  if a.id is null or a.status = 'cancelada' then raise exception 'Aula indisponível'; end if;
  if a.inicio < now() then raise exception 'Essa aula já começou'; end if;
  select * into t from turmas where id = a.turma_id;
  if not public.tem_acesso_turma(auth.uid(), t.id) then
    raise exception 'A turma % não faz parte do seu plano. Fale com a recepção para trocar de plano ou de turma.', t.nome;
  end if;
  if exists (select 1 from reservas where aula_id = p_aula and aluno_id = auth.uid() and status in ('reservada','presente','espera')) then
    select * into r from reservas where aula_id = p_aula and aluno_id = auth.uid();
    return r;
  end if;
  motivo := public.validar_plano(auth.uid(), p_aula);
  if motivo is not null then raise exception '%', motivo; end if;
  select count(*) into ocupadas from reservas where aula_id = p_aula and status in ('reservada','presente');
  insert into reservas (aula_id, aluno_id, status)
  values (p_aula, auth.uid(), case when ocupadas >= t.capacidade then 'espera' else 'reservada' end::status_reserva)
  on conflict (aula_id, aluno_id) do update
    set status = excluded.status, created_at = now()
    where reservas.status in ('cancelada','falta')
  returning * into r;
  if r.id is null then select * into r from reservas where aula_id = p_aula and aluno_id = auth.uid(); end if;
  return r;
end $$;

-- mensagem do check-in bloqueado aponta o caminho para pagar
create or replace function public.fazer_checkin(p_token text) returns public.reservas
language plpgsql security definer set search_path = public as $$
declare jan int; a aulas; r reservas; motivo text; livre boolean;
begin
  if not public.is_ativo() then raise exception 'Cadastro ainda não aprovado'; end if;
  if not exists (select 1 from qr_tokens where token = p_token and expira_em > now()) then
    raise exception 'QR code inválido ou vencido';
  end if;
  if public.bloqueado_por_atraso(auth.uid()) then raise exception 'Check-in bloqueado: mensalidade em atraso. Pague em Mensalidades (libera na hora) ou fale com a recepção.'; end if;
  select janela_checkin_min into jan from academia_config;
  livre := public.tem_plano_livre(auth.uid());
  select a2.* into a from aulas a2
    join turmas t on t.id = a2.turma_id
    left join reservas rv on rv.aula_id = a2.id and rv.aluno_id = auth.uid() and rv.status in ('reservada','espera')
    left join matriculas m on m.turma_id = t.id and m.aluno_id = auth.uid()
  where a2.status <> 'cancelada'
    and now() between a2.inicio - make_interval(mins => jan) and a2.fim
    and (rv.id is not null or m.aluno_id is not null or t.coletiva or livre)
  order by (rv.id is not null) desc, (m.aluno_id is not null) desc, a2.inicio
  limit 1;
  if a.id is null then raise exception 'Nenhuma aula das suas turmas acontecendo agora'; end if;
  if not exists (select 1 from reservas where aula_id = a.id and aluno_id = auth.uid() and status in ('reservada','presente')) then
    motivo := public.validar_plano(auth.uid(), a.id);
    if motivo is not null then raise exception '%', motivo; end if;
  end if;
  insert into reservas (aula_id, aluno_id, status, checkin_em, checkin_metodo)
  values (a.id, auth.uid(), 'presente', now(), 'qr')
  on conflict (aula_id, aluno_id) do update set status = 'presente', checkin_em = now(), checkin_metodo = 'qr'
  returning * into r;
  return r;
end $$;

-- alunos bloqueados (para a chamada mostrar o cadeado)
create or replace function public.alunos_bloqueados() returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query select distinct c.aluno_id from cobrancas c where c.aluno_id is not null and c.status in ('em_aberto', 'atrasado')
    and c.vencimento < public.hoje_fortaleza() and public.bloqueado_por_atraso(c.aluno_id);
end $$;
revoke execute on function public.alunos_bloqueados from public, anon;
grant execute on function public.alunos_bloqueados to authenticated;

-- avisos diários: véspera do bloqueio e dia do bloqueio (junto do lembrete de vencimento)
create or replace function public.lembrar_vencimentos() returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; dias int := (select dias_bloqueio_atraso from academia_config); nome text;
begin
  for c in select * from cobrancas where status = 'em_aberto' and vencimento = hoje_fortaleza() + 3 loop
    perform notificar(c.aluno_id, 'cobranca', 'Mensalidade vence em 3 dias',
      c.descricao || ': ' || brl(c.valor_final_centavos) || ', vencimento ' || to_char(c.vencimento, 'DD/MM') || '. Pague pelo portal com Pix, cartão ou boleto.', '/app#/financeiro');
    n := n + 1;
  end loop;
  if dias is not null then
    for c in select * from cobrancas where status in ('em_aberto', 'atrasado') and vencimento + dias - 1 = hoje_fortaleza() loop
      perform notificar(c.aluno_id, 'cobranca', 'Amanhã seu acesso às aulas será bloqueado',
        c.descricao || ' venceu em ' || to_char(c.vencimento, 'DD/MM') || '. Pague hoje pelo portal para continuar treinando.', '/app#/financeiro');
      n := n + 1;
    end loop;
    for c in select * from cobrancas where status in ('em_aberto', 'atrasado') and vencimento + dias = hoje_fortaleza() loop
      if public.bloqueado_por_atraso(c.aluno_id) then
        select p.nome into nome from profiles p where p.id = c.aluno_id;
        perform notificar(c.aluno_id, 'cobranca', 'Acesso às aulas bloqueado 🔒',
          c.descricao || ' venceu em ' || to_char(c.vencimento, 'DD/MM') || '. Pague em Mensalidades: o acesso libera na hora.', '/app#/financeiro');
        perform notificar_equipe('pagamento', coalesce(nome, 'Aluno') || ' foi bloqueado por atraso', c.descricao || ' · ' || brl(c.valor_final_centavos), '/app#/inadimplencia');
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.lembrar_vencimentos from public, anon, authenticated;
