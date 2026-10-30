import type { ReactNode } from 'react'
import { cn } from '@boilerstone/ui/lib/utils'

/**
 * What a status asks of the staff, not what it is called:
 * - `action` (earth) — someone must act now;
 * - `progress` (blue) — moving on its own;
 * - `done` (green) — finished well;
 * - `problem` (coral) — went wrong, the only use of coral;
 * - `idle` (neutral) — closed or waiting on someone outside eBio.
 */
export type StatusTone = 'action' | 'progress' | 'done' | 'problem' | 'idle'

const TONE_CLASSES: Record<StatusTone, { pill: string, dot: string }> = {
  action: {
    pill: 'bg-ebio-earth-50 text-ebio-earth-800 border-ebio-earth-200 dark:bg-ebio-earth-900 dark:text-ebio-earth-100 dark:border-ebio-earth-800',
    dot: 'bg-ebio-earth-400',
  },
  progress: {
    pill: 'bg-ebio-blue-50 text-ebio-blue-800 border-ebio-blue-100 dark:bg-ebio-blue-900 dark:text-ebio-blue-100 dark:border-ebio-blue-800',
    dot: 'bg-ebio-blue-400',
  },
  done: {
    pill: 'bg-ebio-green-50 text-ebio-green-800 border-ebio-green-100 dark:bg-ebio-green-900 dark:text-ebio-green-100 dark:border-ebio-green-800',
    dot: 'bg-ebio-green-400',
  },
  problem: {
    pill: 'bg-ebio-coral-50 text-ebio-coral-600 border-ebio-coral-200 dark:bg-ebio-coral-900 dark:text-ebio-coral-100 dark:border-ebio-coral-800',
    dot: 'bg-ebio-coral-400',
  },
  idle: {
    pill: 'bg-ebio-neutral-50 text-ebio-neutral-600 border-ebio-neutral-200 dark:bg-ebio-neutral-800 dark:text-ebio-neutral-200 dark:border-ebio-neutral-600',
    dot: 'bg-ebio-neutral-400',
  },
}

interface StatusBadgeProps {
  tone: StatusTone
  children: ReactNode
  className?: string
}

/** Pill with a leading dot, so the tone still reads in a dense column or without colour vision. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const classes = TONE_CLASSES[tone]
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        classes.pill,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden="true" />
      {children}
    </span>
  )
}
