import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const FIELD_BASE =
  "w-full rounded-control border border-line bg-raised px-3 text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "hover:border-line-strong focus:border-accent focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-critical";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(FIELD_BASE, "h-10 text-sm", className)} {...props} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(FIELD_BASE, "py-2 text-sm leading-relaxed", className)}
      {...props}
    />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(FIELD_BASE, "h-10 cursor-pointer pr-8 text-sm", className)}
      {...props}
    />
  );
});
