'use client'

import { useState, useRef, useEffect } from 'react'
import { animate } from 'framer-motion'

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

function useAnimatedText(text: string) {
  const [cursor, setCursor] = useState(0)
  const [startingCursor, setStartingCursor] = useState(0)
  const [prevText, setPrevText] = useState(text)

  if (prevText !== text) {
    setPrevText(text)
    setStartingCursor(text.startsWith(prevText) ? cursor : 0)
  }

  useEffect(() => {
    const chars = text.split('')
    const controls = animate(startingCursor, chars.length, {
      duration: chars.length * 0.05,
      ease: 'linear',
      onUpdate(latest) { setCursor(Math.floor(latest)) },
    })
    return () => controls.stop()
  }, [startingCursor, text])

  return text.split('').slice(0, cursor).join('')
}

function AssistantMessage({ text, accent }: { text: string; accent: string }) {
  const animated = useAnimatedText(text)
  return <span>{animated}</span>
}

export default function ChatWidget({
  game = 'Valorant',
  accent = '#ff4655',
  accentRgb = '255,70,85',
  bgColor = '#0f1923',
  borderColor = 'rgba(255,70,85,0.2)',
  placeholder = 'Ask about a patch...',
  title = 'ASK PATCHBOT',
  subtitle = 'Ask anything about Valorant patches',
  exampleQuestion = '"When did Neon get nerfed?"',
}: ChatWidgetProps) {
  const [open, setOpen]         = useState(false)
  const [input, setInput]       = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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
      setMessages((m) => [...m, { role: 'assistant', text: data.answer ?? data.error }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Something went wrong.' }])
    } finally {
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
          background: `linear-gradient(135deg, ${accent}, ${accent}aa)`,
          border: 'none', cursor: 'pointer',
          boxShadow: `0 4px 24px rgba(${accentRgb},0.4)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: game === 'CS2' ? '#000' : '#fff',
          transition: 'transform .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        {open ? '✕' : '💬'}
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
                  ? <AssistantMessage text={m.text} accent={accent} />
                  : m.text}
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