-- Sparring é de toda a equipe; Comunidade é de todos. Tudo é desfeito no final.
do $$
declare
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); lead uuid;
  tsp uuid; t2 uuid; ausp uuid; post uuid; r jsonb := '{}'::jsonb; ok boolean;
begin
  select id into tsp from turmas where coletiva and sparring limit 1;
  select id into t2 from turmas where ativa and not coletiva order by id limit 1;
  insert into auth.users (id, email, aud, role) values (p1, 'sp1@zxt.test', 'authenticated', 'authenticated'),
    (p2, 'sp2@zxt.test', 'authenticated', 'authenticated'), (a2, 'sa2@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (p1, 'professor'), (p2, 'professor');
  update profiles set status = 'ativo' where id in (p1, p2, a2);
  update turmas set professor_id = p2 where id = t2;
  update turmas set professor_id = p2 where id = tsp;            -- mesmo com professor definido, é de todos
  insert into matriculas values (a2, t2);
  insert into aulas (turma_id, data, inicio, fim) values (tsp, current_date + 400, now() + interval '400 days', now() + interval '400 days 1 hour') returning id into ausp;
  insert into reservas (aula_id, aluno_id) values (ausp, a2);
  insert into cobrancas (aluno_id, descricao, vencimento, valor_centavos, status) values (a2, 'T', current_date, 5000, 'em_aberto');
  insert into leads (nome, whatsapp, turma_id, origem) values ('Experimental Sparring', '84999990001', tsp, 'instagram') returning id into lead;
  insert into posts (autor_id, texto) values (p2, 'aviso para todos') returning id into post;

  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object(
    '1_prof1_ve_aula_de_sparring', public.minha_aula(ausp),
    '2_prof1_ve_reservas_do_sparring', (select count(*) from reservas where aula_id = ausp) = 1,
    '3_prof1_ve_aluno_que_reservou_sparring', (select count(*) from profiles where id = a2) = 1,
    '4_prof1_ve_experimental_de_sparring', (select count(*) from leads where id = lead) = 1,
    '5_prof1_nao_ve_financeiro_desse_aluno', (select count(*) from cobrancas where aluno_id = a2) = 0,
    '6_comunidade_posts_visiveis', (select count(*) from posts where id = post) = 1,
    '7_comunidade_perfis_visiveis', (select count(*) from perfis_publicos() where id = a2) = 1);
  begin perform marcar_presenca(ausp, a2, true); ok := true; exception when others then ok := false; end;
  r := r || jsonb_build_object('8_prof1_faz_chamada_do_sparring', ok);
  begin insert into comentarios (post_id, autor_id, texto) values (post, p1, 'oi'); ok := true; exception when others then ok := false; end;
  r := r || jsonb_build_object('9_prof1_comenta_na_comunidade', ok);
  begin perform baixa_manual((select id from cobrancas where aluno_id = a2 limit 1), 'dinheiro'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('10_mas_financeiro_do_aluno_continua_do_outro_prof', ok);
  execute 'reset role';
  raise exception 'RESULTADO: %', jsonb_pretty(r);
end $$;
