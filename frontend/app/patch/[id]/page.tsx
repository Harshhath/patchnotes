import { supabase, Patch } from '@/lib/supabase'
import Link from 'next/link'

const TAG_COLORS: Record<string, string> = {
  'agent-buff':   'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'agent-nerf':   'bg-red-500/15 text-red-300 border-red-500/25',
  'weapon-buff':  'bg-sky-500/15 text-sky-300 border-sky-500/25',
  'weapon-nerf':  'bg-orange-500/15 text-orange-300 border-orange-500/25',
  'map-change':   'bg-violet-500/15 text-violet-300 border-violet-500/25',
  'bug-fix':      'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  'economy':      'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'performance':  'bg-pink-500/15 text-pink-300 border-pink-500/25',
  'new-feature':  'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'premier':      'bg-teal-500/15 text-teal-300 border-teal-500/25',
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default async function PatchPage({ params }: { params: { id: string } }) {
  const { data: patch, error } = await supabase
    .from('patches')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !patch) {
    return <div className="p-8 text-red-400">Patch not found.</div>
  }

  const p = patch as Patch

  return (
    <main className="min-h-screen text-white" style={{ background: '#08080e' }}>

      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 -right-60 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-violet-400 transition-colors mb-6 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            All patches
          </Link>

          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/20">
              {p.game}
            </span>
            <span className="text-xs text-white/30">{formatDate(p.date)}</span>
          </div>

          <h1 className="text-4xl font-black tracking-tight leading-tight"
            style={{ background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {p.title}
          </h1>

          {/* Tags */}
          {p.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {p.tags.map((tag) => (
                <span key={tag}
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${TAG_COLORS[tag] ?? 'bg-white/5 text-white/40 border-white/10'}`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* AI Summary card */}
        {p.summary?.length > 0 && (
          <div className="rounded-2xl border border-violet-500/20 p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(14,165,233,0.06) 100%)', backdropFilter: 'blur(10px)' }}>
            <div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)' }} />
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-xs font-bold tracking-[0.15em] uppercase text-violet-400">AI Summary</span>
            </div>
            <ul className="space-y-3">
              {p.summary.map((point, i) => (
                <li key={i} className="flex gap-3 text-white/80">
                  <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-violet-400" />
                  <span className="text-sm leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Full patch notes */}
        <div className="rounded-2xl border border-white/[0.08] p-6"
          style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)' }}>
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-white/30 mb-4">
            Full Patch Notes
          </h2>
          <div className="text-white/60 leading-relaxed whitespace-pre-wrap text-sm">
            {p.content}
          </div>
          <a href={p.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            View original on Riot →
          </a>
        </div>
      </div>
    </main>
  )
}
