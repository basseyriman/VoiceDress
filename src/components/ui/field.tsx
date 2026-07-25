import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode } from "react";

export const fieldInputClass =
  "w-full rounded-2xl border border-line bg-ink-soft px-4 py-3.5 text-sm text-ivory outline-none transition placeholder:text-mist/55 focus:border-champagne/45 focus:bg-[#1a1917] focus:ring-1 focus:ring-champagne/20";

export function FieldLabel({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-medium uppercase tracking-[0.2em] text-mist"
      >
        {children}
      </label>
      {hint ? <span className="text-[11px] text-mist/70">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const fieldId = id || props.name || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="block">
      <FieldLabel htmlFor={fieldId} hint={hint}>
        {label}
      </FieldLabel>
      <input id={fieldId} className={cn(fieldInputClass, className)} {...props} />
    </div>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#e8b4ac]"
    >
      {children}
    </p>
  );
}
