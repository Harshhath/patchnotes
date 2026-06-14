import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import Groq from 'groq-sdk'

// ── Keyword → tag mapping ──────────────────────────────────────────────────
const VALORANT_KEYWORD_TAGS: Record<string, string> = {
  'weapon': 'weapon-buff', 'gun': 'weapon-buff', 'rifle': 'weapon-buff',
  'pistol': 'weapon-buff', 'smg': 'weapon-buff', 'sniper': 'weapon-buff',
  'shotgun': 'weapon-buff', 'phantom': 'weapon-buff', 'vandal': 'weapon-buff',
  'operator': 'weapon-buff', 'sheriff': 'weapon-buff', 'nerf': 'weapon-nerf',
  'agent': 'agent-buff', 'jett': 'agent-buff', 'neon': 'agent-buff',
  'raze': 'agent-buff', 'reyna': 'agent-buff', 'sage': 'agent-buff',
  'omen': 'agent-buff', 'viper': 'agent-buff', 'killjoy': 'agent-buff',
  'sova': 'agent-buff', 'phoenix': 'agent-buff', 'fade': 'agent-buff',
  'harbor': 'agent-buff', 'gekko': 'agent-buff', 'deadlock': 'agent-buff',
  'iso': 'agent-buff', 'clove': 'agent-buff', 'waylay': 'agent-buff',
  'map': 'map-change', 'ascent': 'map-change', 'bind': 'map-change',
  'haven': 'map-change', 'split': 'map-change', 'icebox': 'map-change',
  'breeze': 'map-change', 'fracture': 'map-change', 'pearl': 'map-change',
  'lotus': 'map-change', 'sunset': 'map-change', 'abyss': 'map-change',
  'bug': 'bug-fix', 'fix': 'bug-fix', 'crash': 'bug-fix',
  'economy': 'economy', 'credit': 'economy', 'buy': 'economy',
  'performance': 'performance', 'fps': 'performance',
  'premier': 'premier', 'ranked': 'premier',
}

const CS2_KEYWORD_TAGS: Record<string, string> = {
  'weapon': 'weapon-change', 'gun': 'weapon-change', 'rifle': 'weapon-change',
  'pistol': 'weapon-change', 'smg': 'weapon-change', 'sniper': 'weapon-change',
  'shotgun': 'weapon-change', 'ak': 'weapon-change', 'ak-47': 'weapon-change',
  'm4': 'weapon-change', 'awp': 'weapon-change', 'deagle': 'weapon-change',
  'glock': 'weapon-change', 'usp': 'weapon-change', 'damage': 'weapon-change',
  'recoil': 'weapon-change', 'map': 'map-change', 'dust': 'map-change',
  'mirage': 'map-change', 'inferno': 'map-change', 'nuke': 'map-change',
  'overpass': 'map-change', 'anubis': 'map-change', 'vertigo': 'map-change',
  'ancient': 'map-change', 'bug': 'bug-fix', 'fix': 'bug-fix', 'crash': 'bug-fix',
  'cheat': 'anti-cheat', 'vac': 'anti-cheat', 'anti-cheat': 'anti-cheat',
  'ui': 'ui-change', 'hud': 'ui-change', 'menu': 'ui-change',
  'performance': 'performance', 'fps': 'performance',
  'gameplay': 'gameplay', 'animation': 'animation',
}

// ── Query expansion terms per tag ──────────────────────────────────────────
const TAG_EXPANSION: Record<string, string> = {
  'weapon-buff':   'weapon buff damage increase accuracy improvement gun upgrade',
  'weapon-nerf':   'weapon nerf damage reduction accuracy decrease gun downgrade',
  'weapon-change': 'weapon change damage recoil accuracy fire rate gun balance',
  'agent-buff':    'agent ability buff cooldown reduction damage increase upgrade',
  'agent-nerf':    'agent ability nerf cooldown increase damage reduction downgrade',
  'map-change':    'map update layout change geometry callout added removed',
  'bug-fix':       'bug fix crash error resolved patch stability',
  'economy':       'economy credits buy phase cost price change',
  'performance':   'performance fps optimization frame rate memory',
  'premier':       'premier ranked competitive mode',
  'ui-change':     'ui interface hud menu visual update display',
  'anti-cheat':    'anti-cheat vac detection ban cheat prevention',
  'gameplay':      'gameplay mechanic change movement shooting update',
  'animation':     'animation visual effect model update',
}

