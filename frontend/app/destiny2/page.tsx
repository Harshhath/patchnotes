'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase, Patch } from '@/lib/supabase'
import Image from "next/image"
import ChatWidget from '@/components/ChatWidget'

const TAG_COLORS: Record<string, string> = {
  'weapon-buff':    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'weapon-nerf':    'bg-red-500/15 text-red-300 border-red-500/25',
  'ability-change': 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  'subclass-change':'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'bug-fix':        'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
  'new-feature':    'bg-sky-500/15 text-sky-300 border-sky-500/25',
  'raid-change':    'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'pvp-change':     'bg-orange-500/15 text-orange-300 border-orange-500/25',
  'economy':        'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'performance':    'bg-pink-500/15 text-pink-300 border-pink-500/25',
  'hunter':         'bg-green-500/15 text-green-300 border-green-500/25',
  'titan':          'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'warlock':        'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'gunslinger':     'bg-green-500/15 text-green-300 border-green-500/25',
  'arcstrider':     'bg-green-500/15 text-green-300 border-green-500/25',
  'nightstalker':   'bg-green-500/15 text-green-300 border-green-500/25',
  'revenant':       'bg-green-500/15 text-green-300 border-green-500/25',
  'threadrunner':   'bg-green-500/15 text-green-300 border-green-500/25',
  'sunbreaker':     'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'striker':        'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'sentinel':       'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'behemoth':       'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'berserker':      'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'dawnblade':      'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'stormcaller':    'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'voidwalker':     'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'shadebinder':    'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'broodweaver':    'bg-purple-500/15 text-purple-300 border-purple-500/25',
  'prismatic':      'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
}

type TagEntry =
  | { label: string; value: string; group?: false }
  | { label: string; value: string; group: true }

const ALL_TAGS: TagEntry[] = [
  { label: 'Weapon Buff',     value: 'weapon-buff' },
  { label: 'Weapon Nerf',     value: 'weapon-nerf' },
  { label: 'Ability Change',  value: 'ability-change' },
  { label: 'Subclass Change', value: 'subclass-change' },
  { label: 'Raid Change',     value: 'raid-change' },
  { label: 'PvP Change',      value: 'pvp-change' },
  { label: 'New Feature',     value: 'new-feature' },
  { label: 'Economy',         value: 'economy' },
  { label: 'Bug Fix',         value: 'bug-fix' },
  { label: 'Performance',     value: 'performance' },
  // ── Hunter ──
  { label: 'HUNTER',          value: 'hunter',       group: true },
  { label: 'Gunslinger',      value: 'gunslinger' },
  { label: 'Arcstrider',      value: 'arcstrider' },
  { label: 'Nightstalker',    value: 'nightstalker' },
  { label: 'Revenant',        value: 'revenant' },
  { label: 'Threadrunner',    value: 'threadrunner' },
  // ── Titan ──
  { label: 'TITAN',           value: 'titan',        group: true },
  { label: 'Sunbreaker',      value: 'sunbreaker' },
  { label: 'Striker',         value: 'striker' },
  { label: 'Sentinel',        value: 'sentinel' },
  { label: 'Behemoth',        value: 'behemoth' },
  { label: 'Berserker',       value: 'berserker' },
  // ── Warlock ──
  { label: 'WARLOCK',         value: 'warlock',      group: true },
  { label: 'Dawnblade',       value: 'dawnblade' },
  { label: 'Stormcaller',     value: 'stormcaller' },
  { label: 'Voidwalker',      value: 'voidwalker' },
  { label: 'Shadebinder',     value: 'shadebinder' },
  { label: 'Broodweaver',     value: 'broodweaver' },
  // ── Cross-class ──
  { label: 'CROSS-CLASS',     value: 'prismatic',    group: true },
  { label: 'Prismatic',       value: 'prismatic' },
]

const DATE_PRESETS = [
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 14 days',  days: 14 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last year',     days: 365 },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_NAMES = ['Mo','Tu','We','Th','Fr','Sa','Su']

const ACCENT     = '#c8a951'
const ACCENT_RGB = '200,169,81'
const BG         = '#0d1117'

