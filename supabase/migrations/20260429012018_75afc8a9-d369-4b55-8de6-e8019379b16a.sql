create or replace function public.get_broadcast_audience_stats(_channel_id uuid)
returns table(audience_size bigint, push_ready bigint)
language sql stable security definer set search_path = public
as $$
  with subs as (
    select bs.user_id
    from public.broadcast_subscribers bs
    join public.broadcast_channels bc on bc.id = bs.channel_id
    where bs.channel_id = _channel_id
      and bs.user_id <> bc.owner_id
  )
  select
    (select count(*) from subs) as audience_size,
    (select count(distinct ps.user_id)
       from public.push_subscriptions ps
       where ps.user_id in (select user_id from subs)) as push_ready;
$$;