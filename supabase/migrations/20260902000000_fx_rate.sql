-- #38: optional per-bill Purchase Currency + FX Rate (manual, exact fraction, never fetched
-- live). Both null = a pure-THB bill, unchanged from before this migration.
alter table bills
  add column purchase_currency text,
  add column fx_rate_numerator integer,
  add column fx_rate_denominator integer,
  add constraint bills_fx_rate_together check (
    (purchase_currency is null and fx_rate_numerator is null and fx_rate_denominator is null)
    or (purchase_currency is not null and fx_rate_numerator is not null and fx_rate_denominator is not null)
  ),
  add constraint bills_fx_rate_positive check (
    fx_rate_numerator is null or (fx_rate_numerator > 0 and fx_rate_denominator > 0)
  );

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
      'accountName', b.account_name,
      'roundingAbsorberPeerId', b.rounding_absorber_peer_id,
      'purchaseCurrency', b.purchase_currency,
      'fxRateNumerator', b.fx_rate_numerator,
      'fxRateDenominator', b.fx_rate_denominator
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
