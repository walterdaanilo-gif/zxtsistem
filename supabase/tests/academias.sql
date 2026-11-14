-- Academias: admin cadastra, professor só lê, aluno não vê. Tudo é desfeito.
do $$
declare
  admin_id uuid := (select user_id from user_roles where papel = 'admin' limit 1);
  pf uuid := gen_random_uuid(); al uuid := gen_random_uuid(); r jsonb := '{}'::jsonb; n int; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values (pf, 'acp@zxt.test', 'authenticated', 'authenticated'), (al, 'aca@zxt.test', 'authenticated', 'authenticated');
  insert into user_roles values (pf, 'professor');
  update profiles set status = 'ativo' where id in (pf, al);

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into academias (nome) values ('Academia Teste X');
  update professores_evento set academia_id = (select id from academias where nome = 'Academia Teste X') where nome = 'Thiago';
  execute 'reset role';
  r := r || jsonb_build_object('1_admin_cadastra_e_liga', (select a.nome = 'Academia Teste X' from professores_evento p join academias a on a.id = p.academia_id where p.nome = 'Thiago'));

  perform set_config('request.jwt.claims', json_build_object('sub', pf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from academias where nome = 'Academia Teste X';
  r := r || jsonb_build_object('2_professor_le', n = 1);
  begin insert into academias (nome) values ('Hack'); ok := false; exception when others then ok := true; end;
  r := r || jsonb_build_object('3_professor_nao_cadastra', ok);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', al, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from academias;
  r := r || jsonb_build_object('4_aluno_nao_ve', n = 0);
  execute 'reset role';
  raise exception 'RESULTADO: %', r;
end $$;