function toInputDate(d: Date) { return d.toISOString().split('T')[0] }
function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatShort(dateStr: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isPresetActive(dateFrom: string, dateTo: string, days: number) {
  if (!dateFrom || !dateTo) return false
  const from = new Date(dateFrom)
  const expected = new Date()
  expected.setDate(expected.getDate() - days + 1)
  expected.setHours(0, 0, 0, 0)
  return Math.abs(from.getTime() - expected.getTime()) < 86400000
}

function D2Logo({ size = 22 }: { size?: number }) {
  return <Image src="/d2-logo2.png" alt="Destiny 2 Logo" width={size} height={size} priority />
}

function Calendar({ dateFrom, dateTo, onRange }: {
  dateFrom: string; dateTo: string; onRange: (from: string, to: string) => void
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [picking,   setPicking]   = useState<Date | null>(null)

  const startDate = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
  const endDate   = dateTo   ? new Date(dateTo   + 'T00:00:00') : null

  function changeMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m > 11) { m = 0; y++ } if (m < 0) { m = 11; y-- }
    setViewMonth(m); setViewYear(y)
  }

  function pickDay(date: Date) {
    if (!picking) { setPicking(date); onRange(toInputDate(date), '') }
    else {
      const [a, b] = date < picking ? [date, picking] : [picking, date]
      onRange(toInputDate(a), toInputDate(b)); setPicking(null)
    }
  }

  const cells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay()
    const offset = (firstDow + 6) % 7
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrev  = new Date(viewYear, viewMonth,     0).getDate()
    const result: { date: Date; current: boolean }[] = []
    for (let i = offset - 1; i >= 0; i--) result.push({ date: new Date(viewYear, viewMonth - 1, daysInPrev - i), current: false })
    for (let n = 1; n <= daysInMonth; n++) result.push({ date: new Date(viewYear, viewMonth, n), current: true })
    const rem = (7 - (result.length % 7)) % 7
    for (let i = 1; i <= rem; i++) result.push({ date: new Date(viewYear, viewMonth + 1, i), current: false })
    return result
  }, [viewYear, viewMonth])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => changeMonth(-1)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={() => changeMonth(1)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_NAMES.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)', padding: '3px 0', letterSpacing: '.04em' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map(({ date, current }, i) => {
          const isStart   = !!(startDate && sameDay(date, startDate))
          const isEnd     = !!(endDate   && sameDay(date, endDate))
          const isPicking = !!(picking   && sameDay(date, picking))
          const inRange   = !!(startDate && endDate && date > startDate && date < endDate)
          const isToday   = sameDay(date, today)
          const isSelected = isStart || isEnd || isPicking
          let bg = 'transparent', color = current ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)'
          let border = '1px solid transparent', borderRadius = '7px', fontWeight = 400
          if (isSelected) { bg = ACCENT; color = '#000'; border = `1px solid ${ACCENT}`; fontWeight = 700 }
          else if (inRange) { bg = `rgba(${ACCENT_RGB},0.1)`; color = 'rgba(255,255,255,0.65)'; borderRadius = '0px' }
          if (isStart && endDate && !sameDay(startDate!, endDate)) borderRadius = '7px 0 0 7px'
          if (isEnd && startDate && !sameDay(startDate!, endDate)) borderRadius = '0 7px 7px 0'
          return (
            <div key={i} onClick={() => current && pickDay(date)}
              style={{ textAlign: 'center', fontSize: 11, padding: '5px 2px', borderRadius, cursor: current ? 'pointer' : 'default', background: bg, color, border, fontWeight, position: 'relative', transition: 'all .1s' }}
              onMouseEnter={(e) => { if (!current || isSelected || inRange) return; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.1)`; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.25)` }}
              onMouseLeave={(e) => { if (!current || isSelected || inRange) return; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'transparent' }}>
              {date.getDate()}
              {isToday && !isSelected && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: ACCENT }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Destiny2Home() {
  const [patches,      setPatches]      = useState<Patch[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    supabase.from('patches').select('id, game, title, url, date, summary, tags')
      .eq('game', 'Destiny 2')
      .order('date', { ascending: false })
      .then(({ data }) => { setPatches((data as Patch[]) ?? []); setLoading(false) })
  }, [])

  const filtered = useMemo(() => patches.filter((p) => {
    const d = new Date(p.date)
    if (dateFrom && d < new Date(dateFrom)) return false
    if (dateTo   && d > new Date(dateTo))   return false
    if (selectedTags.length > 0 && !selectedTags.every((t) => p.tags?.includes(t))) return false
    return true
  }), [patches, dateFrom, dateTo, selectedTags])

  function applyPreset(days: number) {
    const to = new Date(), from = new Date()
    from.setDate(from.getDate() - days + 1)
    setDateFrom(toInputDate(from)); setDateTo(toInputDate(to))
  }

  const handleRange = useCallback((from: string, to: string) => {
    setDateFrom(from); setDateTo(to)
  }, [])

  function toggleTag(tag: string) {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  const hasFilters   = dateFrom || dateTo || selectedTags.length > 0
  const activePreset = DATE_PRESETS.find(({ days }) => isPresetActive(dateFrom, dateTo, days))

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#fff' }}>

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-60 -left-60 w-96 h-96 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, ${ACCENT} 0%, transparent 65%)` }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-5"
          style={{ background: `radial-gradient(circle, #1a2040 0%, transparent 70%)` }} />
      </div>

      <header className="relative z-20 border-b"
        style={{ borderColor: `rgba(${ACCENT_RGB},0.15)`, background: 'rgba(8,10,14,0.97)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center gap-4">
          <a href="/" title="Home" style={{ position: 'fixed', top: 12, left: 2, zIndex: 100 }}>
            <Image src="/sukuna.png" alt="Home" width={89} height={89} className="hover:opacity-80 transition-opacity" />
          </a>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <D2Logo size={24} />
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: ACCENT }}>Destiny 2</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight" style={{ color: ACCENT }}>PATCHNOTES</h1>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8 flex gap-8">

        <aside className="w-60 shrink-0 space-y-4">

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>Filters</span>
            {hasFilters && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setSelectedTags([]) }}
                className="text-[11px] font-semibold" style={{ color: ACCENT }}>Clear all</button>
            )}
          </div>

          {/* Date Range */}
          <div className="rounded-xl border p-4" style={{ background: `rgba(${ACCENT_RGB},0.04)`, borderColor: `rgba(${ACCENT_RGB},0.3)` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Date Range</p>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-[10px] font-semibold" style={{ color: `rgba(${ACCENT_RGB},0.8)` }}>Clear</button>
              )}
            </div>
            <div className="space-y-1 mb-4">
              {DATE_PRESETS.map(({ label, days }) => {
                const active = isPresetActive(dateFrom, dateTo, days)
                return (
                  <button key={days} onClick={() => applyPreset(days)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 10, textAlign: 'left', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all .1s',
                      background: active ? `rgba(${ACCENT_RGB},0.14)` : 'transparent',
                      border: `1px solid ${active ? `rgba(${ACCENT_RGB},0.3)` : 'transparent'}`,
                      color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                    }}
                    onMouseEnter={(e) => { if (active) return; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.1)`; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.25)` }}
                    onMouseLeave={(e) => { if (active) return; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'transparent' }}>
                    <span>{label}</span>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0, background: active ? ACCENT : 'transparent', border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,0.15)'}`, color: '#000' }}>
                      {active ? '✓' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>Custom Range</p>
            <Calendar dateFrom={dateFrom} dateTo={dateTo} onRange={handleRange} />
            {(dateFrom || dateTo) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <div style={{ flex: 1, background: `rgba(${ACCENT_RGB},0.08)`, border: `1px solid rgba(${ACCENT_RGB},0.18)`, borderRadius: 9, padding: '6px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>From</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>{formatShort(dateFrom)}</p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, alignSelf: 'center' }}>→</span>
                <div style={{ flex: 1, background: `rgba(${ACCENT_RGB},0.08)`, border: `1px solid rgba(${ACCENT_RGB},0.18)`, borderRadius: 9, padding: '6px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>To</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>{dateTo ? formatShort(dateTo) : '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Change Type + Classes */}
          <div className="rounded-xl border p-4" style={{ background: `rgba(${ACCENT_RGB},0.04)`, borderColor: `rgba(${ACCENT_RGB},0.3)` }}>
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Change Type</p>
            <div className="space-y-0.5">
              {ALL_TAGS.map((entry) => {
                if (entry.group) {
                  // Class group header — also acts as a toggle for the class itself
                  const classValue = entry.value
                  const active = selectedTags.includes(classValue)
                  return (
                    <button
                      key={classValue}
                      onClick={() => toggleTag(classValue)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 12px', borderRadius: 8, textAlign: 'left', fontSize: 9,
                        fontWeight: 800, letterSpacing: '0.18em', cursor: 'pointer', transition: 'all .1s',
                        marginTop: 10,
                        background: active ? `rgba(${ACCENT_RGB},0.14)` : 'transparent',
                        border: `1px solid ${active ? `rgba(${ACCENT_RGB},0.3)` : 'transparent'}`,
                        color: active ? ACCENT : `rgba(${ACCENT_RGB},0.55)`,
                      }}
                      onMouseEnter={(e) => { if (active) return; e.currentTarget.style.color = `rgba(${ACCENT_RGB},0.85)`; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.07)` }}
                      onMouseLeave={(e) => { if (active) return; e.currentTarget.style.color = `rgba(${ACCENT_RGB},0.55)`; e.currentTarget.style.background = 'transparent' }}
                    >
                      <span>{entry.label}</span>
                      {active && <span style={{ color: ACCENT, fontSize: 10 }}>✓</span>}
                    </button>
                  )
                }

                const active = selectedTags.includes(entry.value)
                return (
                  <button
                    key={entry.value}
                    onClick={() => toggleTag(entry.value)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 10, textAlign: 'left', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all .1s',
                      background: active ? `rgba(${ACCENT_RGB},0.12)` : 'transparent',
                      border: `1px solid ${active ? `rgba(${ACCENT_RGB},0.3)` : 'transparent'}`,
                      color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                    }}
                    onMouseEnter={(e) => { if (active) return; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.1)`; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.25)` }}
                    onMouseLeave={(e) => { if (active) return; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'transparent' }}
                  >
                    <span>{entry.label}</span>
                    {active && <span style={{ color: ACCENT, fontSize: 10 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {hasFilters && (
            <div className="rounded-xl border px-4 py-3 text-xs"
              style={{ background: `rgba(${ACCENT_RGB},0.06)`, borderColor: `rgba(${ACCENT_RGB},0.2)`, color: 'rgba(255,255,255,0.45)' }}>
              <span className="font-bold" style={{ color: '#fff' }}>{filtered.length}</span> of {patches.length} patches
              {activePreset && <span className="block mt-0.5" style={{ color: `rgba(${ACCENT_RGB},0.7)`, fontSize: 10 }}>{activePreset.label}</span>}
            </div>
          )}
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <span><span className="font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>{patches.length}</span> patches indexed</span>
              <span><span className="font-bold" style={{ color: ACCENT }}>AI</span> summaries</span>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-20 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading patches...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No patches match your filters.</div>
            ) : filtered.map((patch) => (
              <a key={patch.id} href={patch.url} target="_blank" rel="noopener noreferrer" className="block group">
                <div className="relative rounded-xl border p-5 transition-all duration-200 overflow-hidden cursor-pointer"
                  style={{ background: `rgba(${ACCENT_RGB},0.04)`, borderColor: `rgba(${ACCENT_RGB},0.3)` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.55)`; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.08)` }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.3)`; e.currentTarget.style.background = `rgba(${ACCENT_RGB},0.04)` }}>
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: `linear-gradient(to bottom, ${ACCENT}, #8a6f2e)` }} />
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black tracking-[0.2em] uppercase px-2 py-0.5 rounded"
                          style={{ background: `rgba(${ACCENT_RGB},0.15)`, color: ACCENT, border: `1px solid rgba(${ACCENT_RGB},0.25)` }}>
                          {patch.game}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(patch.date)}</span>
                      </div>
                      {patches[0]?.id === patch.id && (
                        <Image src="/star.png" alt="Current patch" width={40} height={40} />
                      )}
                    </div>
                    <h2 className="text-lg font-bold leading-tight" style={{ color: 'rgba(255,255,255,0.88)' }}>{patch.title}</h2>
                    {patch.summary?.length > 0 && (
                      <ul className="space-y-1.5">
                        {patch.summary.slice(0, 3).map((point, i) => (
                          <li key={i} className="flex gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full" style={{ background: ACCENT }} />
                            {point}
                          </li>
                        ))}
                      </ul>
                    )}
                    {patch.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[...new Set(patch.tags)].map((tag) => (
                          <span key={tag} className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${TAG_COLORS[tag] ?? 'bg-white/5 text-white/40 border-white/10'}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <ChatWidget
        game="Destiny 2"
        accent="#c8a951"
        accentRgb="200,169,81"
        bgColor="#0d1117"
        borderColor="rgba(200,169,81,0.2)"
        title="ASK PATCHBOT"
        subtitle="Ask anything about Destiny 2 patches"
        exampleQuestion='"What changed for Warlocks?"'
      />
    </div>
  )
}