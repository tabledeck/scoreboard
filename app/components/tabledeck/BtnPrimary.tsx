import type { ButtonHTMLAttributes, ReactNode } from "react";

interface BtnPrimaryProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

/**
 * BtnPrimary — gold foil button with pressed / hover states.
 */
export default function BtnPrimary({
  children,
  className = "",
  ...rest
}: BtnPrimaryProps) {
  return (
    <button className={`btn-primary ${className}`} {...rest}>
      {children}
    </button>
  );
}
