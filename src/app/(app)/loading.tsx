export default function Loading() {
  return <div className="animate-pulse"><div className="mb-3 h-3 w-24 rounded bg-[#dde8df]" /><div className="mb-3 h-9 w-70 rounded bg-[#dde8df]" /><div className="mb-8 h-4 w-96 max-w-full rounded bg-[#e8eee9]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-36 rounded-2xl border bg-white" />)}</div><div className="mt-8 h-72 rounded-2xl border bg-white" /></div>;
}