function detectTag(question: string, game: string): string | null {
  const lower = question.toLowerCase()
  const map = game === 'CS2' ? CS2_KEYWORD_TAGS : VALORANT_KEYWORD_TAGS
  for (const [keyword, tag] of Object.entries(map)) {
    if (lower.includes(keyword)) return tag
  }
  return null
}

// ── Expand query with domain terms for better embedding ───────────────────
function expandQuery(question: string, tag: string | null, game: string): string {
  const expansion = tag ? (TAG_EXPANSION[tag] ?? '') : ''
  return `${game} patch notes: ${question} ${expansion}`.trim()
}

// ── Rerank patches by combining similarity + tag match + recency ──────────
function rerank(
  patches: any[],
  detectedTag: string | null,
  question: string
): any[] {
  const lower = question.toLowerCase()
  const words = lower.split(/\s+/).filter((w) => w.length > 2)
  const now   = Date.now()

  return patches
    .map((p) => {
      let score = p.similarity ?? 0

      // +0.15 if patch has the detected tag
      if (detectedTag && Array.isArray(p.tags) && p.tags.includes(detectedTag)) {
        score += 0.15
      }

      // +0.02 per question keyword found in title or summary
      const haystack = `${p.title} ${JSON.stringify(p.summary ?? '')}`.toLowerCase()
      for (const word of words) {
        if (haystack.includes(word)) score += 0.02
      }

      // slight recency boost — newer patches score marginally higher
      const age = now - new Date(p.date).getTime()
      const ageYears = age / (1000 * 60 * 60 * 24 * 365)
      score += Math.max(0, 0.05 - ageYears * 0.01)

      return { ...p, _score: score }
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const ai   = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

  const { question, game } = await req.json()
  if (!question) return NextResponse.json({ error: 'No question' }, { status: 400 })

  const gameLabel  = game ?? 'Valorant'
  const detectedTag = detectTag(question, gameLabel)

  // ── 1. Expand query before embedding ──────────────────────────────────────
  const expandedQuery = expandQuery(question, detectedTag, gameLabel)

  // ── 2. Embed the expanded query ────────────────────────────────────────────
  const embedResult = await ai.models.embedContent({
    model: 'models/gemini-embedding-2',
    contents: expandedQuery,
  })
  const embedding = ((embedResult as any).embeddings ?? [])[0]?.values ?? []

  // ── 3. Fetch more candidates so reranker has room to work ─────────────────
  let patches: any[] = []
  let error: any     = null

  const result = await supabase.rpc('match_patches_by_game', {
    query_embedding: embedding,
    match_count: 15,
    game_filter: gameLabel,
  })
  patches = result.data ?? []
  error   = result.error

  // fallback if game-filtered RPC doesn't exist
  if (error?.code === 'PGRST202') {
    const fallback = await supabase.rpc('match_patches', {
      query_embedding: embedding,
      match_count: 20,
    })
    patches = (fallback.data ?? []).filter((p: any) => p.game === gameLabel)
    error   = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 4. Rerank: tag match + keyword overlap + recency ──────────────────────
  const reranked = rerank(patches, detectedTag, question)

  // ── 5. Build context ───────────────────────────────────────────────────────
  const context = reranked.map((p: any) =>
    `Patch: ${p.title} (${p.date})\nTags: ${JSON.stringify(p.tags)}\n${p.content ?? JSON.stringify(p.summary)}`
  ).join('\n\n')

  // ── 6. LLM answer ─────────────────────────────────────────────────────────
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a ${gameLabel} patch notes expert. Answer questions based only on the patch notes context provided. Be concise and specific. Always mention the patch version and date when referencing a change.`,
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    max_tokens: 500,
  })

  const answer = completion.choices[0]?.message?.content ?? 'No answer found.'
  return NextResponse.json({ answer, sources: reranked })
}