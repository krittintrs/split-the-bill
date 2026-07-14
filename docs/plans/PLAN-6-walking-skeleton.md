# Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Tasks marked **[HUMAN]** need the user in a browser console — pause and hand over.

**Issue:** #6
**Goal:** Production URL where an Organizer signs in/out with Google and sees an empty dashboard shell, with `npm run check` as the working quality gate.
**Architecture:** Next.js App Router (TS) + Tailwind scaffold in this repo; Supabase (Singapore) provides Postgres + Google OAuth via `@supabase/ssr` cookie sessions; Vercel deploys `main` automatically through its GitHub integration.
**Tech Stack:** Next.js 15+, TypeScript, Tailwind, Vitest, `@supabase/supabase-js` + `@supabase/ssr`, Vercel, Supabase.

## Global Constraints (from CLAUDE.md)

- Do NOT modify things not asked for; unsure → ask
- All bill math lives in `src/lib/billing/` as pure functions; money = integer satang, ฿ only at display edge, never float money math
- Organizer data behind RLS on `auth.uid()`; nothing peer-facing may require login (no peer surface in this ticket)
- Supabase = single source of truth; mobile-first UI
- Conventional Commits, subject < 50 chars; default branch `main`
- DoD: `npm run check` = lint + typecheck + unit tests, zero errors

## File Map

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` | scaffold + `check` script |
| `vitest.config.ts` | unit test runner (node env, `src/**/*.test.ts`) |
| `src/app/globals.css`, `src/app/layout.tsx` | Tailwind base + root layout |
| `src/app/page.tsx` | landing: sign-in button OR redirect to /dashboard |
| `src/app/dashboard/page.tsx` | empty authenticated shell (email + sign out) |
| `src/app/auth/callback/route.ts` | OAuth code → session exchange |
| `src/app/auth/actions.ts` | server actions: signInWithGoogle, signOut |
| `src/lib/supabase/client.ts` / `server.ts` | browser / server Supabase clients |
| `src/middleware.ts` | session refresh on every request |
| `src/lib/billing/money.ts` + `money.test.ts` | first pure fn `formatSatang` — establishes billing layer + TDD pattern |
| `.env.local` (untracked), `.env.example` (tracked) | Supabase keys |
| `docs/STATUS.md` | row #6 → DONE at the end |

---

### Task 1: Scaffold Next.js into the existing repo

**Files:** Create: all scaffold files above (except auth/billing). Modify: `.gitignore` (merge).

**Interfaces:** Produces the repo layout (`src/app/*`, `@/*` alias) every later task assumes.

- [x] **Step 1: Scaffold in a temp dir** (create-next-app refuses non-empty dirs)

```bash
cd /Users/krittintrs/Documents/vibe/split-the-bill
npx create-next-app@latest .tmp-scaffold --ts --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --no-git
```

- [x] **Step 2: Merge scaffold into repo root**

```bash
cat .gitignore .tmp-scaffold/.gitignore | awk 'NF' | sort -u > .gitignore.merged && mv .gitignore.merged .gitignore
rm .tmp-scaffold/.gitignore .tmp-scaffold/README.md
cp -R .tmp-scaffold/. . && rm -rf .tmp-scaffold
```

- [x] **Step 3: Verify dev server boots**

Run: `npm run dev` → expect `✓ Ready` on http://localhost:3000, Ctrl-C after.

- [x] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold next.js app"
```

### Task 2: Quality gate `npm run check` + first billing pure fn (TDD)

**Files:** Create: `vitest.config.ts`, `src/lib/billing/money.ts`, `src/lib/billing/money.test.ts`. Modify: `package.json`.

**Interfaces:** Produces `formatSatang(satang: number): string` (e.g. `18720 → "฿187.20"`); later tickets display money ONLY through this.

- [x] **Step 1: Install Vitest**

```bash
npm i -D vitest
```

- [x] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

- [x] **Step 3: Write the failing test** — `src/lib/billing/money.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatSatang } from "./money";

describe("formatSatang", () => {
  it("formats satang as baht with two decimals", () => {
    expect(formatSatang(18720)).toBe("฿187.20");
  });
  it("groups thousands", () => {
    expect(formatSatang(123456789)).toBe("฿1,234,567.89");
  });
  it("formats zero", () => {
    expect(formatSatang(0)).toBe("฿0.00");
  });
  it("rejects non-integer input", () => {
    expect(() => formatSatang(1.5)).toThrow("satang must be an integer");
  });
});
```

- [x] **Step 4: Run test, verify it fails**

Run: `npx vitest run` → Expected: FAIL, cannot find `./money`.

- [x] **Step 5: Implement** — `src/lib/billing/money.ts`

```ts
export function formatSatang(satang: number): string {
  if (!Number.isInteger(satang)) throw new Error("satang must be an integer");
  const baht = satang / 100;
  return `฿${baht.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

- [x] **Step 6: Run test, verify it passes**

Run: `npx vitest run` → Expected: 4 passed.

- [x] **Step 7: Wire `check` script** — in `package.json` `"scripts"`, add/replace:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"check": "npm run lint && npm run typecheck && npm run test"
```

- [x] **Step 8: Verify gate**

Run: `npm run check` → Expected: lint 0 problems, tsc silent, 4 tests pass.

- [x] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add check gate and formatSatang"
```

### Task 3: [HUMAN] Provision Supabase + Google OAuth

**Files:** Create: `.env.local` (untracked), `.env.example`.

**Interfaces:** Produces env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` consumed by Task 4.

- [ ] **Step 1 [HUMAN]:** supabase.com → New project → org personal, name `split-the-bill`, region **Southeast Asia (Singapore)**, generate DB password (store in password manager).
- [ ] **Step 2 [HUMAN]:** console.cloud.google.com → new project `split-the-bill` → APIs & Services → OAuth consent screen: External, app name `Split the Bill`, your email; scopes: default (email, profile). → Credentials → Create OAuth client ID, type **Web application**:
  - Authorized JavaScript origins: `http://localhost:3000`
  - Authorized redirect URIs: `https://<PROJECT-REF>.supabase.co/auth/v1/callback` (copy `<PROJECT-REF>` from Supabase project settings)
- [ ] **Step 3 [HUMAN]:** Supabase → Authentication → Providers → Google: enable, paste Client ID + Secret. Authentication → URL Configuration → Site URL `http://localhost:3000`.
- [ ] **Step 4:** Write `.env.local` (values from Supabase → Settings → API):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

- [ ] **Step 5:** Write `.env.example` with the same keys and placeholder values, then:

```bash
git add .env.example && git commit -m "chore: add env example"
```

(`.env*` is already gitignored by the scaffold; verify `git status` does NOT list `.env.local`.)

### Task 4: Auth wiring — sign in, callback, dashboard shell, sign out

**Files:** Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/dashboard/page.tsx`. Modify: `src/app/page.tsx`.

**Interfaces:** Consumes Task 3 env vars. Produces `createClient()` (server) used by every later authenticated page.

- [ ] **Step 1: Install Supabase libs**

```bash
npm i @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2:** `src/lib/supabase/client.ts`

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3:** `src/lib/supabase/server.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* called from a Server Component; middleware refreshes instead */
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4:** `src/middleware.ts` (session refresh)

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5:** `src/app/auth/actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signInWithGoogle() {
  const origin = (await headers()).get("origin")!;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) redirect("/?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

- [ ] **Step 6:** `src/app/auth/callback/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
```

- [ ] **Step 7:** `src/app/page.tsx` (landing)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInWithGoogle } from "@/app/auth/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Split the Bill</h1>
      <p className="text-center">แชร์ค่าข้าวกับเพื่อน จ่ายคืนไว ไม่มีลืม</p>
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8:** `src/app/dashboard/page.tsx` (empty shell)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Split the Bill</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </header>
      <p className="text-sm opacity-70">Signed in as {user.email}</p>
      <p className="mt-8 text-center opacity-50">No bills yet.</p>
    </main>
  );
}
```

