import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** shadcn-style button. Use `buttonVariants` on <Link> for link-buttons. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-leaf-700 text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_6px_16px_-6px_rgb(31_93_70/0.6)] hover:bg-leaf-800 hover:shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_10px_22px_-8px_rgb(31_93_70/0.7)]",
        secondary:
          "border border-line-2 bg-white/80 text-ink hover:border-leaf-300 hover:bg-white hover:text-leaf-800",
        soft: "bg-leaf-50 text-leaf-800 hover:bg-leaf-100",
        ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink",
        link: "bg-link-50 text-link-700 hover:bg-link-100",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-14 px-7 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
