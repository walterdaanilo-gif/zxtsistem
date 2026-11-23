-- Aula experimental nova notifica a administração. Tudo é desfeito no final.
do $$
declare adm uuid; n int; l uuid;
begin
  select user_id into adm from user_roles where papel = 'admin' limit 1;
  select count(*) into n from notificacoes where user_id = adm and tipo = 'experimental';
  l := criar_lead('Teste Notificacao Silva', '84999990000', 20, 'muay-thai', (select id from turmas where nome = 'Muay Thai · Turma 1' and ativa limit 1), 'site');
  raise exception 'RESULTADO antes=% depois=%', n, (select count(*) from notificacoes where user_id = adm and tipo = 'experimental');
end $$;