- [ ] **Step 9: Verify locally**

Run: `npm run dev` → on http://localhost:3000 click Sign in with Google → Google consent → lands on `/dashboard` showing your email → Sign out returns to landing. Then `npm run check` → Expected: zero errors.

- [ ] **Step 10: Commit + push**

```bash
git add -A && git commit -m "feat: google sign-in and dashboard shell" && git push
```

### Task 5: [HUMAN] Vercel deploy via GitHub integration + prod OAuth

**Files:** none (console work) — Modify Supabase/Google settings.

- [ ] **Step 1 [HUMAN]:** vercel.com → Add New Project → Import `krittintrs/split-the-bill` → framework auto-detects Next.js → add env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (all environments) → Deploy. Note prod URL `https://<app>.vercel.app`.
- [ ] **Step 2 [HUMAN]:** Supabase → Authentication → URL Configuration: Site URL = prod URL; Additional Redirect URLs: `https://<app>.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`.
- [ ] **Step 3 [HUMAN]:** Google Cloud → OAuth client → add JavaScript origin `https://<app>.vercel.app`.
- [ ] **Step 4: Verify production** — open prod URL on phone: sign in with Google → dashboard shows email → sign out. Expected: full loop works in mobile browser.

### Task 6: Close out

- [ ] **Step 1:** Run: `npm run check` → Expected: zero errors.
- [ ] **Step 2:** Update `docs/STATUS.md`: row #6 Status → DONE; add Decision Log row `2026-07-14 | Walking skeleton live at <prod URL> | scaffold+auth+deploy | User`.
- [ ] **Step 3: Commit + push**

```bash
git add docs/STATUS.md && git commit -m "docs: mark #6 done" && git push
```

- [ ] **Step 4:** Comment + close ticket:

```bash
gh issue close 6 --comment "Walking skeleton live: <prod URL>. check gate green."
```

## Definition of Done

`npm run check` (lint + typecheck + unit tests) — zero errors, all tests green. Production sign-in/out verified on mobile.
