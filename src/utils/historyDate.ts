import type { Movie } from '../types'
import { formatLocalDate } from './date'

export { formatLocalDate }

export function normalizeHistoryDateValue(value?: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dateOnlyMatch) {
    return dateOnlyMatch[1]
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return formatLocalDate(parsed)
}

export function getMovieHistoryDate(
  movie: Pick<Movie, 'watched_date' | 'date_added' | 'date_updated'>
): string {
  return (
    normalizeHistoryDateValue(movie.watched_date) ??
    normalizeHistoryDateValue(movie.date_added) ??
    normalizeHistoryDateValue(movie.date_updated) ??
    formatLocalDate(new Date())
  )
}

export function parseHistoryDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date(`${formatLocalDate(new Date())}T00:00:00`)
  }

  return parsed
}
