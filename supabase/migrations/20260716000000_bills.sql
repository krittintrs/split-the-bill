-- Split the Bill: #8 schema (ADR-0005) + anon door (ADR-0006)
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payment_info text not null default ''
);

create table peers (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  last_used_at timestamptz not null default now(),
  unique (organizer_id, name)
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  restaurant text not null default '',
  eaten_at date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'open')),
  bill_discount_percent int not null default 0 check (bill_discount_percent between 0 and 100),
  bill_discount_satang int not null default 0 check (bill_discount_satang >= 0),
  service_charge_percent int not null default 0 check (service_charge_percent between 0 and 100),
  vat_percent int not null default 0 check (vat_percent between 0 and 100),
  receipt_total_satang int not null default 0 check (receipt_total_satang >= 0),
  payment_info text not null default '',
  created_at timestamptz not null default now()
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id) on delete cascade,
  name text not null default '',
  unit_price_satang int not null default 0 check (unit_price_satang >= 0),
  qty int not null default 1 check (qty >= 1),
  discount_percent int not null default 0 check (discount_percent between 0 and 100),
  discount_satang int not null default 0 check (discount_satang >= 0),
  position int not null default 0
);

create table bill_peers (
  bill_id uuid not null references bills (id) on delete cascade,
  peer_id uuid not null references peers (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (bill_id, peer_id)
);

create table ticks (
  line_item_id uuid not null references line_items (id) on delete cascade,
  peer_id uuid not null references peers (id) on delete cascade,
  primary key (line_item_id, peer_id)
);

-- RLS: organizer-only on every table; anon gets NOTHING except the RPC.
alter table profiles enable row level security;
alter table peers enable row level security;
alter table bills enable row level security;
alter table line_items enable row level security;
alter table bill_peers enable row level security;
alter table ticks enable row level security;

create policy "own profile" on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own peers" on peers for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "own bills" on bills for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "own line_items" on line_items for all to authenticated
  using (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()))
  with check (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()));
create policy "own bill_peers" on bill_peers for all to authenticated
  using (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()))
  with check (
    exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid())
    and exists (select 1 from peers p where p.id = peer_id and p.organizer_id = auth.uid())
  );
create policy "own ticks" on ticks for all to authenticated
  using (exists (
    select 1 from line_items li join bills b on b.id = li.bill_id
    where li.id = line_item_id and b.organizer_id = auth.uid()
  ))
  with check (
    exists (
      select 1 from line_items li join bills b on b.id = li.bill_id
      where li.id = line_item_id and b.organizer_id = auth.uid()
    )
    and exists (select 1 from peers p where p.id = peer_id and p.organizer_id = auth.uid())
  );

-- ADR-0006: the ONLY anonymous door. One id in, one open bill out, no enumeration.
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
      'billDiscountPercent', b.bill_discount_percent,
      'billDiscountSatang', b.bill_discount_satang,
      'serviceChargePercent', b.service_charge_percent,
      'vatPercent', b.vat_percent,
      'receiptTotalSatang', b.receipt_total_satang,
      'paymentInfo', b.payment_info
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
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
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
  where b.id = p_bill_id and b.status = 'open';
$$;

revoke all on function get_bill(uuid) from public;
grant execute on function get_bill(uuid) to anon, authenticated;
