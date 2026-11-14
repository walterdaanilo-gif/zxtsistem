-- Professor tem controle financeiro de qualquer aluno (ver e dar baixa), sem despesas nem planos. Tudo é desfeito.
do $$
declare
  pf uuid := gen_random_uuid(); minha uuid := gen_random_uuid(); outra uuid := gen_random_uuid(); al uuid := gen_random_uuid();
  t1 uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'muay-thai') order by hora_inicio desc offset 1 limit 1); bx uuid := (select id from turmas where ativa and not coletiva and modalidade_id = (select id from modalidades where slug = 'boxe') order by nome, hora_inicio limit 1);
  pl uuid; r jsonb := '{}'::jsonb; ok boolean;
begin
  insert into planos (nome, valor_centavos, max_turmas) values ('T fin', 7000, 1) returning id into pl;
  insert into auth.users (id, email, aud, role) values (pf, 'fp@zxt.test', 'authenticated', 'authenticated'), (minha, 'fm@zxt.test', 'authenticated', 'authenticated'),
    (outra, 'fo@zxt.test', 'authenticated', 'authenticated'), (al, 'fa@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo' where id in (pf, minha, outra, al);
  update turmas set professor_id = pf where id = t1;
  update turmas set professor_id = null where id = bx;
  insert into matriculas values (minha, t1), (outra, bx);
  insert into assinaturas (aluno_id, plano_id) values (minha, pl), (outra, pl);
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values
    (minha, 'T', current_date - 5, 7000, 'atrasado'), (outra, 'O', current_date, 7000, 'em_aberto');
  insert into despesas (descricao, categoria, valor_centavos) values ('aluguel', 'aluguel', 100000);

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '1_ve_aluno_da_turma_dele', (select count(*) from cobrancas where aluno_id = minha) = 1,
    '2_ve_aluno_de_outra_turma', (select count(*) from cobrancas where aluno_id = outra) = 1,
    '3_ve_assinaturas', (select count(*) from assinaturas where aluno_id in (minha, outra)) = 2,
    '4_nao_ve_despesas', (select count(*) from despesas) = 0);
  perform baixa_manual((select id from cobrancas where aluno_id = outra), 'dinheiro', 'pago na recepção');
  update planos set valor_centavos = 1 where id = pl;
  execute 'reset role';
  r := r || jsonb_build_object(
    '5_da_baixa_em_qualquer_aluno', (select status = 'pago' and baixa_manual_por = pf from cobrancas where aluno_id = outra),
    '6_nao_altera_valor_do_plano', (select valor_centavos from planos where id = pl) = 7000,
    '7_baixa_fica_na_auditoria', exists (select 1 from auditoria where tabela = 'cobrancas' and user_id = pf));

  -- aluno comum continua sem dar baixa e sem ver mensalidade de outro
  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform baixa_manual((select id from cobrancas where aluno_id = minha), 'dinheiro'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('8_aluno_nao_da_baixa', ok, '9_aluno_nao_ve_mensalidade_de_outro', (select count(*) from cobrancas where aluno_id in (minha, outra)) = 0);
  execute 'reset role';

  raise exception 'RESULTADO: %', r;
end $$;
