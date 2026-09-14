import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  bandForZoom,
  buildAnchoredLayout,
  buildFamilyStructure,
  memberCardX,
  segmentX,
  SIZE_BANDS,
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

function PersonCard({ person, x, y, selected, onSelect, s }) {
  const { NODE_W, NODE_H } = s
  const band = s.key
  const years = shortYears(person)
  const photo = (person.photos || []).find((p) => p.isProfile)?.url || (person.photos || [])[0]?.url || null
  const clipId = `clip-${person.id}`
  const firstName = (person.name || "?").split(" ")[0]
  const compact = band === "compact"
  const medium = band === "medium"
  const avatarR = compact ? NODE_H / 2 - 2 : NODE_H / 2 - 6
  const avatarCx = compact ? 0 : NODE_H / 2
  const textX = compact ? 6 : NODE_H + 10
  const nameSize = compact ? NODE_H - 4 : medium ? 12.5 : 13.5
  const yearsSize = compact ? 0 : 11.5

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
      <rect width={NODE_W} height={NODE_H} rx={compact ? 6 : 10} className="node-bg" />
      <rect x="0" y="0" width={compact ? 3 : 5} height={NODE_H} rx={compact ? 1.5 : 2.5} className={`node-accent sex-${person.sex}`} />
      {!compact && (
        <circle cx={avatarCx} cy={NODE_H / 2} r={avatarR} className={`node-initial-bg sex-${person.sex}`} />
      )}
      {!compact && (
        <g transform={`translate(${avatarCx - 10} ${NODE_H / 2 - 11.5})`} className="node-silhouette">
          <SilhouettePaths sex={person.sex} />
        </g>
      )}
      {!compact && photo && (
        <>
          <clipPath id={clipId}>
            <circle cx={avatarCx} cy={NODE_H / 2} r={avatarR} />
          </clipPath>
          <image
            href={photo}
            x={avatarCx - avatarR}
            y={NODE_H / 2 - avatarR}
            width={avatarR * 2}
            height={avatarR * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            onError={(e) => {
              e.target.style.display = "none"
            }}
          />
        </>
      )}
      {!compact && (
        <circle cx={avatarCx} cy={NODE_H / 2} r={avatarR} className="node-photo-ring" />
      )}
      <text
        x={textX}
        y={years && !medium ? NODE_H / 2 - 7 : NODE_H / 2 + 4.5}
        className="node-name"
        style={{ fontSize: nameSize }}
      >
        {compact ? firstName : person.name || "(Unknown)"}
      </text>
      {years && !compact && !medium && (
        <text x={textX} y={NODE_H / 2 + 10.5} className="node-years" style={{ fontSize: yearsSize }}>
          {years}
        </text>
      )}
    </g>
  )
}

function segmentBottom(unit, spouse, s) {
  const { NODE_H } = s
  return { x: segmentX(unit, spouse, s), y: unit.y + NODE_H }
}

function downEdgePath(parent, child, spouse, s) {
  const p = segmentBottom(parent, spouse, s)
  const c = { x: child.x + child.w / 2, y: child.y }
  const mid = p.y + (c.y - p.y) / 2
  return `M ${p.x} ${p.y} C ${p.x} ${mid}, ${c.x} ${mid}, ${c.x} ${c.y}`
}

function upEdgePath(parent, child, memberId, s) {
  const p = { x: parent.x + parent.w / 2, y: parent.y + s.NODE_H }
  const c = { x: memberCardX(child, memberId, s), y: child.y }
  const mid = p.y + (c.y - p.y) / 2
  return `M ${p.x} ${p.y} C ${p.x} ${mid}, ${c.x} ${mid}, ${c.x} ${c.y}`
}

const K_MIN = 0.05
const K_MAX = 5

