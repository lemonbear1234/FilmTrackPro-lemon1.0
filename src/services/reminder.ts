/**
 * 电视剧更新提醒服务
 *
 * 提醒由两部分拼成：
 * 1. TMDb 自动推导：在追的剧 → /tv/{id} 的 next_episode_to_air → 落在范围里的条目
 * 2. 用户手动添加：TMDb 拉不到、或日期不准时自己填，落库保存
 *
 * 海报三级回退：条目自带 → 本地影视库同作品 → TMDb 搜索 → 留空
 */
import type {
  ApiResponse,
  Movie,
  ReminderEntry,
  ReminderEntryForm,
  TVEpisodeReminder,
  TVReminderGroup
} from '../types';
import { databaseAPI } from './database-api';
import { tmdbAPI } from '../utils/api';

interface ReminderOptions {
  /** 向后查看多少天，默认 7 */
  days?: number;
  movies?: Movie[];
  /** 跳过 TMDb 详情缓存，强制联网（「刷新提醒」用） */
  forceRefresh?: boolean;
}

/** 手动提醒里「已播出」的保留天数，方便用户回头删掉，不做成永久堆积 */
const PAST_MANUAL_KEEP_DAYS = 30;

class TVReminderService {
  private defaultRange = 7; // 默认查找未来7天内的更新

  /**
   * 获取用户正在追的电视剧
   */
  private async loadWatchingTVShows(provided?: Movie[]): Promise<Movie[]> {
    if (provided && provided.length > 0) {
      return provided.filter(movie => movie.type === 'tv');
    }

    const result = await databaseAPI.getMovies('watching');
    if (result.success && result.data) {
      return result.data.filter(movie => movie.type === 'tv');
    }

    throw new Error(result.error || '无法加载追剧列表');
  }

  /**
   * 判断播出日期是否在未来N天内
   */
  private isWithinRange(airDate: string, days: number): boolean {
    if (!airDate) return false;

    const target = new Date(airDate);
    if (Number.isNaN(target.getTime())) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setDate(end.getDate() + days);
    end.setHours(23, 59, 59, 999);

    return target.getTime() >= today.getTime() && target.getTime() <= end.getTime();
  }

