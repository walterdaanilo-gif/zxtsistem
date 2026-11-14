-- Testes de RLS e do fluxo cadastro → aprovação → reserva → check-in → financeiro.
-- Roda tudo dentro de um bloco que termina com RAISE EXCEPTION: nada fica gravado.
-- O resultado volta na mensagem de erro, no formato "RESULTADO: {...}".
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); p uuid := gen_random_uuid();
  plano uuid; turma uuid; aula uuid; futura uuid; tok text; n int; r jsonb := '{}'::jsonb; ok boolean; msg text;
  procedure_dummy int;
begin
  -- usuários de teste (o trigger cria perfil PENDENTE + papel aluno)
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (a, 'aluno.a@zxt.test', '{"nome":"Aluno A"}', 'authenticated', 'authenticated'),
    (b, 'aluno.b@zxt.test', '{"nome":"Aluno B"}', 'authenticated', 'authenticated'),
    (p, 'prof@zxt.test', '{"nome":"Professor P"}', 'authenticated', 'authenticated');
  insert into user_roles values (p, 'professor');
  update profiles set status = 'ativo' where id = p;
  insert into planos (nome, valor_centavos) values ('Plano teste', 15000) returning id into plano;
  select id into turma from turmas where nome = 'Muay Thai · Turma 1' and ativa;
  -- aula acontecendo agora para testar check-in
  insert into aulas (turma_id, data, inicio, fim) values (turma, hoje_fortaleza() + 400, now() - interval '5 min', now() + interval '55 min') returning id into aula;
  insert into aulas (turma_id, data, inicio, fim) values (turma, hoje_fortaleza() + 401, now() + interval '1 day', now() + interval '1 day 1 hour') returning id into futura;
  insert into qr_tokens (token) values ('tok-teste') returning token into tok;

  r := r || jsonb_build_object('1_cadastro_entra_pendente', (select status from profiles where id = a) = 'pendente');

  -- ===== como ALUNO A (pendente) =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform reservar_aula(futura); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('2_pendente_nao_reserva', ok);
  begin update profiles set status = 'ativo' where id = a; exception when others then null; end;
  execute 'reset role';
  r := r || jsonb_build_object('3_aluno_nao_se_autoaprova', (select status from profiles where id = a) = 'pendente');

  -- ===== como ADMIN: aprova A e B =====
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform aprovar_aluno(a, plano, array[turma], 28);   -- vencimento futuro: não cai no bloqueio por atraso
  perform aprovar_aluno(b, plano, array[turma], 28);
  n := gerar_mensalidades();
  execute 'reset role';
  r := r || jsonb_build_object('4_admin_aprova', (select status from profiles where id = a) = 'ativo',
                               '5_mensalidades_geradas', n >= 2);

  -- ===== como ALUNO A (ativo) =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '6_aluno_ve_so_o_proprio_perfil', (select count(*) from profiles) = 1,
    '7_aluno_nao_ve_cobranca_de_outro', (select count(*) from cobrancas where aluno_id = b) = 0,
    '8_aluno_ve_a_propria_cobranca', (select count(*) from cobrancas where aluno_id = a) >= 1,
    '9_aluno_nao_le_auditoria', (select count(*) from auditoria) = 0);
  perform reservar_aula(futura);
  r := r || jsonb_build_object('10_reserva_ok', (select status from reservas where aula_id = futura and aluno_id = a) = 'reservada');
  perform fazer_checkin(tok);
  r := r || jsonb_build_object('11_checkin_qr_ok', (select status from reservas where aula_id = aula and aluno_id = a) = 'presente');
  begin insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos) values (a, 'hack', current_date, 0); ok := false;
  exception when others then ok := true; end;
  r := r || jsonb_build_object('12_aluno_nao_cria_cobranca', ok);
  begin perform baixa_manual((select id from cobrancas where aluno_id = a limit 1), 'dinheiro'); ok := false;
  exception when others then ok := true; end;
  r := r || jsonb_build_object('13_aluno_nao_da_baixa', ok);
  execute 'reset role';

  -- ===== como PROFESSOR =====
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '14_professor_nao_ve_despesas', (select count(*) from despesas) = 0,
    '15_professor_ve_presenca', (select count(*) from reservas where aula_id = aula and status = 'presente') = 1,
    '16_professor_ve_alunos', (select count(*) from profiles where id in (a, b)) = 2);
  perform salvar_observacao_professor(a, 'Base boa, melhorar guarda');
  begin update profiles set status = 'inativo' where id = a; exception when others then null; end;
  execute 'reset role';
  r := r || jsonb_build_object(
    '17_professor_grava_observacao', (select observacoes_professor from profiles where id = a) = 'Base boa, melhorar guarda',
    '18_professor_nao_muda_status', (select status from profiles where id = a) = 'ativo');

  -- ===== como VISITANTE (anon) =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  r := r || jsonb_build_object(
    '19_visitante_ve_grade', (select count(*) from turmas) >= 6,
    '20_visitante_ve_evento_publico', (select count(*) from eventos) >= 1,
    '21_visitante_nao_ve_perfis', (select count(*) from profiles) = 0,
    '22_visitante_nao_ve_leads', (select count(*) from leads) = 0);
  perform criar_lead('Visitante Teste', '84999990000', 22, 'muay-thai', turma, 'instagram');
  execute 'reset role';
  r := r || jsonb_build_object('23_lead_registrado', (select count(*) from leads where nome = 'Visitante Teste') = 1,
                               '24_auditoria_registra', (select count(*) from auditoria where tabela in ('profiles','assinaturas')) >= 2);

  raise exception 'RESULTADO: %', r;
end $$;
