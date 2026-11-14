-- Exame de graduação de Muay Thai 2026: formulário com as opções e valores que já estavam no Google Forms.
-- Opções sem valor no formulário antigo ficam "a confirmar" (valor nulo) até a administração definir.
update public.eventos set
  slug = 'graduacao-2026',
  pagamento = 'online',
  descricao = 'Dia de mostrar a evolução do ano no Muay Thai. Escolha o prajied que você vai fazer (confirme com seu professor) e garanta a inscrição.',
  campos = '{"cpf": true, "nascimento": true, "whatsapp": true, "email": false,
             "extras": [{"id": "professor", "rotulo": "Professor", "tipo": "opcoes", "obrigatorio": true, "opcoes": ["Thiago", "Zulu", "Ricardo", "Mauriltom"]}]}'::jsonb,
  mensagem_confirmacao = 'Inscrição recebida. Leve sua documentação e chegue com 30 minutos de antecedência.'
where tipo = 'exame_graduacao' and titulo = 'Exame de graduação de Muay Thai 2026';

insert into public.evento_opcoes (evento_id, nome, valor_centavos, nivel_id, ordem)
select e.id, x.nome, x.valor, (select n.id from public.graduacao_niveis n join public.modalidades m on m.id = n.modalidade_id
                               where m.slug = 'muay-thai' and n.ordem = x.nivel), x.ordem
from public.eventos e,
     (values ('Branco (1º Khan)', null::int, 1, 1), ('Amarelo (2º Khan)', 9000, 2, 2), ('Amarelo ponta branca (3º Khan)', 12000, 3, 3),
             ('Verde (4º Khan)', 15000, 4, 4), ('Azul ponta branca (7º Khan)', null, 7, 5), ('Só participar do exame', null, null, 6)) as x(nome, valor, nivel, ordem)
where e.slug = 'graduacao-2026'
  and not exists (select 1 from public.evento_opcoes o where o.evento_id = e.id);
