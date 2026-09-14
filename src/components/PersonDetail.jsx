import { useState } from "react"
import { getPersonLinks, getProfilePhoto, getSpouseFamilies } from "../lib/gedcom"
import Silhouette from "./Silhouette"

function PersonChip({ person, onSelect, role }) {
  if (!person) return null
  const photo = getProfilePhoto(person)
  return (
    <button className="person-chip" onClick={() => onSelect(person.id)}>
      <span className="avatar small" data-sex={person.sex}>
        <Silhouette sex={person.sex} className="silhouette" />
        {photo && (
          <img className="avatar-img" src={photo.url} alt="" loading="lazy"
            onError={(e) => (e.target.style.display = "none")} />
        )}
      </span>
      <span>
        <span className="chip-name">{person.name}</span>
        <span className="chip-role">{role}</span>
      </span>
    </button>
  )
}

function FactRow({ label, children }) {
  if (!children) return null
  return (
    <div className="fact-row">
      <span className="fact-label">{label}</span>
      <span className="fact-value">{children}</span>
    </div>
  )
}

const EVENT_LABELS = {
  CHR: "Christening",
  RESI: "Residence",
  IMMI: "Immigration",
  EMIG: "Emigration",
  EDUC: "Education",
  RELI: "Religion",
  TITL: "Title",
  EVEN: "Event",
  CENS: "Census",
  BURI: "Burial",
  BAPM: "Baptism",
  CONF: "Confirmation",
  PROB: "Probate",
  GRAD: "Graduation",
  ORDN: "Ordination",
  NATU: "Naturalization",
  WILL: "Will",
}

function Lightbox({ photo, onClose, onPrev, onNext }) {
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} title="Close">×</button>
      {onPrev && <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); onPrev() }}>‹</button>}
      {onNext && <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); onNext() }}>›</button>}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.url} alt={photo.title || "Photo"} />
        {photo.title && <figcaption>{photo.title}</figcaption>}
      </figure>
    </div>
  )
}

function isRemote(url) {
  return /^https?:\/\//i.test(url || "")
}

function SourceItem({ citation, sources }) {
  const src = citation.ref ? sources.get(citation.ref) : null
  const pageIsUrl = citation.page && isRemote(citation.page)
  return (
    <div className="source-item">
      <div className="source-main">
        <span className="source-title">{src?.title || "Source"}</span>
        {src?.author && <span className="source-author"> by {src.author}</span>}
      </div>
      {pageIsUrl ? (
        <a className="source-link" href={citation.page} target="_blank" rel="noreferrer">
          {citation.page.length > 80 ? citation.page.slice(0, 77) + "…" : citation.page}
        </a>
      ) : (
        citation.page && <span className="source-page">{citation.page}</span>
      )}
      {citation.text && (
        <p className="source-text" dangerouslySetInnerHTML={{ __html: citation.text.replace(/<[^>]+>/g, " ") }} />
      )}
    </div>
  )
}

