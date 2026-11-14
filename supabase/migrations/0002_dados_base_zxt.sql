-- Dados reais da ZXT (seção 0 do briefing). Itens sem informação ficam marcados TODO_ZXT.

-- usuário admin que já existia no projeto
insert into public.profiles (id, email, status, aprovado_em)
select id, email, 'ativo', now() from auth.users
on conflict (id) do update set status = 'ativo';
insert into public.user_roles (user_id, papel)
select id, 'admin' from auth.users on conflict do nothing;

-- modalidades
insert into public.modalidades (slug, nome, sistema, icone, ordem) values
  ('muay-thai','Muay Thai','prajied','muaythai',1),
  ('boxe','Boxe','nivel','boxe',2),
  ('mma','MMA','nivel','mma',3),
  ('jiu-jitsu','Jiu-Jitsu','faixa','jiujitsu',4);

-- Muay Thai: PRAJIED (nunca "faixa"). Cores: TODO_ZXT
insert into public.graduacao_niveis (modalidade_id, nome, cor, ordem)
select id, n.nome, n.cor, n.ordem from public.modalidades m,
  (values ('Prajied 1 · TODO_ZXT cor','#ffffff',1),('Prajied 2 · TODO_ZXT cor','#cccccc',2),
          ('Prajied 3 · TODO_ZXT cor','#999999',3),('Prajied 4 · TODO_ZXT cor','#666666',4),
          ('Prajied 5 · TODO_ZXT cor','#333333',5),('Prajied 6 · TODO_ZXT cor','#e1141e',6)) n(nome,cor,ordem)
where m.slug = 'muay-thai';

-- Jiu-Jitsu: faixas adultas e infantis, 4 graus cada. Tempo mínimo e aulas: TODO_ZXT
insert into public.graduacao_niveis (modalidade_id, nome, cor, ordem, graus_max, infantil)
select id, n.nome, n.cor, n.ordem, 4, n.inf from public.modalidades m,
  (values ('Branca','#f5f5f5',1,false),('Azul','#1e50c8',2,false),('Roxa','#6b2fa0',3,false),
          ('Marrom','#6b3a1e',4,false),('Preta','#111111',5,false),
          ('Branca','#f5f5f5',1,true),('Cinza','#8a8a8a',2,true),('Amarela','#f2c21b',3,true),
          ('Laranja','#f07c1b',4,true),('Verde','#2f9e44',5,true)) n(nome,cor,ordem,inf)
where m.slug = 'jiu-jitsu';

-- Boxe e MMA: níveis configuráveis
insert into public.graduacao_niveis (modalidade_id, nome, cor, ordem)
select m.id, n.nome, n.cor, n.ordem from public.modalidades m,
  (values ('Nível 1 · Iniciante','#8a8a8a',1),('Nível 2 · Intermediário','#f2c21b',2),
          ('Nível 3 · Avançado','#e1141e',3),('Nível 4 · Competição','#111111',4)) n(nome,cor,ordem)
where m.slug in ('boxe','mma');

-- grade atual (0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex)
insert into public.turmas (modalidade_id, nome, dias_semana, hora_inicio, nivel, capacidade, coletiva, sparring)
select (select id from public.modalidades where slug = g.mod), g.nome, g.dias, g.hora, 'todos', 30, g.col, g.spar
from (values
  ('boxe','Boxe · Turma 1','{1,3}'::smallint[],'07:00'::time,false,false),
  ('boxe','Boxe · Turma 2','{2,4}','18:00',false,false),
  ('muay-thai','Muay Thai · Turma 1','{1,3}','19:00',false,false),
  ('muay-thai','Muay Thai · Turma 2','{1,3}','20:00',false,false),
  ('muay-thai','Muay Thai · Turma 3','{2,4}','06:00',false,false),
  (null,'Sparring · Toda a equipe','{5}','19:00',true,true)
) g(mod,nome,dias,hora,col,spar);
-- TODO_ZXT: turmas de MMA e Jiu-Jitsu (dias e horário)

-- promoção de turma nova (exemplo real de 17/09 a 17/10). TODO_ZXT: marcar quais turmas eram "novas"
insert into public.promocoes (nome, tipo, valor, inicio, fim, turma_ids, apenas_primeira_mensalidade, ativa)
values ('50% no primeiro mês · turmas novas', 'percentual', 50, '2026-09-17', '2026-10-17',
        array(select id from public.turmas where nova), true, true);

-- exame de graduação de Muay Thai 2026
insert into public.eventos (tipo, titulo, descricao, modalidade_id, inicio, local_nome, endereco, taxa_centavos, publico)
values ('exame_graduacao', 'Exame de graduação de Muay Thai 2026',
        'Dia de mostrar a evolução do ano. Alunos aptos, confirmem a inscrição com o professor.',
        (select id from public.modalidades where slug = 'muay-thai'),
        '2026-11-28 15:30:00-03', 'Local externo', 'Rua São Nicolau, 309, Felipe Camarão, Natal/RN',
        0, true);  -- TODO_ZXT: taxa e doação do exame

-- loja: camiseta Atleta 2026 (TODO_ZXT: preço e estoque real)
with p as (
  insert into public.produtos (nome, categoria, descricao, preco_centavos, ativo)
  values ('Camiseta ZXT Atleta 2026', 'camiseta', 'Dry fit, linha Atleta 2026', 0, false) returning id)
insert into public.produto_variacoes (produto_id, tamanho, estoque)
select p.id, t, 0 from p, unnest(array['P','M','G','GG']) t;

-- FAQ inicial
insert into public.faq (pergunta, resposta, ordem) values
  ('Como faço check-in?', 'Abra o sistema no celular, toque em Check-in e aponte a câmera para o QR code da recepção.', 1),
  ('Até quando posso cancelar uma reserva?', 'Até 2 horas antes da aula. Depois disso a vaga fica marcada como sua.', 2),
  ('Quem pode treinar no sparring de sexta?', 'Alunos de todas as turmas. É o treino coletivo da equipe, às 19h.', 3);

select public.gerar_aulas(14);
