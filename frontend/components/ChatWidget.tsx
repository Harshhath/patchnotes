'use client'

import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; text: string }

interface ChatWidgetProps {
  game?: string
  accent?: string
  accentRgb?: string
  bgColor?: string
  borderColor?: string
  placeholder?: string
  title?: string
  subtitle?: string
  exampleQuestion?: string
}

// charsPerMs: how fast the typewriter reveals text. Matches the previous
// 0.03s-per-char pace (~33 chars/sec).
const MS_PER_CHAR = 30

// Computes how many characters should be visible right now, purely from
// wall-clock time. Because this is a pure function of `Date.now()` and a
// fixed `startedAt` timestamp, it gives the same answer whether anything
// was mounted/rendering in between or not — so progress keeps advancing
// even while the panel (and AssistantMessage) is unmounted.
function charsRevealedByNow(startedAt: number, totalChars: number) {
  const elapsed = Date.now() - startedAt
  return Math.max(0, Math.min(totalChars, Math.floor(elapsed / MS_PER_CHAR)))
}

function AssistantMessage({
  text,
  startedAt,
  isLatest,
  onAnimationDone,
}: {
  text: string
  startedAt: number
  isLatest: boolean
  onAnimationDone: () => void
}) {
  const [, forceTick] = useState(0)
  const doneRef = useRef(false)

  const cursor = isLatest ? charsRevealedByNow(startedAt, text.length) : text.length

  useEffect(() => {
    if (!isLatest) return
    if (cursor >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true
        onAnimationDone()
      }
      return
    }
    // Re-render every frame while still revealing, so `cursor` above gets
    // recomputed from the clock. This loop only needs to run while
    // AssistantMessage is mounted (panel open) — while closed, no frames
    // run, but `charsRevealedByNow` still advances correctly in the
    // background because it's driven by Date.now(), not by this loop.
    let raf: number
    const tick = () => {
      forceTick((n) => n + 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isLatest, cursor, text.length, onAnimationDone])

  const animated = text.split('').slice(0, cursor).join('')
  return (
    <span>
      {animated.split('\n').map((line, j) => (
        <span key={j} style={{ display: 'block', marginBottom: 8, lineHeight: 1.6 }}>
          {line}
        </span>
      ))}
    </span>
  )
}

export default function ChatWidget({
  game = 'Valorant',
  accent = '#ff4655',
  accentRgb = '255,70,85',
  bgColor = '#0f1923',
  borderColor = 'rgba(255,70,85,0.2)',
  placeholder = 'Ask about a patch...',
  title = 'PATCHBOT',
  subtitle = 'Ask anything about Valorant patches',
  exampleQuestion = '"When did Neon get nerfed?"',
}: ChatWidgetProps) {
  const [open, setOpen]           = useState(false)
  const [input, setInput]         = useState('')
  const [messages, setMessages]   = useState<Message[]>([])
  const [loading, setLoading]     = useState(false)
  const [animatedIds, setAnimatedIds] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  // One timestamp per assistant message index, set the moment that message
  // is added to `messages`. The reveal animation is computed purely from
  // `Date.now() - startedAt`, so it keeps advancing in real time even while
  // the panel is closed and AssistantMessage is unmounted — closing the
  // panel doesn't pause the clock, it just stops rendering frames for it.
  const startedAtRef = useRef<Map<number, number>>(new Map())
  function getStartedAt(i: number) {
    let t = startedAtRef.current.get(i)
    if (t === undefined) {
      t = Date.now()
      startedAtRef.current.set(i, t)
    }
    return t
  }

  // NOTE on the behavior you asked about:
  // Closing the panel only toggles `open`, which hides the JSX below via
  // `{open && (...)}`. It does NOT unmount ChatWidget itself — the button
  // stays mounted at the top level — so `messages`/`loading` state, and any
  // in-flight `fetch` in `send()`, are untouched by closing. The response
  // will finish and land in `messages` whether the panel is open or closed,
  // and you'll see it (already complete, or mid-typewriter) when you reopen.
  //
  // The only way this WOULD break is if a parent did `{open && <ChatWidget/>}`
  // instead, unmounting the whole component on close. This guard below
  // protects against that case too, in case this component ever gets used
  // that way, or gets removed from the tree for some other reason (route
  // change, etc.) while a request is in flight.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, game }),
      })
      const data = await res.json()
      // Guard, not a requirement: only matters if ChatWidget itself was
      // unmounted (see note above). Closing the dropdown alone never
      // triggers this branch.
      if (isMountedRef.current) {
        setMessages((m) => {
          const next = [...m, { role: 'assistant' as const, text: data.answer ?? data.error }]
          // Stamp the reveal-animation start time right now, at message
          // creation, not on first render of AssistantMessage. If the panel
          // stays closed for a while after this, the animation should
          // already be (or become) fully revealed by the time it's opened,
          // not restart fresh from the moment of opening.
          startedAtRef.current.set(next.length - 1, Date.now())
          return next
        })
      }
    } catch {
      if (isMountedRef.current) {
        setMessages((m) => {
          const next = [...m, { role: 'assistant' as const, text: 'Something went wrong.' }]
          startedAtRef.current.set(next.length - 1, Date.now())
          return next
        })
      }
    } finally {
      // Always clear loading, regardless of mount state. Skipping this
      // when unmounted is harmless (React just no-ops/warns), but skipping
      // it while still mounted is how you get a spinner stuck forever.
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 50,
          width: 52, height: 52, borderRadius: '50%',
          background: accent,
          border: 'none', cursor: 'pointer',
          boxShadow: `0 4px 24px rgba(${accentRgb},0.4)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: game === 'CS2' ? '#000' : '#fff',
          transition: 'transform .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 28, zIndex: 50,
          width: 360, height: 500, borderRadius: 16,
          background: bgColor, border: `1px solid ${borderColor}`,
          boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: `1px solid rgba(${accentRgb},0.15)`,
            background: `rgba(${accentRgb},0.06)`,
          }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: accent, letterSpacing: '.05em' }}>{title}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{subtitle}</p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 60 }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                  Try asking:<br />
                  <span style={{ color: `rgba(${accentRgb},0.7)`, fontStyle: 'italic' }}>{exampleQuestion}</span>
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? `rgba(${accentRgb},0.2)` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${m.role === 'user' ? `rgba(${accentRgb},0.3)` : 'rgba(255,255,255,0.08)'}`,
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px', fontSize: 12, lineHeight: 1.6,
                color: m.role === 'user' ? accent : 'rgba(255,255,255,0.8)',
              }}>
                {m.role === 'assistant'
                  ? (
                    <AssistantMessage
                      text={m.text}
                      startedAt={getStartedAt(i)}
                      isLatest={i === messages.length - 1 && !animatedIds.has(i)}
                      onAnimationDone={() => setAnimatedIds((s) => new Set(s).add(i))}
                    />
                  )
                  : m.text.split('\n').map((line, j) => (
                    <span key={j} style={{ display: 'block', marginBottom: 8, lineHeight: 1.5 }}>
                      {line}
                    </span>
                  ))}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px 12px 12px 2px',
                padding: '10px 16px', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: `rgba(${accentRgb}, 0.6)`,
                    display: 'inline-block',
                    animation: `bounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{
            padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: 8,
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={placeholder}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                padding: '8px 12px', fontSize: 12, color: '#fff', outline: 'none',
              }}
            />
            <button onClick={send} disabled={loading}
              style={{
                background: loading ? `rgba(${accentRgb},0.3)` : accent,
                border: 'none', borderRadius: 10, padding: '8px 14px',
                cursor: loading ? 'not-allowed' : 'pointer',
                color: game === 'CS2' ? '#000' : '#fff', fontSize: 14,
              }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}