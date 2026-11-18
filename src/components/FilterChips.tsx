// One row of filter pills. The chosen one is tinted, not solid, so the page's main button stays the only solid blue.
const chipClass = (active: boolean) => `h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/40' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`;

export default function FilterChips<T>({ label, options, value, onChange, className = '' }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map(option => (
        <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)} className={chipClass(option.value === value)}>{option.label}</button>
      ))}
    </div>
  );
}
