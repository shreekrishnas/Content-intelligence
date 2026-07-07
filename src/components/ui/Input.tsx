import { type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function GlassInput({ className = "", ...rest }: GlassInputProps) {
  return (
    <input
      className={`glass-input ${className}`.trim()}
      {...rest}
    />
  );
}

interface GlassTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function GlassTextarea({ className = "", ...rest }: GlassTextareaProps) {
  return (
    <textarea
      className={`glass-textarea ${className}`.trim()}
      {...rest}
    />
  );
}

interface GlassSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function GlassSelect({ className = "", children, ...rest }: GlassSelectProps) {
  return (
    <select
      className={`glass-select ${className}`.trim()}
      {...rest}
    >
      {children}
    </select>
  );
}
