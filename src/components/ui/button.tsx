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

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-3", className)}
      aria-label="VoiceDress home"
    >
      {/* Exact home-screen icon (thick stroke + padding) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png?v=12"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-[0.75rem] border border-champagne/20 transition duration-300 group-hover:opacity-90"
      />
      <span className="font-display text-[1.35rem] font-medium leading-none tracking-[0.06em] text-ivory">
        Voice
        <span className="text-champagne">Dress</span>
      </span>
    </Link>
  );
}
