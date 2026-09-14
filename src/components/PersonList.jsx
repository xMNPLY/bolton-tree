import { useMemo, useState } from "react"
import { getProfilePhoto } from "../lib/gedcom"
import Silhouette from "./Silhouette"

function years(person) {
  const b = person.birth?.iso?.slice(0, 4)
  const d = person.death?.iso?.slice(0, 4)
  if (!b && !d) return ""
  if (b && d) return `${b}–${d}`
  if (b) return `b. ${b}`
  return `d. ${d}`
}

export default function PersonList({ people, selectedId, onSelect }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => {
      const hay = `${p.name} ${p.surname || ""} ${p.birthPlace || ""} ${p.deathPlace || ""} ${p.occupation || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [people, query])

  return (
    <div className="person-list">
      <div className="search-box">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="search"
          placeholder="Search people, places…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="list-scroll">
        {filtered.length === 0 && <p className="list-empty">No matches found.</p>}
        {filtered.map((p) => {
          const photo = getProfilePhoto(p)
          return (
            <button
              key={p.id}
              className={`person-row ${p.id === selectedId ? "selected" : ""}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="avatar" data-sex={p.sex}>
                <Silhouette sex={p.sex} className="silhouette" />
                {photo && (
                  <img className="avatar-img" src={photo.url} alt="" loading="lazy"
                    onError={(e) => (e.target.style.display = "none")} />
                )}
              </span>
              <span className="person-row-text">
                <span className="person-row-name">{p.name || "(Unknown)"}</span>
                <span className="person-row-meta">{years(p)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
