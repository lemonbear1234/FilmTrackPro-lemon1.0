/**
 * 统计数据访问对象
 * 提供统计数据的查询操作
 *
 * 统计口径说明：
 * - 月/年观看量以「真实观看时间」为准，而不是记录入库时间（created_at）。
 * - 观看事件 = 状态为 completed 的主记录（取 watched_date，缺失时回退 date_added/created_at）
 *   + replay_records 中的每条重刷记录（取 watch_date）。
 * - 同一部作品在同一个自然日内的多条事件只计一次（按 movie_id + 日期去重），
 *   避免主记录与当天重刷重复计数。
 * - 电影/剧集按 movies.type 区分：'movie' / 'tv'。
 * @author yanstu
 */

import type {
  ApiResponse,
  Statistics,
  DetailedStatistics,
  MonthlyTrendPoint,
  DistributionItem,
  DatabaseRow
} from '../../../types'
import { DatabaseConnection } from '../connection'
import { DatabaseUtils } from '../utils'

/** 构建观看事件临时表：统一主记录与重刷记录，并按作品+自然日去重 */
const WATCH_EVENTS_CTE = `
  WITH watch_events AS (
    SELECT
      m.id AS movie_id,
      m.type AS media_type,
      date(COALESCE(NULLIF(m.watched_date, ''), NULLIF(m.date_added, ''), m.created_at)) AS watch_day
    FROM movies m
    WHERE m.status = 'completed'
    UNION ALL
    SELECT
      r.movie_id AS movie_id,
      m.type AS media_type,
      date(r.watch_date) AS watch_day
    FROM replay_records r
    JOIN movies m ON m.id = r.movie_id
    WHERE r.watch_date IS NOT NULL AND r.watch_date <> ''
  ),
  distinct_events AS (
    SELECT movie_id, media_type, watch_day
    FROM watch_events
    WHERE watch_day IS NOT NULL
    GROUP BY movie_id, media_type, watch_day
  )
`

const toNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export class StatisticsDAO {
  /** 获取核心统计数据（首页统计卡片用） */
  /**
   * 获取每部作品的全部真实观看日期（主记录 + 重刷，按作品+自然日去重）。
   * 供影视库「观看时间」筛选使用：key 为 movie_id，value 为 YYYY-MM-DD 日期数组。
   */
  static async getAllWatchDates(): Promise<ApiResponse<Record<string, string[]>>> {
    try {
      const db = await DatabaseConnection.getInstance()
      const sql = `${WATCH_EVENTS_CTE}
        SELECT movie_id, watch_day
        FROM distinct_events
        ORDER BY watch_day`
      const rows = await db.select(sql) as DatabaseRow[]
      const result: Record<string, string[]> = {}
      for (const row of rows) {
        const id = String(row.movie_id ?? '')
        const day = String(row.watch_day ?? '')
        if (!id || !day) continue
        if (!result[id]) result[id] = []
        result[id].push(day)
      }
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: `获取观看日期失败: ${error}` }
    }
  }

  static async getStatistics(): Promise<ApiResponse<Statistics>> {
    try {
      const db = await DatabaseConnection.getInstance()

      const sql = `${WATCH_EVENTS_CTE}
        SELECT
          (SELECT COUNT(*) FROM movies) AS total_movies,
          (SELECT COUNT(*) FROM movies WHERE status = 'completed') AS completed_movies,
          (SELECT COALESCE(AVG(CAST(personal_rating AS REAL)), 0)
             FROM movies WHERE personal_rating IS NOT NULL AND personal_rating > 0) AS average_rating,
          (SELECT COUNT(*) FROM movies WHERE type = 'movie') AS total_movie_count,
          (SELECT COUNT(*) FROM movies WHERE type = 'tv') AS total_tv_count,
          (SELECT COUNT(DISTINCT CASE WHEN media_type = 'movie' THEN movie_id END)
             FROM distinct_events
             WHERE watch_day >= date('now', 'start of month')) AS movies_this_month_movie,
          (SELECT COUNT(DISTINCT CASE WHEN media_type = 'tv' THEN movie_id END)
             FROM distinct_events
             WHERE watch_day >= date('now', 'start of month')) AS movies_this_month_tv,
          (SELECT COUNT(DISTINCT CASE WHEN media_type = 'movie' THEN movie_id END)
             FROM distinct_events
             WHERE watch_day >= date('now', 'start of year')) AS movies_this_year_movie,
          (SELECT COUNT(DISTINCT CASE WHEN media_type = 'tv' THEN movie_id END)
             FROM distinct_events
             WHERE watch_day >= date('now', 'start of year')) AS movies_this_year_tv,
          (SELECT COALESCE(SUM(duration), 0) FROM replay_records) AS total_watch_minutes
      `

      const rows = await db.select(sql) as DatabaseRow[]
      const row = rows[0] ?? {}

      // 兼容旧字段：本月/本年总数改为电影+剧集之和，保持向后一致
      const moviesThisMonth = toNumber(row.movies_this_month_movie) + toNumber(row.movies_this_month_tv)
      const moviesThisYear = toNumber(row.movies_this_year_movie) + toNumber(row.movies_this_year_tv)

      const statistics: Statistics = {
        total_movies: toNumber(row.total_movies),
        completed_movies: toNumber(row.completed_movies),
        average_rating: toNumber(row.average_rating),
        movies_this_month: moviesThisMonth,
        movies_this_year: moviesThisYear,
        total_movie_count: toNumber(row.total_movie_count),
        total_tv_count: toNumber(row.total_tv_count),
        movies_this_month_movie: toNumber(row.movies_this_month_movie),
        movies_this_month_tv: toNumber(row.movies_this_month_tv),
        movies_this_year_movie: toNumber(row.movies_this_year_movie),
        movies_this_year_tv: toNumber(row.movies_this_year_tv),
        total_watch_minutes: toNumber(row.total_watch_minutes)
      }

      return { success: true, data: statistics }
    } catch (error) {
      return { success: false, error: `获取统计数据失败: ${error}` }
    }
  }

  /** 获取详细统计（趋势 / 分布），用于首页统计面板 */
  static async getDetailedStatistics(): Promise<ApiResponse<DetailedStatistics>> {
    try {
      const db = await DatabaseConnection.getInstance()

      // 近 12 个月：按自然月分组，电影/剧集分开统计作品数
      const trendSql = `${WATCH_EVENTS_CTE}
        SELECT
          strftime('%Y-%m', watch_day) AS month,
          COUNT(DISTINCT CASE WHEN media_type = 'movie' THEN movie_id END) AS movie_count,
          COUNT(DISTINCT CASE WHEN media_type = 'tv' THEN movie_id END) AS tv_count
        FROM distinct_events
        WHERE watch_day >= date('now', 'start of month', '-11 months')
        GROUP BY strftime('%Y-%m', watch_day)
        ORDER BY month
      `
      const trendRows = await db.select(trendSql) as DatabaseRow[]
      const trendMap = new Map<string, { movie_count: number; tv_count: number }>()
      trendRows.forEach((row) => {
        trendMap.set(String(row.month), {
          movie_count: toNumber(row.movie_count),
          tv_count: toNumber(row.tv_count)
        })
      })

      // 补齐最近 12 个月的空档，保证图表连续
      const monthlyTrend: MonthlyTrendPoint[] = []
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const value = trendMap.get(key) ?? { movie_count: 0, tv_count: 0 }
        monthlyTrend.push({ month: key, ...value })
      }

      // 读取全部作品的 type / genres / status，在 JS 侧做 JSON 解析与分布聚合
      const movieRows = await db.select(
        'SELECT type, genres, status FROM movies'
      ) as DatabaseRow[]

      const movieGenreCount = new Map<string, number>()
      const tvGenreCount = new Map<string, number>()
      const statusCount = new Map<string, number>()

      movieRows.forEach((row) => {
        const type = row.type === 'tv' ? 'tv' : 'movie'
        const rawGenres = typeof row.genres === 'string' ? row.genres : null
        const genres = DatabaseUtils.parseJsonField<string[]>(rawGenres) ?? []
        const genreTarget = type === 'tv' ? tvGenreCount : movieGenreCount
        genres.forEach((genre) => {
          const name = String(genre).trim()
          if (name) genreTarget.set(name, (genreTarget.get(name) ?? 0) + 1)
        })
        const statusKey = `${type}:${row.status ?? 'unknown'}`
        statusCount.set(statusKey, (statusCount.get(statusKey) ?? 0) + 1)
      })

      const topN = (map: Map<string, number>, n = 6): DistributionItem[] =>
        [...map.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)
          .map(([name, count]) => ({ name, count }))

      const statusDistribution = [...statusCount.entries()]
        .map(([key, count]) => {
          const [type, status] = key.split(':')
          return {
            name: status,
            count,
            type: type as 'movie' | 'tv'
          }
        })
        .sort((a, b) => b.count - a.count)

      return {
        success: true,
        data: {
          monthly_trend: monthlyTrend,
          movie_genre_distribution: topN(movieGenreCount),
          tv_genre_distribution: topN(tvGenreCount),
          status_distribution: statusDistribution
        }
      }
    } catch (error) {
      return { success: false, error: `获取详细统计数据失败: ${error}` }
    }
  }
}
