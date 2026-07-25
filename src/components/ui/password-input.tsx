"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FieldLabel, fieldInputClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  hint?: string;
  className?: string;
};

export function PasswordInput({
  className,
  label = "Password",
  hint,
  id,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fieldId = id || "password";

  return (
    <div className="block">
      {label ? (
        <FieldLabel htmlFor={fieldId} hint={hint}>
          {label}
        </FieldLabel>
      ) : null}
      <div className="relative">
        <input
          {...props}
          id={fieldId}
          type={visible ? "text" : "password"}
          className={cn(fieldInputClass, "pr-11", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-mist transition hover:bg-white/[0.04] hover:text-ivory"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? (
            <Eye className="h-4 w-4" aria-hidden />
          ) : (
            <EyeOff className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
