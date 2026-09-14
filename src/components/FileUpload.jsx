import { useCallback, useRef, useState } from "react"

export default function FileUpload({ onLoad }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback(
    (file) => {
      if (!file) return
      if (!/\.(ged|txt)$/i.test(file.name) && file.type !== "text/plain") {
        setError("Please upload a .ged (GEDCOM) file.")
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          onLoad(reader.result, file.name)
          setError(null)
          setFileName(file.name)
        } catch (e) {
          setError("Could not read that file: " + e.message)
        }
      }
      reader.onerror = () => setError("Could not read that file.")
      reader.readAsText(file)
    },
    [onLoad]
  )

  return (
    <div className="upload-screen">
      <div className="upload-hero">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="5" r="2.6" />
            <path d="M12 7.6v4.4" />
            <path d="M12 12l-4.6 8h9.2z" />
            <path d="M7 16.6c2 1.8 3.2 2.9 5 3.4 1.8-.5 3-1.6 5-3.4" />
          </svg>
        </div>
        <h1>Family Tree</h1>
        <p className="tagline">
          Upload a GEDCOM file to explore, search, and visualize your family history.
        </p>
      </div>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFile(e.dataTransfer.files[0])
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ged,.txt,text/plain"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
        </svg>
        <p className="drop-title">Drag &amp; drop your GEDCOM file here</p>
        <p className="drop-sub">or click to browse — supports .ged files (GEDCOM 5.5+)</p>
      </div>

      {error && <p className="error">{error}</p>}
      {fileName && <p className="file-loaded">Loaded: {fileName}</p>}

      <button className="btn ghost" onClick={() => onLoad(null, "sample.ged")}>
        No file handy? Load the sample family
      </button>

      <p className="privacy-note">
        Files are parsed locally in your browser — nothing is uploaded to any server.
      </p>
    </div>
  )
}
