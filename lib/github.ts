export type GitHubCommit = {
  sha: string
  commit: {
    message: string
    author: { date: string }
    committer: { date: string }
  }
  repository: {
    name: string
    full_name: string
  }
  // enriched client-side after stats fetch:
  _additions?: number
  _deletions?: number
  _account?: 'personal' | 'business'
}

export type DayStats = {
  date: string // YYYY-MM-DD
  personal: number
  business: number
  added: number
  deleted: number
}