export default function PersonDetail({ person, individuals, families, sources, onSelect, onFindInTree }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  if (!person) return null
  const links = getPersonLinks(person, individuals, families)
  const spouseFams = getSpouseFamilies(person, families)
  const photos = person.photos
  const profilePhoto = getProfilePhoto(person)
  const age = person.birth?.iso && person.death?.iso
    ? (() => {
        const b = new Date(person.birth.iso.length === 7 ? person.birth.iso + "-01" : person.birth.iso)
        const d = new Date(person.death.iso.length === 7 ? person.death.iso + "-01" : person.death.iso)
        let a = d.getFullYear() - b.getFullYear()
        if (d.getMonth() < b.getMonth()) a--
        return a > 0 ? ` (aged ${a})` : ""
      })()
    : ""

  const sexLabel = { M: "Male", F: "Female", U: "Unknown" }[person.sex]

  const lifeline = [person.birth ? person.birth.display : null, person.death ? person.death.display : null]
    .filter(Boolean)
    .join(" — ")

  return (
    <div className="detail">
      <header className="detail-header">
        <div className="detail-header-row">
          {profilePhoto ? (
            <span className="profile-photo" data-sex={person.sex}>
              <Silhouette sex={person.sex} className="silhouette large" />
              <img
                className="profile-photo-img"
                src={profilePhoto.url}
                alt={person.name}
                onClick={() => setLightboxIndex(photos.indexOf(profilePhoto))}
                onError={(e) => { e.target.style.display = "none" }}
              />
            </span>
          ) : (
            <span className="profile-photo placeholder" data-sex={person.sex}>
              <Silhouette sex={person.sex} className="silhouette large" />
            </span>
          )}
          <div className="detail-heading">
            <h2>{person.name || "(Unknown)"}</h2>
            <p className="detail-sub">
              {lifeline}
              {age}
            </p>
            <div className="mini-facts">
              {person.birthPlace && <span>Born in {person.birthPlace}</span>}
              {person.deathPlace && <span>Died in {person.deathPlace}</span>}
              {person.occupation && <span>{person.occupation}</span>}
            </div>
            {onFindInTree && (
              <button className="btn small find-in-tree" onClick={() => onFindInTree(person.id)}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5" r="2.6" />
                  <path d="M12 7.6v4.4" />
                  <path d="M12 12l-4.6 8h9.2z" />
                  <path d="M7 16.6c2 1.8 3.2 2.9 5 3.4 1.8-.5 3-1.6 5-3.4" />
                </svg>
                Find in tree
              </button>
            )}
          </div>
        </div>
      </header>

      {photos.length > 0 && (
        <section className="photo-gallery">
          <div className="gallery-grid">
            {photos.map((photo, i) => (
              <figure key={i} className="gallery-item" onClick={() => setLightboxIndex(i)}>
                <img
                  src={photo.url}
                  alt={photo.title || ""}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.parentElement.style.display = "none" }}
                />
                {photo.isProfile && <span className="gallery-badge">Profile</span>}
                {photo.title && <figcaption>{photo.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="fact-grid">
        <FactRow label="Gender">{sexLabel}</FactRow>
        <FactRow label="Birth">
          {person.birth?.display}
          {person.birthPlace ? ` · ${person.birthPlace}` : ""}
        </FactRow>
        <FactRow label="Death">
          {person.death?.display}
          {person.deathPlace ? ` · ${person.deathPlace}` : ""}
        </FactRow>
        {person.burial && (
          <FactRow label="Burial">
            {person.burial.display}
            {person.burialPlace ? ` · ${person.burialPlace}` : ""}
          </FactRow>
        )}
        <FactRow label="Occupation">{person.occupation}</FactRow>
        {person.events.map((ev, i) => (
          <FactRow key={i} label={EVENT_LABELS[ev.tag] || ev.tag}>
            {ev.date?.display}
            {ev.place ? ` · ${ev.place}` : ""}
            {ev.address ? ` · ${ev.address}` : ""}
            {ev.value ? ` · ${ev.value}` : ""}
          </FactRow>
        ))}
      </section>

      {person.note && (
        <section className="note-card">
          <h3>Notes</h3>
          <p>{person.note}</p>
        </section>
      )}

      {(links.parents.length > 0 || links.siblings.length > 0) && (
        <section>
          <h3>Immediate family</h3>
          {links.parents.length > 0 && (
            <div className="chip-row">
              {links.parents.map((p) => (
                <PersonChip key={p.id} person={p} onSelect={onSelect} role={p.sex === "F" ? "Mother" : "Father"} />
              ))}
            </div>
          )}
          {links.siblings.length > 0 && (
            <div className="chip-row">
              {links.siblings.map((p) => (
                <PersonChip key={p.id} person={p} onSelect={onSelect} role="Sibling" />
              ))}
            </div>
          )}
        </section>
      )}

      {spouseFams.length > 0 && (
        <section>
          <h3>{spouseFams.length > 1 ? "Spouses & children" : "Spouse & children"}</h3>
          {spouseFams.map((fam) => {
            const spouseId = fam.husband === person.id ? fam.wife : fam.husband
            const spouse = individuals.get(spouseId)
            return (
              <div className="family-unit" key={fam.id}>
                <div className="chip-row">
                  <PersonChip person={spouse} onSelect={onSelect} role="Spouse" />
                </div>
                {fam.marriage && (
                  <p className="marriage-line">
                    Married {fam.marriage.display}
                    {fam.marriagePlace ? ` · ${fam.marriagePlace}` : ""}
                  </p>
                )}
                {fam.children.length > 0 && (
                  <div className="chip-row">
                    {fam.children.map((cid) => (
                      <PersonChip key={cid} person={individuals.get(cid)} onSelect={onSelect} role="Child" />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {person.sources.length > 0 && (
        <section>
          <h3>Sources ({person.sources.length})</h3>
          <div className="sources-list">
            {person.sources.map((c, i) => (
              <SourceItem key={i} citation={c} sources={sources} />
            ))}
          </div>
        </section>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onPrev={photos.length > 1 ? () => setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length) : null}
          onNext={photos.length > 1 ? () => setLightboxIndex((lightboxIndex + 1) % photos.length) : null}
        />
      )}
    </div>
  )
}
