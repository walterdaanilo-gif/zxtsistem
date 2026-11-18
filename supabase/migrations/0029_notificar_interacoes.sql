-- Notificações da Comunidade: comentário e curtida na minha publicação, resposta e curtida no meu comentário.
-- Tipo 'interacao' (a pessoa pode desligar em Configurar notificações). Curtida repetida no mesmo dia não gera aviso novo.
create or replace function public.notificar_interacao(p_user uuid, p_titulo text, p_corpo text, p_unico boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if p_unico and exists (select 1 from notificacoes where user_id = p_user and tipo = 'interacao' and titulo = left(p_titulo, 140)
                          and corpo is not distinct from left(p_corpo, 400) and created_at > now() - interval '1 day') then return; end if;
  perform notificar(p_user, 'interacao', p_titulo, p_corpo, '/app#/comunidade');
exception when others then null;
end $$;

create or replace function public.nome_curto(p_id uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(nome, ' ', 1), ''), 'Alguém') from profiles where id = p_id
$$;
create or replace function public.trecho(p_txt text, p_vazio text) returns text language sql immutable as $$
  select coalesce(nullif(left(regexp_replace(coalesce(p_txt, ''), '\s+', ' ', 'g'), 90), ''), p_vazio)
$$;

-- comentário novo: avisa o dono da publicação e, se for resposta, o dono do comentário respondido
create or replace function public.notif_comentario() returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; txt text; pai uuid; quem text := public.nome_curto(new.autor_id);
begin
  begin
    select autor_id, texto into dono, txt from posts where id = new.post_id;
    if new.resposta_de is not null then
      select autor_id into pai from comentarios where id = new.resposta_de;
      if pai is not null and pai <> new.autor_id then
        perform notificar_interacao(pai, quem || ' respondeu seu comentário', public.trecho(new.texto, 'Nova resposta'));
      end if;
    end if;
    if dono is not null and dono <> new.autor_id and dono is distinct from pai then
      perform notificar_interacao(dono, quem || ' comentou na sua publicação', public.trecho(new.texto, 'Novo comentário'));
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_comentarios on public.comentarios;
create trigger notif_comentarios after insert on public.comentarios for each row execute function public.notif_comentario();

-- curtida na publicação
create or replace function public.notif_curtida_post() returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; txt text;
begin
  begin
    select autor_id, texto into dono, txt from posts where id = new.post_id;
    if dono is not null and dono <> new.user_id then
      perform notificar_interacao(dono, public.nome_curto(new.user_id) || ' curtiu sua publicação', public.trecho(txt, 'Sua publicação com foto ou vídeo'), true);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_curtidas_post on public.post_curtidas;
create trigger notif_curtidas_post after insert on public.post_curtidas for each row execute function public.notif_curtida_post();

-- curtida no comentário
create or replace function public.notif_curtida_comentario() returns trigger language plpgsql security definer set search_path = public as $$
declare dono uuid; txt text;
begin
  begin
    select autor_id, texto into dono, txt from comentarios where id = new.comentario_id;
    if dono is not null and dono <> new.user_id then
      perform notificar_interacao(dono, public.nome_curto(new.user_id) || ' curtiu seu comentário', public.trecho(txt, 'Seu comentário'), true);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_curtidas_comentario on public.comentario_curtidas;
create trigger notif_curtidas_comentario after insert on public.comentario_curtidas for each row execute function public.notif_curtida_comentario();

revoke execute on function public.notificar_interacao, public.nome_curto, public.trecho from public, anon, authenticated;
