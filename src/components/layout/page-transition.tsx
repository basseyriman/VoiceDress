"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Keep transitions light — no layout/shared-element animations (those can
  // leave invisible hit targets over sticky/fixed nav).
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0.92, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-0"
    >
      {children}
    </motion.div>
  );
}
