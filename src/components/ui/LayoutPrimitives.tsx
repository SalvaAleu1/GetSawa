import type { ReactNode } from "react";
import Link from "next/link";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className={`page-heading ${eyebrow ? "mt-2" : ""}`}>{title}</h1>
        {description ? <p className="page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="section-heading">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-ink/50">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="metric-card">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/40">{label}</p>
      <div className="mt-3 text-2xl font-bold tracking-tight text-ink">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-ink/45">{detail}</div> : null}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  children?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, actionHref, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-black text-brand-600" aria-hidden="true">
        GS
      </div>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink/50">{description}</p>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn-primary mt-5">
          {actionLabel}
        </Link>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

interface InlineNoticeProps {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children?: ReactNode;
}

const NOTICE_CLASSES = {
  info: "border-brand-200 bg-brand-50 text-brand-900",
  success: "border-success/20 bg-success/5 text-ink",
  warning: "border-amber-400/30 bg-amber-400/10 text-ink",
  danger: "border-danger/20 bg-danger/5 text-ink",
};

export function InlineNotice({ tone = "info", title, children }: InlineNoticeProps) {
  return (
    <div className={`rounded-2xl border p-4 ${NOTICE_CLASSES[tone]}`}>
      <p className="text-sm font-bold">{title}</p>
      {children ? <div className="mt-1 text-sm leading-6 opacity-70">{children}</div> : null}
    </div>
  );
}
