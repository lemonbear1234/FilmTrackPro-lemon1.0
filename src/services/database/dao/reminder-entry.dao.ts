/**
 * 更新提醒条目数据访问对象
 *
 * 只存放两类数据：
 * - manual    用户手动添加的提醒（TMDb 拉不到、或 TMDb 日期不准时自己填）
 * - dismissed 对某条自动提醒的忽略标记
 *
 * TMDb 自动提醒本身不落库，每次实时推导。
 */
import type { ApiResponse, ReminderEntry, ReminderEntryForm, DatabaseRow } from '../../../types';
import { DatabaseConnection } from '../connection';
import { DatabaseUtils } from '../utils';

type ReminderEntryRow = DatabaseRow & ReminderEntry;

const SELECT_COLUMNS = `id, source, movie_id, title, tmdb_id, poster_path,
  air_date, season_number, episode_number, episode_name, notes, created_at, updated_at`;

export class ReminderEntryDAO {
  /** 获取全部手动添加的提醒（按播出日期升序） */
  static async getManualEntries(): Promise<ApiResponse<ReminderEntry[]>> {
    try {
      const db = await DatabaseConnection.getInstance();
      const rows = (await db.select(
        `SELECT ${SELECT_COLUMNS} FROM reminder_entries
         WHERE source = 'manual'
         ORDER BY air_date ASC, created_at ASC`
      )) as ReminderEntryRow[];

      return { success: true, data: rows ?? [] };
    } catch (error) {
      return { success: false, error: `获取手动提醒失败: ${error}` };
    }
  }

  /** 获取所有「已忽略」标记 */
  static async getDismissedEntries(): Promise<ApiResponse<ReminderEntry[]>> {
    try {
      const db = await DatabaseConnection.getInstance();
      const rows = (await db.select(
        `SELECT ${SELECT_COLUMNS} FROM reminder_entries
         WHERE source = 'dismissed'`
      )) as ReminderEntryRow[];

      return { success: true, data: rows ?? [] };
    } catch (error) {
      return { success: false, error: `获取忽略记录失败: ${error}` };
    }
  }

  /** 新增一条手动提醒 */
  static async addEntry(form: ReminderEntryForm): Promise<ApiResponse<ReminderEntry>> {
    try {
      const db = await DatabaseConnection.getInstance();
      const id = await DatabaseUtils.generateUuid();
      const timestamp = await DatabaseUtils.getCurrentTimestamp();

      await db.execute(
        `INSERT INTO reminder_entries (
          id, source, movie_id, title, tmdb_id, poster_path,
          air_date, season_number, episode_number, episode_name, notes, created_at, updated_at
        ) VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          form.movie_id || null,
          form.title,
          form.tmdb_id || null,
          form.poster_path || null,
          form.air_date,
          form.season_number ?? null,
          form.episode_number ?? null,
          form.episode_name || null,
          form.notes || null,
          timestamp,
          timestamp
        ]
      );

      const rows = (await db.select(
        `SELECT ${SELECT_COLUMNS} FROM reminder_entries WHERE id = $1`,
        [id]
      )) as ReminderEntryRow[];

      if (!rows || rows.length === 0) {
        return { success: false, error: '提醒已写入但读回失败，请刷新后查看' };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      return { success: false, error: `添加提醒失败: ${error}` };
    }
  }

  /** 修改一条手动提醒 */
  static async updateEntry(
    id: string,
    form: ReminderEntryForm
  ): Promise<ApiResponse<ReminderEntry>> {
    try {
      const db = await DatabaseConnection.getInstance();
      const timestamp = await DatabaseUtils.getCurrentTimestamp();

      await db.execute(
        `UPDATE reminder_entries SET
          movie_id = $1, title = $2, tmdb_id = $3, poster_path = $4,
          air_date = $5, season_number = $6, episode_number = $7,
          episode_name = $8, notes = $9, updated_at = $10
        WHERE id = $11 AND source = 'manual'`,
        [
          form.movie_id || null,
          form.title,
          form.tmdb_id || null,
          form.poster_path || null,
          form.air_date,
          form.season_number ?? null,
          form.episode_number ?? null,
          form.episode_name || null,
          form.notes || null,
          timestamp,
          id
        ]
      );

      const rows = (await db.select(
        `SELECT ${SELECT_COLUMNS} FROM reminder_entries WHERE id = $1`,
        [id]
      )) as ReminderEntryRow[];

      if (!rows || rows.length === 0) {
        return { success: false, error: '这条提醒已经不存在了，可能已被删除' };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      return { success: false, error: `修改提醒失败: ${error}` };
    }
  }

  /** 删除一条手动提醒 */
  static async deleteEntry(id: string): Promise<ApiResponse<string>> {
    try {
      const db = await DatabaseConnection.getInstance();
      await db.execute(`DELETE FROM reminder_entries WHERE id = $1 AND source = 'manual'`, [id]);
      return { success: true, data: id };
    } catch (error) {
      return { success: false, error: `删除提醒失败: ${error}` };
    }
  }

  /**
   * 忽略一条自动提醒
   * 按 作品 + 播出日 + 集数 唯一，重复忽略不会报错
   */
  static async dismissAutoReminder(payload: {
    movieId: string;
    title: string;
    airDate: string;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    tmdbId?: number | null;
  }): Promise<ApiResponse<string>> {
    try {
      const db = await DatabaseConnection.getInstance();
      const id = await DatabaseUtils.generateUuid();
      const timestamp = await DatabaseUtils.getCurrentTimestamp();

      await db.execute(
        `INSERT INTO reminder_entries (
          id, source, movie_id, title, tmdb_id, poster_path,
          air_date, season_number, episode_number, episode_name, notes, created_at, updated_at
        ) VALUES ($1, 'dismissed', $2, $3, $4, NULL, $5, $6, $7, NULL, NULL, $8, $9)
        ON CONFLICT DO NOTHING`,
        [
          id,
          payload.movieId,
          payload.title,
          payload.tmdbId || null,
          payload.airDate,
          payload.seasonNumber ?? null,
          payload.episodeNumber ?? null,
          timestamp,
          timestamp
        ]
      );

      return { success: true, data: payload.movieId };
    } catch (error) {
      return { success: false, error: `忽略提醒失败: ${error}` };
    }
  }
}
