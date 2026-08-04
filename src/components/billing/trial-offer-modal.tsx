"use client";

import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  mode?: "soft" | "hard";
};

export function TrialOfferModal({ open, onClose, mode = "soft" }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-offer-title"
        className="w-full max-w-md rounded-[1.75rem] border border-line bg-stone p-6 shadow-2xl"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-champagne">
          {mode === "hard" ? "Out of Credits" : "You're dressed!"}
        </p>
        <h2
          id="trial-offer-title"
          className="mt-2 font-display text-3xl text-ivory"
        >
          {mode === "hard"
            ? "Need more Try-ons?"
            : "Top up to keep dressing"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          {mode === "hard"
            ? "You have used your free try-on. Buy more credits to continue styling your outfits."
            : "You have used your free try-on. Bank some more Credits to keep swapping pieces and dressing for every occasion."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/billing"
            className="flex w-full items-center justify-center rounded-full bg-champagne py-2.5 font-medium text-ink transition hover:bg-champagne/90"
          >
            Get more Credits
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-line px-4 py-2.5 text-xs text-mist transition hover:border-champagne/40 hover:text-ivory"
          >
            {mode === "hard" ? "Close" : "Maybe later"}
          </button>
        </div>
      </div>
    </div>
  );
}
