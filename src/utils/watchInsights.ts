import type { Movie, ReplayRecord } from '../types';
import {
  getLastAvailableProgress,
  getNextWatchProgress,
  getNormalizedProgress,
  getSeasonEpisodeCount,
  getSeasonOptions,
  getWatchProgressSummary,
} from './seasonProgress';

export interface MovieActionItem {
  movieId: string;
  title: string;
  subtitle: string;
  reason: string;
  actionLabel: string;
  priority: number;
  type: 'continue' | 'resume' | 'review';
}

export interface WatchTimelineItem {
  id: string;
  date: string;
  label: string;
  description: string;
  tone: 'default' | 'accent' | 'success';
}

/**
 * 构建「观影待办」卡片。
 *
 * 这里只负责「接下来看什么」：在追的剧集下一步、暂停中的恢复。
 * 新集播出日程统一由首页下方的「更新提醒」呈现（那里按日期分组、带海报，
 * 还能刷新），如果这里再生成一批「新集提醒」卡片，两处内容会完全重复。
 */
export function buildMovieActionItems(movies: Movie[]): MovieActionItem[] {
  const actions: MovieActionItem[] = [];

  for (const movie of movies) {
    if (movie.status === 'watching' && movie.type === 'tv') {
      const nextProgress = getNextWatchProgress(movie);
      const progress = getWatchProgressSummary(movie);

      if (nextProgress) {
        actions.push({
          movieId: movie.id,
          title: movie.title,
          subtitle: `下一步：第${nextProgress.season}季第${nextProgress.episode}集`,
          reason: progress.current > 0 ? '上次看到这里' : '从这里开始看',
          actionLabel: '继续观看',
          priority: 100 - progress.percentage,
          type: 'continue',
        });
      }
    }

    if (movie.status === 'paused') {
      actions.push({
        movieId: movie.id,
        title: movie.title,
        subtitle: movie.type === 'tv'
          ? `暂停在第${getNormalizedProgress(movie).season}季第${getNormalizedProgress(movie).episode}集`
          : '暂停中的影片',
        reason: '接着上次的位置看',
        actionLabel: '恢复进度',
        priority: 72,
        type: 'resume',
      });
    }
  }

  // 同一部作品只留一张卡（比如既在追又暂停时不会出现两条）
  const seen = new Set<string>();

  return actions
    .sort((left, right) => right.priority - left.priority)
    .filter((item) => {
      if (seen.has(item.movieId)) return false;
      seen.add(item.movieId);
      return true;
    })
    .slice(0, 6);
}

export function buildWatchTimeline(movie: Movie, replayRecords: ReplayRecord[]): WatchTimelineItem[] {
  const timeline: WatchTimelineItem[] = [];

  if (movie.watched_date) {
    timeline.push({
      id: `watched-${movie.id}`,
      date: movie.watched_date,
      label: '主记录日期',
      description: '当前这条影视记录的观看日期',
      tone: 'accent',
    });
  }

  if (movie.type === 'tv') {
    const current = getNormalizedProgress(movie);
    const progress = getWatchProgressSummary(movie);
    const seasonCount = getSeasonOptions(movie.seasons_data, movie.total_seasons).length;
    const currentSeasonEpisodes = getSeasonEpisodeCount(movie, current.season);
    const lastAvailable = getLastAvailableProgress(movie);

    timeline.push({
      id: `progress-${movie.id}`,
      date: movie.date_updated || movie.updated_at || movie.created_at,
      label: '当前进度',
      description: seasonCount > 1
        ? `已看到第${current.season}季第${current.episode}集，累计 ${progress.current}/${progress.total || '?'} 集`
        : `已看到第${current.episode}/${currentSeasonEpisodes || movie.total_episodes || '?'} 集`,
      tone: 'default',
    });

    timeline.push({
      id: `completion-${movie.id}`,
      date: movie.date_updated || movie.updated_at || movie.created_at,
      label: '已更新到',
      description: `当前已知最多到第${lastAvailable.season}季第${lastAvailable.episode}集`,
      tone: progress.isCompleted ? 'success' : 'default',
    });
  }

  replayRecords
    .slice()
    .sort((left, right) => new Date(right.watch_date).getTime() - new Date(left.watch_date).getTime())
    .slice(0, 5)
    .forEach(record => {
      timeline.push({
        id: record.id,
        date: record.watch_date,
        label: '重刷记录',
        description: [
          record.season ? `第${record.season}季` : '',
          record.episode ? `第${record.episode}集` : '',
          record.rating ? `评分 ${record.rating}` : '',
          record.notes ? record.notes : '',
        ].filter(Boolean).join(' · ') || '已记录一次重刷',
        tone: 'default',
      });
    });

  return timeline
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 8);
}
