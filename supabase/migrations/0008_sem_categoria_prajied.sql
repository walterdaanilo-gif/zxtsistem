-- A ZXT não usa a categoria (Iniciante, Intermediário...) nos prajieds.
update public.graduacao_niveis set categoria = null
where modalidade_id = (select id from public.modalidades where slug = 'muay-thai');
