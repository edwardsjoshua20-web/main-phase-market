create or replace function public.set_app_entities_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_app_entities_updated_at on public.app_entities;

create trigger set_app_entities_updated_at
before update on public.app_entities
for each row
execute function public.set_app_entities_updated_date();
