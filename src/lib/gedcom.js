function stripXref(id) {
  return id ? id.replace(/^@|@$/g, "") : null
}

const MONTHS = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
}

const MONTH_NAMES = {
  JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr", MAY: "May", JUN: "Jun",
  JUL: "Jul", AUG: "Aug", SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec",
}

const PREFIXES = {
  ABT: "about",
  EST: "estimated",
  CAL: "calculated",
  BEF: "before",
  AFT: "after",
  INT: "interpreted",
}

function dateFromParts(day, mon, year) {
  const yy = year.length === 2 ? (year > "40" ? "19" : "20") + year : year.padStart(4, "0")
  if (day && mon) return { iso: `${yy}-${MONTHS[mon]}-${day.padStart(2, "0")}` }
  if (mon) return { iso: `${yy}-${MONTHS[mon]}` }
  return { iso: yy }
}

export function parseDate(value) {
  if (!value) return null
  const v = value.trim()
  if (!v) return null

  const prefixMatch = v.match(/^(ABT|EST|CAL|BEF|AFT|INT|FROM|TO|BET)\s+/)
  let prefix = null
  let body = v
  if (prefixMatch) {
    prefix = prefixMatch[1]
    body = v.slice(prefixMatch[0].length)
  }

  if (prefix === "BET" || prefix === "FROM") {
    const m = body.match(/^(\d{1,4}(?:\s+[A-Za-z]{3,9})?\s*\d{0,4})\s+(?:AND|TO)\s+(\d{1,4}(?:\s+[A-Za-z]{3,9})?\s*\d{0,4})$/i)
    if (m) {
      const a = parseDate(m[1].trim())
      const b = parseDate(m[2].trim())
      return {
        display: `${a?.display || m[1].trim()}–${b?.display || m[2].trim()}`,
        iso: a?.iso || b?.iso || null,
      }
    }
  }

  let m = body.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{1,4})/)
  if (m) {
    const parts = dateFromParts(m[1], m[2], m[3])
    return {
      display: `${prefix && PREFIXES[prefix] ? PREFIXES[prefix] + " " : ""}${m[1]} ${MONTH_NAMES[m[2]]} ${parts.iso.slice(0, 4)}`,
      iso: parts.iso,
    }
  }

  m = body.match(/^([A-Z]{3})\s+(\d{1,4})/)
  if (m) {
    const parts = dateFromParts(null, m[1], m[2])
    return {
      display: `${prefix && PREFIXES[prefix] ? PREFIXES[prefix] + " " : ""}${MONTH_NAMES[m[1]]} ${parts.iso.slice(0, 4)}`,
      iso: parts.iso,
    }
  }

  m = body.match(/^(\d{1,4})/)
  if (m) {
    const year = m[1].length === 2 ? (m[1] > "40" ? "19" : "20") + m[1] : m[1].padStart(4, "0")
    return {
      display: `${prefix && PREFIXES[prefix] ? PREFIXES[prefix] + " " : ""}${year}`,
      iso: year,
    }
  }

  return { display: v, iso: null }
}

function collectText(node) {
  if (!node) return null
  const parts = []
  for (const c of node.children) {
    if (c.tag === "TEXT" || c.tag === "NOTE" || c.tag === "CONT" || c.tag === "CONC") {
      if (c.value) parts.push(c.value)
      const sub = collectText(c)
      if (sub) parts.push(sub)
    } else if (c.tag === "DATA" || c.tag === "ADDR") {
      const sub = collectText(c)
      if (sub) parts.push(sub)
    }
  }
  return parts.length ? parts.join("\n") : node.value || null
}

function parsePhotoNode(node, person) {
  const photo = { url: null, title: null, format: null, size: null, isProfile: false, cutout: false }
  for (const d of node.children) {
    if (d.tag === "FILE") photo.url = d.value
    else if (d.tag === "FORM") photo.format = d.value
    else if (d.tag === "TITL") photo.title = d.value
    else if (d.tag === "_FILESIZE") photo.size = d.value
    else if (d.tag === "_PERSONALPHOTO") photo.isProfile = d.value.trim().toUpperCase() === "Y"
    else if (d.tag === "_PRIM_CUTOUT") photo.cutout = d.value.trim().toUpperCase() === "Y"
  }
  if (photo.url) person.photos.push(photo)
}

