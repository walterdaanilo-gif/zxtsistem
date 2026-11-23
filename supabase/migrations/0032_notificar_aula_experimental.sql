-- Toda aula experimental nova (pelo site) avisa a administração no sino e no celular.
create or replace function public.notif_lead() returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid; mod text; tur text; corpo text;
begin
  begin
    select nome into mod from modalidades where id = new.modalidade_id;
    select nome into tur from turmas where id = new.turma_id;
    corpo := concat_ws(' · ', nullif(coalesce(tur, mod), ''), nullif(new.whatsapp, ''), case when new.idade is not null then new.idade || ' anos' end);
    for u in select distinct user_id from user_roles where papel = 'admin' loop
      perform notificar(u, 'experimental', 'Nova aula experimental: ' || coalesce(nullif(split_part(new.nome, ' ', 1), ''), 'visitante'),
                        coalesce(nullif(corpo, ''), new.nome), '/app#/leads');
    end loop;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notif_leads on public.leads;
create trigger notif_leads after insert on public.leads for each row execute function public.notif_lead();
