export function SilhouettePaths({ sex }) {
  if (sex === "F") {
    return (
      <>
        <circle cx="12" cy="8.6" r="4.4" />
        <path d="M6.6 23c.4-4.4 2.5-6.6 5.4-6.6s5 2.2 5.4 6.6h-2.4c-.3-2.6-1.5-4-3-4s-2.7 1.4-3 4H6.6Z" />
      </>
    )
  }
  return (
    <>
      <circle cx="12" cy="8.6" r="4.4" />
      <path d="M4.3 23c.9-4.9 3.8-7.4 7.7-7.4s6.8 2.5 7.7 7.4H4.3Z" />
    </>
  )
}

export default function Silhouette({ sex, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="currentColor">
        <SilhouettePaths sex={sex} />
      </g>
    </svg>
  )
}
