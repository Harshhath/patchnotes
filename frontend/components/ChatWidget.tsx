'use client'

import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; text: string }

export default function ChatWidget() {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
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
        body: JSON.stringify({ question: q }),
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
      {/* Floating button */}
      <button onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 50,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #ff4655, #bd3944)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,70,85,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: '#fff', transition: 'transform .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
        {open ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 28, zIndex: 50,
          width: 360, height: 500, borderRadius: 16,
          background: '#0f1923', border: '1px solid rgba(255,70,85,0.2)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid rgba(255,70,85,0.15)',
            background: 'rgba(255,70,85,0.06)',
          }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#ff4655', letterSpacing: '.05em' }}>
              ASK PATCHBOT
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              Ask anything about Valorant patches
            </p>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 60 }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>⚡</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                  Try asking:<br />
                  <span style={{ color: 'rgba(255,70,85,0.7)', fontStyle: 'italic' }}>"When did Neon get nerfed?"</span>
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? 'rgba(255,70,85,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${m.role === 'user' ? 'rgba(255,70,85,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px', fontSize: 12, lineHeight: 1.6,
                color: m.role === 'user' ? '#ff8a93' : 'rgba(255,255,255,0.8)',
              }}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px 12px 12px 2px',
                padding: '8px 14px', fontSize: 18, color: 'rgba(255,255,255,0.4)',
                letterSpacing: 4,
              }}>
                ···
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: 8,
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask about a patch..."
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                padding: '8px 12px', fontSize: 12, color: '#fff', outline: 'none',
              }}
            />
            <button onClick={send} disabled={loading}
              style={{
                background: loading ? 'rgba(255,70,85,0.3)' : '#ff4655',
                border: 'none', borderRadius: 10, padding: '8px 14px',
                cursor: loading ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 14,
              }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}