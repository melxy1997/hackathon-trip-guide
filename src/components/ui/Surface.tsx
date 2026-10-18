import type { HTMLAttributes } from 'react'

export function Surface({ variant = 'standard', className = '', ...props }: HTMLAttributes<HTMLDivElement> & { variant?: 'standard' | 'raised' | 'glass' }) {
  return <div {...props} data-variant={variant} className={`tw-ui-surface ${className}`.trim()} />
}