import type { CSSProperties } from 'react'

// React adaptation of sv-matrix Square 11: 5×5 Manhattan-ring echo, 1.25× cycle.
// Source: https://sv-matrix.vercel.app/r/square-11.json and /r/dot-matrix.json.
export function SquareLoader({ label = 'Loading' }: { label?: string }) {
  return <span className="square-loader" role="img" aria-label={label}>
    {Array.from({ length: 25 }, (_, i) => {
      const ring = Math.abs(Math.floor(i / 5) - 2) + Math.abs(i % 5 - 2)
      return <span key={i} style={{ '--dot-delay': `${(ring * .14 + ring % 2 * .03) * 1875}ms`, '--dot-rest': .2 + (1 - ring / 4) * .72 } as CSSProperties} />
    })}
  </span>
}
