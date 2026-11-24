-- Prajied Prata (14º Khan) no Muay Thai; Paulo Zulu graduado nele; opção Prata no exame de graduação 2026.
-- Idempotente: pode rodar de novo sem duplicar.
do $$
declare mt uuid; n13 graduacao_niveis; nv uuid; ev uuid; adm uuid; paulo uuid;
begin
  select id into mt from modalidades where slug = 'muay-thai';
  select * into n13 from graduacao_niveis where modalidade_id = mt and ordem = 13;
  select id into nv from graduacao_niveis where modalidade_id = mt and ordem = 14;
  if nv is null then
    insert into graduacao_niveis (modalidade_id, nome, cor, cor2, ordem, graus_max, tempo_minimo_meses, aulas_minimas, infantil, categoria)
    values (mt, '14º Khan · Prata', '#C0C0C0', null, 14, n13.graus_max, n13.tempo_minimo_meses, n13.aulas_minimas, false, n13.categoria) returning id into nv;
  end if;
  select user_id into adm from user_roles where papel = 'admin' limit 1;
  select id into paulo from profiles where nome = 'Paulo Zulu' limit 1;
  if paulo is not null and not exists (select 1 from graduacoes_aluno where aluno_id = paulo and nivel_id = nv) then
    insert into graduacoes_aluno (aluno_id, modalidade_id, nivel_id, grau, data, professor_id, obs)
    values (paulo, mt, nv, 0, public.hoje_fortaleza(), adm, 'Atualizado pelo admin');
  end if;
  select id into ev from eventos where slug = 'graduacao-2026';
  if ev is not null and not exists (select 1 from evento_opcoes where evento_id = ev and nivel_id = nv) then
    update evento_opcoes set ordem = 15 where evento_id = ev and nome = 'Só participar do exame';
    insert into evento_opcoes (evento_id, nome, valor_centavos, nivel_id, ordem) values (ev, 'Prata (14º Khan)', null, nv, 14);
  end if;
end $$;
