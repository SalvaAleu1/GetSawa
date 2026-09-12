import Link from "next/link";

interface BrandLogoProps {
  href?: string;
  inverse?: boolean;
  compact?: boolean;
  className?: string;
  suffix?: string;
}

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-sm font-black text-white shadow-sm"
    >
      S
    </span>
  );
}

function Wordmark({ inverse, suffix }: Pick<BrandLogoProps, "inverse" | "suffix">) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={`font-display text-xl font-bold tracking-tight ${inverse ? "text-white" : "text-ink"}`}>
        Get<span className={inverse ? "text-brand-200" : "text-brand-500"}>Sawa</span>
      </span>
      {suffix ? (
        <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${inverse ? "text-white/45" : "text-ink/40"}`}>
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function BrandLogo({ href = "/", inverse = false, compact = false, className = "", suffix }: BrandLogoProps) {
  const content = (
    <>
      <Mark />
      {!compact ? <Wordmark inverse={inverse} suffix={suffix} /> : null}
    </>
  );

  const classes = `inline-flex items-center gap-2.5 ${className}`.trim();
  if (!href) return <span className={classes}>{content}</span>;

  return (
    <Link href={href} className={classes} aria-label="GetSawa home">
      {content}
    </Link>
  );
}
