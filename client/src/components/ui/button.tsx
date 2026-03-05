import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-body text-sm font-bold shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-25 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary-500 text-neutral-0 hover:bg-primary-600 active:bg-primary-700',
        destructive:
          'bg-error-500 text-neutral-0 hover:bg-error-600',
        outline:
          'border border-neutral-200 bg-neutral-0 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-700',
        ghost:
          'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-700',
        link: 'text-primary-500 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2 rounded',
        sm: 'h-9 px-3 rounded text-xs',
        lg: 'h-12 px-8 rounded',
        icon: 'h-11 w-11 rounded',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
