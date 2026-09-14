import { useCallback, useEffect, useMemo, useState } from "react"
import FileUpload from "./components/FileUpload"
import PersonList from "./components/PersonList"
import PersonDetail from "./components/PersonDetail"
import TreeCanvas from "./components/TreeCanvas"
import { parseGedcom, orderPeopleByRelation } from "./lib/gedcom"
import { SAMPLE_GEDCOM } from "./lib/sample"

export default function App() {
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [homeId, setHomeId] = useState(null)
  const [tab, setTab] = useState("tree")
  const [showUpload, setShowUpload] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [focus, setFocus] = useState({ id: null, nonce: 0 })

  const handleLoad = useCallback((text, name) => {
    let content = text
    if (name === "sample.ged") {
      content = SAMPLE_GEDCOM
    }
    const parsed = parseGedcom(content)
    const firstId = parsed.individuals.keys().next().value ?? null
    setData(parsed)
    setFileName(name === "sample.ged" ? "sample.ged (built-in sample)" : name)
    setSelectedId(firstId)
    setHomeId(firstId)
    setTab("tree")
    setShowUpload(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("./family.ged")
      .then((res) => {
        if (!res.ok) throw new Error("no family file")
        return res.text()
      })
      .then((text) => {
        if (cancelled || !text.trim()) throw new Error("empty")
        handleLoad(text, "family.ged")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [handleLoad])

  const selected = useMemo(
    () => (data && selectedId ? data.individuals.get(selectedId) : null),
    [data, selectedId]
  )

  const orderedPeople = useMemo(() => {
    if (!data) return []
    return orderPeopleByRelation(data.individuals, data.families, homeId)
  }, [data, homeId])

  const findInTree = useCallback((id) => {
    setSelectedId(id)
    setFocus((f) => ({ id, nonce: f.nonce + 1 }))
    setTab("tree")
  }, [])

  if (!data) {
    return (
      <div className="app-shell">
        <FileUpload onLoad={handleLoad} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setTab("tree")}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="5" r="2.6" />
            <path d="M12 7.6v4.4" />
            <path d="M12 12l-4.6 8h9.2z" />
            <path d="M7 16.6c2 1.8 3.2 2.9 5 3.4 1.8-.5 3-1.6 5-3.4" />
          </svg>
          <span>Bolton Family Tree</span>
        </div>
        <nav className="top-tabs">
          <button className={tab === "tree" ? "active" : ""} onClick={() => setTab("tree")}>
            Family Tree
          </button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
            Profile
          </button>
        </nav>
        <div className="file-meta">
          <span className="file-name" title={fileName}>{fileName}</span>
          <span className="stats">
            {data.people.length} people · {data.families.size} families
          </span>
        </div>
        <button className="btn ghost small" onClick={() => setShowUpload(true)}>
          Load another file
        </button>
      </header>

      {showUpload && (
        <div className="modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <FileUpload onLoad={handleLoad} />
            <button className="btn ghost small modal-close" onClick={() => setShowUpload(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={`layout ${sidebarOpen ? "" : "sidebar-closed"}`}>
        <button
          className="sidebar-arrow"
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? "Hide people list" : "Show people list"}
          aria-label={sidebarOpen ? "Hide people list" : "Show people list"}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>
        <aside className="sidebar">
          <PersonList people={orderedPeople} selectedId={selectedId} onSelect={(id) => {
            setSelectedId(id)
            setTab("profile")
          }} />
        </aside>

        <main className="main">
          {tab === "profile" && (
            <div className="pane">
              <PersonDetail
                key={selectedId}
                person={selected}
                individuals={data.individuals}
                families={data.families}
                sources={data.sources}
                onSelect={setSelectedId}
                onFindInTree={findInTree}
              />
            </div>
          )}

          {tab === "tree" && (
            <div className="pane tree-pane">
              <TreeCanvas
                key={data}
                individuals={data.individuals}
                families={data.families}
                homeId={homeId}
                selectedId={selectedId}
                onSelect={setSelectedId}
                focusId={focus.id}
                focusNonce={focus.nonce}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
