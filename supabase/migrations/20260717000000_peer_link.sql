-- #9 peer link: locked status, paid flag, anon write RPCs (ADR-0006), broadcast pings (ADR-0007)

alter table bills drop constraint bills_status_check;
alter table bills add constraint bills_status_check
  check (status in ('draft', 'open', 'locked'));

alter table bill_peers add column paid_at timestamptz;

-- get_bill now serves open AND locked (peers must still see a locked bill),
-- returns status + per-peer paidAt. Draft/nonexistent stay null (no enumeration).
create or replace function get_bill(p_bill_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'bill', jsonb_build_object(
      'id', b.id, 'restaurant', b.restaurant, 'eatenAt', b.eaten_at,
      'status', b.status,
      'billDiscountPercent', b.bill_discount_percent,
      'billDiscountSatang', b.bill_discount_satang,
      'serviceChargePercent', b.service_charge_percent,
      'vatPercent', b.vat_percent,
      'receiptTotalSatang', b.receipt_total_satang,
      'paymentInfo', b.payment_info,
      'paymentMethod', b.payment_method
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', li.id, 'name', li.name, 'unitPriceSatang', li.unit_price_satang,
        'qty', li.qty, 'discountPercent', li.discount_percent,
        'discountSatang', li.discount_satang, 'position', li.position
      ) order by li.position), '[]'::jsonb)
      from line_items li where li.bill_id = b.id
    ),
    'peers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'paidAt', bp.paid_at
      )), '[]'::jsonb)
      from bill_peers bp join peers p on p.id = bp.peer_id where bp.bill_id = b.id
    ),
    'ticks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lineItemId', t.line_item_id, 'peerId', t.peer_id
      )), '[]'::jsonb)
      from ticks t join line_items li on li.id = t.line_item_id where li.bill_id = b.id
    )
  )
  from bills b
  where b.id = p_bill_id and b.status in ('open', 'locked');
$$;

-- Anon tick write. Bill id = capability proof; item + peer must belong to THAT bill.
-- Ticking allowed only while open (locked freezes ticks — grill decision 2026-07-16).
create or replace function set_tick(
  p_bill_id uuid, p_line_item_id uuid, p_peer_id uuid, p_on boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bills b
    join line_items li on li.bill_id = b.id and li.id = p_line_item_id
    join bill_peers bp on bp.bill_id = b.id and bp.peer_id = p_peer_id
    where b.id = p_bill_id and b.status = 'open'
  ) then
    raise exception 'bill not open or item/peer not on bill';
  end if;

  if p_on then
    insert into ticks (line_item_id, peer_id) values (p_line_item_id, p_peer_id)
    on conflict do nothing;
  else
    delete from ticks where line_item_id = p_line_item_id and peer_id = p_peer_id;
  end if;
end;
$$;

-- Anon paid toggle. Allowed while open OR locked (paying happens after lock).
create or replace function set_paid(
  p_bill_id uuid, p_peer_id uuid, p_paid boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bills b
    join bill_peers bp on bp.bill_id = b.id and bp.peer_id = p_peer_id
    where b.id = p_bill_id and b.status in ('open', 'locked')
  ) then
    raise exception 'bill not open/locked or peer not on bill';
  end if;

  update bill_peers
  set paid_at = case when p_paid then now() else null end
  where bill_id = p_bill_id and peer_id = p_peer_id;
end;
$$;

revoke all on function set_tick(uuid, uuid, uuid, boolean) from public;
revoke all on function set_paid(uuid, uuid, boolean) from public;
grant execute on function set_tick(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function set_paid(uuid, uuid, boolean) to anon, authenticated;

-- ADR-0007: broadcast an empty "changed" ping to bill:<id> on every write path.
-- Broadcast failure must never abort the write.
create or replace function notify_bill_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill_id uuid;
  rec record;
begin
  rec := coalesce(new, old);
  if tg_table_name = 'bills' then
    v_bill_id := rec.id;
  elsif tg_table_name in ('line_items', 'bill_peers') then
    v_bill_id := rec.bill_id;
  elsif tg_table_name = 'ticks' then
    select li.bill_id into v_bill_id from line_items li where li.id = rec.line_item_id;
  end if;

  if v_bill_id is not null then
    begin
      perform realtime.send('{}'::jsonb, 'changed', 'bill:' || v_bill_id, false);
    exception when others then
      null; -- never block the write on a broadcast failure
    end;
  end if;
  return null;
end;
$$;

create trigger ticks_notify after insert or delete on ticks
  for each row execute function notify_bill_changed();
create trigger bill_peers_notify after insert or update or delete on bill_peers
  for each row execute function notify_bill_changed();
create trigger bills_notify after update on bills
  for each row execute function notify_bill_changed();
create trigger line_items_notify after insert or update or delete on line_items
  for each row execute function notify_bill_changed();
