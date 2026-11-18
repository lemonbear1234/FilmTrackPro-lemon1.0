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