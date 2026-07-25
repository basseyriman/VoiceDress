"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Waveform({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const bars = [0.35, 0.7, 1, 0.55, 0.9, 0.45, 0.8, 0.6, 0.95, 0.4, 0.75, 0.5];

  return (
    <div className={cn("flex h-8 items-end gap-[3px]", className)} aria-hidden>
      {bars.map((peak, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-champagne"
          animate={
            active
              ? {
                  height: [
                    `${10 + peak * 8}px`,
                    `${14 + peak * 18}px`,
                    `${8 + peak * 10}px`,
                  ],
                  opacity: [0.45, 1, 0.55],
                }
              : { height: "6px", opacity: 0.25 }
          }
          transition={
            active
              ? {
                  duration: 0.55 + (i % 4) * 0.08,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.04,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}