  /** 判断播出日期是否已经过去 */
  private isPastDate(airDate: string): boolean {
    const target = new Date(airDate);
    if (Number.isNaN(target.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return target.getTime() < today.getTime();
  }

  /** 去重键：同作品 + 同播出日 + 同集数视为同一条 */
  private buildKey(movieId: string | null | undefined, airDate: string, episodeNumber?: number | null): string {
    return `${movieId || 'no-movie'}|${airDate}|${episodeNumber ?? 'na'}`;
  }

  /**
   * TMDb 自动推导的提醒
   */
  private async collectAutoReminders(
    days: number,
    options: ReminderOptions
  ): Promise<TVEpisodeReminder[]> {
    const tvShows = await this.loadWatchingTVShows(options.movies);
    const showsWithTmdbId = tvShows.filter(movie => movie.tmdb_id);

    if (showsWithTmdbId.length === 0) {
      return [];
    }

    const detailResults = await Promise.allSettled(
      showsWithTmdbId.map(show =>
        tmdbAPI.getTVDetails(show.tmdb_id!, { forceRefresh: options.forceRefresh })
      )
    );

    const reminders: TVEpisodeReminder[] = [];

    detailResults.forEach((result, index) => {
      const show = showsWithTmdbId[index];
      if (result.status !== 'fulfilled') {
        console.warn('获取电视剧详情失败:', result.reason);
        return;
      }

      if (!result.value.success || !result.value.data) {
        return;
      }

      const detail = result.value.data;
      const nextEpisode = detail.next_episode_to_air;
      if (!nextEpisode || !nextEpisode.air_date) {
        return;
      }

      if (!this.isWithinRange(nextEpisode.air_date, days)) {
        return;
      }

      reminders.push({
        movie_id: show.id,
        tmdb_id: show.tmdb_id,
        title: show.title,
        status: show.status,
        // 本地没有海报时，用刚拿到的 TMDb 详情兜底
        poster_path: show.poster_path || detail.poster_path || null,
        air_date: nextEpisode.air_date,
        season_number: nextEpisode.season_number,
        episode_number: nextEpisode.episode_number,
        episode_name: nextEpisode.name,
        overview: nextEpisode.overview,
        still_path: nextEpisode.still_path ?? null,
        source: 'auto'
      });
    });

    return reminders;
  }

  /**
   * 用户手动添加的提醒
   * 不受「未来 N 天」范围限制——自己加的日期应该一定看得见
   */
  private async collectManualReminders(): Promise<TVEpisodeReminder[]> {
    const [manualResult, moviesResult] = await Promise.all([
      databaseAPI.getManualReminders(),
      databaseAPI.getMovies()
    ]);

    if (!manualResult.success) {
      throw new Error(manualResult.error || '读取手动提醒失败');
    }

    const entries = manualResult.data ?? [];
    if (entries.length === 0) {
      return [];
    }

    const movieMap = new Map<string, Movie>();
    if (moviesResult.success && moviesResult.data) {
      moviesResult.data.forEach(movie => movieMap.set(movie.id, movie));
    }

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - PAST_MANUAL_KEEP_DAYS);

    const reminders: TVEpisodeReminder[] = [];

    entries.forEach(entry => {
      const airTime = new Date(entry.air_date).getTime();
      if (Number.isNaN(airTime) || airTime < cutoff.getTime()) {
        return;
      }

      const linkedMovie = entry.movie_id ? movieMap.get(entry.movie_id) : undefined;

      reminders.push({
        movie_id: entry.movie_id || `manual-${entry.id}`,
        tmdb_id: entry.tmdb_id ?? linkedMovie?.tmdb_id ?? undefined,
        title: entry.title,
        status: linkedMovie?.status ?? 'watching',
        poster_path: entry.poster_path || linkedMovie?.poster_path || null,
        air_date: entry.air_date,
        season_number: entry.season_number ?? undefined,
        episode_number: entry.episode_number ?? undefined,
        episode_name: entry.episode_name ?? null,
        overview: null,
        still_path: null,
        source: 'manual',
        entry_id: entry.id,
        notes: entry.notes ?? null,
        is_past: this.isPastDate(entry.air_date)
      });
    });

    return reminders;
  }

  /**
   * 获取未来几天即将更新的剧集（自动 + 手动，已忽略的不再出现）
   */
  public async getUpcomingReminders(options: ReminderOptions = {}): Promise<ApiResponse<TVEpisodeReminder[]>> {
    try {
      const days = Math.min(60, Math.max(1, options.days ?? this.defaultRange));

      const [autoReminders, manualReminders, dismissedResult] = await Promise.all([
        this.collectAutoReminders(days, options),
        this.collectManualReminders(),
        databaseAPI.getDismissedReminders()
      ]);

      const dismissedKeys = new Set(
        (dismissedResult.success ? dismissedResult.data ?? [] : []).map(entry =>
          this.buildKey(entry.movie_id, entry.air_date, entry.episode_number)
        )
      );

      const manualKeys = new Set(
        manualReminders.map(item => this.buildKey(item.movie_id, item.air_date, item.episode_number))
      );

      // 手动条目优先：同一作品同一天同集数时，以用户手填的内容为准
      const autoFiltered = autoReminders.filter(item => {
        const key = this.buildKey(item.movie_id, item.air_date, item.episode_number);
        return !dismissedKeys.has(key) && !manualKeys.has(key);
      });

      const merged = [...autoFiltered, ...manualReminders];

      // 未来条目按日期升序在前，已播出的手动提醒沉到最后（倒序，最近的在前）
      merged.sort((left, right) => {
        const leftPast = Boolean(left.is_past);
        const rightPast = Boolean(right.is_past);
        const leftTime = new Date(left.air_date).getTime();
        const rightTime = new Date(right.air_date).getTime();

        if (leftPast !== rightPast) return leftPast ? 1 : -1;
        return leftPast ? rightTime - leftTime : leftTime - rightTime;
      });

      return { success: true, data: merged };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * 将提醒数据按日期分组（保持排序结果，已播出的一组排最后）
   */
  public async getReminderGroups(options: ReminderOptions = {}): Promise<ApiResponse<TVReminderGroup[]>> {
    const remindersResult = await this.getUpcomingReminders(options);
    if (!remindersResult.success || !remindersResult.data) {
      return { success: false, error: remindersResult.error || '获取提醒失败' };
    }

    const groupsMap = new Map<string, TVEpisodeReminder[]>();
    remindersResult.data.forEach(reminder => {
      const key = reminder.air_date;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(reminder);
    });

    const groups: TVReminderGroup[] = Array.from(groupsMap.entries())
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => {
          // 手动的排在自动前面，其余按标题
          if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
          return a.title.localeCompare(b.title, 'zh-CN');
        })
      }));

