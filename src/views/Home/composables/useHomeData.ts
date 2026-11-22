import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMovieStore } from '../../../stores/movie';
import { tmdbAPI } from '../../../utils/api';
import { databaseAPI } from '../../../services/database-api';
import { tvReminderService } from '../../../services/reminder';
import type { Movie, Statistics, DetailedStatistics, TVReminderGroup } from '../../../types';
import { getWatchProgressSummary } from '../../../utils/seasonProgress';
import { buildMovieActionItems, type MovieActionItem } from '../../../utils/watchInsights';
import { sendDesktopNotification } from '../../../services/desktop-notifications';

interface LoadWatchingOptions {
  silent?: boolean;
}

export function useHomeData() {
  const router = useRouter();
  const movieStore = useMovieStore();

  const loadingStats = ref(true);
  const loadingWatching = ref(true);
  const loadingHistory = ref(true);
  const loadingReminders = ref(true);
  const statsError = ref('');
  const watchingError = ref('');
  const historyError = ref('');
  const reminderError = ref('');

  const statistics = ref<Statistics>({
    total_movies: 0,
    completed_movies: 0,
    average_rating: 0,
    movies_this_month: 0,
    movies_this_year: 0,
    total_movie_count: 0,
    total_tv_count: 0,
    movies_this_month_movie: 0,
    movies_this_month_tv: 0,
    movies_this_year_movie: 0,
    movies_this_year_tv: 0,
    total_watch_minutes: 0
  });

  const detailedStats = ref<DetailedStatistics>({
    monthly_trend: [],
    movie_genre_distribution: [],
    tv_genre_distribution: [],
    status_distribution: []
  });

  const watchingMovies = ref<Movie[]>([]);
  const recentHistory = ref<Movie[]>([]);
  const reminderGroups = ref<TVReminderGroup[]>([]);

  // 提醒范围：7 / 14 / 30 天，用户选择后记住
  const REMINDER_RANGE_KEY = 'filmtrack-reminder-range';
  const REMINDER_RANGE_OPTIONS = [
    { value: 7, label: '7 天' },
    { value: 14, label: '14 天' },
    { value: 30, label: '30 天' }
  ];

  const readStoredRange = (): number => {
    try {
      const raw = Number(window.localStorage.getItem(REMINDER_RANGE_KEY));
      if (REMINDER_RANGE_OPTIONS.some(option => option.value === raw)) return raw;
    } catch {
      // 隐私模式等场景读不到，用默认值
    }
    return 7;
  };

  const reminderRange = ref<number>(readStoredRange());
  // 待办只依赖「在追」列表，用 computed 派生，避免多处赋值彼此覆盖（加载顺序不同结果就不同）
  const actionItems = computed<MovieActionItem[]>(() => buildMovieActionItems(watchingMovies.value));

  const getMovieImageURL = (path: string | undefined) => {
    return tmdbAPI.getImageURL(path);
  };

  const navigateToDetail = (movieId: string) => {
    router.push(`/detail/${movieId}`);
  };

  const getTotalWatchedEpisodes = (movie: Movie) => getWatchProgressSummary(movie).current;

  const getRelativeDayLabel = (dateStr: string) => {
    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays === 2) return '后天';
    if (diffDays > 2) return `还有${diffDays}天`;
    return '';
  };

  const formatReminderDate = (dateStr: string) => {
    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return dateStr;

    const relative = getRelativeDayLabel(dateStr);
    const readableDate = `${target.getMonth() + 1}月${target.getDate()}日`;
    const weekdayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdayMap[target.getDay()];

    return `${relative ? relative + ' · ' : ''}${readableDate}（${weekday}）`;
  };

  const formatEpisodeLabel = (season?: number, episode?: number) => {
    const parts = [];
    if (season) {
      parts.push(`第${season}季`);
    }
    if (episode) {
      parts.push(`第${episode}集`);
    }
    return parts.join(' · ') || '新集即将上线';
  };

  const loadStatistics = async () => {
    try {
      loadingStats.value = true;
      statsError.value = '';

      const [result, detailedResult] = await Promise.all([
        databaseAPI.getStatistics(),
        databaseAPI.getDetailedStatistics()
      ])

      if (result.success && result.data) {
        statistics.value = result.data;
      } else {
        throw new Error(result.error || '获取统计数据失败');
      }

      if (detailedResult.success && detailedResult.data) {
        detailedStats.value = detailedResult.data;
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
      statsError.value = error instanceof Error ? error.message : '获取统计数据失败';
    } finally {
      loadingStats.value = false;
    }
  };

  const loadWatchingMovies = async (options: LoadWatchingOptions = {}): Promise<Movie[]> => {
    const { silent = false } = options;
    try {
      if (!silent) {
        loadingWatching.value = true;
      }
      watchingError.value = '';

      const result = await databaseAPI.getMovies('watching');
      if (result.success && result.data) {
        watchingMovies.value = result.data;
        return result.data;
      }

      throw new Error(result.error || '获取追剧数据失败');
    } catch (error) {
      console.error('获取追剧数据失败:', error);
      watchingError.value = error instanceof Error ? error.message : '获取追剧数据失败';
      return [];
    } finally {
      if (!silent) {
        loadingWatching.value = false;
      }
    }
  };

  const loadReplayHistory = async () => {
    try {
      loadingHistory.value = true;
      historyError.value = '';

      const result = await databaseAPI.getHistoryMovies(12, 0);
      if (result.success && result.data) {
        recentHistory.value = result.data;
      } else {
        throw new Error(result.error || '获取历史数据失败');
      }
    } catch (error) {
      console.error('获取历史数据失败:', error);
      historyError.value = error instanceof Error ? error.message : '获取历史数据失败';
      recentHistory.value = [];
    } finally {
      loadingHistory.value = false;
    }
  };

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * 把"今天就播"的剧集合并为一条桌面通知；同一日内多次刷新只推一次（去重）。
   */
  const notifyTodayAirings = async (groups: TVReminderGroup[]) => {
    const today = todayKey();
    const todayItems = groups
      .filter((group) => group.date && group.date.slice(0, 10) === today)
      .flatMap((group) => group.items);
    if (todayItems.length === 0) return;

    const titles = todayItems.slice(0, 3).map((item) => item.title);
    const more = todayItems.length - titles.length;
    const body = more > 0
      ? `${titles.join('、')} 等共 ${todayItems.length} 部今天有新集`
      : `${titles.join('、')} 今天有新集`;

    await sendDesktopNotification({
      key: `tv-airings-${today}`,
      title: '今天有新集上线',
      body,
    });
  };

  const loadUpdateReminders = async (
    movies?: Movie[],
    options: { forceRefresh?: boolean } = {}
  ) => {
    try {
      loadingReminders.value = true;
      reminderError.value = '';

      const result = await tvReminderService.getReminderGroups({
        movies,
        days: reminderRange.value,
        forceRefresh: options.forceRefresh
      });
      if (result.success && result.data) {
        reminderGroups.value = result.data;
        void notifyTodayAirings(result.data);
      } else {
        throw new Error(result.error || '获取更新提醒失败');
      }
    } catch (error) {
      console.error('获取更新提醒失败:', error);
      reminderError.value = error instanceof Error ? error.message : '获取更新提醒失败';
      reminderGroups.value = [];
    } finally {
      loadingReminders.value = false;
    }
  };

  const refreshReminders = async () => {
    const latestWatching = await loadWatchingMovies({ silent: true });
    // 「刷新提醒」必须真的联网：否则 24 小时缓存会让它看起来什么都没发生
    await loadUpdateReminders(latestWatching, { forceRefresh: true });
  };

  const setReminderRange = (days: number) => {
    if (!REMINDER_RANGE_OPTIONS.some(option => option.value === days)) return;
    if (reminderRange.value === days) return;

    reminderRange.value = days;
    try {
      window.localStorage.setItem(REMINDER_RANGE_KEY, String(days));
    } catch {
      // 存不了也不影响本次使用
    }

    // 详情数据已有缓存，改范围只是重新筛选，无需重新联网
    void loadUpdateReminders(watchingMovies.value);
  };

  const initializeData = async () => {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('数据加载超时')), 10000)
      );

      const watchingPromise = loadWatchingMovies();

      await Promise.race([
        Promise.allSettled([
          loadStatistics(),
          watchingPromise,
          loadReplayHistory(),
          watchingPromise
            .then(data => loadUpdateReminders(data))
            .catch(() => loadUpdateReminders())
        ]),
        timeout
      ]);
    } catch (error) {
      console.error('数据初始化失败:', error);
    }
  };

  return {
    movieStore,
    loadingStats,
    loadingWatching,
    loadingHistory,
    loadingReminders,
    statsError,
    watchingError,
    historyError,
    reminderError,
    statistics,
    detailedStats,
    watchingMovies,
    recentHistory,
    reminderGroups,
    actionItems,
    getMovieImageURL,
    navigateToDetail,
    getTotalWatchedEpisodes,
    reminderRange,
    reminderRangeOptions: REMINDER_RANGE_OPTIONS,
    setReminderRange,
    getRelativeDayLabel,
    formatReminderDate,
    formatEpisodeLabel,
    loadStatistics,
    loadWatchingMovies,
    loadReplayHistory,
    loadUpdateReminders,
    refreshReminders,
    initializeData
  };
}
