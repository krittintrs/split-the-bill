# Anonymous reads go through one security-definer RPC, never table policies

Peers (no login, ADR-0002) read a published bill by calling a single Postgres function `get_bill(p_bill_id uuid)` — SECURITY DEFINER, `EXECUTE` granted to `anon` — which returns the full bill bundle (bill, line items, peers on the bill, ticks) as JSON **only when that exact id exists and `status = 'open'`**; otherwise `null`. All five tables carry **no anon policies at all**: the function is the only anonymous door, and it structurally cannot enumerate because it takes one id in and returns one bill out.

The trap this avoids: an RLS policy like `FOR SELECT TO anon USING (status = 'open')` *filters rows*, it does not verify the caller knew the id — PostgREST would happily serve `GET /rest/v1/bills?select=*` and list **every open bill in the database** to anyone holding the public key. The capability model (unguessable uuid = the key) only holds if presenting the id is mandatory on every path.

Peer *writes* in #9 (ticking) will follow the same shape: security-definer RPCs that take the bill id as proof of capability, validate `status = 'open'`, and touch only the intended rows.

**Considered options:** anon SELECT policies (the enumeration hole above); server-only reads with the service-role key (safe, but every peer interaction round-trips through Next.js server actions and browser Realtime subscriptions in #9 get much harder); forced Google login for peers (rejected again — without a per-bill email allowlist it's the same exposure with extra clicks, and the allowlist means typing 8 emails at a lunch table; see ADR-0002).