function parseSourceCitation(node, person) {
  const citation = { ref: null, page: null, quay: null, text: null }
  if (node.value && node.value !== "MYHERITAGE") citation.ref = node.value.replace(/@/g, "")
  else citation.ref = null
  for (const d of node.children) {
    if (d.tag === "PAGE") citation.page = d.value
    else if (d.tag === "QUAY") citation.quay = d.value
    else if (d.tag === "DATA") citation.text = collectText(d)
    else if (d.tag === "TEXT" || d.tag === "NOTE") citation.text = citation.text || collectText(d)
  }
  person.sources.push(citation)
}

const EVENT_TAGS = new Set(["CHR", "RESI", "IMMI", "EMIG", "EDUC", "RELI", "TITL", "EVEN", "CENS", "BURI", "OCCU", "BAPM", "CONF", "PROB", "GRAD", "ORDN", "NATU", "WILL"])

function parseEvent(node, person) {
  const event = { tag: node.tag, date: null, place: null, value: node.value || null, address: null }
  for (const d of node.children) {
    if (d.tag === "DATE") event.date = parseDate(d.value)
    else if (d.tag === "PLAC") event.place = d.value
    else if (d.tag === "ADDR") {
      const lines = []
      for (const a of d.children) {
        if (a.tag === "ADR1" || a.tag === "ADR2" || a.tag === "CITY" || a.tag === "STAE" || a.tag === "POST" || a.tag === "CTRY" || a.tag === "EMAIL") {
          if (a.value) lines.push(a.value)
        }
      }
      event.address = lines.length ? lines.join(", ") : d.value || null
    } else if (d.tag === "NOTE" && !person.note) {
      person.note = collectText(d)
    }
  }
  person.events.push(event)
}

