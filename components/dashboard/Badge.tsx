type BadgeTone = "positive" | "warning" | "negative" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive:
    "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
  warning: "bg-[rgba(243,184,100,0.14)] text-[#f3b864] border-[rgba(243,184,100,0.4)]",
  negative: "bg-[rgba(238,143,129,0.14)] text-[#ee8f81] border-[rgba(238,143,129,0.4)]",
  neutral: "bg-[var(--ghost)] text-[var(--muted)] border-[rgba(255,255,255,0.14)]",
};

export function Badge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
