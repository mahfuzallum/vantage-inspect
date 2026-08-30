import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "./slot";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_8px_24px_-4px_rgba(139,92,246,0.45)] font-semibold transition-shadow hover:bg-accent-strong hover:shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_10px_32px_-4px_rgba(167,139,250,0.6)] active:bg-accent",
  secondary: "bg-raised text-ink hover:bg-line border border-line",
  ghost: "text-ink-muted hover:text-ink hover:bg-raised",
  outline: "border border-line-strong text-ink hover:border-accent hover:text-accent",
  danger: "bg-critical/15 text-critical border border-critical/40 hover:bg-critical/25",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "size-10 justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element instead of a <button> — for links styled as buttons. */
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild = false, type, ...props },
  ref,
) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex items-center rounded-control transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
