"use client";

import { useState, useEffect } from "react";
import { X, Share, PlusSquare } from "lucide-react";

export function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Detect if already installed / running in standalone PWA mode
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(!!isRunningStandalone);

    // If on iOS and not installed, show the prompt
    if (isIosDevice && !isRunningStandalone) {
      // Check if they've dismissed it before
      const dismissed = localStorage.getItem("pwa-prompt-dismissed");
      if (!dismissed) {
        // Delay a bit so it doesn't interrupt immediate load
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-prompt-dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 p-4 pb-8 sm:pb-4 sm:hidden">
      <div className="relative flex items-start gap-4 rounded-2xl border border-line bg-stone/90 p-4 shadow-2xl backdrop-blur-md">
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 text-mist transition hover:text-ivory"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex-1 text-sm text-ivory">
          <p className="font-medium text-champagne mb-1">Install VoiceDress App</p>
          <p className="text-mist text-xs leading-relaxed">
            Install this app to your phone in seconds. Tap{" "}
            <Share className="inline-block h-4 w-4 align-sub text-blue-500" />{" "}
            (or tap <span className="font-bold">...</span> then Share{" "}
            <Share className="inline-block h-4 w-4 align-sub text-blue-500" />),{" "}
            then select <span className="font-medium text-ivory">"Add to Home Screen"</span>{" "}
            <PlusSquare className="inline-block h-4 w-4 align-sub text-ivory" />.
          </p>
        </div>
      </div>
    </div>
  );
}
