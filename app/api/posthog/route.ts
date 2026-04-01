import { NextResponse } from 'next/server'

export const runtime = 'edge'

type HogQLResult = { results: (string | number)[][] }

async function hogql(projectId: string, apiKey: string, query: string): Promise<(string | number)[][]> {
  const res = await fetch(`https://us.posthog.com/api/projects/${projectId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  })
  if (!res.ok) return []
  const data: HogQLResult = await res.json()
  return data.results ?? []
}

const referrerQuery = `
  SELECT properties.$referring_domain, count()
  FROM events
  WHERE event = '$pageview'
    AND properties.$referring_domain IS NOT NULL
    AND properties.$referring_domain != ''
    AND properties.$referring_domain != 'direct'
    AND timestamp > now() - interval 30 day
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 5
`

export async function GET() {
  const apiKey = process.env.POSTHOG_API_KEY
  const msbsId = process.env.POSTHOG_MSBS_PROJECT_ID
  const aquaslogId = process.env.POSTHOG_AQUASLOG_PROJECT_ID

  if (!apiKey || !msbsId || !aquaslogId) {
    return NextResponse.json({ error: 'Missing PostHog credentials' }, { status: 400 })
  }

  const [
    msbsPageviews, msbsUniqueVisitors, msbsClicks, msbsLinkTypes, msbsReferrers,
    aquaslogPageviews, aquaslogUniqueVisitors, aquaslogSignups, aquaslogReferrers,
  ] = await Promise.all([
    hogql(msbsId, apiKey, `
      SELECT count()
      FROM events
      WHERE event = '$pageview'
        AND timestamp > now() - interval 30 day
    `),
    hogql(msbsId, apiKey, `
      SELECT count(distinct distinct_id)
      FROM events
      WHERE event = '$pageview'
        AND timestamp > now() - interval 30 day
    `),
    hogql(msbsId, apiKey, `
      SELECT properties.$ph_capture_attribute_project, count()
      FROM events
      WHERE event = '$autocapture'
        AND properties.$ph_capture_attribute_project IS NOT NULL
        AND timestamp > now() - interval 30 day
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `),
    hogql(msbsId, apiKey, `
      SELECT properties.$ph_capture_attribute_link_type, count()
      FROM events
      WHERE event = '$autocapture'
        AND properties.$ph_capture_attribute_link_type IS NOT NULL
        AND timestamp > now() - interval 30 day
      GROUP BY 1
      ORDER BY 2 DESC
    `),
    hogql(msbsId, apiKey, referrerQuery),
    hogql(aquaslogId, apiKey, `
      SELECT count()
      FROM events
      WHERE event = '$pageview'
        AND timestamp > now() - interval 30 day
    `),
    hogql(aquaslogId, apiKey, `
      SELECT count(distinct distinct_id)
      FROM events
      WHERE event = '$pageview'
        AND timestamp > now() - interval 30 day
    `),
    hogql(aquaslogId, apiKey, `
      SELECT count()
      FROM events
      WHERE event = 'signed_up'
        AND timestamp > now() - interval 30 day
    `),
    hogql(aquaslogId, apiKey, referrerQuery),
  ])

  return NextResponse.json({
    msbs: {
      pageviews: Number(msbsPageviews[0]?.[0] ?? 0),
      uniqueVisitors: Number(msbsUniqueVisitors[0]?.[0] ?? 0),
      topProjects: msbsClicks.map(([project, count]) => ({ project: String(project), count: Number(count) })),
      linkTypes: msbsLinkTypes.map(([type, count]) => ({ type: String(type), count: Number(count) })),
      referrers: msbsReferrers.map(([domain, count]) => ({ domain: String(domain), count: Number(count) })),
    },
    aquaslog: {
      pageviews: Number(aquaslogPageviews[0]?.[0] ?? 0),
      uniqueVisitors: Number(aquaslogUniqueVisitors[0]?.[0] ?? 0),
      signups: Number(aquaslogSignups[0]?.[0] ?? 0),
      referrers: aquaslogReferrers.map(([domain, count]) => ({ domain: String(domain), count: Number(count) })),
    },
  })
}
