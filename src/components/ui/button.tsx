import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:shadow-[var(--shadow-glow)] aria-invalid:ring-destructive/20 aria-invalid:border-destructive/60",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-raised)] hover:brightness-105 hover:-translate-y-px',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20',
        outline:
          'border border-input bg-background shadow-[var(--shadow-ring)] hover:bg-accent hover:text-accent-foreground hover:-translate-y-px',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-5 py-2',
        sm: 'h-8 px-4 text-xs',
        lg: 'h-10 px-7',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
