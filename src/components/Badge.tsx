export default function Badge({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full mb-4 text-xs font-semibold tracking-widest uppercase"
      style={{ color: "var(--text-secondary)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block animate-pulse" />
      {label}
    </div>
  );
}
