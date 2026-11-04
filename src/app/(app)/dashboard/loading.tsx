export default function DashboardLoading() {
  return <div className="animate-pulse space-y-5" aria-label="Carregando dashboard">
    <div className="flex flex-wrap items-end justify-between gap-4"><div className="space-y-3"><div className="h-3 w-24 rounded bg-[#dde8df]" /><div className="h-9 w-72 max-w-full rounded bg-[#dde8df]" /><div className="h-4 w-80 max-w-full rounded bg-[#e8eee9]" /></div><div className="h-10 w-52 rounded-lg bg-[#e8eee9]" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 rounded-2xl border bg-white p-5"><div className="h-4 w-28 rounded bg-[#e8eee9]" /><div className="mt-8 h-8 w-36 rounded bg-[#dde8df]" /><div className="mt-4 h-3 w-44 rounded bg-[#e8eee9]" /></div>)}</div>
    <div className="h-72 rounded-2xl border bg-white p-6"><div className="h-5 w-44 rounded bg-[#dde8df]" /><div className="mt-6 space-y-4">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-8 rounded bg-[#f5f8f5]" />)}</div></div>
  </div>;
}
