import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data', 'health')

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') ?? '30')))

    await fs.mkdir(DATA_DIR, { recursive: true })
    const files = await fs.readdir(DATA_DIR)
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse().slice(0, days)

    const results = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf-8')
          return JSON.parse(raw)
        } catch {
          return null
        }
      })
    )

    return NextResponse.json(results.filter(Boolean))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
