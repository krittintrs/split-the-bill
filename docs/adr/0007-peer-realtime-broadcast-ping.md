# Peer realtime = broadcast ping + refetch, not postgres_changes

Peers watching a bill (`/b/[id]`, anonymous) get live updates through a **Supabase Realtime
Broadcast channel named `bill:<uuid>`** — the unguessable bill id doubles as the channel
capability, exactly like `get_bill` (ADR-0006). Postgres triggers on `ticks`, `bill_peers`,
`bills`, and `line_items` call `realtime.send()` with an **empty "changed" ping**; every
subscribed browser responds by refetching `get_bill` and re-rendering from that single
source of truth. The ping is an invalidation signal, never data: clients hold no shadow
state and never merge (poke + pull).

Why not the standard path: Supabase's `postgres_changes` subscriptions **respect RLS**, and
ADR-0006 deliberately gives `anon` zero table read policies — an anonymous subscriber would
connect successfully and receive nothing, silently. Granting anon SELECT policies to feed
the subscription would reopen the exact enumeration hole ADR-0006 closed.

Why triggers rather than client-side broadcasts after each mutation: the organizer's editor
writes tables directly (RLS path, `mutations.ts`), while peers write through RPCs — a
database trigger covers **every** write path with one mechanism and cannot be forgotten by
a future caller. Broadcast failures must never abort the write itself (wrap `realtime.send`
in an exception handler).

**Considered options:** `postgres_changes` + anon SELECT policies (enumeration hole);
client-side broadcast after each mutation (misses the editor's direct writes, ping lost if
the client dies mid-flight); polling every ~2s (meets the latency bar, wasteful and not
realtime); delta payloads instead of pings (faster but adds client merge logic and
missed-message recovery — wrong trade for a ~2 KB bill; see `docs/TEACH-realtime-messaging.md`).
