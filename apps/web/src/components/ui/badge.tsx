import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-chip px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--badge-bg)] text-[var(--badge-text)]",
        low: "bg-[#F0FDF4] text-[#166534] dark:bg-green-900/30 dark:text-green-400",
        medium: "bg-[#FFFBEB] text-[#92400E] dark:bg-amber-900/30 dark:text-amber-400",
        high: "bg-[#FEF2F2] text-[#991B1B] dark:bg-red-900/30 dark:text-red-400",
        critical: "bg-[#7F1D1D] text-white",
        outline: "border border-neutral-200 dark:border-neutral-700 text-[var(--text-secondary)]",
        info: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
