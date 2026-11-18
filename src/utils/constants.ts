/**
 * 常量和工具函数
 * @author yanstu
 */

import { APP_CONFIG } from '../../config/app.config';

// 导出配置常量
export const { mediaTypes, watchStatus } = APP_CONFIG.features;

// 状态选项
export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(watchStatus).map(([key, label]) => ({
    value: key,
    label
  }))
];

// 筛选用的「动漫」标记：动漫在数据库中仍是 tv 类型，靠标签区分，故用独立标记值
export const TAG_ANIME_VALUE = 'tag:动漫';

// 类型选项（影视库用）
export const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'movie', label: '电影' },
  { value: 'tv', label: '剧集' },
  { value: TAG_ANIME_VALUE, label: '动漫' }
];

/** 观看时间筛选的固定选项（年份选项在影视库内按数据动态补充） */
export const WATCH_TIME_BASE_OPTIONS = [
  { value: '', label: '全部观看时间' },
  { value: 'this-month', label: '本月观看' },
  { value: 'this-year', label: '本年观看' },
  { value: 'last-year', label: '去年观看' }
];

/** 上映时间筛选的固定选项（年份选项在影视库内按数据动态补充） */
export const RELEASE_YEAR_BASE_OPTIONS = [
  { value: '', label: '全部上映时间' }
];

/**
 * 按「观看时间」筛选：只要该作品有任意一次观看事件落在目标范围内即命中。
 * @param dates 该作品的全部观看日期（YYYY-MM-DD 数组，来自统计 CTE）
 * @param value 筛选值：this-month / this-year / last-year / 具体年份(如 2025)
 */
export function matchesWatchTimeFilter(dates: string[] | undefined, value: string): boolean {
  if (!value) return true;
  if (!dates || dates.length === 0) return false;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`;

  switch (value) {
    case 'this-month':
      return dates.some((d) => d.startsWith(ym));
    case 'this-year':
      return dates.some((d) => d.startsWith(`${year}-`));
    case 'last-year':
      return dates.some((d) => d.startsWith(`${year - 1}-`));
    default:
      // 具体年份
      return /^\d{4}$/.test(value) && dates.some((d) => d.startsWith(`${value}-`));
  }
}

/**
 * 按「上映时间」筛选：匹配作品的上映年份。
 * @param year 作品上映年份
 * @param value 筛选值：具体年份(如 2025) 或 decade(如 2020s)
 */
export function matchesReleaseYearFilter(year: number | null | undefined, value: string): boolean {
  if (!value) return true;
  if (value.endsWith('s') && /^\d{3}s$/.test(value)) {
    const decade = parseInt(value, 10);
    return !!year && year >= decade && year < decade + 10;
  }
  return !!year && String(year) === value;
}

/**
 * 按「类型」筛选作品。
 * - 普通值(movie/tv)：匹配 movie.type；其中 tv 会排除带「动漫」标签的作品，保证与「动漫」选项互斥
 * - 动漫标记：匹配 genres/tags 里含「动漫」的作品（这类作品数据库类型仍是 tv）
 */
export function matchesTypeFilter(
  movie: { type?: string; genres?: string[] | null; tags?: string[] | null },
  filterValue: string
): boolean {
  if (!filterValue) return true;

  const genres = movie.genres ?? [];
  const tags = movie.tags ?? [];
  const isAnime = genres.includes('动漫') || tags.includes('动漫');

  if (filterValue === TAG_ANIME_VALUE) {
    return isAnime;
  }

  // 选「剧集」时排除动漫，让「剧集」与「动漫」是两个互斥的筛选结果
  if (filterValue === 'tv') {
    return movie.type === 'tv' && !isAnime;
  }

  return movie.type === filterValue;
}

// 记录状态选项（用于添加记录）
export const RECORD_STATUS_OPTIONS = [
  { value: '', label: '请选择状态' },
  ...Object.entries(watchStatus).map(([key, label]) => ({
    value: key,
    label
  }))
];

// 工具函数
export const getStatusLabel = (status: string): string => {
  return watchStatus[status as keyof typeof watchStatus] || status;
};

export const getTypeLabel = (type?: string): string => {
  if (!type) return '未知';
  return mediaTypes[type as keyof typeof mediaTypes] || type;
};

export const getStatusBadgeClass = (status: string): string => {
  const classes = {
    watching: 'bg-green-100 text-green-800',
    completed: 'bg-blue-100 text-blue-800',
    planned: 'bg-yellow-100 text-yellow-800',
    paused: 'bg-orange-100 text-orange-800',
    dropped: 'bg-red-100 text-red-800'
  };
  return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
};

export const getYear = (dateString?: string): number | undefined => {
  if (!dateString) return undefined;
  return new Date(dateString).getFullYear();
};

// 格式化日期
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('zh-CN');
};

// 格式化时长
export const formatDuration = (minutes?: number): string => {
  if (!minutes) return '未知';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
};

// 格式化评分
export const formatRating = (rating?: number): string => {
  if (!rating || rating === 0) return '暂无评分';
  return rating.toFixed(1);
};

// 获取播出状态标签
export const getAirStatusLabel = (status?: string): string => {
  if (!status) return '未知';
  return APP_CONFIG.features.airStatus[status as keyof typeof APP_CONFIG.features.airStatus] || status;
};