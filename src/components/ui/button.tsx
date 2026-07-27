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
  variant = "default",
}: {
  className?: string;
  /** Larger lockup for auth / landing hero */
  variant?: "default" | "hero";
}) {
  const hero = variant === "hero";

  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center",
        hero ? "gap-3.5" : "gap-2.5",
        className
      )}
      aria-label="VoiceDress home"
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[0.85rem] border border-champagne/25 bg-[#121110] shadow-[inset_0_1px_0_rgba(245,240,232,0.06)]",
          hero ? "h-12 w-12" : "h-9 w-9"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg?v=14"
          alt=""
          width={hero ? 32 : 26}
          height={hero ? 32 : 26}
          className={cn(
            "w-auto",
            hero ? "h-7" : "h-[1.35rem]"
          )}
        />
      </span>
      <span
        className={cn(
          "font-display font-medium leading-none text-ivory",
          hero
            ? "text-[2rem] tracking-[0.14em] sm:text-[2.25rem]"
            : "text-[1.45rem] tracking-[0.12em]"
        )}
      >
        Voice
        <span className="text-champagne">Dress</span>
      </span>
    </Link>
  );
}
