"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
  children: ReactNode;
  pendingLabel: ReactNode;
};

/** Disabilita il submit appena React avvia la server action, evitando invii doppi. */
export default function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
