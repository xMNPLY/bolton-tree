export const NODE_W = 218
export const NODE_H = 64
export const COUPLE_GAP = 26

const ROW = NODE_H + 84
const GAP = 24
const ROOT_GAP = 80
const SEG_W = NODE_W * 2 + COUPLE_GAP

export function buildFamilyStructure(individuals, families) {
  const coupleUnits = new Map()
  const singleUnits = new Map()
  const multiUnits = new Map()
  const byPerson = new Map()
  const byKey = new Map()

  const person = (id) => (id ? individuals.get(id) : null)

  const marriageCount = (p) => p.families.filter((f) => f.type === "FAMS").length

  function makeSingleUnit(id) {
    const p = person(id)
    if (!p) return null
    if (!singleUnits.has(id)) {
      singleUnits.set(id, {
        key: `s:${id}`,
        kind: "single",
        person: p,
        husband: null,
        wife: null,
        anchor: null,
        spouses: [],
        marriages: [],
        x: 0,
        y: 0,
        w: NODE_W,
      })
    }
    return singleUnits.get(id)
  }

  function makeMultiUnit(anchorId) {
    const p = person(anchorId)
    if (!p) return null
    if (!multiUnits.has(anchorId)) {
      const spouses = []
      const marriages = []
      for (const f of p.families.filter((f) => f.type === "FAMS")) {
        const fam = families.get(f.ref)
        if (!fam) continue
        const spouseId = fam.husband === p.id ? fam.wife : fam.husband
        const spouse = person(spouseId)
        if (spouse && !spouses.some((s) => s.id === spouse.id)) spouses.push(spouse)
        marriages.push({
          spouse: spouse || null,
          children: fam.children.map((id) => person(id)).filter(Boolean),
        })
      }
      multiUnits.set(anchorId, {
        key: `m:${anchorId}`,
        kind: "multi",
        person: p,
        husband: null,
        wife: null,
        anchor: p,
        spouses,
        marriages,
        x: 0,
        y: 0,
        w: NODE_W + spouses.length * (NODE_W + COUPLE_GAP),
      })
    }
    return multiUnits.get(anchorId)
  }

  function makeCoupleUnit(fam) {
    if (!fam || (!fam.husband && !fam.wife)) return null
    const hu = person(fam.husband)
    const wi = person(fam.wife)
    if (!hu && !wi) return null
    if (!coupleUnits.has(fam.id)) {
      coupleUnits.set(fam.id, {
        key: `f:${fam.id}`,
        kind: "couple",
        person: hu || wi,
        husband: hu,
        wife: wi,
        anchor: null,
        spouses: [],
        marriages: [{ spouse: null, children: fam.children.map((id) => person(id)).filter(Boolean) }],
        x: 0,
        y: 0,
        w: hu && wi ? SEG_W : NODE_W,
      })
    }
    return coupleUnits.get(fam.id)
  }

  function famUnit(fam) {
    if (!fam || (!fam.husband && !fam.wife)) return null
    const hu = person(fam.husband)
    const wi = person(fam.wife)
    if (hu && marriageCount(hu) > 1) return makeMultiUnit(hu.id)
    if (wi && marriageCount(wi) > 1) return makeMultiUnit(wi.id)
    return makeCoupleUnit(fam)
  }

  for (const fam of families.values()) {
    if (fam.husband || fam.wife) famUnit(fam)
  }
  for (const p of individuals.values()) {
    const hasFams = p.families.some((f) => f.type === "FAMS")
    if (!hasFams) makeSingleUnit(p.id)
  }

  const allUnits = [...coupleUnits.values(), ...multiUnits.values(), ...singleUnits.values()]
  for (const u of allUnits) byKey.set(u.key, u)

  function membersOf(u) {
    const ids = []
    if (u.kind === "couple") {
      if (u.husband) ids.push(u.husband.id)
      if (u.wife) ids.push(u.wife.id)
    } else if (u.kind === "multi") {
      ids.push(u.anchor.id)
      u.spouses.forEach((s) => ids.push(s.id))
    } else {
      ids.push(u.person.id)
    }
    return ids
  }

  for (const u of allUnits) {
    for (const id of membersOf(u)) {
      if (!byPerson.has(id)) byPerson.set(id, u)
    }
  }

  function unitOfPerson(p) {
    const fams = p.families.filter((f) => f.type === "FAMS").map((f) => families.get(f.ref)).filter(Boolean)
    for (const fam of fams) {
      const unit = famUnit(fam)
      if (unit && membersOf(unit).includes(p.id)) return unit
    }
    return makeSingleUnit(p.id)
  }

  const kidsOf = new Map()
  const upGroupsOf = new Map()
  const hasChildren = new Map()
  const hasUpGroups = new Map()

  for (const u of allUnits) {
    kidsOf.set(u.key, [])
    upGroupsOf.set(u.key, [])
  }

  for (const u of allUnits) {
    for (const marriage of u.marriages) {
      const kidUnits = []
      for (const child of marriage.children) {
        const cu = unitOfPerson(child)
        if (cu && !kidUnits.some((k) => k.key === cu.key)) kidUnits.push(cu)
      }
      kidsOf.get(u.key).push({ spouse: marriage.spouse, kids: kidUnits })
    }
  }

  for (const u of allUnits) {
    for (const id of membersOf(u)) {
      const p = person(id)
      if (!p) continue
      const parentSet = []
      for (const f of p.families.filter((f) => f.type === "FAMC")) {
        const fam = families.get(f.ref)
        if (!fam) continue
        const pu = famUnit(fam)
        if (pu && pu.key !== u.key && !parentSet.some((k) => k.key === pu.key)) parentSet.push(pu)
      }
      if (parentSet.length > 0) {
        upGroupsOf.get(u.key).push({ memberId: id, parents: parentSet })
      }
    }
  }

  for (const u of allUnits) {
    hasChildren.set(u.key, kidsOf.get(u.key).some((g) => g.kids.length > 0))
    hasUpGroups.set(u.key, upGroupsOf.get(u.key).length > 0)
  }

  return { units: allUnits, byPerson, byKey, kidsOf, upGroupsOf, hasChildren, hasUpGroups }
}

