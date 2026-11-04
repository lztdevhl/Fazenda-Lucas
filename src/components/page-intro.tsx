export function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-7"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#172620] sm:text-[36px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>;
}
