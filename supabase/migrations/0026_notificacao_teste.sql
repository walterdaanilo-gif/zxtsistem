-- Botão "mandar notificação de teste" (só para a própria pessoa)
create or replace function public.notificacao_teste() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  insert into notificacoes (user_id, tipo, titulo, corpo, link)
  values (auth.uid(), 'geral', 'Teste da ZXT 🥊', 'Se você recebeu isto no celular, as notificações estão funcionando.', '/app#/notificacoes');
end $$;
revoke execute on function public.notificacao_teste from public, anon;
grant execute on function public.notificacao_teste to authenticated;
