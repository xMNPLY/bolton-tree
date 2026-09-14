import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildAnchoredLayout,
  buildFamilyStructure,
  COUPLE_GAP,
  memberCardX,
  NODE_H,
  NODE_W,
} from "../lib/layout"
import { SilhouettePaths } from "./Silhouette"

function shortYears(person) {
  const b = person.birth?.iso?.slice(0, 4)
  const d = person.death?.iso?.slice(0, 4)
  if (!b && !d) return ""
  if (b && d) return `${b}–${d}`
  if (b) return `b. ${b}`
  return `d. ${d}`
}

function PersonCard({ person, x, y, selected, onSelect }) {
  const years = shortYears(person)
  const photo = (person.photos || []).find((p) => p.isProfile)?.url || (person.photos || [])[0]?.url || null
  const clipId = `clip-${person.id}`
  return (
    <g
      className={`tree-node ${selected ? "selected" : ""}`}
      transform={`translate(${x} ${y})`}
      onClick={() => onSelect(person.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(person.id)
      }}
    >
      <rect width={NODE_W} height={NODE_H} rx="10" className="node-bg" />
      <rect x="0" y="0" width="5" height={NODE_H} rx="2.5" className={`node-accent sex-${person.sex}`} />
      <circle cx="30" cy={NODE_H / 2} r="19" className={`node-initial-bg sex-${person.sex}`} />
      <g transform="translate(20 22.5)" className="node-silhouette">
        <SilhouettePaths sex={person.sex} />
      </g>
      {photo && (
        <>
          <clipPath id={clipId}>
            <circle cx="30" cy={NODE_H / 2} r="19" />
          </clipPath>
          <image
            href={photo}
            x="11"
            y={NODE_H / 2 - 19}
            width="38"
            height="38"
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            onError={(e) => {
              e.target.style.display = "none"
            }}
          />
        </>
      )}
      <circle cx="30" cy={NODE_H / 2} r="19" className="node-photo-ring" />
      <text x="58" y={years ? "26" : "32"} className="node-name">{person.name || "(Unknown)"}</text>
      {years && <text x="58" y="46" className="node-years">{years}</text>}
    </g>
  )
}

function segmentBottom(unit, spouse) {
  if (!spouse || unit.kind !== "multi") {
    return { x: unit.x + unit.w / 2, y: unit.y + NODE_H }
  }
  const idx = unit.spouses.findIndex((s) => s.id === spouse.id)
  const anchorCx = unit.x + NODE_W / 2
  const spouseCx = unit.x + NODE_W + COUPLE_GAP + idx * (NODE_W + COUPLE_GAP) + NODE_W / 2
  return { x: (anchorCx + spouseCx) / 2, y: unit.y + NODE_H }
}

function downEdgePath(parent, child, spouse) {
  const p = segmentBottom(parent, spouse)
  const c = { x: child.x + child.w / 2, y: child.y }
  const mid = p.y + (c.y - p.y) / 2
  return `M ${p.x} ${p.y} C ${p.x} ${mid}, ${c.x} ${mid}, ${c.x} ${c.y}`
}

function upEdgePath(parent, child, memberId) {
  const p = { x: parent.x + parent.w / 2, y: parent.y + NODE_H }
  const c = { x: memberCardX(child, memberId), y: child.y }
  const mid = p.y + (c.y - p.y) / 2
  return `M ${p.x} ${p.y} C ${p.x} ${mid}, ${c.x} ${mid}, ${c.x} ${c.y}`
}

const K_MIN = 0.05
const K_MAX = 5

