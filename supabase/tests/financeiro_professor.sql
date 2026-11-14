-- Professor vê o financeiro só dos alunos das turmas dele. Tudo é desfeito no final.
do $$
declare
  pf uuid := gen_random_uuid(); minha uuid := gen_random_uuid(); outra uuid := gen_random_uuid(); livre uuid := gen_random_uuid();
  t1 uuid := (select id from turmas where nome = 'Muay Thai · Turma 1'); bx uuid := (select id from turmas where nome = 'Boxe · Turma 2');
  pl uuid; r jsonb := '{}'::jsonb; ok boolean;
begin
  insert into planos (nome, valor_centavos, max_turmas) values ('T fin', 7000, 1) returning id into pl;
  insert into auth.users (id, email, aud, role) values (pf, 'fp@zxt.test', 'authenticated', 'authenticated'), (minha, 'fm@zxt.test', 'authenticated', 'authenticated'),
    (outra, 'fo@zxt.test', 'authenticated', 'authenticated'), (livre, 'fl@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo' where id in (pf, minha, outra, livre);
  update turmas set professor_id = pf where id = t1;
  update turmas set professor_id = null where id = bx;
  insert into matriculas values (minha, t1), (outra, bx);
  insert into assinaturas (aluno_id, plano_id) values (minha, pl), (outra, pl);
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values
    (minha, 'T', current_date - 5, 7000, 'atrasado'), (outra, 'O', current_date, 7000, 'em_aberto'), (livre, 'L', current_date, 7000, 'em_aberto');
  insert into despesas (descricao, categoria, valor_centavos) values ('aluguel', 'aluguel', 100000);

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '1_ve_cobranca_do_aluno_da_turma', (select count(*) from cobrancas where aluno_id = minha) = 1,
    '2_nao_ve_aluno_de_outra_turma', (select count(*) from cobrancas where aluno_id = outra) = 0,
    '3_nao_ve_aluno_sem_turma', (select count(*) from cobrancas where aluno_id = livre) = 0,
    '4_ve_plano_do_aluno', (select count(*) from assinaturas where aluno_id = minha) = 1,
    '5_nao_ve_despesas', (select count(*) from despesas) = 0);
  begin perform baixa_manual((select id from cobrancas where aluno_id = minha), 'dinheiro'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('6_nao_da_baixa', ok);
  update cobrancas set status = 'pago' where aluno_id = minha;
  execute 'reset role';
  r := r || jsonb_build_object('7_nao_altera_cobranca', (select status from cobrancas where aluno_id = minha) = 'atrasado');

  raise exception 'RESULTADO: %', r;
end $$;
