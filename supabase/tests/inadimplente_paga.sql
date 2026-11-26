-- Aluno bloqueado por atraso continua vendo a própria mensalidade para pagar (e só ela). Tudo é desfeito no final.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); pl uuid; c1 uuid; r jsonb := '{}'::jsonb; j jsonb; ok boolean;
begin
  select id into pl from planos where ativo limit 1;
  insert into auth.users (id, email, aud, role) values (a, 'ip1@zxt.test', 'authenticated', 'authenticated'), (b, 'ip2@zxt.test', 'authenticated', 'authenticated');
  update profiles set status = 'ativo' where id in (a, b);
  insert into assinaturas (aluno_id, plano_id, dia_vencimento) values (a, pl, 10), (b, pl, 10);
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (a, 'Atrasada', current_date - 16, 7000, 'atrasado') returning id into c1;
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (b, 'Outro', current_date - 16, 7000, 'atrasado');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := meu_bloqueio();
  r := r || jsonb_build_object('1_esta_bloqueado', (j->>'bloqueado')::boolean, '2_ve_o_valor_em_atraso', (j->>'total_centavos')::int = 7000,
    '3_ve_a_propria_mensalidade', (select count(*) from cobrancas where id = c1) = 1, '4_nao_ve_a_de_outro', (select count(*) from cobrancas where aluno_id = b) = 0,
    '5_ve_o_plano', jsonb_array_length(coalesce(meu_plano()::jsonb, '[]'::jsonb)) >= 0);
  begin perform reservar_aula((select id from aulas limit 1)); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('6_reserva_continua_bloqueada', ok);
  execute 'reset role';
  raise exception 'RESULTADO: %', jsonb_pretty(r);
end $$;
