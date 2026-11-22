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
  TMDbEpisode,
  TMDbMovieDetail,
  TVEpisodeReminder,
  TVReminderGroup
} from '../types';
import { databaseAPI } from './database-api';
import { tmdbAPI } from '../utils/api';
import {
  addDaysToDate,
  daysFromToday,
  startOfWeekDate,
  todayLocalDate,
  weekdayOfDate
} from '../utils/date';

interface ReminderOptions {
  /** 向后查看多少天，默认 7 */
  days?: number;
  movies?: Movie[];
  /** 跳过 TMDb 详情缓存，强制联网（「刷新提醒」用） */
  forceRefresh?: boolean;
}

/** 手动提醒里「已播出」的保留天数：留一周方便回看，之后自动清掉 */
const PAST_MANUAL_KEEP_DAYS = 7;

/** 周期提醒向前补齐的天数上限，避免一条周期条目铺满整个列表 */
const CYCLE_LOOKAHEAD_DAYS = 120;

/** 一条周期提醒最多显示几场（含用户填的那一集） */
const CYCLE_MAX_OCCURRENCES = 12;

/** 极端周期（例如每天更新 + 很久以前的首播日）时循环的硬上限 */
const CYCLE_MAX_STEPS = 1200;

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
   * 选哪一季来算：优先「下一集」所在的季，其次「上一集」，
   * 都为空（完结或新季未建）时退到最近播过的一季
   */
  private pickSeasonNumber(detail: TMDbMovieDetail): number | null {
    const next = detail.next_episode_to_air;
    if (next?.season_number != null) return next.season_number;

    const last = detail.last_episode_to_air;
    if (last?.season_number != null) return last.season_number;

    const seasons = (detail.seasons ?? [])
      .filter(season => season.season_number > 0)
      .sort((a, b) => a.season_number - b.season_number);

    if (seasons.length === 0) return null;

    const aired = seasons.filter(season => season.air_date && daysFromToday(season.air_date) <= 0);
    return (aired.length > 0 ? aired[aired.length - 1] : seasons[seasons.length - 1]).season_number;
  }

  /** 把 TMDb 单集转成列表项 */
  private buildAutoReminder(
    show: Movie,
    detail: TMDbMovieDetail,
    episode: TMDbEpisode,
    totalEpisodes: number | null
  ): TVEpisodeReminder {
    return {
      movie_id: show.id,
      tmdb_id: show.tmdb_id,
      title: show.title,
      status: show.status,
      // 本地没有海报时，用刚拿到的 TMDb 详情兜底
      poster_path: show.poster_path || detail.poster_path || null,
      air_date: episode.air_date,
      season_number: episode.season_number,
      episode_number: episode.episode_number,
      episode_name: episode.name,
      overview: episode.overview,
      still_path: episode.still_path ?? null,
      source: 'auto',
      media_type: 'tv',
      total_episodes: totalEpisodes,
      is_past: this.isPastDate(episode.air_date)
    };
  }

  /**
   * TMDb 自动推导的提醒
   *
   * 不再只读 next_episode_to_air（它只给一集，也拿不到「本季共几集」），
   * 改为按季拉 /tv/{id}/season/{n} 的整季集表：
   * 周一周二双更、本季总集数、每集实际播出日都能对上。
   * 季集表拿不到（新季还没建）时再退回 next_episode。
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

    const resolved: Array<{ show: Movie; detail: TMDbMovieDetail; season: number | null }> = [];

    detailResults.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value.success || !result.value.data) {
        if (result.status === 'rejected') {
          console.warn('获取电视剧详情失败:', result.reason);
        }
        return;
      }

      const detail = result.value.data;
      resolved.push({
        show: showsWithTmdbId[index],
        detail,
        season: this.pickSeasonNumber(detail)
      });
    });

    const seasonResults = await Promise.allSettled(
      resolved.map(entry =>
        entry.season === null
          ? Promise.resolve({ success: false as const, error: '没有可用的季' })
          : tmdbAPI.getTVSeasonDetails(entry.show.tmdb_id!, entry.season, {
              forceRefresh: options.forceRefresh
            })
      )
    );

    const reminders: TVEpisodeReminder[] = [];

    resolved.forEach((entry, index) => {
      const { show, detail, season } = entry;
      const seasonResult = seasonResults[index];
      const episodes =
        seasonResult.status === 'fulfilled' && seasonResult.value.success && seasonResult.value.data
          ? seasonResult.value.data.episodes ?? []
          : [];

      // 总集数优先用整季集表长度；季集表没有时用详情里的 episode_count
      const seasonMeta = (detail.seasons ?? []).find(item => item.season_number === season);
      const totalEpisodes =
        episodes.filter(episode => episode.episode_number > 0).length ||
        seasonMeta?.episode_count ||
        null;

      const inRange = episodes
        .filter(episode => episode.air_date && this.isWithinRange(episode.air_date, days))
        .sort(
          (left, right) =>
            left.air_date.localeCompare(right.air_date) ||
            left.episode_number - right.episode_number
        );

      if (inRange.length > 0) {
        inRange.forEach(episode => {
          reminders.push(this.buildAutoReminder(show, detail, episode, totalEpisodes));
        });
        return;
      }

      // 整季集表里没有落在范围内的集（新季尚未建集表 / 本季已更完），退回「下一集」
      const nextEpisode = detail.next_episode_to_air;
      if (nextEpisode?.air_date && this.isWithinRange(nextEpisode.air_date, days)) {
        reminders.push(this.buildAutoReminder(show, detail, nextEpisode, totalEpisodes));
      }
    });

    return reminders;
  }

  /** 把一条手动条目转成列表项（周期提醒的每一场也走这里） */
  private buildManualReminder(
    entry: ReminderEntry,
    linkedMovie: Movie | undefined,
    options: {
      airDate?: string;
      episodeNumber?: number | null;
      sequence?: number;
      repeatDays?: number | null;
    } = {}
  ): TVEpisodeReminder {
    const airDate = options.airDate ?? entry.air_date;
    const sequence = options.sequence ?? 0;

    return {
      movie_id: entry.movie_id || `manual-${entry.id}`,
      tmdb_id: entry.tmdb_id ?? linkedMovie?.tmdb_id ?? undefined,
      title: entry.title,
      status: linkedMovie?.status ?? 'watching',
      poster_path: entry.poster_path || linkedMovie?.poster_path || null,
      air_date: airDate,
      season_number: entry.season_number ?? undefined,
      episode_number: (options.episodeNumber ?? entry.episode_number) ?? undefined,
      // 用户填的集标题只属于那一集，自动补出来的场次不要沿用
      episode_name: sequence > 0 ? null : entry.episode_name ?? null,
      overview: null,
      still_path: null,
      source: 'manual',
      entry_id: entry.id,
      notes: entry.notes ?? null,
      repeat_days: options.repeatDays ?? entry.repeat_days ?? null,
      media_type: entry.media_type ?? linkedMovie?.type ?? null,
      total_episodes: entry.season_total_episodes ?? null,
      air_weekdays: entry.air_weekdays ?? null,
      occurrence_sequence: sequence,
      // 自动补出来的场次带上原点信息，编辑时还原成用户填的那一集
      cycle_base: sequence > 0
        ? {
            air_date: entry.air_date,
            season_number: entry.season_number ?? null,
            episode_number: entry.episode_number ?? null,
            episode_name: entry.episode_name ?? null
          }
        : undefined,
      is_past: this.isPastDate(airDate)
    };
  }

  /**
   * 生成一条周期提醒的候选日期
   *
   * - 有周更日（周一周二双更）时按「周几」推进，必须把首播日当天那一周也含进来，
   *   否则集号会和用户填的「第 1 集」错位
   * - 没有周更日时按每 N 天推进
   * - 一直生成到查看上限，交给调用方按「今天」截断，保证集号始终和日期对得上
   */
  private buildCycleDates(baseDate: string, repeatDays: number, weekdays: number[]): string[] {
    const dates: string[] = [];
    const stepWeeks = weekdays.length > 0 && repeatDays % 7 === 0 ? Math.round(repeatDays / 7) : 0;

    if (stepWeeks > 0) {
      const anchor = startOfWeekDate(baseDate);
      // 首播日那天的周几一定要算进去，否则第一集会被跳过
      const days = Array.from(new Set([...weekdays, weekdayOfDate(baseDate)])).sort();

      for (let week = 0; week < CYCLE_MAX_STEPS; week += stepWeeks) {
        for (const weekday of days) {
          const date = addDaysToDate(anchor, week * 7 + (weekday - 1));
          if (daysFromToday(date) > CYCLE_LOOKAHEAD_DAYS) return dates;
          if (date < baseDate) continue;
          dates.push(date);
        }
      }

      return dates;
    }

    for (let step = 0; step < CYCLE_MAX_STEPS; step += 1) {
      const date = addDaysToDate(baseDate, step * repeatDays);
      if (daysFromToday(date) > CYCLE_LOOKAHEAD_DAYS) break;
      dates.push(date);
    }

    return dates;
  }

  /**
   * 周期提醒：从用户填的那一集开始向后推导
   *
   * - 必须有「本季共几集」才推导：没有总集数还硬推，2019 年首播的周更剧会被算成第 377 集
   * - 集数按日期顺序 +1，超过总集数立即停，绝不越过季末
   * - 只保留今天及以后（外加保留期内的几场），已播完的收进「已播出」
   */
  private expandCycleEntry(entry: ReminderEntry, linkedMovie?: Movie): TVEpisodeReminder[] {
    const repeatDays = Math.floor(Number(entry.repeat_days ?? 0));
    if (!Number.isFinite(repeatDays) || repeatDays < 1) {
      return [];
    }

    const totalEpisodes = entry.season_total_episodes ?? null;
    const baseEpisode = entry.episode_number ?? null;

    // 没有总集数就不推算后续集数，只保留用户填的这一集
    if (!totalEpisodes || !baseEpisode) {
      return [this.buildManualReminder(entry, linkedMovie)];
    }

    const weekdays = (entry.air_weekdays ?? []).filter(day => day >= 1 && day <= 7);
    const dates = this.buildCycleDates(entry.air_date, repeatDays, weekdays);

    // 往前多留几场，让「最近播完的那一集」还能出现在已播出区
    const startIndex = dates.findIndex(date => daysFromToday(date) >= -PAST_MANUAL_KEEP_DAYS);
    if (startIndex < 0) {
      return [];
    }

    const occurrences: TVEpisodeReminder[] = [];

    for (
      let index = startIndex;
      index < dates.length && occurrences.length < CYCLE_MAX_OCCURRENCES;
      index += 1
    ) {
      const episode = baseEpisode + index;
      if (episode > totalEpisodes) break;

      occurrences.push(
        this.buildManualReminder(entry, linkedMovie, {
          airDate: dates[index],
          episodeNumber: episode,
          sequence: index,
          repeatDays
        })
      );
    }

    // 本季已经更完：仍把用户填的那一集留在「已播出」，点开才能改季/改总集数
    if (occurrences.length === 0) {
      return [this.buildManualReminder(entry, linkedMovie)];
    }

    return occurrences;
  }

  /**
   * 用户手动添加的提醒
   * 不受「未来 N 天」范围限制——自己加的日期应该一定看得见
   * 设置了更新周期的条目，会在这里展开成后续几集
   */
  private async collectManualReminders(): Promise<TVEpisodeReminder[]> {
    // 先清掉早就播完的单集条目，避免它们在库里无声堆积（周期条目不动）
    const purgeBefore = addDaysToDate(todayLocalDate(), -PAST_MANUAL_KEEP_DAYS);
    const purgeResult = await databaseAPI.purgeExpiredReminders(purgeBefore);
    if (!purgeResult.success) {
      console.warn('清理过期提醒失败，不影响本次展示:', purgeResult.error);
    }

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
      const linkedMovie = entry.movie_id ? movieMap.get(entry.movie_id) : undefined;
      const repeatDays = Number(entry.repeat_days ?? 0);

      if (Number.isFinite(repeatDays) && repeatDays >= 1) {
        reminders.push(...this.expandCycleEntry(entry, linkedMovie));
        return;
      }

      const airTime = new Date(entry.air_date).getTime();
      if (Number.isNaN(airTime) || airTime < cutoff.getTime()) {
        return;
      }

      reminders.push(this.buildManualReminder(entry, linkedMovie));
    });

    return reminders;
  }

  /** 同剧聚合键：本地作品 > TMDb ID > 标题 */
  private buildShowKey(item: TVEpisodeReminder): string {
    if (item.movie_id && !item.movie_id.startsWith('manual-')) {
      return `movie:${item.movie_id}`;
    }
    if (item.tmdb_id) {
      return `tmdb:${item.tmdb_id}`;
    }
    return `title:${item.title.trim().toLowerCase()}`;
  }

  /**
   * 按剧聚合：一部剧只留一张卡
   *
   * 列表只放「下一次更新」，同一周里多出来的集（周一周二双更）挂在 extra_airings，
   * 卡片上用「本周还有 N 集」提示，不会同剧铺满好几列。
   * 已播出的同样只留最近一集，避免一条周期提醒刷出一串旧卡。
   */
  private aggregateByShow(items: TVEpisodeReminder[]): TVEpisodeReminder[] {
    const buckets = new Map<string, TVEpisodeReminder[]>();

    items.forEach(item => {
      const key = this.buildShowKey(item);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key)!.push(item);
    });

    const result: TVEpisodeReminder[] = [];

    buckets.forEach(list => {
      list.sort((left, right) => {
        const leftTime = new Date(left.air_date).getTime();
        const rightTime = new Date(right.air_date).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        // 同一天：手动条目优先，用户手填的日期/集数更可信
        if (left.source !== right.source) return left.source === 'manual' ? -1 : 1;
        return (left.episode_number ?? 0) - (right.episode_number ?? 0);
      });

      const upcoming = list.filter(item => !item.is_past);
      const past = list.filter(item => item.is_past);

      if (upcoming.length > 0) {
        const next = upcoming[0];
        const nextWeek = startOfWeekDate(next.air_date);
        // 只收「同一周」的其它集（周一周二双更、同天连播多集）；
        // 下周同一时间的下一集不算，否则周更剧会天天挂着「本周还有 1 集」
        const extras = upcoming
          .slice(1)
          .filter(item => startOfWeekDate(item.air_date) === nextWeek);

        result.push({
          ...next,
          extra_airings: extras.length
            ? extras.map(item => ({
                air_date: item.air_date,
                episode_number: item.episode_number ?? null
              }))
            : undefined
        });
      }

      if (past.length > 0) {
        result.push({ ...past[past.length - 1] });
      }
    });

    return result;
  }

  /**
   * 获取未来几天即将更新的剧集（自动 + 手动，已忽略的不再出现）
   */
  public async getUpcomingReminders(options: ReminderOptions = {}): Promise<ApiResponse<TVEpisodeReminder[]>> {
    try {
      const days = Math.min(365, Math.max(1, options.days ?? this.defaultRange));

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

      // 周期提醒里单独跳过的那几场，也要按忽略标记过滤掉
      const manualFiltered = manualReminders.filter(
        item => !dismissedKeys.has(this.buildKey(item.movie_id, item.air_date, item.episode_number))
      );

      // 同剧只留一项：列表里一部剧一张卡，多出来的集数挂在 extra_airings
      const aggregated = this.aggregateByShow([...autoFiltered, ...manualFiltered]);

      // 范围对自动、手动一视同仁：超出窗口的条目不再出现在列表里；
      // 已播出的留在「已播出」区，不受窗口影响
      const merged = aggregated.filter(item => {
        if (item.is_past) return true;
        const offset = daysFromToday(item.air_date);
        return !Number.isNaN(offset) && offset <= days;
      });

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

    // 3. 本地没有，再去 TMDb 搜一次；只接受标题确实对得上的结果，宁可不给海报也不张冠李戴
    try {
      const search = await tmdbAPI.searchMulti(form.title);
      const first = (search.success ? search.data?.results ?? [] : []).find(result =>
        this.isTitleMatch(result.title ?? result.name, form.title)
      );
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

  /** 标题比对：忽略标点与空白，允许「主标题 + 副标题」这种前缀展开 */
  private isTitleMatch(candidate: string | null | undefined, keyword: string): boolean {
    const normalize = (value: string) => value.toLowerCase().replace(/[\s·・:：\-—（）()《》「」]/g, '');
    const target = normalize(keyword.trim());
    const source = normalize((candidate ?? '').trim());
    if (!target || !source) return false;
    if (source === target) return true;

    // 「复仇者联盟5」→「复仇者联盟5康之王朝」可以认，但「复仇者联盟」不算
    return source.startsWith(target) && source.length - target.length <= 8;
  }

  /** 在本地影视库里按标题匹配（先精确、再前缀展开） */
  private async findLocalMovieByTitle(title: string): Promise<Movie | null> {
    const keyword = title.trim();
    if (!keyword) return null;

    const result = await databaseAPI.getMovies();
    if (!result.success || !result.data) return null;

    return result.data.find(movie => this.isTitleMatch(movie.title, keyword)) ?? null;
  }

  /** 新增手动提醒（自动补海报） */
  public async createReminder(form: ReminderEntryForm): Promise<ApiResponse<ReminderEntry>> {
    if (!form.title?.trim()) {
      return { success: false, error: '请先填写作品名称' };
    }
    if (!form.air_date) {
      return { success: false, error: '请选择日期' };
    }

    const resolved = await this.resolveReminderPoster(this.normalizeForm({ ...form, title: form.title.trim() }));
    return databaseAPI.addManualReminder(resolved);
  }

  /** 修改手动提醒 */
  public async updateReminder(id: string, form: ReminderEntryForm): Promise<ApiResponse<ReminderEntry>> {
    if (!form.title?.trim()) {
      return { success: false, error: '请先填写作品名称' };
    }
    if (!form.air_date) {
      return { success: false, error: '请选择日期' };
    }

    const resolved = await this.resolveReminderPoster(this.normalizeForm({ ...form, title: form.title.trim() }));
    return databaseAPI.updateManualReminder(id, resolved);
  }

  /** 电影没有季集和更新周期，落库前统一抹掉，避免脏数据推算出奇怪的集数 */
  private normalizeForm(form: ReminderEntryForm): ReminderEntryForm {
    if (form.media_type === 'movie') {
      return {
        ...form,
        season_number: null,
        episode_number: null,
        repeat_days: null,
        season_total_episodes: null,
        air_weekdays: null
      };
    }

    // 周更日只在「每周 / 每两周」下有意义，其余周期一律丢掉，免得和 N 天打架
    const weekdays =
      form.repeat_days && form.repeat_days % 7 === 0 && form.air_weekdays
        ? Array.from(new Set(form.air_weekdays.filter(day => day >= 1 && day <= 7))).sort((a, b) => a - b)
        : [];

    return {
      ...form,
      season_total_episodes:
        form.season_total_episodes && form.season_total_episodes > 0
          ? Math.floor(form.season_total_episodes)
          : null,
      air_weekdays: weekdays.length > 0 ? weekdays : null
    };
  }

  /** 删除手动提醒 */
  public async deleteReminder(id: string): Promise<ApiResponse<string>> {
    return databaseAPI.deleteManualReminder(id);
  }

  /** 统计落在当前时间窗口之外的手动提醒，列表底部用它提示「还有 N 条」 */
  public async countManualRemindersBeyondRange(days: number): Promise<number> {
    const result = await databaseAPI.getManualReminders();
    if (!result.success || !result.data) {
      return 0;
    }

    return result.data.filter(entry => {
      const offset = daysFromToday(entry.air_date);
      return !Number.isNaN(offset) && offset > days;
    }).length;
  }

  /** 批量清空已播出的手动提醒（不动周期条目的原点） */
  public async clearPastReminders(items: TVEpisodeReminder[]): Promise<ApiResponse<number>> {
    const ids = Array.from(
      new Set(items.filter(item => item.source === 'manual' && item.entry_id).map(item => item.entry_id as string))
    );

    if (ids.length === 0) {
      return { success: true, data: 0 };
    }

    return databaseAPI.deleteManualReminders(ids);
  }

  /**
   * 删除/忽略一条提醒
   * - 周期提醒里自动补出来的场次：只记一个忽略标记，跳过这一集
   * - 手动条目本身：真删除（整条周期提醒一起没了）
   * - 自动条目：记忽略标记
   */
  public async dismissReminder(item: TVEpisodeReminder): Promise<ApiResponse<string>> {
    if (item.source === 'manual' && item.entry_id && !item.occurrence_sequence) {
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
