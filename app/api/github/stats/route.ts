import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const repo = searchParams.get('repo')
  const sha = searchParams.get('sha')
  const account = searchParams.get('account') as 'personal' | 'business'

  const token =
    account === 'personal'
      ? process.env.GITHUB_TOKEN_PERSONAL
      : process.env.GITHUB_TOKEN_BUSINESS

  if (!token || !repo || !sha) {
    return NextResponse.json({ additions: 0, deletions: 0 })
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'github-dashboard',
      },
    })

    if (!res.ok) return NextResponse.json({ additions: 0, deletions: 0 })

    const data = await res.json()
    return NextResponse.json({
      additions: data.stats?.additions ?? 0,
      deletions: data.stats?.deletions ?? 0,
    })
  } catch {
    return NextResponse.json({ additions: 0, deletions: 0 })
  }
}
