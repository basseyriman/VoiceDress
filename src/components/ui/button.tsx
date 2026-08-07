"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "soft";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-300 disabled:opacity-50",
        size === "sm" && "px-3.5 py-2 text-xs",
        size === "md" && "px-5 py-2.5 text-sm",
        size === "lg" && "px-7 py-3.5 text-sm tracking-wide",
        variant === "primary" &&
          "bg-champagne text-ink hover:bg-[#d4b68c] shadow-[0_10px_40px_rgba(201,168,124,0.25)]",
        variant === "ghost" && "text-ivory-muted hover:text-ivory hover:bg-white/5",
        variant === "outline" &&
          "border border-line text-ivory hover:border-champagne/50 hover:bg-white/[0.03]",
        variant === "soft" && "bg-white/[0.06] text-ivory hover:bg-white/[0.1]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Logo({
  className,
  variant = "header",
  theme = "dark",
}: {
  className?: string;
  /** header = app nav (premium). hero = auth / landing. compact = tight spaces */
  variant?: "header" | "hero" | "compact";
  /** dark = light text for dark backgrounds (default). light = dark text for light backgrounds */
  theme?: "dark" | "light";
}) {
  const hero = variant === "hero";
  const compact = variant === "compact";

  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex min-w-0 max-w-full items-center transition-opacity duration-300 hover:opacity-95",
        hero ? "gap-4" : compact ? "gap-2" : "gap-2.5 sm:gap-4",
        className
      )}
      aria-label="VoiceDress home"
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[0.9rem] border border-champagne/30 bg-ink-soft shadow-[inset_0_1px_0_rgba(245,240,232,0.08),0_8px_24px_rgba(0,0,0,0.35)]",
          hero && "h-14 w-14 sm:h-16 sm:w-16",
          compact && "h-8 w-8 rounded-[0.65rem]",
          !hero && !compact && "h-9 w-9 sm:h-12 sm:w-12"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg?v=15"
          alt=""
          width={hero ? 40 : compact ? 22 : 36}
          height={hero ? 40 : compact ? 22 : 36}
          className={cn(
            "w-auto",
            hero && "h-9 sm:h-10",
            compact && "h-[1.15rem]",
            !hero && !compact && "h-6 sm:h-8"
          )}
        />
      </span>
      <span
        className={cn(
          "font-display font-medium leading-none",
          theme === "dark" ? "text-ivory" : "text-ink",
          hero &&
            "text-[1.85rem] tracking-[0.12em] sm:text-[2.5rem] sm:tracking-[0.18em]",
          compact && "text-[1.25rem] tracking-[0.1em]",
          !hero &&
            !compact &&
            "hidden text-[1.65rem] tracking-[0.14em] sm:inline sm:text-[1.85rem] sm:tracking-[0.16em]"
        )}
      >
        Voice
        <span className="text-champagne">Dress</span>
      </span>
    </Link>
  );
}
