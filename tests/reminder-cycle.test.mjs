import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { addDaysToDate, daysFromToday, startOfWeekDate, weekdayOfDate } from '../src/utils/date.ts'

/**
 * 更新提醒：更新周期（按周几推进 + 受本季总集数约束）
 *
 * 老实现按 repeat_days 机械 +1，2019 年首播的周更剧会被算成「第 377 集」。
 * 现在：总集数优先取 TMDb 的整季集表，TMDb 没有才手填；推到季末就停。
 * 周一周二双更的剧用「每周更新日」多选表达。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const schema = read('src/services/database/schema.ts')
const dao = read('src/services/database/dao/reminder-entry.dao.ts')
const service = read('src/services/reminder.ts')
const modal = read('src/components/ReminderEditModal.vue')
const homeView = read('src/views/Home.vue')
const cardView = read('src/components/ReminderCard.vue')
const api = read('src/utils/api.ts')
const types = read('src/types/index.ts')
const pkg = read('package.json')

describe('更新提醒：更新周期', () => {
  describe('日期工具', () => {
    it('按日历日加减，跨月跨年不受时区影响', () => {
      assert.equal(addDaysToDate('2026-01-28', 7), '2026-02-04')
      assert.equal(addDaysToDate('2026-12-28', 7), '2027-01-04')
      assert.equal(addDaysToDate('2026-03-01', -1), '2026-02-28')
    })

    it('周几按 1=周一 … 7=周日算，周日不会算成 0', () => {
      assert.equal(weekdayOfDate('2026-11-23'), 1)
      assert.equal(weekdayOfDate('2026-11-29'), 7)
      assert.equal(startOfWeekDate('2026-11-25'), '2026-11-23')
      assert.equal(startOfWeekDate('2026-11-29'), '2026-11-23')
    })

    it('能算出距离今天几天', () => {
      const today = new Date()
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`
      assert.equal(daysFromToday(iso), 0)
      assert.equal(daysFromToday(addDaysToDate(iso, 3)), 3)
    })
  })

  describe('数据结构', () => {
    it('提醒表有周期、总集数与周更日，老库能补列', () => {
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries[\s\S]*?repeat_days INTEGER/.test(schema),
        'reminder_entries 缺少 repeat_days'
      )
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries[\s\S]*?season_total_episodes INTEGER/.test(schema),
        'reminder_entries 缺少 season_total_episodes'
      )
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries[\s\S]*?air_weekdays TEXT/.test(schema),
        'reminder_entries 缺少 air_weekdays'
      )
      assert.ok(
        /ALTER TABLE reminder_entries ADD COLUMN season_total_episodes INTEGER/.test(schema),
        '缺少总集数补列迁移'
      )
      assert.ok(
        /ALTER TABLE reminder_entries ADD COLUMN air_weekdays TEXT/.test(schema),
        '缺少周更日补列迁移'
      )
      assert.ok(/LATEST_SCHEMA_VERSION = 7/.test(schema), '迁移版本应推进到 7')
      assert.ok(
        /version: 7,[\s\S]{0,200}reminder-season-meta/.test(schema),
        '缺少 v7 迁移'
      )
    })

    it('增改都会写总集数与周更日', () => {
      assert.ok(/season_total_episodes, air_weekdays/.test(dao), '查询未取新字段')
      assert.ok(/season_total_episodes = \$11/.test(dao), '更新未写总集数')
      assert.ok(/air_weekdays = \$12/.test(dao), '更新未写周更日')
      assert.ok(/form\.air_weekdays\.join\(','\)/.test(dao), '周更日应以逗号分隔存字符串')
      assert.ok(/parseWeekdays/.test(dao), '读出时要还原成 number[]')
    })

    it('类型定义贯通表单、条目、列表项与编辑预填', () => {
      assert.ok(/season_total_episodes\?: number \| null/.test(types), '缺总集数')
      assert.ok(/air_weekdays\?: number\[\] \| null/.test(types), '缺周更日')
      assert.ok(/totalEpisodes\?: number \| null/.test(types), '编辑预填缺总集数')
      assert.ok(/extra_airings\?: Array/.test(types), '列表项缺同周其它集')
    })

    it('集标题只属于用户填的那一集', () => {
      assert.ok(
        /episode_name: sequence > 0 \? null : entry\.episode_name \?\? null/.test(service),
        '自动补出的场次不应沿用第一集的标题'
      )
    })
  })

  describe('服务层展开', () => {
    it('按季拉整季集表，不再只读 next_episode', () => {
      assert.ok(/getTVSeasonDetails/.test(api), '缺少按季接口')
      assert.ok(/\/tv\/\$\{tvId\}\/season\/\$\{seasonNumber\}/.test(api), '接口路径应精确到季')
      assert.ok(
        /getTVSeasonDetails\(entry\.show\.tmdb_id!, entry\.season/.test(service),
        '自动提醒应拉当前季的集表'
      )
      assert.ok(/pickSeasonNumber/.test(service), '应能从详情里判断该看哪一季')
      assert.ok(/totalEpisodes/.test(service), '总集数应来自整季集表')
    })

    it('没有总集数就不推算，避免第 377 集', () => {
      const block = service.slice(
        service.indexOf('private expandCycleEntry'),
        service.indexOf('private async collectManualReminders')
      )
      assert.ok(/if \(!totalEpisodes \|\| !baseEpisode\)/.test(block), '缺总集数时应停止推算')
      assert.ok(/return \[this\.buildManualReminder\(entry, linkedMovie\)\]/.test(block), '缺总集数只保留用户填的那一集')
    })

    it('集数推到本季总集数就停，不越过季末', () => {
      const block = service.slice(
        service.indexOf('private expandCycleEntry'),
        service.indexOf('private async collectManualReminders')
      )
      assert.ok(/if \(episode > totalEpisodes\) break/.test(block), '超过总集数应立即停止')
      assert.ok(/episodeNumber: episode/.test(block), '集数应按日期顺序递增')
    })

    it('周一周二双更按周几推进，首播日当天不会漏', () => {
      assert.ok(/buildCycleDates/.test(service), '缺少按周几生成日期的逻辑')
      assert.ok(
        /new Set\(\[\.\.\.weekdays, weekdayOfDate\(baseDate\)\]\)/.test(service),
        '首播日当天必须算进周更日，否则第一集会错位'
      )
      assert.ok(/startOfWeekDate/.test(service), '应以周一为一周起点')
      assert.ok(/weekdays\.length > 0 && repeatDays % 7 === 0/.test(service), '只有整周周期才按周几推')
    })

    it('补齐有上限，不会铺满列表', () => {
      assert.ok(/CYCLE_MAX_OCCURRENCES = 12/.test(service), '最多补 12 集')
      assert.ok(/CYCLE_LOOKAHEAD_DAYS = 120/.test(service), '最多看 120 天')
      assert.ok(/CYCLE_MAX_STEPS = 1200/.test(service), '循环要有硬上限')
    })

    it('跳过单集不会删掉整条周期提醒', () => {
      assert.ok(
        /item\.source === 'manual' && item\.entry_id && !item\.occurrence_sequence/.test(service),
        '只有用户填的那一集才真删除，自动补出来的场次应只记忽略'
      )
    })
  })

  describe('按剧聚合', () => {
    it('同一部剧只留一项，多出来的集挂在 extra_airings', () => {
      assert.ok(/aggregateByShow/.test(service), '缺少按剧聚合')
      assert.ok(/buildShowKey/.test(service), '缺少同剧判定键')
      assert.ok(/extra_airings/.test(service), '同周其它集应挂在 extra_airings')
      assert.ok(/aggregateByShow\(\[\.\.\.autoFiltered, \.\.\.manualFiltered\]\)/.test(service), '合并后应聚合')
    })

    it('已播出只留最近一集，不会一集一张旧卡', () => {
      assert.ok(/const past = list\.filter/.test(service), '应区分已播出')
      assert.ok(/past\[past\.length - 1\]/.test(service), '已播出只保留最近一集')
    })
  })

  describe('界面', () => {
    it('弹窗里有可改的更新周期，默认 7 天', () => {
      assert.ok(/NEW_ENTRY_REPEAT_DAYS = 7/.test(modal), '默认周期应为 7 天')
      assert.ok(/更新周期/.test(modal), '缺少「更新周期」标签')
      assert.ok(/value: 7, label: '每周'/.test(modal), '缺少每周选项')
      assert.ok(/value: CUSTOM_CYCLE, label: '自定义'/.test(modal), '缺少自定义天数')
    })

    it('可以手填本季共几集，并做范围校验', () => {
      assert.ok(/本季共几集/.test(modal), '缺少总集数输入')
      assert.ok(/totalEpisodesInput/.test(modal), '总集数未接入表单')
      assert.ok(/本季总集数不能小于起始集数/.test(modal), '缺少总集数与起始集的校验')
      assert.ok(/本季总集数请填 1-999 之间的数字/.test(modal), '缺少总集数范围校验')
    })

    it('每周 / 每两周可以多选周几', () => {
      assert.ok(/WEEKDAY_OPTIONS/.test(modal), '缺少周几选项')
      assert.ok(/showWeekdayPicker/.test(modal), '周几只在每周 / 每两周下显示')
      assert.ok(/toggleWeekday/.test(modal), '缺少周几多选逻辑')
      assert.ok(/reminder-weekday-button/.test(modal), '缺少周几按钮样式')
    })

    it('表单会把周期、总集数、周更日一起保存', () => {
      assert.ok(
        /repeat_days: [^\n]*resolvedRepeatDays\.value >= 1 \? resolvedRepeatDays\.value : null/.test(modal),
        '周期应随表单落库'
      )
      assert.ok(/season_total_episodes: isMovie\.value \? null : toNumberOrNull\(totalEpisodesInput\.value\)/.test(modal), '总集数应落库')
      assert.ok(/air_weekdays:/.test(modal), '周更日应落库')
    })

    it('首页卡片显示周期与本周其它集', () => {
      assert.ok(/cycleLabel/.test(cardView), '缺少周期标记')
      assert.ok(/update-reminder-badge-cycle/.test(cardView), '缺少周期样式')
      assert.ok(/本周还有/.test(cardView), '缺少「本周还有 N 集」提示')
      assert.ok(/共 \$\{props\.item\.total_episodes\} 集/.test(cardView), '缺少总集数展示')
      assert.ok(/isCycleOccurrence/.test(homeView), '缺少周期场次判断')
    })

    it('从自动补出的卡片编辑时还原到首播那一集和总集数', () => {
      assert.ok(/cycle_base/.test(homeView), '编辑时应读周期原点')
      assert.ok(
        /airDate: base\?\.air_date \?\? item\.air_date/.test(homeView),
        '编辑应回到首播日，而不是把周期起点挪到未来'
      )
      assert.ok(/totalEpisodes: item\.total_episodes/.test(homeView), '编辑时应带回总集数')
    })

    it('测试脚本包含本文件', () => {
      assert.ok(/tests\/reminder-cycle\.test\.mjs/.test(pkg), 'package.json 未登记本测试')
    })
  })
})
