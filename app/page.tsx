'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { GitHubCommit, DayStats } from '@/lib/github'

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: '#f8f9fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '24px',
    color: '#1a1a2e',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  h1: { fontSize: '22px', fontWeight: 700, margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const },
  badge: {
    fontSize: '12px',
    color: '#6b7280',
    background: '#e5e7eb',
    padding: '4px 10px',
    borderRadius: '999px',
  },
  btn: (disabled: boolean, color = '#1a1a2e') =>
    ({
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: disabled ? '#d1d5db' : color,
      color: disabled ? '#9ca3af' : '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '13px',
      fontWeight: 600,
    }) as React.CSSProperties,
  rangeBtns: { display: 'flex', gap: '6px' },
  rangeBtn: (active: boolean) =>
    ({
      padding: '5px 12px',
      borderRadius: '6px',
      border: `1px solid ${active ? '#3b82f6' : '#d1d5db'}`,
      background: active ? '#eff6ff' : '#fff',
      color: active ? '#3b82f6' : '#6b7280',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: active ? 600 : 400,
    }) as React.CSSProperties,
  progressWrap: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '20px',
  },
  progressLabel: { fontSize: '13px', color: '#374151', marginBottom: '8px' },
  progressTrack: { background: '#e5e7eb', borderRadius: '999px', height: '8px' },
  progressFill: (pct: number) =>
    ({
      background: '#3b82f6',
      borderRadius: '999px',
      height: '8px',
      width: `${Math.min(100, pct)}%`,
      transition: 'width 0.2s',
    }) as React.CSSProperties,
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  card: (bg = '#fff', border = '#e5e7eb') =>
    ({
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: '10px',
      padding: '16px',
    }) as React.CSSProperties,
  cardLabel: { fontSize: '11px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' } as React.CSSProperties,
  cardValue: (color = '#111827') =>
    ({ fontSize: '26px', fontWeight: 700, color }) as React.CSSProperties,
  skeletonCard: {
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '16px',
    height: '72px',
    animation: 'pulse 1.5s infinite',
  } as React.CSSProperties,
  section: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
  },
  sectionTitle: { fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: '#374151' },
  heatmapGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '3px',
  },
  heatCell: (color: string) =>
    ({
      height: '18px',
      borderRadius: '3px',
      background: color,
      cursor: 'pointer',
    }) as React.CSSProperties,
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
  barLabel: { fontSize: '12px', color: '#374151', marginBottom: '4px' },
  barTrack: {
    background: '#f3f4f6',
    borderRadius: '3px',
    height: '18px',
    overflow: 'hidden',
    marginBottom: '6px',
    position: 'relative',
  } as React.CSSProperties,
  repoRow: { marginBottom: '8px' },
  subSection: { marginBottom: '20px' },
  subTitle: { fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' } as React.CSSProperties,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function toYMD(date: Date) {
  return date.toISOString().split('T')[0]
}

function getDaysArray(days: number): string[] {
  const arr: string[] = []
  const count = days === 0 ? 3650 : days
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    arr.push(toYMD(d))
  }
  return arr
}

function shortNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function heatColor(personal: number, business: number, maxDay: number): string {
  const total = personal + business
  if (total === 0) return '#f0f0f0'
  const intensity = Math.min(1, total / Math.max(1, maxDay))
  const t = 0.15 + intensity * 0.85

  if (personal > 0 && business > 0) {
    // purple ramp
    const r = Math.round(88 + (1 - t) * 100)
    const g = Math.round(28 + (1 - t) * 60)
    const b = Math.round(220 - (1 - t) * 60)
    return `rgb(${r},${g},${b})`
  } else if (personal > 0) {
    // blue ramp
    const v = Math.round(180 - t * 120)
    return `rgb(${v},${Math.round(v * 0.7)},255)`
  } else {
    // green ramp
    const v = Math.round(180 - t * 120)
    return `rgb(${Math.round(v * 0.6)},${v + 30},${Math.round(v * 0.5)})`
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GitHubDashboard() {
  const [days, setDays] = useState(30)
  const [commits, setCommits] = useState<GitHubCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'commits' | 'stats' | 'done'>('idle')
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [avatars, setAvatars] = useState<{ personal: string | null; business: string | null }>({ personal: null, business: null })

  useEffect(() => {
    async function fetchAvatars() {
      const [p, b] = await Promise.all([
        fetch(`https://api.github.com/users/${process.env.NEXT_PUBLIC_GITHUB_USERNAME_PERSONAL}`).then(r => r.json()).catch(() => ({})),
        fetch(`https://api.github.com/users/${process.env.NEXT_PUBLIC_GITHUB_USERNAME_BUSINESS}`).then(r => r.json()).catch(() => ({})),
      ])
      setAvatars({ personal: p.avatar_url ?? null, business: b.avatar_url ?? null })
    }
    fetchAvatars()
  }, [])
  const [tooltip, setTooltip] = useState<{ date: string; personal: number; business: number; x: number; y: number } | null>(null)

  const personalUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME_PERSONAL ?? 'Personal'
  const businessUsername = process.env.NEXT_PUBLIC_GITHUB_USERNAME_BUSINESS ?? 'Business'

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const enrichWithStats = useCallback(async (list: GitHubCommit[], account: 'personal' | 'business') => {
    const CONCURRENCY = 5
    let idx = 0

    async function worker() {
      while (idx < list.length) {
        const i = idx++
        const c = list[i]
        const repo = c.repository?.full_name
        const sha = c.sha
        if (!repo || !sha) {
          setEnrichProgress(p => ({ ...p, done: p.done + 1 }))
          continue
        }
        const url = `/api/github/stats?repo=${encodeURIComponent(repo)}&sha=${sha}&account=${account}`
        const stats = await fetch(url)
          .then(r => r.json())
          .catch(() => ({ additions: 0, deletions: 0 }))
        c._additions = stats.additions
        c._deletions = stats.deletions
        c._account = account
        setEnrichProgress(p => ({ ...p, done: p.done + 1 }))
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }, [])

  const fetchData = useCallback(async (daysToFetch: number, forceFresh = false) => {
    setLoading(true)
    setPhase('commits')
    setCommits([])
    setEnrichProgress({ done: 0, total: 0 })

    try {
      // Check Supabase cache (< 2 hours old) — skipped on forced refresh
      if (!forceFresh) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        const { data: snapshots } = await supabase
          .from('github_snapshots')
          .select('*')
          .gte('fetched_at', twoHoursAgo)
          .order('fetched_at', { ascending: false })
          .limit(2)

        if (snapshots && snapshots.length >= 2) {
          const personal = snapshots.find((s: { account: string }) => s.account === 'personal')
          const business = snapshots.find((s: { account: string }) => s.account === 'business')
          if (personal && business) {
            const all = [
              ...(personal.commits as GitHubCommit[]),
              ...(business.commits as GitHubCommit[]),
            ]
            setCommits(all)
            setLastUpdated(new Date(personal.fetched_at))
            setPhase('done')
            setLoading(false)
            return
          }
        }
      }

      // Phase 1 — fetch commit lists in parallel
      const apiDays = daysToFetch === 0 ? 3650 : daysToFetch
      const [c1, c2] = await Promise.all([
        fetch(`/api/github/commits?account=personal&days=${apiDays}`).then(r => r.json()),
        fetch(`/api/github/commits?account=business&days=${apiDays}`).then(r => r.json()),
      ])

      const personalCommits: GitHubCommit[] = c1.commits ?? []
      const businessCommits: GitHubCommit[] = c2.commits ?? []
      const total = personalCommits.length + businessCommits.length

      setPhase('stats')
      setEnrichProgress({ done: 0, total })

      // Phase 2 — enrich with line stats, 5 at a time
      await Promise.all([
        enrichWithStats(personalCommits, 'personal'),
        enrichWithStats(businessCommits, 'business'),
      ])

      const all = [...personalCommits, ...businessCommits]
      setCommits(all)
      setLastUpdated(new Date())

      // Save to Supabase cache
      await Promise.all([
        supabase.from('github_snapshots').insert({ account: 'personal', commits: personalCommits }),
        supabase.from('github_snapshots').insert({ account: 'business', commits: businessCommits }),
      ])

      setPhase('done')
    } catch (err) {
      console.error(err)
      setPhase('done')
    } finally {
      setLoading(false)
    }
  }, [enrichWithStats])

  useEffect(() => {
    fetchData(days)
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ─────────────────────────────────────────────────────────

  const daysList = useMemo(() => getDaysArray(days), [days])

  const dayMap = useMemo(() => {
    const map: Record<string, DayStats> = {}
    for (const d of daysList) {
      map[d] = { date: d, personal: 0, business: 0, added: 0, deleted: 0 }
    }
    for (const c of commits) {
      const raw = c.commit?.author?.date ?? c.commit?.committer?.date
      if (!raw) continue
      const d = raw.split('T')[0]
      if (!map[d]) continue
      if (c._account === 'personal') map[d].personal++
      else map[d].business++
      map[d].added += c._additions ?? 0
      map[d].deleted += c._deletions ?? 0
    }
    return map
  }, [commits, daysList])

  const chartData = useMemo(
    () => daysList.map(d => ({ ...dayMap[d], label: formatDate(d) })),
    [dayMap, daysList],
  )

  const linesData = useMemo(
    () =>
      daysList.map(d => ({
        date: formatDate(d),
        added: dayMap[d].added,
        deleted: -(dayMap[d].deleted),
      })),
    [dayMap, daysList],
  )

  const stats = useMemo(() => {
    const personal = commits.filter(c => c._account === 'personal')
    const business = commits.filter(c => c._account === 'business')
    const repos = new Set(commits.map(c => c.repository?.full_name).filter(Boolean))
    const totalAdded = commits.reduce((s, c) => s + (c._additions ?? 0), 0)
    const totalDeleted = commits.reduce((s, c) => s + (c._deletions ?? 0), 0)
    const net = totalAdded - totalDeleted
    const avg = commits.length > 0 ? Math.round((totalAdded + totalDeleted) / commits.length) : 0
    return { personal, business, repos, totalAdded, totalDeleted, net, avg }
  }, [commits])

  const topRepos = useMemo(() => {
    const byAccount = (account: 'personal' | 'business') => {
      const list = commits.filter(c => c._account === account)
      const byCommit: Record<string, number> = {}
      const byLines: Record<string, number> = {}
      for (const c of list) {
        const r = c.repository?.full_name ?? 'unknown'
        byCommit[r] = (byCommit[r] ?? 0) + 1
        byLines[r] = (byLines[r] ?? 0) + (c._additions ?? 0) + (c._deletions ?? 0)
      }
      const commitList = Object.entries(byCommit)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
      const linesList = Object.entries(byLines)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
      return { commitList, linesList }
    }
    return {
      personal: byAccount('personal'),
      business: byAccount('business'),
    }
  }, [commits])

  const maxDayCommits = useMemo(
    () => Math.max(1, ...Object.values(dayMap).map(d => d.personal + d.business)),
    [dayMap],
  )

  // ── Hour-of-day map ───────────────────────────────────────────────────────

  const hourMap = useMemo(() => {
    const map: Record<number, { personal: number; business: number }> = {}
    for (let h = 0; h < 24; h++) map[h] = { personal: 0, business: 0 }
    for (const c of commits) {
      const raw = c.commit?.author?.date ?? c.commit?.committer?.date
      if (!raw) continue
      const hour = new Date(raw).getHours()
      if (c._account === 'personal') map[hour].personal++
      else map[hour].business++
    }
    return map
  }, [commits])

  // ── Streak + busiest weekday ──────────────────────────────────────────────

  const extras = useMemo(() => {
    let streak = 0
    let maxStreak = 0
    for (const d of daysList) {
      const total = dayMap[d].personal + dayMap[d].business
      if (total > 0) {
        streak++
        maxStreak = Math.max(maxStreak, streak)
      } else {
        streak = 0
      }
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekCounts = Array(7).fill(0)
    for (const d of daysList) {
      const day = new Date(d + 'T12:00:00').getDay()
      weekCounts[day] += dayMap[d].personal + dayMap[d].business
    }
    const busiestIdx = weekCounts.indexOf(Math.max(...weekCounts))

    const peakHourEntry = Object.entries(hourMap)
      .sort((a, b) => (b[1].personal + b[1].business) - (a[1].personal + a[1].business))[0]
    const busiestHour = peakHourEntry
      ? `${Number(peakHourEntry[0]) % 12 || 12}${Number(peakHourEntry[0]) < 12 ? 'am' : 'pm'}`
      : '—'

    return { maxStreak, busiestDay: weekdays[busiestIdx], busiestHour }
  }, [dayMap, daysList, hourMap])

  // ── Formatters ────────────────────────────────────────────────────────────

  const xTickFormatter = useCallback(
    (val: string, idx: number) => (idx % 5 === 0 ? val : ''),
    [],
  )

  const absFormatter = useCallback((v: number) => String(Math.abs(v)), [])

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = loading
  const pct = enrichProgress.total > 0 ? (enrichProgress.done / enrichProgress.total) * 100 : 0

  const lastUpdatedLabel = lastUpdated
    ? (() => {
        const mins = Math.round((Date.now() - lastUpdated.getTime()) / 60000)
        return mins < 1 ? 'just now' : `${mins}m ago`
      })()
    : null

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>GitHub Commit Dashboard</h1>
          {lastUpdatedLabel && (
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Updated {lastUpdatedLabel}</span>
          )}
        </div>
        <div style={s.headerRight}>
          <div style={s.rangeBtns}>
            {[7, 30, 0].map(d => (
              <button key={d} style={s.rangeBtn(days === d)} onClick={() => setDays(d)} disabled={isLoading}>
                {d === 0 ? 'All' : `${d}d`}
              </button>
            ))}
          </div>
          <button style={s.btn(isLoading, '#3b82f6')} onClick={() => fetchData(days, true)} disabled={isLoading}>
            {isLoading ? 'Fetching…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {phase === 'stats' && (
        <div style={s.progressWrap}>
          <div style={s.progressLabel}>
            Fetching line stats: {enrichProgress.done} / {enrichProgress.total} commits
          </div>
          <div style={s.progressTrack}>
            <div style={s.progressFill(pct)} />
          </div>
        </div>
      )}
      {phase === 'commits' && (
        <div style={s.progressWrap}>
          <div style={s.progressLabel}>Fetching commits…</div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill(100), animation: 'pulse 1s infinite' }} />
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div style={{ ...s.statsRow, marginBottom: '16px' }}>
        {isLoading && phase === 'commits'
          ? Array(12).fill(0).map((_, i) => <div key={i} style={s.skeletonCard} />)
          : <>
              <div style={s.card()}>
                <div style={s.cardLabel}>Total commits</div>
                <div style={s.cardValue()}>{commits.length}</div>
              </div>
              <div style={s.card()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {avatars.personal && <img src={avatars.personal} alt={personalUsername} style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #bfdbfe', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...s.cardLabel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{personalUsername}</div>
                    <div style={s.cardValue('#3b82f6')}>{stats.personal.length}</div>
                  </div>
                </div>
              </div>
              <div style={s.card()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                  {avatars.business && <img src={avatars.business} alt={businessUsername} style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #bbf7d0', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...s.cardLabel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessUsername}</div>
                    <div style={s.cardValue('#639922')}>{stats.business.length}</div>
                  </div>
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.cardLabel}>Repos touched</div>
                <div style={s.cardValue()}>{stats.repos.size}</div>
              </div>
              <div style={s.card('#f0fdf4', '#bbf7d0')}>
                <div style={s.cardLabel}>Lines added</div>
                <div style={s.cardValue('#16a34a')}>+{stats.totalAdded.toLocaleString()}</div>
              </div>
              <div style={s.card('#fff1f2', '#fecdd3')}>
                <div style={s.cardLabel}>Lines deleted</div>
                <div style={s.cardValue('#dc2626')}>−{stats.totalDeleted.toLocaleString()}</div>
              </div>
              <div style={s.card(stats.net >= 0 ? '#f0fdf4' : '#fff1f2', stats.net >= 0 ? '#bbf7d0' : '#fecdd3')}>
                <div style={s.cardLabel}>Net lines</div>
                <div style={s.cardValue(stats.net >= 0 ? '#16a34a' : '#dc2626')}>
                  {stats.net >= 0 ? '+' : '−'}{Math.abs(stats.net).toLocaleString()}
                </div>
              </div>
              <div style={s.card('#eff6ff', '#bfdbfe')}>
                <div style={s.cardLabel}>Avg lines/commit</div>
                <div style={s.cardValue('#2563eb')}>{stats.avg.toLocaleString()}</div>
              </div>
              <div style={s.card('#fefce8', '#fde68a')}>
                <div style={s.cardLabel}>Longest streak</div>
                <div style={s.cardValue('#d97706')}>{extras.maxStreak} days</div>
              </div>
              <div style={s.card('#fdf4ff', '#e9d5ff')}>
                <div style={s.cardLabel}>Busiest weekday</div>
                <div style={s.cardValue('#7c3aed')}>{extras.busiestDay}</div>
              </div>
              <div style={s.card('#f0f9ff', '#bae6fd')}>
                <div style={s.cardLabel}>Busiest hour</div>
                <div style={s.cardValue('#0284c7')}>{extras.busiestHour}</div>
              </div>
              <div style={s.card()}>
                <div style={s.cardLabel}>Date range</div>
                <div style={s.cardValue('#374151')}>{days === 0 ? 'All time' : `${days} days`}</div>
              </div>
            </>}
      </div>

      {/* ── Heatmap ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Activity Heatmap</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '11px', color: '#6b7280' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', background: 'rgb(130,60,200)', borderRadius: '2px', display: 'inline-block' }} />
            Both
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', background: 'rgb(60,60,255)', borderRadius: '2px', display: 'inline-block' }} />
            Personal
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '12px', height: '12px', background: 'rgb(40,180,80)', borderRadius: '2px', display: 'inline-block' }} />
            Business
          </span>
        </div>
        <div style={s.heatmapGrid}>
          {daysList.map(d => {
            const { personal, business } = dayMap[d]
            const color = heatColor(personal, business, maxDayCommits)
            return (
              <div
                key={d}
                style={s.heatCell(color)}
                onMouseEnter={e => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect()
                  setTooltip({ date: d, personal, business, x: rect.left + rect.width / 2, y: rect.top - 8 })
                }}
                onMouseLeave={() => setTooltip(null)}
                title={`${formatDate(d)}: ${personal + business} commits`}
              />
            )
          })}
        </div>
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              pointerEvents: 'none',
              zIndex: 1000,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 600 }}>{formatDate(tooltip.date)}</div>
            {tooltip.personal > 0 && <div>Personal: {tooltip.personal}</div>}
            {tooltip.business > 0 && <div>Business: {tooltip.business}</div>}
            {tooltip.personal + tooltip.business === 0 && <div>No commits</div>}
          </div>
        )}
      </div>

      {/* ── Hour of day heatmap ── */}
      {commits.length > 0 && (() => {
        const maxHour = Math.max(1, ...Object.values(hourMap).map(h => h.personal + h.business))
        const peakHour = Object.entries(hourMap).sort((a, b) => (b[1].personal + b[1].business) - (a[1].personal + a[1].business))[0]
        const peakLabel = peakHour ? `${Number(peakHour[0]) % 12 || 12}${Number(peakHour[0]) < 12 ? 'am' : 'pm'}` : ''
        return (
          <div style={s.section}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={s.sectionTitle}>Time of Day</div>
              {peakLabel && <div style={{ fontSize: '12px', color: '#6b7280' }}>Peak: <span style={{ fontWeight: 600, color: '#374151' }}>{peakLabel}</span></div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '3px' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const { personal, business } = hourMap[h]
                const color = heatColor(personal, business, maxHour)
                return (
                  <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div
                      style={{ height: '32px', width: '100%', borderRadius: '3px', background: color, cursor: 'pointer' }}
                      title={`${h % 12 || 12}${h < 12 ? 'am' : 'pm'}: ${personal + business} commits`}
                    />
                    {(h % 6 === 0) && (
                      <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                        {h === 0 ? '12a' : h === 12 ? '12p' : `${h % 12}${h < 12 ? 'a' : 'p'}`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Chart 1: Commits over time ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Commits Over Time</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tickFormatter={xTickFormatter} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip
              formatter={(v, name) => [v, name === 'personal' ? personalUsername : businessUsername]}
            />
            <Legend formatter={v => (v === 'personal' ? personalUsername : businessUsername)} />
            <Bar dataKey="personal" stackId="a" fill="#378ADD" />
            <Bar dataKey="business" stackId="a" fill="#639922" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Chart 2: Lines added vs deleted ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Lines Added vs Deleted</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={linesData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tickFormatter={xTickFormatter} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={absFormatter} tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              formatter={(v, name) => {
                const n = Number(v)
                return [
                  name === 'added' ? `+${n.toLocaleString()} lines` : `−${Math.abs(n).toLocaleString()} lines`,
                  name === 'added' ? 'Added' : 'Deleted',
                ]
              }}
            />
            <Legend formatter={v => (v === 'added' ? 'Added' : 'Deleted')} />
            <Bar dataKey="added" fill="#16a34a" />
            <Bar dataKey="deleted" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Top repos ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Top Repositories</div>
        {(['personal', 'business'] as const).map(account => {
          const label = account === 'personal' ? personalUsername : businessUsername
          const color = account === 'personal' ? '#378ADD' : '#639922'
          const { commitList, linesList } = topRepos[account]
          const maxC = commitList[0]?.[1] ?? 1
          const maxL = linesList[0]?.[1] ?? 1

          return (
            <div key={account} style={{ marginBottom: account === 'personal' ? '24px' : 0 }}>
              <div style={{ ...s.cardLabel, marginBottom: '12px', fontSize: '13px', color }}>{label}</div>
              <div style={s.twoCol}>
                <div style={s.subSection}>
                  <div style={s.subTitle}>By commit count</div>
                  {commitList.length === 0 && <div style={{ color: '#9ca3af', fontSize: '12px' }}>No data</div>}
                  {commitList.map(([repo, count]) => (
                    <div key={repo} style={s.repoRow}>
                      <div style={s.barLabel}>
                        {repo.split('/')[1] ?? repo}
                        <span style={{ float: 'right', color: '#6b7280', fontSize: '11px' }}>{count}</span>
                      </div>
                      <div style={s.barTrack}>
                        <div style={{ height: '100%', width: `${(count / maxC) * 100}%`, background: color, borderRadius: '3px' }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={s.subSection}>
                  <div style={s.subTitle}>By lines changed</div>
                  {linesList.length === 0 && <div style={{ color: '#9ca3af', fontSize: '12px' }}>No data</div>}
                  {linesList.map(([repo, lines]) => (
                    <div key={repo} style={s.repoRow}>
                      <div style={s.barLabel}>
                        {repo.split('/')[1] ?? repo}
                        <span style={{ float: 'right', color: '#6b7280', fontSize: '11px' }}>{shortNum(lines)}</span>
                      </div>
                      <div style={s.barTrack}>
                        <div style={{ height: '100%', width: `${(lines / maxL) * 100}%`, background: color, borderRadius: '3px', opacity: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