    return { success: true, data: groups };
  }

  /**
   * 海报解析：本地库优先，其次 TMDb，最后留空
   * 弹窗保存时调用，把结果一起落库，列表渲染就不用再联网
   */
  public async resolveReminderPoster(form: ReminderEntryForm): Promise<ReminderEntryForm> {
    if (form.poster_path) {
      return form;
    }

    // 1. 关联了本地作品，直接用它自己的海报
    if (form.movie_id) {
      const result = await databaseAPI.getMovieById(form.movie_id);
      if (result.success && result.data) {
        return {
          ...form,
          poster_path: result.data.poster_path || null,
          tmdb_id: form.tmdb_id ?? result.data.tmdb_id ?? null
        };
      }
    }

    // 2. 本地影视库里按标题找同名作品
    const localMatch = await this.findLocalMovieByTitle(form.title);
    if (localMatch) {
      return {
        ...form,
        movie_id: form.movie_id || localMatch.id,
        poster_path: localMatch.poster_path || null,
        tmdb_id: form.tmdb_id ?? localMatch.tmdb_id ?? null
      };
    }

    // 3. 本地没有，再去 TMDb 搜一次；搜不到就空着
    try {
      const search = await tmdbAPI.searchMulti(form.title);
      const first = search.success ? search.data?.results?.[0] : undefined;
      if (first) {
        return {
          ...form,
          poster_path: first.poster_path || null,
          tmdb_id: form.tmdb_id ?? first.id ?? null
        };
      }
    } catch (error) {
      console.warn('TMDb 海报补全失败，将留空:', error);
    }

    return form;
  }

  /** 在本地影视库里按标题匹配（先精确、再不区分大小写包含） */
  private async findLocalMovieByTitle(title: string): Promise<Movie | null> {
    const keyword = title.trim();
    if (!keyword) return null;

    const result = await databaseAPI.getMovies();
    if (!result.success || !result.data) return null;

    const exact = result.data.find(movie => movie.title === keyword);
    if (exact) return exact;

    const lower = keyword.toLowerCase();
    const fuzzy = result.data.find(movie => movie.title?.toLowerCase().includes(lower));
    if (fuzzy) return fuzzy;

    // 反方向包含也算命中（用户只写了作品名的一部分）
    return result.data.find(movie => lower.includes(movie.title?.toLowerCase() ?? '\u0000')) ?? null;
  }

  /** 新增手动提醒（自动补海报） */
  public async createReminder(form: ReminderEntryForm): Promise<ApiResponse<ReminderEntry>> {
    if (!form.title?.trim()) {
      return { success: false, error: '请先填写作品名称' };
    }
    if (!form.air_date) {
      return { success: false, error: '请选择播出日期' };
    }

    const resolved = await this.resolveReminderPoster({ ...form, title: form.title.trim() });
    return databaseAPI.addManualReminder(resolved);
  }

  /** 修改手动提醒 */
  public async updateReminder(id: string, form: ReminderEntryForm): Promise<ApiResponse<ReminderEntry>> {
    if (!form.title?.trim()) {
      return { success: false, error: '请先填写作品名称' };
    }
    if (!form.air_date) {
      return { success: false, error: '请选择播出日期' };
    }

    const resolved = await this.resolveReminderPoster({ ...form, title: form.title.trim() });
    return databaseAPI.updateManualReminder(id, resolved);
  }

  /** 删除手动提醒 */
  public async deleteReminder(id: string): Promise<ApiResponse<string>> {
    return databaseAPI.deleteManualReminder(id);
  }

  /**
   * 删除/忽略一条提醒
   * 手动条目是真删除，自动条目是记一个忽略标记
   */
  public async dismissReminder(item: TVEpisodeReminder): Promise<ApiResponse<string>> {
    if (item.source === 'manual' && item.entry_id) {
      return this.deleteReminder(item.entry_id);
    }

    return databaseAPI.dismissAutoReminder({
      movieId: item.movie_id,
      title: item.title,
      airDate: item.air_date,
      seasonNumber: item.season_number ?? null,
      episodeNumber: item.episode_number ?? null,
      tmdbId: item.tmdb_id ?? null
    });
  }
}

export const tvReminderService = new TVReminderService();