function parseIndividual(rec) {
  const person = {
    id: rec.xref,
    name: "",
    given: "",
    surname: "",
    sex: "U",
    birth: null,
    birthPlace: null,
    death: null,
    deathPlace: null,
    burial: null,
    burialPlace: null,
    occupation: null,
    note: null,
    families: [],
    events: [],
    photos: [],
    sources: [],
  }
  for (const child of rec.children) {
    if (child.tag === "NAME") {
      person.name = child.value.replace(/\//g, "").replace(/\s+/g, " ").trim()
      const surname = child.value.match(/\/([^/]*)\//)
      person.surname = surname ? surname[1].trim() : ""
      for (const d of child.children) {
        if (d.tag === "GIVN") person.given = d.value
        if (d.tag === "SURN") person.surname = person.surname || d.value
      }
    } else if (child.tag === "SEX") {
      person.sex = child.value.toUpperCase().startsWith("M") ? "M"
        : child.value.toUpperCase().startsWith("F") ? "F" : "U"
    } else if (child.tag === "BIRT") {
      for (const d of child.children) {
        if (d.tag === "DATE") person.birth = parseDate(d.value)
        if (d.tag === "PLAC") person.birthPlace = d.value
      }
    } else if (child.tag === "DEAT") {
      for (const d of child.children) {
        if (d.tag === "DATE") person.death = parseDate(d.value)
        if (d.tag === "PLAC") person.deathPlace = d.value
      }
    } else if (child.tag === "BURI") {
      for (const d of child.children) {
        if (d.tag === "DATE") person.burial = parseDate(d.value)
        if (d.tag === "PLAC") person.burialPlace = d.value
      }
    } else if (child.tag === "OCCU") {
      person.occupation = child.value
    } else if (child.tag === "NOTE") {
      person.note = collectText(child)
    } else if (child.tag === "FAMS" || child.tag === "FAMC") {
      person.families.push({ type: child.tag, ref: child.value.replace(/@/g, "") })
    } else if (child.tag === "OBJE") {
      if (child.children.length > 0) {
        parsePhotoNode(child, person)
      }
    } else if (child.tag === "SOUR") {
      parseSourceCitation(child, person)
    } else if (EVENT_TAGS.has(child.tag)) {
      parseEvent(child, person)
    }
  }
  return person
}

export function parseGedcom(text) {
  const lines = text.split(/\r?\n/)
  const records = []
  const stack = []

  for (const raw of lines) {
    if (!raw.trim()) continue
    const m = raw.match(/^(\d+)\s+(@[^@]+@\s+)?([A-Za-z_]+)\s?(.*)$/)
    if (!m) continue
    const level = parseInt(m[1], 10)
    const xref = m[2] ? m[2].trim() : null
    const tag = m[3].toUpperCase()
    const value = (m[4] || "").trim()
    const node = { level, xref: stripXref(xref), tag, value, children: [] }

    if (level === 0) {
      records.push(node)
      stack.length = 0
      stack.push(node)
    } else if (stack.length > 0) {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }
      stack[stack.length - 1].children.push(node)
      stack.push(node)
    }
  }

  const individuals = new Map()
  const families = new Map()
  const sources = new Map()
  const allPeople = []

  for (const rec of records) {
    if (rec.tag === "INDI") {
      const person = parseIndividual(rec)
      if (!person.name && !person.id) continue
      individuals.set(person.id, person)
      allPeople.push(person)
    } else if (rec.tag === "FAM") {
      const fam = { id: rec.xref, husband: null, wife: null, children: [], marriage: null, marriagePlace: null }
      for (const child of rec.children) {
        if (child.tag === "HUSB") fam.husband = child.value.replace(/@/g, "")
        else if (child.tag === "WIFE") fam.wife = child.value.replace(/@/g, "")
        else if (child.tag === "CHIL") fam.children.push(child.value.replace(/@/g, ""))
        else if (child.tag === "MARR") {
          for (const d of child.children) {
            if (d.tag === "DATE") fam.marriage = parseDate(d.value)
            if (d.tag === "PLAC") fam.marriagePlace = d.value
          }
        }
      }
      families.set(fam.id, fam)
    } else if (rec.tag === "SOUR") {
      const src = { id: rec.xref, title: rec.value || null, author: null, publication: null, text: null, type: null }
      for (const child of rec.children) {
        if (child.tag === "TITL") src.title = child.value
        else if (child.tag === "AUTH") src.author = child.value
        else if (child.tag === "PUBL") src.publication = child.value
        else if (child.tag === "TEXT") src.text = src.text ? src.text + "\n" + child.value : child.value
        else if (child.tag === "_TYPE") src.type = child.value
      }
      sources.set(src.id, src)
    }
  }

  allPeople.sort((a, b) => {
    const keyA = a.birth?.iso || "9999"
    const keyB = b.birth?.iso || "9999"
    if (keyA !== keyB) return keyA.localeCompare(keyB)
    return a.name.localeCompare(b.name)
  })

  return { individuals, families, sources, people: allPeople }
}

export function getPersonLinks(person, individuals, families) {
  const links = {
    parents: [],
    spouses: [],
    children: [],
    siblings: [],
  }
  for (const f of person.families) {
    const fam = families.get(f.ref)
    if (!fam) continue
    if (f.type === "FAMC") {
      if (fam.husband && fam.husband !== person.id) links.parents.push(fam.husband)
      if (fam.wife && fam.wife !== person.id) links.parents.push(fam.wife)
      links.siblings.push(...fam.children.filter((c) => c !== person.id))
    } else if (f.type === "FAMS") {
      const spouseId = fam.husband === person.id ? fam.wife : fam.husband
      if (spouseId && spouseId !== person.id) links.spouses.push(spouseId)
      links.children.push(...fam.children)
    }
  }
  return {
    parents: [...new Set(links.parents)].map((id) => individuals.get(id)).filter(Boolean),
    spouses: [...new Set(links.spouses)].map((id) => individuals.get(id)).filter(Boolean),
    children: [...new Set(links.children)].map((id) => individuals.get(id)).filter(Boolean),
    siblings: [...new Set(links.siblings)].map((id) => individuals.get(id)).filter(Boolean),
  }
}

export function getSpouseFamilies(person, families) {
  return person.families
    .filter((f) => f.type === "FAMS")
    .map((f) => families.get(f.ref))
    .filter(Boolean)
}

export function getProfilePhoto(person) {
  return person.photos.find((p) => p.isProfile) || person.photos[0] || null
}

export function orderPeopleByRelation(individuals, families, rootId) {
  const ordered = []
  const visited = new Set()
  const queue = [[rootId, 0]]
  while (queue.length > 0) {
    const [id] = queue.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    const person = individuals.get(id)
    if (!person) continue
    ordered.push(person)
    const links = getPersonLinks(person, individuals, families)
    const next = [
      ...links.spouses,
      ...links.children,
      ...links.parents,
      ...links.siblings,
    ]
    for (const n of next) {
      if (!visited.has(n.id)) queue.push([n.id])
    }
  }
  const rest = [...individuals.values()].filter((p) => !visited.has(p.id))
  rest.sort((a, b) => {
    const keyA = a.birth?.iso || "9999"
    const keyB = b.birth?.iso || "9999"
    if (keyA !== keyB) return keyA.localeCompare(keyB)
    return a.name.localeCompare(b.name)
  })
  ordered.push(...rest)
  return ordered
}
