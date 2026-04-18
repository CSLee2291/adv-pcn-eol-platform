import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 shadow-sm",
        ghost:
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        outline:
          "border border-neutral-200 dark:border-neutral-700 bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800",
        danger:
          "bg-danger text-white hover:bg-red-600 active:bg-red-700",
        secondary:
          "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
      },
      size: {
        default: "h-10 px-5 py-2.5 rounded-pill",
        sm: "h-8 px-3.5 py-1.5 text-meta rounded-pill",
        lg: "h-12 px-7 py-3 text-body rounded-pill",
        icon: "h-10 w-10 rounded-panel",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
