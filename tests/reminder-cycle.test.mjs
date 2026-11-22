import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { addDaysToDate, daysFromToday } from '../src/utils/date.ts'

/**
 * 更新提醒：更新周期（按周期自动补齐后续集数）
 *
 * 此前的问题是「每集都要手动加一条」，一条 12 集的剧要建 12 次提醒。
 * 现在手动提醒带一个可改的更新周期（默认 7 天），后续集数按周期自动推导。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const schema = read('src/services/database/schema.ts')
const dao = read('src/services/database/dao/reminder-entry.dao.ts')
const service = read('src/services/reminder.ts')
const modal = read('src/components/ReminderEditModal.vue')
const homeView = read('src/views/Home.vue')
const types = read('src/types/index.ts')
const pkg = read('package.json')

describe('更新提醒：更新周期', () => {
  describe('日期工具', () => {
    it('按日历日加减，跨月跨年不受时区影响', () => {
      assert.equal(addDaysToDate('2026-01-28', 7), '2026-02-04')
      assert.equal(addDaysToDate('2026-12-28', 7), '2027-01-04')
      assert.equal(addDaysToDate('2026-03-01', -1), '2026-02-28')
      assert.equal(addDaysToDate('2026-05-10', 0), '2026-05-10')
    })

    it('格式不对时原样返回，不抛异常', () => {
      assert.equal(addDaysToDate('', 7), '')
      assert.equal(addDaysToDate('不是日期', 7), '不是日期')
    })

    it('能算出距离今天几天', () => {
      const today = new Date()
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`
      assert.equal(daysFromToday(iso), 0)
      assert.equal(daysFromToday(addDaysToDate(iso, 3)), 3)
      assert.equal(daysFromToday(addDaysToDate(iso, -2)), -2)
    })
  })

  describe('数据结构', () => {
    it('提醒表有周期字段，老库能补列', () => {
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries[\s\S]*?repeat_days INTEGER/.test(schema),
        'reminder_entries 缺少 repeat_days'
      )
      assert.ok(
        /ALTER TABLE reminder_entries ADD COLUMN repeat_days INTEGER/.test(schema),
        '缺少补列迁移'
      )
      assert.ok(/LATEST_SCHEMA_VERSION = 5/.test(schema), '迁移版本应推进到 5')
      assert.ok(
        /version: 5,[\s\S]{0,200}reminder-repeat-days/.test(schema),
        '缺少 v5 迁移'
      )
    })

    it('增改都会写周期字段', () => {
      assert.ok(/episode_name, repeat_days, notes/.test(dao), '查询未取 repeat_days')
      assert.ok(/repeat_days = \$9/.test(dao), '更新未写 repeat_days')
      assert.ok(/form\.repeat_days \?\? null/.test(dao), '写入时应把 0/空值存成 NULL')
    })

    it('类型定义贯通表单、条目、列表项与编辑预填', () => {
      assert.ok(/repeat_days\?: number \| null/.test(types), 'ReminderEntry/Form 缺 repeat_days')
      assert.ok(/repeatDays\?: number \| null/.test(types), '编辑预填缺 repeatDays')
      assert.ok(/occurrence_sequence\?: number/.test(types), '列表项缺场次序号')
      assert.ok(/cycle_base\?:/.test(types), '列表项缺周期原点，编辑时无法还原首播日')
    })
  })

  describe('服务层展开', () => {
    it('有周期的条目展开成多集，集数逐场递增', () => {
      assert.ok(/private expandCycleEntry/.test(service), '缺少周期展开')
      assert.ok(
        /episodeNumber: baseEpisode === null \? null : baseEpisode \+ sequence/.test(service),
        '后续集数应按场次递增'
      )
      assert.ok(
        /if \(!this\.isWithinRange\(nextEpisode\.air_date, days\)\)/.test(service),
        '自动提醒仍按天数范围筛选'
      )
    })

    it('首播日已过去时直接跳到最近的场次，不会空转', () => {
      assert.ok(
        /Math\.ceil\(-baseOffset \/ repeatDays\)/.test(service),
        '应从今天对应的场次开始推导'
      )
    })

    it('补齐有上限，不会铺满列表', () => {
      assert.ok(/CYCLE_MAX_OCCURRENCES = 6/.test(service), '最多补 6 集')
      assert.ok(/CYCLE_LOOKAHEAD_DAYS = 120/.test(service), '最多看 120 天')
      assert.ok(/CYCLE_MAX_STEPS = 200/.test(service), '循环要有硬上限')
    })

    it('周期条目只看未来的场次', () => {
      const block = service.slice(
        service.indexOf('private expandCycleEntry'),
        service.indexOf('private async collectManualReminders')
      )
      assert.ok(/daysFromToday/.test(block), '应基于今天判断场次是否已过')
      assert.ok(/offset > CYCLE_LOOKAHEAD_DAYS/.test(block), '超出前瞻范围应停止')
    })

    it('跳过单集不会删掉整条周期提醒', () => {
      assert.ok(
        /item\.source === 'manual' && item\.entry_id && !item\.occurrence_sequence/.test(service),
        '只有用户填的那一集才真删除，自动补出来的场次应只记忽略'
      )
    })

    it('被跳过的那一场不会再出现', () => {
      assert.ok(/manualFiltered/.test(service), '手动条目也应被忽略标记过滤')
      assert.ok(
        /!dismissedKeys\.has\(this\.buildKey\(item\.movie_id, item\.air_date, item\.episode_number\)\)/.test(
          service
        ),
        '周期场次按 作品+日期+集数 过滤'
      )
    })
  })

  describe('界面', () => {
    it('弹窗里有可改的更新周期，默认 7 天', () => {
      assert.ok(/NEW_ENTRY_REPEAT_DAYS = 7/.test(modal), '默认周期应为 7 天')
      assert.ok(/更新周期/.test(modal), '缺少「更新周期」标签')
      assert.ok(/value: 7, label: '每周'/.test(modal), '缺少每周选项')
      assert.ok(/value: CUSTOM_CYCLE, label: '自定义'/.test(modal), '缺少自定义天数')
      assert.ok(
        /cyclePreset = ref<number>\(NEW_ENTRY_REPEAT_DAYS\)/.test(modal),
        '初始值应取默认周期'
      )
    })

    it('自定义天数会校验范围', () => {
      assert.ok(/value >= 1 && value <= 365/.test(modal), '自定义周期应限制在 1-365 天')
      assert.ok(/自定义周期请填 1-365 之间的天数/.test(modal), '缺少校验提示')
    })

    it('表单会把周期一起保存，单集存成空', () => {
      assert.ok(
        /repeat_days: resolvedRepeatDays\.value >= 1 \? resolvedRepeatDays\.value : null/.test(modal),
        '周期应随表单落库'
      )
    })

    it('首页卡片显示周期，自动补的集数可单独跳过', () => {
      assert.ok(/getCycleLabel/.test(homeView), '缺少周期标记')
      assert.ok(/update-reminder-badge-cycle/.test(homeView), '缺少周期样式')
      assert.ok(/跳过这一集/.test(homeView), '缺少跳过单集的操作')
      assert.ok(/isCycleOccurrence/.test(homeView), '缺少周期场次判断')
    })

    it('从自动补出的卡片编辑时还原到首播那一集', () => {
      assert.ok(/cycle_base/.test(homeView), '编辑时应读周期原点')
      assert.ok(
        /airDate: base\?\.air_date \?\? item\.air_date/.test(homeView),
        '编辑应回到首播日，而不是把周期起点挪到未来'
      )
      assert.ok(/repeatDays: item\.repeat_days \?\? 0/.test(homeView), '编辑时应带回周期')
    })

    it('测试脚本包含本文件', () => {
      assert.ok(/tests\/reminder-cycle\.test\.mjs/.test(pkg), 'package.json 未登记本测试')
    })
  })
})
