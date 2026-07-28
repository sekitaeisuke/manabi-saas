/**
 * つながるまなび — 共通UI部品
 *
 * globals.css のトークン（brand / canvas / surface / line / ink / radius-card …）だけを使う。
 * 画面ごとに indigo-600 や slate-200 を直書きしていくと、色がじわじわズレていくので、
 * 見た目に関わるものはできるだけここを経由させる。
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...parts: unknown[]) =>
  parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");

/* ──────────────────────────────────────────────────────────────
   Card — 面。白・やわらかい影・角丸16px で統一
   ────────────────────────────────────────────────────────────── */

export function Card({
  className,
  children,
  padding = "md",
  interactive = false,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  /** none = 自分で padding を持つ中身（テーブル等）を入れるとき */
  padding?: "none" | "sm" | "md" | "lg";
  /** クリックできるカード。hover でわずかに浮く */
  interactive?: boolean;
} & Omit<ComponentProps<"div">, "className" | "children">) {
  const pad = { none: "", sm: "p-4", md: "p-5", lg: "p-6 sm:p-7" }[padding];
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-surface shadow-card",
        pad,
        interactive &&
          "transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** リンクとして振る舞うカード */
export function CardLink({
  href,
  className,
  children,
  padding = "md",
}: {
  href: string;
  className?: string;
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  const pad = { none: "", sm: "p-4", md: "p-5", lg: "p-6 sm:p-7" }[padding];
  return (
    <Link
      href={href}
      className={cx(
        "block rounded-card border border-line bg-surface shadow-card",
        "transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover",
        pad,
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────
   見出し
   ────────────────────────────────────────────────────────────── */

/** ページ最上部。日付などの前置き・タイトル・説明・右側の操作 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("mb-7 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-ink-faint">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** セクション見出し。小さく・控えめに・大文字トラッキング */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-faint">{children}</h2>
      {action}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Button — ブランド色は primary だけ。他は無彩色で引く
   ────────────────────────────────────────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface text-ink shadow-card hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:text-ink-faint",
  ghost: "text-ink-muted hover:bg-canvas-sunken hover:text-ink",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:text-brand-300",
  danger:
    "border border-critical-200 bg-critical-50 text-critical-600 hover:bg-critical-100 hover:border-critical-600/30",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-field px-3 text-xs",
  md: "h-10 gap-2 rounded-field px-4 text-sm",
  lg: "h-12 gap-2 rounded-card px-6 text-base",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cx(
    "inline-flex select-none items-center justify-center font-semibold",
    "transition duration-150 ease-out-soft active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-60 disabled:active:scale-100",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ComponentProps<"button">) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────
   Badge — 状態を一目で。色は5種類だけに絞る
   ────────────────────────────────────────────────────────────── */

export type Tone = "neutral" | "brand" | "positive" | "caution" | "critical";

const TONE: Record<Tone, string> = {
  neutral: "bg-canvas-sunken text-ink-muted",
  brand: "bg-brand-50 text-brand-700",
  positive: "bg-positive-50 text-positive-700",
  caution: "bg-caution-50 text-caution-700",
  critical: "bg-critical-50 text-critical-700",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 件数の丸バッジ（ナビの未読数など） */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      data-numeric
      className={cx(
        "flex h-5 min-w-5 items-center justify-center rounded-pill bg-critical-600 px-1.5",
        "text-[0.6875rem] font-bold leading-none text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   StatTile — 数字を1つ見せる小さいタイル
   ────────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-ink",
    brand: "text-brand-700",
    positive: "text-positive-700",
    caution: "text-caution-700",
    critical: "text-critical-700",
  };
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && <span className="text-ink-faint">{icon}</span>}
        <p className="text-xs font-semibold text-ink-faint">{label}</p>
      </div>
      <p data-numeric className={cx("mt-2 text-3xl font-bold tracking-tight", accent[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </>
  );
  return href ? (
    <CardLink href={href} padding="md">
      {body}
    </CardLink>
  ) : (
    <Card padding="md">{body}</Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   EmptyState — 「無い」ことを、責められている感じなく伝える
   ────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-faint">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   フォーム
   ────────────────────────────────────────────────────────────── */

export const inputClass = cx(
  "w-full rounded-field border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink",
  "placeholder:text-ink-faint",
  "transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/12",
  "disabled:bg-canvas-sunken disabled:text-ink-faint",
);

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-xs font-medium text-critical-600">必須</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-critical-600">{error}</span>}
    </label>
  );
}

/* ──────────────────────────────────────────────────────────────
   その他
   ────────────────────────────────────────────────────────────── */

/** 画面全体のローディング */
export function FullPageLoader({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3 text-ink-faint">
        <Spinner className="h-6 w-6" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="読み込み中"
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-line-strong border-t-brand-600",
        className ?? "h-4 w-4",
      )}
    />
  );
}

/** 注意を引く帯（エラー・警告・お知らせ） */
export function Callout({
  tone = "caution",
  title,
  children,
  action,
}: {
  tone?: Exclude<Tone, "neutral">;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const skin: Record<Exclude<Tone, "neutral">, string> = {
    brand: "border-brand-200 bg-brand-50 text-brand-900",
    positive: "border-positive-200 bg-positive-50 text-positive-700",
    caution: "border-caution-200 bg-caution-50 text-caution-700",
    critical: "border-critical-200 bg-critical-50 text-critical-700",
  };
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3",
        skin[tone],
      )}
    >
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "leading-6 opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** 一覧の行が並ぶ入れ物。境界線をカードの内側に引く */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