export default function TreeCanvas({ individuals, families, homeId, selectedId, onSelect, focusId, focusNonce }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 24, y: 24, k: 1 })
  const drag = useRef(null)

  const structure = useMemo(
    () => buildFamilyStructure(individuals, families),
    [individuals, families]
  )

  const [upCollapsed, setUpCollapsed] = useState(() => {
    const home = structure.byPerson.get(homeId)
    const set = new Set()
    for (const u of structure.units) {
      for (const g of structure.upGroupsOf.get(u.key)) {
        set.add(`up:${u.key}:${g.memberId}`)
      }
    }
    if (home) {
      for (const g of structure.upGroupsOf.get(home.key)) {
        set.delete(`up:${home.key}:${g.memberId}`)
      }
    }
    return set
  })

  const [downCollapsed, setDownCollapsed] = useState(() => {
    const home = structure.byPerson.get(homeId)
    if (!home) return new Set()
    const set = new Set(
      structure.units.filter((u) => structure.hasChildren.get(u.key)).map((u) => u.key)
    )
    set.delete(home.key)
    for (const g of structure.upGroupsOf.get(home.key)) {
      for (const p of g.parents) set.delete(p.key)
    }
    return set
  })

  const layout = useMemo(
    () => buildAnchoredLayout(structure, homeId, upCollapsed, downCollapsed),
    [structure, homeId, upCollapsed, downCollapsed]
  )

  const parseUpKey = (key) => {
    const rest = key.slice(3)
    const i = rest.lastIndexOf(":")
    return { unitKey: rest.slice(0, i), memberId: rest.slice(i + 1) }
  }

  const toggleUp = (key) => {
    const { unitKey, memberId } = parseUpKey(key)
    const group = (structure.upGroupsOf.get(unitKey) || []).find((g) => g.memberId === memberId)
    const expanding = upCollapsed.has(key)
    const nextUp = new Set(upCollapsed)
    const nextDown = new Set(downCollapsed)
    if (expanding) nextUp.delete(key)
    else nextUp.add(key)
    for (const p of group?.parents || []) {
      if (expanding) nextDown.delete(p.key)
      else nextDown.add(p.key)
    }
    setUpCollapsed(nextUp)
    setDownCollapsed(nextDown)
  }

  const toggleDown = (key) => {
    setDownCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const fitK = useCallback(() => {
    const el = containerRef.current
    if (!el || !el.clientWidth || !el.clientHeight) return 1
    const fit = Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height) * 0.96
    return Math.max(K_MIN, fit)
  }, [layout.width, layout.height])

  const clamp = useCallback((t) => {
    const el = containerRef.current
    if (!el || !el.clientWidth || !el.clientHeight) return t
    const cw = el.clientWidth
    const ch = el.clientHeight
    const scaledW = layout.width * t.k
    const scaledH = layout.height * t.k
    const x = scaledW <= cw ? (cw - scaledW) / 2 : Math.min(80, Math.max(cw - scaledW - 80, t.x))
    const y = scaledH <= ch ? (ch - scaledH) / 2 : Math.min(80, Math.max(ch - scaledH - 80, t.y))
    return { ...t, x, y }
  }, [layout.width, layout.height])

  const fitToView = useCallback(() => {
    setTransform(clamp({ k: fitK(), x: 24, y: 24 }))
  }, [fitK, clamp])

  const homeUnit = layout.home
  const initialViewDone = useRef(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (initialViewDone.current) return
      initialViewDone.current = true
      const el = containerRef.current
      if (!el || !homeUnit) return
      const k = 1
      setTransform(clamp({
        k,
        x: el.clientWidth / 2 - (homeUnit.x + homeUnit.w / 2) * k,
        y: el.clientHeight / 2 - (homeUnit.y + NODE_H / 2) * k,
      }))
    })
    return () => cancelAnimationFrame(raf)
  }, [clamp, homeUnit])

  const pendingPan = useRef(null)

  const focusInTree = useCallback((id) => {
    const target = structure.byPerson.get(id)
    const homeU = structure.byPerson.get(homeId)
    if (!target) return

    const expandPathTo = (fromUnitKey, homeKey) => {
      const adj = new Map()
      for (const u of structure.units) {
        const list = []
        for (const g of structure.kidsOf.get(u.key)) {
          for (const k of g.kids) list.push({ key: k.key, dir: "down" })
        }
        for (const g of structure.upGroupsOf.get(u.key)) {
          for (const p of g.parents) list.push({ key: p.key, dir: "up", memberId: g.memberId })
        }
        adj.set(u.key, list)
      }
      const prev = new Map()
      const q = [fromUnitKey]
      const seen = new Set([fromUnitKey])
      while (q.length > 0 && !seen.has(homeKey)) {
        const cur = q.shift()
        for (const nb of adj.get(cur) || []) {
          if (seen.has(nb.key)) continue
          seen.add(nb.key)
          prev.set(nb.key, { from: cur, dir: nb.dir, memberId: nb.memberId })
          q.push(nb.key)
        }
      }
      if (!seen.has(homeKey)) return null
      const steps = []
      let cur = homeKey
      let guard = 0
      while (cur && cur !== fromUnitKey && guard < 60) {
        const p = prev.get(cur)
        if (!p) break
        steps.push({ from: p.from, to: cur, dir: p.dir, memberId: p.memberId })
        cur = p.from
        guard++
      }
      return steps
    }

    const nextUp = new Set(upCollapsed)
    const nextDown = new Set(downCollapsed)
    let pathOk = false

    if (homeU) {
      const steps = expandPathTo(target.key, homeU.key)
      if (steps) {
        pathOk = true
        for (const s of steps) {
          if (s.dir === "down") {
            nextDown.delete(s.from)
            for (const g of structure.upGroupsOf.get(s.to) || []) {
              if (g.parents.some((p) => p.key === s.from)) {
                nextUp.delete(`up:${s.to}:${g.memberId}`)
              }
            }
          } else {
            nextUp.delete(`up:${s.from}:${s.memberId}`)
            nextDown.delete(s.to)
          }
        }
      }
    }

    if (!pathOk) {
      const q = [target.key]
      const seen = new Set([target.key])
      let guard = 0
      while (q.length > 0 && guard < 60) {
        const cur = q.shift()
        for (const g of structure.upGroupsOf.get(cur) || []) {
          nextUp.delete(`up:${cur}:${g.memberId}`)
          for (const p of g.parents) {
            nextDown.delete(p.key)
            if (!seen.has(p.key)) {
              seen.add(p.key)
              q.push(p.key)
            }
          }
        }
        guard++
      }
    }

    setUpCollapsed(nextUp)
    setDownCollapsed(nextDown)
    pendingPan.current = id
  }, [structure, homeId, upCollapsed, downCollapsed])

  const lastFocusNonce = useRef(0)

  useEffect(() => {
    if (!focusNonce || !focusId || focusNonce === lastFocusNonce.current) return
    const raf = requestAnimationFrame(() => {
      if (focusNonce === lastFocusNonce.current) return
      lastFocusNonce.current = focusNonce
      focusInTree(focusId)
    })
    return () => cancelAnimationFrame(raf)
  }, [focusNonce, focusId, focusInTree])

  useEffect(() => {
    if (!pendingPan.current) return
    const id = pendingPan.current
    pendingPan.current = null
    const unit = layout.byPerson.get(id)
    const el = containerRef.current
    if (unit && el) {
      const k = 1.2
      setTransform(clamp({
        k,
        x: el.clientWidth / 2 - (unit.x + unit.w / 2) * k,
        y: el.clientHeight / 2 - (unit.y + NODE_H / 2) * k,
      }))
    }
  }, [layout, clamp])

  const zoomAt = (factor, cx, cy) => {
    const el = containerRef.current
    const px = cx ?? (el ? el.clientWidth / 2 : 0)
    const py = cy ?? (el ? el.clientHeight / 2 : 0)
    setTransform((t) => {
      const lo = fitK()
      const k = Math.min(K_MAX, Math.max(lo, t.k * factor))
      const ratio = k / t.k
      return clamp({
        k,
        x: px - ratio * (px - t.x),
        y: py - ratio * (py - t.y),
      })
    })
  }

  const onWheel = (e) => {
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.target.closest && (e.target.closest(".tree-toolbar") || e.target.closest(".expand-bubble"))) return
    e.preventDefault()
    drag.current = { sx: e.clientX, sy: e.clientY, tx: transform.x, ty: transform.y }
  }

  useEffect(() => {
    let rafId = null
    const apply = () => {
      rafId = null
      const d = drag.current
      if (!d) return
      setTransform((t) =>
        clamp({
          ...t,
          x: d.tx + (d.lastX - d.sx),
          y: d.ty + (d.lastY - d.sy),
        })
      )
    }
    const onMove = (e) => {
      if (!drag.current) return
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
      drag.current.lastX = e.clientX
      drag.current.lastY = e.clientY
      if (rafId === null) rafId = requestAnimationFrame(apply)
    }
    const onUp = () => {
      drag.current = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    window.addEventListener("blur", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("blur", onUp)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [clamp])

  const { units, edges, upEdges, secondaryUpEdges, upGroupsOf, hasChildren } = layout

  const spouseLinks = units.filter((u) => u.kind === "couple" && u.husband && u.wife)
  const multiLinks = units.filter((u) => u.kind === "multi")

  return (
    <div className="tree-wrap" ref={containerRef} onPointerDown={onPointerDown}>
      <div className="tree-toolbar">
        <span className="tree-hint">Scroll to zoom · drag to pan · click a card to select · + opens older generations above, − folds below</span>
        <div className="zoom-controls">
          <button onClick={() => zoomAt(1.3)} title="Zoom in">+</button>
          <button onClick={() => zoomAt(1 / 1.3)} title="Zoom out">−</button>
          <button onClick={fitToView} title="Fit to screen">⤢</button>
          <button onClick={() => setTransform(clamp({ x: 24, y: 24, k: 1 }))} title="Reset view">⟲</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className="tree-svg"
        onWheel={onWheel}
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          transformOrigin: "0 0",
        }}
      >
        {secondaryUpEdges.map((e, i) => (
          <path
            key={`se${i}`}
            d={upEdgePath(e.parent, e.child, e.memberId)}
            fill="none"
            stroke="#d9a441"
            strokeWidth="1.5"
            strokeDasharray="6 5"
            opacity="0.85"
          />
        ))}
        {upEdges.map((e, i) => (
          <path
            key={`ue${i}`}
            d={upEdgePath(e.parent, e.child, e.memberId)}
            fill="none"
            stroke="#b9c4b2"
            strokeWidth="2"
          />
        ))}
        {edges.map((e, i) => (
          <path
            key={`e${i}`}
            d={downEdgePath(e.parent, e.child, e.spouse)}
            fill="none"
            stroke="#8aa88e"
            strokeWidth="2"
          />
        ))}
        {spouseLinks.map((u) => (
          <line
            key={`sp-${u.key}`}
            x1={u.x + NODE_W}
            y1={u.y + NODE_H / 2}
            x2={u.x + NODE_W + COUPLE_GAP}
            y2={u.y + NODE_H / 2}
            stroke="#c9a27a"
            strokeWidth="2.5"
            strokeDasharray="5 4"
          />
        ))}
        {multiLinks.map((u) =>
          u.spouses.map((spouse, i) => (
            <line
              key={`ml-${u.key}-${spouse.id}`}
              x1={u.x + NODE_W + i * (NODE_W + COUPLE_GAP)}
              y1={u.y + NODE_H / 2}
              x2={u.x + NODE_W + COUPLE_GAP + i * (NODE_W + COUPLE_GAP)}
              y2={u.y + NODE_H / 2}
              stroke="#c9a27a"
              strokeWidth="2.5"
              strokeDasharray="5 4"
            />
          ))
        )}
        {units.map((u) => (
          <g key={u.key}>
            {u.kind === "couple" && (
              <>
                {u.husband && (
                  <PersonCard
                    person={u.husband}
                    x={u.x}
                    y={u.y}
                    selected={u.husband.id === selectedId}
                    onSelect={onSelect}
                  />
                )}
                {u.wife && (
                  <PersonCard
                    person={u.wife}
                    x={u.x + NODE_W + COUPLE_GAP}
                    y={u.y}
                    selected={u.wife.id === selectedId}
                    onSelect={onSelect}
                  />
                )}
              </>
            )}
            {u.kind === "multi" && (
              <>
                <PersonCard
                  person={u.anchor}
                  x={u.x}
                  y={u.y}
                  selected={u.anchor.id === selectedId}
                  onSelect={onSelect}
                />
                {u.spouses.map((spouse, i) => (
                  <PersonCard
                    key={spouse.id}
                    person={spouse}
                    x={u.x + NODE_W + COUPLE_GAP + i * (NODE_W + COUPLE_GAP)}
                    y={u.y}
                    selected={spouse.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </>
            )}
            {u.kind === "single" && (
              <PersonCard
                person={u.person}
                x={u.x}
                y={u.y}
                selected={u.person.id === selectedId}
                onSelect={onSelect}
              />
            )}
            {upGroupsOf.get(u.key).map((group) => {
              const memberKey = `up:${u.key}:${group.memberId}`
              return (
                <g
                  key={memberKey}
                  className="expand-bubble up"
                  transform={`translate(${memberCardX(u, group.memberId)} ${u.y - 16})`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleUp(memberKey)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      toggleUp(memberKey)
                    }
                  }}
                >
                  <circle r="11" />
                  <text y="4.5" textAnchor="middle">{upCollapsed.has(memberKey) ? "+" : "−"}</text>
                </g>
              )
            })}
            {hasChildren.get(u.key) && (
              <g
                className="expand-bubble down"
                transform={`translate(${u.x + u.w / 2} ${u.y + NODE_H + 16})`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleDown(u.key)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation()
                    toggleDown(u.key)
                  }
                }}
              >
                <circle r="11" />
                <text y="4.5" textAnchor="middle">{downCollapsed.has(u.key) ? "+" : "−"}</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
