-- #24 / ADR-0010: the organizer joins their own bill as a marked self-peer.
--
-- linked_user_id is the column ADR-0005 reserved for peer accounts. It carries
-- one meaning in both uses: this Peer record IS that auth user. The organizer's
-- self-peer is a pre-claimed peer, so #12's Account Claim inherits the column.
--
-- on delete set null, NOT cascade: if a claimed peer's account is ever deleted,
-- the organizer keeps the contact and its history. The organizer's own self-peer
-- is removed anyway by the existing organizer_id cascade.
alter table peers add column linked_user_id uuid references auth.users (id) on delete set null;

-- At most one row per (organizer, linked user): one self-peer per organizer, and
-- #12's "claim once per organizer". Partial, so ordinary peers stay unconstrained.
create unique index peers_one_row_per_linked_user
  on peers (organizer_id, linked_user_id)
  where linked_user_id is not null;

-- The organizer's peer-facing name. Not account_name, which is the bank account
-- holder name shown for payer confirmation (ADR-0009).
alter table profiles add column display_name text not null default '';

-- get_bill gains isSelf so the peer view can suppress claim + payback on the
-- organizer's row. Everything else is copied verbatim from 20260726000000.
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
      'promptpayId', b.promptpay_id,
      'bankName', b.bank_name,
      'bankAccount', b.bank_account,
      'accountName', b.account_name
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
        'id', p.id, 'name', p.name, 'paidAt', bp.paid_at, 'addedAt', bp.added_at,
        'isSelf', (p.linked_user_id is not null and p.linked_user_id = b.organizer_id)
      ) order by bp.added_at, p.id), '[]'::jsonb)
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
