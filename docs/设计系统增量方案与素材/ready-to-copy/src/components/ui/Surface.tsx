import type { HTMLAttributes } from 'react'

/** V1.1-compatible extension: optional editorial geometry, V1 variants unchanged. */
export type SurfaceVariant = 'standard' | 'raised' | 'glass'
export type SurfaceGeometry = 'standard' | 'editorial'
export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant
  geometry?: SurfaceGeometry
}

export function Surface({
  variant = 'standard',
  geometry = 'standard',
  className = '',
  ...props
}: SurfaceProps) {
  return <div {...props} data-variant={variant} data-geometry={geometry} className={`tw-ui-surface ${className}`.trim()} />
}
