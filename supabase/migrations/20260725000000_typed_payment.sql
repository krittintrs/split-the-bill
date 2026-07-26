-- #10 payback: typed payment fields (ADR-0009). Replaces free-form payment_info/payment_method.
alter table profiles add column promptpay_id text not null default '';
alter table profiles add column bank_name text not null default '';
alter table profiles add column bank_account text not null default '';
alter table profiles add column account_name text not null default '';

alter table bills add column promptpay_id text not null default '';
alter table bills add column bank_name text not null default '';
alter table bills add column bank_account text not null default '';
alter table bills add column account_name text not null default '';

-- Carry over legacy bill data (ADR-0009): promptpay keyword OR (blank method + 10-digit 0-phone),
-- with a valid 10/13/15 length -> promptpay_id; everything else -> bank_account (+ bank_name).
update bills set promptpay_id = payment_info
where payment_info ~ '^[0-9]+$'
  and char_length(payment_info) in (10, 13, 15)
  and (
    payment_method ilike '%promptpay%'
    or payment_method ilike '%promptay%'
    or payment_method ilike '%พร้อมเพย์%'
    or (payment_method = '' and char_length(payment_info) = 10 and payment_info like '0%')
  );

update bills
set bank_account = payment_info,
    bank_name = payment_method
where promptpay_id = '' and payment_info <> '';

alter table bills drop column payment_info;
alter table bills drop column payment_method;
alter table profiles drop column payment_info;

-- Rebuild get_bill (ADR-0006: still the only anon door) with typed fields.
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
