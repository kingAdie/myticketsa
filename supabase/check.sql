-- Paste this into Supabase -> SQL Editor -> Run. Every row should say true. Anything false: re-run supabase/setup.sql.

select 'table' as kind, t as name, to_regclass('public.' || t) is not null as ok
from unnest(array['events','ticket_types','event_tags','accommodations','accommodation_bookings','tickets','equipment_requests','profiles','seller_listings']) as t
union all
select 'column', c, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name || '.' || column_name = c)
from unnest(array['events.refund_policy','events.review_note','accommodations.owner_id','accommodations.refund_policy','seller_listings.images']) as c
union all
select 'photo bucket', 'listing-images', exists (select 1 from storage.buckets where id = 'listing-images')
union all
select 'admin function', 'is_admin()', to_regprocedure('public.is_admin()') is not null
union all
select 'row security on', t, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false)
from unnest(array['events','accommodations','seller_listings','tickets','profiles']) as t
order by 1, 2;
