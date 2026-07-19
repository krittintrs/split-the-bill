/** Route skeleton while the dashboard fetches (issue #15). */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl animate-pulse flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-surface-tint" />
        <div className="h-4 w-48 rounded bg-surface-tint" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-surface-tint" />
        <div className="h-12 w-full rounded-xl bg-surface-tint sm:w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-14 rounded-xl border border-border bg-surface" />
        <div className="h-14 rounded-xl border border-border bg-surface" />
        <div className="h-14 rounded-xl border border-border bg-surface" />
      </div>
    </main>
  );
}
