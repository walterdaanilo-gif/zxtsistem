-- Foto de perfil: o envio com substituição (upsert) precisa de permissão de leitura e de
-- exclusão na própria pasta. Sem isso o Storage responde "new row violates row-level security policy".
drop policy if exists st_avatar_ler on storage.objects;
create policy st_avatar_ler on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists st_avatar_apagar on storage.objects;
create policy st_avatar_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
