"use client";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import styles from "./ui.module.css";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* --------------------------------------------------------------- header ---- */

export function PageHeader({
  title,
  sub,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHead}>
      <div className={styles.pageHeadText}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1 className={styles.pageTitle}>{title}</h1>
        {sub ? <p className={styles.pageSub}>{sub}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function SectionHead({
  title,
  sub,
  actions,
  icon: IconCmp,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  icon?: Icon;
}) {
  return (
    <div className={styles.cardHead}>
      <div className={styles.cardTitle}>
        <h3 className={styles.row} style={{ gap: 8 }}>
          {IconCmp ? <IconCmp size={15} /> : null}
          {title}
        </h3>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- card ----- */

export function Card({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return <section className={cx(styles.card, flush && styles.cardFlush, className)}>{children}</section>;
}

export function CardBody({ children, tight }: { children: ReactNode; tight?: boolean }) {
  return <div className={tight ? styles.cardBodyTight : styles.cardBody}>{children}</div>;
}

/* ---------------------------------------------------------------- stat ----- */

export function Stat({
  label,
  value,
  hint,
  icon: IconCmp,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: Icon;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const toneColor =
    tone === "ok" ? "#6ee7b7" : tone === "warn" ? "#fcd34d" : tone === "bad" ? "#fca5a5" : undefined;
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>
        {IconCmp ? <IconCmp size={13} /> : null}
        {label}
      </span>
      <span className={styles.statValue} style={toneColor ? { color: toneColor } : undefined}>
        {value}
      </span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}

/* --------------------------------------------------------------- badge ----- */

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

const badgeTone: Record<Tone, string> = {
  neutral: styles.badge,
  ok: cx(styles.badge, styles.badgeOk),
  warn: cx(styles.badge, styles.badgeWarn),
  bad: cx(styles.badge, styles.badgeBad),
  info: cx(styles.badge, styles.badgeInfo),
  accent: cx(styles.badge, styles.badgeAccent),
};

export function Badge({
  children,
  tone = "neutral",
  dot,
  icon: IconCmp,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  icon?: Icon;
}) {
  return (
    <span className={badgeTone[tone]}>
      {dot ? <span className={styles.dot} /> : null}
      {IconCmp ? <IconCmp size={12} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- button ----- */

type ButtonVariant = "default" | "primary" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "default", extra?: string) {
  const map: Record<ButtonVariant, string> = {
    default: styles.btn,
    primary: cx(styles.btn, styles.btnPrimary),
    ghost: cx(styles.btn, styles.btnGhost),
    danger: cx(styles.btn, styles.btnDanger),
  };
  return cx(map[variant], extra);
}

/* --------------------------------------------------------------- empty ----- */

export function EmptyState({
  icon: IconCmp,
  title,
  children,
  action,
}: {
  icon?: Icon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {IconCmp ? (
        <span className={styles.emptyIcon}>
          <IconCmp size={17} />
        </span>
      ) : null}
      <h3 className={styles.emptyTitle}>{title}</h3>
      {children ? <div className={styles.emptyText}>{children}</div> : null}
      {action ? <div className={styles.row} style={{ marginTop: 6, justifyContent: "center" }}>{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- callout ----- */

export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
}: {
  tone?: "neutral" | "info" | "ok" | "warn" | "bad";
  icon?: Icon;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const map = {
    neutral: { cls: styles.callout, Icon: Info },
    info: { cls: cx(styles.callout, styles.calloutInfo), Icon: Info },
    ok: { cls: cx(styles.callout, styles.calloutOk), Icon: CheckCircle2 },
    warn: { cls: cx(styles.callout, styles.calloutWarn), Icon: AlertTriangle },
    bad: { cls: cx(styles.callout, styles.calloutBad), Icon: XCircle },
  } as const;
  const chosen = map[tone];
  const IconCmp = icon ?? chosen.Icon;
  return (
    <div className={chosen.cls} role={tone === "bad" || tone === "warn" ? "alert" : undefined}>
      <IconCmp size={15} />
      <div style={{ minWidth: 0 }}>
        {title ? <strong style={{ display: "block", marginBottom: 2 }}>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ skeleton ----- */

export function Skeleton({ height, title }: { height?: number; title?: boolean }) {
  return <div className={cx(styles.skeleton, title ? styles.skeletonTitle : styles.skeletonLine)} style={height ? { height } : undefined} />;
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className={styles.row} style={{ gap: 8, color: "var(--muted)", fontSize: 12.5 }}>
      <Loader2 size={14} className={styles.skeleton} style={{ animation: "none" }} />
      {label}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "rivuSpin 0.9s linear infinite" }} />;
}

/* ------------------------------------------------------------ progress ----- */

export function Meter({ value, label, hint }: { value: number; label: ReactNode; hint?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={styles.meterRow}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.progressBar} style={{ width: `${pct}%` }} />
      </div>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={styles.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressBar} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* --------------------------------------------------------------- steps ----- */

export type Step = { key: string; label: string; hint?: string };

export function Stepper({
  steps,
  current,
  completed = [],
  onSelect,
}: {
  steps: Step[];
  current: string;
  completed?: string[];
  onSelect?: (key: string) => void;
}) {
  return (
    <div className={styles.steps} role="tablist" aria-label="Progress">
      {steps.map((step, index) => {
        const isCurrent = step.key === current;
        const isDone = completed.includes(step.key);
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={onSelect ? () => onSelect(step.key) : undefined}
            className={cx(styles.step, isCurrent && styles.stepActive, isDone && !isCurrent && styles.stepDone)}
            style={onSelect ? undefined : { cursor: "default" }}
          >
            <span className={styles.stepNum}>
              {isDone && !isCurrent ? <CheckCircle2 size={11} /> : null}
              Step {index + 1}
            </span>
            <b>{step.label}</b>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- modal ----- */

export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  width,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Dialog"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            {sub ? <p className={styles.modalSub}>{sub}</p> : null}
          </div>
          <button type="button" className={buttonClass("ghost", styles.btnIcon)} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer ? <div className={styles.modalFoot}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- facts ------ */

export function Facts({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <dl className={styles.facts}>
      {rows.map((row, index) => (
        <div className={styles.fact} key={index}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { styles as uiStyles };