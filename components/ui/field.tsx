import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-2xl border border-line-2 bg-white/90 px-4 py-3 text-[0.97rem] text-ink placeholder:text-ink-3/80 shadow-[0_1px_0_rgb(22_38_31/0.03)_inset] transition-colors focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-200/60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, "h-12", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "min-h-28 resize-y leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "h-12 appearance-none bg-[length:1rem] bg-[position:left_1rem_center] bg-no-repeat pe-4 ps-10", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2374837b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({
  className,
  hint,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn("mb-2 block text-sm font-medium text-ink", className)} {...props}>
      {children}
      {hint && <span className="ms-2 font-normal text-ink-3">{hint}</span>}
    </label>
  );
}
