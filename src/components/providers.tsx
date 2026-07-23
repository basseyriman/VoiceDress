"use client";

import { useEffect } from "react";
import { useAetherStore } from "@/store/aether-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const setHydrated = useAetherStore((s) => s.setHydrated);

  useEffect(() => {
    setHydrated(true);
  }, [setHydrated]);

  return <>{children}</>;
}
