import { cn } from '@boilerstone/ui/lib/utils'
import * as React from 'react'

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

export function Header({ className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full h-[var(--header-height)] flex items-center bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#141410] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
        className,
      )}
      {...props}
    >
      {children}
    </header>
  )
}