export function memberCardX(unit, memberId) {
  if (unit.kind === "couple") {
    if (unit.husband?.id === memberId) return unit.x + NODE_W / 2
    if (unit.wife?.id === memberId) return unit.x + NODE_W + COUPLE_GAP + NODE_W / 2
  } else if (unit.kind === "multi") {
    if (unit.anchor?.id === memberId) return unit.x + NODE_W / 2
    const idx = unit.spouses.findIndex((s) => s.id === memberId)
    if (idx >= 0) return unit.x + NODE_W + COUPLE_GAP + idx * (NODE_W + COUPLE_GAP) + NODE_W / 2
  }
  return unit.x + unit.w / 2
}

export function segmentX(unit, spouse) {
  if (!spouse || unit.kind !== "multi") return unit.x + unit.w / 2
  const idx = unit.spouses.findIndex((s) => s.id === spouse.id)
  const anchorCx = unit.x + NODE_W / 2
  const spouseCx = unit.x + NODE_W + COUPLE_GAP + idx * (NODE_W + COUPLE_GAP) + NODE_W / 2
  return (anchorCx + spouseCx) / 2
}

export function buildAnchoredLayout(structure, homeId, upCollapsed, downCollapsed) {
  const { byPerson, byKey, kidsOf, upGroupsOf, hasChildren, hasUpGroups } = structure
  const home = byPerson.get(homeId) || structure.units[0]
  if (!home) {
    return { units: [], edges: [], upEdges: [], secondaryUpEdges: [], width: 300, height: 200 }
  }

  const visible = new Set()
  const depth = new Map()

  const queue = [{ key: home.key, d: 0 }]
  visible.add(home.key)
  depth.set(home.key, 0)

  while (queue.length > 0) {
    const { key, d } = queue.shift()
    const unit = byKey.get(key)
    if (!unit) continue

    if (hasUpGroups.get(key)) {
      for (const group of upGroupsOf.get(key)) {
        if (upCollapsed.has(`up:${key}:${group.memberId}`)) continue
        for (const pu of group.parents) {
          if (!visible.has(pu.key)) {
            visible.add(pu.key)
            depth.set(pu.key, d - 1)
            queue.push({ key: pu.key, d: d - 1 })
          }
        }
      }
    }

    if (!downCollapsed.has(key) && hasChildren.get(key)) {
      for (const group of kidsOf.get(key)) {
        for (const ku of group.kids) {
          if (!visible.has(ku.key)) {
            visible.add(ku.key)
            depth.set(ku.key, d + 1)
            queue.push({ key: ku.key, d: d + 1 })
          }
        }
      }
    }
  }

  const upWCache = new Map()
  const downWCache = new Map()

  function upW(unit) {
    if (upWCache.has(unit.key)) return upWCache.get(unit.key)
    let w = unit.w
    if (visible.has(unit.key) && hasUpGroups.get(unit.key)) {
      let span = 0
      let first = true
      for (const group of upGroupsOf.get(unit.key)) {
        if (upCollapsed.has(`up:${unit.key}:${group.memberId}`)) continue
        const parents = group.parents.filter((p) => visible.has(p.key))
        if (parents.length === 0) continue
        const gw = parents.reduce((s, p) => s + upW(p), 0) + GAP * (parents.length - 1)
        span = first ? gw : span + gw + GAP
        first = false
      }
      w = Math.max(w, span)
    }
    upWCache.set(unit.key, w)
    return w
  }

  function downW(unit) {
    if (downWCache.has(unit.key)) return downWCache.get(unit.key)
    let w = unit.w
    if (visible.has(unit.key) && !downCollapsed.has(unit.key) && hasChildren.get(unit.key)) {
      const placement = downGroupPlacement(unit, false)
      w = Math.max(w, placement.span)
    }
    downWCache.set(unit.key, w)
    return w
  }

  function downGroupPlacement(unit, shiftEnabled) {
    const groups = []
    for (const group of kidsOf.get(unit.key)) {
      const kids = group.kids.filter((k) => visible.has(k.key))
      if (kids.length === 0) continue
      const kidsTotal = kids.reduce((s, k) => s + downW(k), 0) + GAP * (kids.length - 1)
      const gw = Math.max(SEG_W, kidsTotal)
      groups.push({ group, kids, gw, kidsTotal })
    }
    if (groups.length === 0) return { positions: [], span: unit.w }

    const segXs = groups.map((g) => segmentX(unit, g.group.spouse))
    let shift = 0
    const positions = []
    for (let i = 0; i < groups.length; i++) {
      const ideal = segXs[i] - groups[i].gw / 2
      const start = Math.max(ideal, i === 0 ? -Infinity : positions[i - 1] + groups[i - 1].gw + GAP)
      positions.push(start)
    }

    let span = positions[positions.length - 1] + groups[groups.length - 1].gw - positions[0]
    const left = positions[0]
    if (shiftEnabled) {
      shift = unit.x + unit.w / 2 - (left + span / 2)
    }
    return { positions: positions.map((p) => p + shift), shift, span }
  }

  function upGroupPlacement(unit) {
    const groups = []
    for (const group of upGroupsOf.get(unit.key)) {
      if (upCollapsed.has(`up:${unit.key}:${group.memberId}`)) continue
      const parents = group.parents.filter((p) => visible.has(p.key))
      if (parents.length === 0) continue
      const gw = parents.reduce((s, p) => s + upW(p), 0) + GAP * (parents.length - 1)
      groups.push({ group, parents, gw, cx: memberCardX(unit, group.memberId) })
    }
    if (groups.length === 0) return { placements: [], span: 0 }

    groups.sort((a, b) => a.cx - b.cx)

    const positions = groups.map((g) => Math.max(0, g.cx - g.gw / 2))
    for (let i = 1; i < groups.length; i++) {
      if (positions[i] < positions[i - 1] + groups[i - 1].gw + GAP) {
        positions[i] = positions[i - 1] + groups[i - 1].gw + GAP
      }
    }
    for (let i = groups.length - 2; i >= 0; i--) {
      if (positions[i] + groups[i].gw + GAP > positions[i + 1]) {
        positions[i] = positions[i + 1] - groups[i].gw - GAP
      }
    }
    const span = positions[positions.length - 1] + groups[groups.length - 1].gw - positions[0]
    return { placements: groups.map((g, i) => ({ ...g, pos: positions[i] })), span }
  }

  const placed = new Set()

  function placeDownReal(unit, startX, spanW) {
    if (!placed.has(unit.key)) {
      placed.add(unit.key)
      unit._fanX = undefined
      unit.x = startX + spanW / 2 - unit.w / 2
    }

    if (downCollapsed.has(unit.key) || !hasChildren.get(unit.key)) return
    const { positions } = downGroupPlacement(unit, true)
    const groups = []
    for (const group of kidsOf.get(unit.key)) {
      const kids = group.kids.filter((k) => visible.has(k.key))
      if (kids.length === 0) continue
      groups.push({ group, kids })
    }
    groups.forEach((g, i) => {
      const kidsTotal = g.kids.reduce((s, k) => s + downW(k), 0) + GAP * (g.kids.length - 1)
      const gw = Math.max(SEG_W, kidsTotal)
      const segX = segmentX(unit, g.group.spouse)
      let kidCursor = Math.max(positions[i], segX - kidsTotal / 2)
      const maxStart = positions[i] + gw - kidsTotal
      if (kidCursor > maxStart) kidCursor = maxStart
      for (const ku of g.kids) {
        placeDownReal(ku, kidCursor, downW(ku))
        kidCursor += downW(ku) + GAP
      }
    })
  }

  function placeUp(unit) {
    if (!hasUpGroups.get(unit.key)) return
    const { placements } = upGroupPlacement(unit)
    for (const { parents, pos } of placements) {
      let cursor = pos
      for (const pu of parents) {
        if (!placed.has(pu.key)) {
          pu.x = cursor + upW(pu) / 2 - pu.w / 2
          pu._fanX = pu.x + pu.w / 2
          placed.add(pu.key)
          placeUp(pu)
        }
        cursor += upW(pu) + GAP
      }
    }
    for (const { parents } of placements) {
      for (const pu of parents) {
        if (placed.has(pu.key)) {
          placeDownReal(pu, pu.x - (downW(pu) - pu.w) / 2, downW(pu))
        }
      }
    }
  }

  placeDownReal(home, 0, downW(home))
  placeUp(home)

  let cursor = 0
  for (const u of structure.units) {
    if (visible.has(u.key) && !placed.has(u.key)) {
      const w = downW(u)
      placeDownReal(u, cursor, w)
      placeUp(u)
      cursor += w + ROOT_GAP
    }
  }

  const placedUnits = structure.units.filter((u) => visible.has(u.key) && placed.has(u.key))

  const rowsMap = new Map()
  for (const u of placedUnits) {
    const d = depth.get(u.key) ?? 0
    if (!rowsMap.has(d)) rowsMap.set(d, [])
    rowsMap.get(d).push(u)
  }

  const depths = [...rowsMap.keys()].sort((a, b) => b - a)
  for (let round = 0; round < 1; round++) {
    for (const d of depths) {
      for (const u of rowsMap.get(d)) {
        const kids = []
        for (const g of kidsOf.get(u.key) || []) {
          for (const k of g.kids) {
            if (placed.has(k.key)) kids.push(k)
          }
        }
        if (kids.length === 0) continue
        const minKx = Math.min(...kids.map((k) => k.x))
        const maxKx = Math.max(...kids.map((k) => k.x + k.w))
        const spanCenter = (minKx + maxKx) / 2
        const newX = spanCenter - u.w / 2
        const delta = newX - u.x
        if (Math.abs(delta) < 0.5) continue
        u.x = newX
        const shifted = new Set([u.key])
        const queue = [...kids]
        while (queue.length > 0) {
          const c = queue.shift()
          if (shifted.has(c.key)) continue
          shifted.add(c.key)
          c.x += delta
          for (const g of kidsOf.get(c.key) || []) {
            for (const k of g.kids) {
              if (placed.has(k.key)) queue.push(k)
            }
          }
        }
      }
    }
  }

  const shiftSubtree = (unit, delta) => {
    const shifted = new Set()
    const queue = [unit]
    while (queue.length > 0) {
      const c = queue.shift()
      if (shifted.has(c.key)) continue
      shifted.add(c.key)
      c.x += delta
      for (const g of kidsOf.get(c.key) || []) {
        for (const k of g.kids) {
          if (placed.has(k.key)) queue.push(k)
        }
      }
    }
  }

  for (let sweep = 0; sweep < 4; sweep++) {
    let moved = false
    for (const d of depths) {
      const row = rowsMap.get(d).sort((a, b) => a.x - b.x)
      for (let i = 1; i < row.length; i++) {
        const prev = row[i - 1]
        const cur = row[i]
        const need = prev.x + prev.w + GAP
        if (cur.x < need) {
          const delta = need - cur.x
          shiftSubtree(cur, delta)
          moved = true
        }
      }
    }
    if (!moved) break
  }

  let minX = Infinity
  for (const u of placedUnits) {
    minX = Math.min(minX, u.x)
  }
  if (minX < 20) {
    const shift = 20 - minX
    for (const u of placedUnits) {
      u.x += shift
    }
  }

  let minDepth = 0
  for (const u of placedUnits) {
    minDepth = Math.min(minDepth, depth.get(u.key) ?? 0)
  }

  for (const u of placedUnits) {
    u.y = ((depth.get(u.key) ?? 0) - minDepth) * ROW + 20
  }

  const edges = []
  const upEdges = []
  const secondaryUpEdges = []

  for (const u of placedUnits) {
    if (!downCollapsed.has(u.key) && hasChildren.get(u.key)) {
      for (const group of kidsOf.get(u.key)) {
        for (const ku of group.kids) {
          if (!placed.has(ku.key)) continue
          edges.push({ parent: u, child: ku, spouse: group.spouse })
        }
      }
    }
    if (hasUpGroups.get(u.key)) {
      for (const group of upGroupsOf.get(u.key)) {
        if (upCollapsed.has(`up:${u.key}:${group.memberId}`)) continue
        for (const pu of group.parents) {
          if (!placed.has(pu.key)) continue
          const edge = { parent: pu, child: u, memberId: group.memberId }
          if (upEdges.some((e) => e.parent === pu && e.child === u)) {
            if (!secondaryUpEdges.some((e) => e.parent === pu && e.child === u)) secondaryUpEdges.push(edge)
          } else {
            upEdges.push(edge)
          }
        }
      }
    }
  }

  let maxX = 0
  let maxY = 0
  for (const u of placedUnits) {
    maxX = Math.max(maxX, u.x + u.w)
    maxY = Math.max(maxY, u.y + NODE_H)
  }

  return {
    units: placedUnits,
    edges,
    upEdges,
    secondaryUpEdges,
    home,
    byPerson,
    byKey,
    kidsOf,
    upGroupsOf,
    hasChildren,
    hasUpGroups,
    width: Math.max(maxX + 40, 300),
    height: maxY + 40,
  }
}