export default function TreeCanvas({ individuals, families, homeId, selectedId, onSelect, focusId, focusNonce }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 24, y: 24, k: 1 })
  const transformRef = useRef(transform)
  const pointers = useRef(new Map())
  const gesture = useRef(null)

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  const band = bandForZoom(transform.k)
  const s = SIZE_BANDS[band.key]
  const { NODE_H } = s

  const structure = useMemo(
    () => buildFamilyStructure(individuals, families, s),
    [individuals, families, s]
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
    () => buildAnchoredLayout(structure, homeId, upCollapsed, downCollapsed, s),
    [structure, homeId, upCollapsed, downCollapsed, s]
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
  }, [clamp, homeUnit, NODE_H])

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
        for (const st of steps) {
          if (st.dir === "down") {
            nextDown.delete(st.from)
            for (const g of structure.upGroupsOf.get(st.to) || []) {
              if (g.parents.some((p) => p.key === st.from)) {
                nextUp.delete(`up:${st.to}:${g.memberId}`)
              }
            }
          } else {
            nextUp.delete(`up:${st.from}:${st.memberId}`)
            nextDown.delete(st.to)
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
  }, [layout, clamp, NODE_H])

  const zoomAt = (factor, cx, cy) => {
    const el = containerRef.current
    const px = cx ?? (el ? el.clientWidth / 2 : 0)
    const py = cy ?? (el ? el.clientHeight / 2 : 0)
    setTransform((t) => {
      const k = Math.min(K_MAX, Math.max(K_MIN, t.k * factor))
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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = {
        mode: "pan",
        sx: e.clientX,
        sy: e.clientY,
        tx: transform.x,
        ty: transform.y,
      }
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()]
      gesture.current = {
        mode: "pinch",
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mx: (pts[0].x + pts[1].x) / 2,
        my: (pts[0].y + pts[1].y) / 2,
        tx: transform.x,
        ty: transform.y,
        k: transform.k,
      }
    }
  }

  useEffect(() => {
    let rafId = null
    const apply = () => {
      rafId = null
      const g = gesture.current
      if (!g) return
      if (g.mode === "pan") {
        const p = pointers.current.values().next().value
        if (!p) return
        setTransform((t) =>
          clamp({
            ...t,
            x: g.tx + (p.x - g.sx),
            y: g.ty + (p.y - g.sy),
          })
        )
      } else if (g.mode === "pinch") {
        const pts = [...pointers.current.values()]
        if (pts.length < 2) return
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        const mx = (pts[0].x + pts[1].x) / 2
        const my = (pts[0].y + pts[1].y) / 2
        const el = containerRef.current
        if (!el) return
        const ratio = dist / Math.max(1, g.dist)
        const k = Math.min(K_MAX, Math.max(K_MIN, g.k * ratio))
        const px = mx - el.getBoundingClientRect().left
        const py = my - el.getBoundingClientRect().top
        setTransform(
          clamp({
            k,
            x: px - (k / g.k) * (px - g.tx),
            y: py - (k / g.k) * (py - g.ty),
          })
        )
      }
    }
    const onMove = (e) => {
      if (!pointers.current.has(e.pointerId)) return
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (rafId === null) rafId = requestAnimationFrame(apply)
    }
    const onUp = (e) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size === 0) {
        gesture.current = null
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
      } else if (pointers.current.size === 1 && gesture.current?.mode === "pinch") {
        const p = pointers.current.values().next().value
        gesture.current = { mode: "pan", sx: p.x, sy: p.y, tx: transformRef.current.x, ty: transformRef.current.y }
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
  }, [clamp, fitK])

  const { units, edges, upEdges, secondaryUpEdges, upGroupsOf, hasChildren } = layout

  const spouseLinks = units.filter((u) => u.kind === "couple" && u.husband && u.wife)
  const multiLinks = units.filter((u) => u.kind === "multi")

  return (
    <div className="tree-wrap" ref={containerRef} onPointerDown={onPointerDown}>
      <div className="tree-toolbar">
        <span className="tree-hint">Scroll or pinch to zoom · drag to pan · click a card to select · + opens older generations</span>
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
            d={upEdgePath(e.parent, e.child, e.memberId, s)}
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
            d={upEdgePath(e.parent, e.child, e.memberId, s)}
            fill="none"
            stroke="#b9c4b2"
            strokeWidth="2"
          />
        ))}
        {edges.map((e, i) => (
          <path
            key={`e${i}`}
            d={downEdgePath(e.parent, e.child, e.spouse, s)}
            fill="none"
            stroke="#8aa88e"
            strokeWidth="2"
          />
        ))}
        {spouseLinks.map((u) => (
          <line
            key={`sp-${u.key}`}
            x1={u.x + s.NODE_W}
            y1={u.y + NODE_H / 2}
            x2={u.x + s.NODE_W + s.COUPLE_GAP}
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
              x1={u.x + s.NODE_W + i * (s.NODE_W + s.COUPLE_GAP)}
              y1={u.y + NODE_H / 2}
              x2={u.x + s.NODE_W + s.COUPLE_GAP + i * (s.NODE_W + s.COUPLE_GAP)}
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
                    s={s}
                  />
                )}
                {u.wife && (
                  <PersonCard
                    person={u.wife}
                    x={u.x + s.NODE_W + s.COUPLE_GAP}
                    y={u.y}
                    selected={u.wife.id === selectedId}
                    onSelect={onSelect}
                    s={s}
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
                  s={s}
                />
                {u.spouses.map((spouse, i) => (
                  <PersonCard
                    key={spouse.id}
                    person={spouse}
                    x={u.x + s.NODE_W + s.COUPLE_GAP + i * (s.NODE_W + s.COUPLE_GAP)}
                    y={u.y}
                    selected={spouse.id === selectedId}
                    onSelect={onSelect}
                    s={s}
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
                s={s}
              />
            )}
            {upGroupsOf.get(u.key).map((group) => {
              const memberKey = `up:${u.key}:${group.memberId}`
              return (
                <g
                  key={memberKey}
                  className="expand-bubble up"
                  transform={`translate(${memberCardX(u, group.memberId, s)} ${u.y - 14})`}
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
                transform={`translate(${u.x + u.w / 2} ${u.y + NODE_H + 14})`}
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
