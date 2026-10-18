import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', type = 'button', className = '', ...props }: ButtonProps) {
  return <button {...props} type={type} data-variant={variant} data-size={size} className={`tw-ui-button ${className}`.trim()} />
}

export function ActionLink({ to, children, variant = 'primary', size = 'md', className = '' }: { to: string; children: ReactNode; variant?: Variant; size?: Size; className?: string }) {
  return <Link to={to} data-variant={variant} data-size={size} className={`tw-ui-button ${className}`.trim()}>{children}</Link>
}