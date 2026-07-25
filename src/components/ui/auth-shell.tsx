"use client";

import { Logo } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="grain relative flex min-h-screen flex-col justify-center px-4 py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-champagne/[0.07] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-ivory/[0.03] blur-[80px]" />
      </div>

      <div className={cn("mx-auto w-full max-w-md", className)}>
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>
        <div className="glass shine-border rounded-[1.75rem] p-7 sm:p-8">
          <h1 className="font-display text-[2rem] leading-tight tracking-tight text-ivory sm:text-[2.15rem]">
            {title}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-mist">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? (
            <div className="mt-7 border-t border-line/60 pt-6 text-center text-xs text-mist">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
