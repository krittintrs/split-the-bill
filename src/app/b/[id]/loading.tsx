/** Route skeleton while the peer bill fetches (issue #15). */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl animate-pulse flex-col gap-4 p-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-56 rounded-lg bg-surface-tint" />
          <div className="h-4 w-32 rounded bg-surface-tint" />
        </div>
        <div className="h-7 w-20 rounded-full bg-surface-tint" />
      </div>
      <div className="h-64 rounded-xl border border-border bg-surface" />
      <div className="h-40 rounded-xl border border-border bg-surface" />
    </main>
  );
}
