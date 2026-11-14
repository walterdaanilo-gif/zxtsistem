-- Prajieds do Muay Thai conforme a tabela da Confederação Brasileira de Muaythai,
-- do 1º Khan (branco) ao 13º Khan (preto ponta branca).
alter table public.graduacao_niveis add column if not exists cor2 text;        -- segunda cor (ponta)
alter table public.graduacao_niveis add column if not exists categoria text;   -- Iniciante, Intermediário...

delete from public.graduacao_niveis
where modalidade_id = (select id from public.modalidades where slug = 'muay-thai')
  and not exists (select 1 from public.graduacoes_aluno g where g.nivel_id = graduacao_niveis.id);

insert into public.graduacao_niveis (modalidade_id, nome, cor, cor2, ordem, categoria)
select m.id, n.nome, n.cor, n.cor2, n.ordem, n.categoria
from public.modalidades m,
  (values
    ('1º Khan · Branco',                 '#FFFFFF', null,      1,  'Iniciante'),
    ('2º Khan · Amarelo',                '#F2B33D', null,      2,  'Iniciante'),
    ('3º Khan · Amarelo ponta branca',   '#F2B33D', '#FFFFFF', 3,  'Iniciante'),
    ('4º Khan · Verde',                  '#4E8A64', null,      4,  'Iniciante'),
    ('5º Khan · Verde ponta branca',     '#4E8A64', '#FFFFFF', 5,  'Intermediário'),
    ('6º Khan · Azul',                   '#22196B', null,      6,  'Intermediário'),
    ('7º Khan · Azul ponta branca',      '#22196B', '#FFFFFF', 7,  'Intermediário'),
    ('8º Khan · Marrom',                 '#6B3A22', null,      8,  'Avançado'),
    ('9º Khan · Marrom ponta branca',    '#6B3A22', '#FFFFFF', 9,  'Avançado'),
    ('10º Khan · Vermelho',              '#C8352A', null,      10, 'Avançado'),
    ('11º Khan · Vermelho ponta branca', '#C8352A', '#FFFFFF', 11, 'Instrutor em treinamento'),
    ('12º Khan · Preto',                 '#000000', null,      12, 'Instrutor auxiliar'),
    ('13º Khan · Preto ponta branca',    '#000000', '#FFFFFF', 13, 'Instrutor')
  ) as n(nome, cor, cor2, ordem, categoria)
where m.slug = 'muay-thai';
