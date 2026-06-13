import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import Groq from 'groq-sdk'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

  const { question } = await req.json()
  if (!question) return NextResponse.json({ error: 'No question' }, { status: 400 })

  const embedResult = await ai.models.embedContent({
    model: 'models/gemini-embedding-2',
    contents: question,
  })
  const embedding = ((embedResult as any).embeddings ?? [])[0]?.values ?? []

  const { data: patches, error } = await supabase.rpc('match_patches', {
    query_embedding: embedding,
    match_count: 5,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const context = (patches ?? []).map((p: any) =>
    `Patch: ${p.title} (${p.date})\n${p.content ?? JSON.stringify(p.summary)}`
  ).join('\n\n')

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a Valorant patch notes expert. Answer questions based only on the patch notes context provided. Be concise and clear.',
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    max_tokens: 500,
  })

  const answer = completion.choices[0]?.message?.content ?? 'No answer found.'
  return NextResponse.json({ answer, sources: patches })
}
