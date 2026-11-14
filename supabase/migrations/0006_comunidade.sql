-- Comunidade: quem postou pode apagar os próprios arquivos; admin apaga qualquer um.
drop policy if exists st_com_apagar on storage.objects;
create policy st_com_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'comunidade' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- denúncia: uma por pessoa por post/comentário
create unique index if not exists denuncias_unica_post on public.denuncias (autor_id, post_id) where comentario_id is null;
create unique index if not exists denuncias_unica_comentario on public.denuncias (autor_id, comentario_id) where comentario_id is not null;
