/** Route skeleton while the bill editor fetches (issue #15). */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="h-5 w-24 rounded bg-surface-tint" />
        <div className="h-12 w-44 rounded-xl bg-surface-tint" />
      </div>
      <div className="h-28 rounded-xl border border-border bg-surface" />
      <div className="h-64 rounded-xl border border-border bg-surface" />
      <div className="h-36 rounded-xl border border-border bg-surface" />
    </main>
  );
}
