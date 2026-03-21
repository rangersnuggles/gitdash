import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get('account') as 'personal' | 'business'

  const token =
    account === 'personal'
      ? process.env.GITHUB_TOKEN_PERSONAL
      : process.env.GITHUB_TOKEN_BUSINESS
  const username =
    account === 'personal'
      ? process.env.GITHUB_USERNAME_PERSONAL
      : process.env.GITHUB_USERNAME_BUSINESS

  if (!token || !username) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const days = parseInt(searchParams.get('days') ?? '30', 10)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().split('T')[0]

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.cloak-preview',
    'User-Agent': 'github-dashboard',
  }

  const allCommits = []
  let page = 1
  const perPage = 100

  while (page <= 10) {
    const url =
      `https://api.github.com/search/commits` +
      `?q=author:${username}+committer-date:>=${sinceDate}` +
      `&per_page=${perPage}&page=${page}`

    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) break

    const data = await res.json()
    if (!data.items || data.items.length === 0) break

    allCommits.push(...data.items)
    if (data.items.length < perPage) break
    page++
  }

  return NextResponse.json({ commits: allCommits, total: allCommits.length })
}
