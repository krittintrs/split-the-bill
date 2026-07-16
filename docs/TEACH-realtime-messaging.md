# Teach Session: Realtime Messaging Patterns

> Handoff for a future teaching session. Learner = project owner (krittintrs), learning
> web architecture concepts while building. Explain concepts plainly, avoid unexplained
> jargon, use this repo's own realtime design (#9) as the running example.

## Why this doc exists

During the #9 grilling session (2026-07-16) we chose a realtime design for peer ticking.
The owner asked "is this industry standard? what about sockets?" — good instinct, worth a
deeper teach session later. This doc captures the syllabus so a fresh session can teach it
without re-deriving context.

## What was decided (context, not the lesson)

- Anon peers cannot use Supabase `postgres_changes` subscriptions: ADR-0006 gives anon
  zero table read policies, and `postgres_changes` respects RLS.
- Chosen design: **public Broadcast channel per bill** (`bill:<uuid>`, unguessable uuid =
  capability, same model as `get_bill`). Postgres triggers call `realtime.send()` with an
  empty "changed" ping; every subscribed browser refetches `get_bill`. Ping = invalidation
  signal, never data, so the client never merges state (CLAUDE.md: no shadow state).
- See ADR-0006 (`docs/adr/0006-anon-read-security-definer-rpc.md`) and the #9 plan/ADR
  once written. Don't re-explain the decision in the teach session; teach the landscape
  it sits in.

## Syllabus

1. **Transport layer — how bytes move**
   - WebSocket: persistent 2-way TCP connection; what Supabase Realtime is under the hood
     (Phoenix Channels / Elixir). socket.io = self-hosted flavor + fallbacks.
   - SSE (Server-Sent Events): one-way HTTP push; where it beats websockets (feeds,
     notifications) and where it doesn't (2-way).
   - Long/short polling: the fallback tier; why it still exists.
   - Why serverless (Vercel functions) can't hold websocket connections → managed pub/sub
     services (Pusher, Ably, Firebase, Supabase Realtime) are the small-team industry answer.

2. **Message pattern — what to send** (the more interesting layer)
   - Tier 1, **poke + pull** (this repo): push "changed", client refetches truth.
     Name popularized by Replicache. Unbreakable consistency, zero merge logic.
   - Tier 2, **deltas**: push the actual change, client patches local state. Faster, but
     introduces merge bugs and missed-message recovery (sequence numbers, resync).
   - Tier 3, **sync engines / CRDTs**: offline-first local DB, conflict resolution
     (Linear, Figma; Yjs, Liveblocks, Zero, Electric). Heavy machinery.
   - Rule of thumb: small doc + few writers → tier 1. Discuss when a bill app would ever
     need tier 2 (it wouldn't; a collaborative text editor would need tier 3).

3. **Database as event source**
   - Postgres LISTEN/NOTIFY: the decades-old ancestor of `realtime.send()`.
   - Trigger-based fan-out vs application-code fan-out: why triggers cover every write
     path (RPCs *and* the organizer's direct table writes) with one mechanism.

4. **Security of channels**
   - Capability URL model extended to channel names: unguessable topic = the key.
   - Public vs private Realtime channels; when private channels + RLS on
     `realtime.messages` would be needed instead.

## Suggested skills for the teach session

- None required — chat-only lesson. Optionally `/recap` first if the session also
  continues project work.
- If the owner wants to stress-test understanding afterwards: `/scrutinize` the shipped
  #9 realtime implementation against tier-1 claims (does every write path really poke?).

## Prereqs the learner already has

Understands: capability URLs, RLS + SECURITY DEFINER RPCs (ADR-0006), integer-satang
engine, Next.js server/client component split (learned during #9: server shell for first
paint + client component for subscription).
