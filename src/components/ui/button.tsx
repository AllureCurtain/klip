import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200':
            variant === 'default',
          'hover:bg-gray-100 dark:hover:bg-gray-800':
            variant === 'ghost',
          'border border-gray-200 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-800':
            variant === 'outline',
          'bg-red-500 text-white hover:bg-red-600':
            variant === 'destructive',
        },
        {
          'h-10 px-4 py-2 text-sm': size === 'default',
          'h-8 px-3 text-xs': size === 'sm',
          'h-12 px-6 text-base': size === 'lg',
          'h-10 w-10': size === 'icon',
        },
        className
      )}
      {...props}
    />
  );
}
