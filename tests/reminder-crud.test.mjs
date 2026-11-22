import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf-8')

const schema = read('src/services/database/schema.ts')
const dao = read('src/services/database/dao/reminder-entry.dao.ts')
const service = read('src/services/reminder.ts')
const homeView = read('src/views/Home.vue')
const homeData = read('src/views/Home/composables/useHomeData.ts')
const libraryHeader = read('src/views/Library/components/LibraryHeader.vue')
const libraryView = read('src/views/Library/index.vue')
const modal = read('src/components/ReminderEditModal.vue')

describe('更新提醒：手动增删改查', () => {
  describe('数据结构', () => {
    it('有存放手动提醒与忽略标记的表', () => {
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries/.test(schema),
        '缺少 reminder_entries 表'
      )
      assert.ok(
        /source TEXT NOT NULL DEFAULT 'manual' CHECK \(source IN \('manual', 'dismissed'\)\)/.test(schema),
        'source 只允许 manual / dismissed'
      )
      assert.ok(/air_date TEXT NOT NULL/.test(schema), '播出日期必填')
      assert.ok(/notes TEXT/.test(schema), '缺少备注字段')
    })

    it('迁移版本已推进，老库能补建表', () => {
      assert.ok(/LATEST_SCHEMA_VERSION = 5/.test(schema), '迁移版本应推进到 5')
      assert.ok(
        /name: 'manual-reminder-entries'/.test(schema),
        '缺少 v4 迁移'
      )
      assert.ok(
        /version: 4,[\s\S]{0,200}REMINDER_ENTRIES_TABLE_SQL/.test(schema),
        'v4 迁移应创建提醒表'
      )
    })

    it('同一条自动提醒只能忽略一次', () => {
      assert.ok(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_entries_dismissed_unique/.test(schema),
        '缺少忽略去重的唯一索引'
      )
      assert.ok(
        /WHERE source = 'dismissed'/.test(schema),
        '唯一索引应只作用于 dismissed，不影响手动条目'
      )
      assert.ok(
        /COALESCE\(episode_number, -1\)/.test(schema),
        '集数为空时应占位，否则 NULL 会让唯一索引失效'
      )
    })
  })

  describe('数据访问层', () => {
    it('增删改查齐全', () => {
      for (const method of ['addEntry', 'updateEntry', 'deleteEntry', 'getManualEntries', 'getDismissedEntries', 'dismissAutoReminder']) {
        assert.ok(new RegExp(`static async ${method}\\(`).test(dao), `缺少 ${method}`)
      }
    })

    it('修改与删除只作用于手动条目', () => {
      assert.ok(
        /WHERE id = \$12 AND source = 'manual'/.test(dao),
        '更新不应改到忽略标记'
      )
      assert.ok(
        /WHERE id = \$1 AND source = 'manual'/.test(dao),
        '删除不应删掉忽略标记'
      )
    })

    it('忽略重复写入不报错', () => {
      assert.ok(/ON CONFLICT DO NOTHING/.test(dao), '重复忽略应被静默忽略')
    })

    it('写入后回读校验，不返回假成功', () => {
      assert.ok(
        /提醒已写入但读回失败/.test(dao),
        '新增后应回读确认'
      )
    })
  })

  describe('服务层合并', () => {
    it('自动提醒 + 手动提醒一起返回', () => {
      assert.ok(/collectAutoReminders/.test(service), '缺少自动提醒收集')
      assert.ok(/collectManualReminders/.test(service), '缺少手动提醒收集')
      assert.ok(
        /const merged = \[\.\.\.autoFiltered, \.\.\.manualFiltered\]/.test(service),
        '两类提醒应合并'
      )
    })

    it('已忽略的自动提醒不再出现，手动条目优先', () => {
      assert.ok(/dismissedKeys\.has\(key\)/.test(service), '应按忽略标记过滤')
      assert.ok(/!manualKeys\.has\(key\)/.test(service), '手动条目应覆盖同一条自动提醒')
    })

    it('手动提醒不受「未来 N 天」限制', () => {
      const manualBlock = service.slice(
        service.indexOf('private async collectManualReminders'),
        service.indexOf('public async getUpcomingReminders')
      )
      assert.ok(
        !/isWithinRange/.test(manualBlock),
        '手动添加的日期不应被天数范围过滤掉'
      )
      assert.ok(
        /PAST_MANUAL_KEEP_DAYS/.test(service),
        '已播出的手动提醒应保留一段时间供清理'
      )
    })

    it('海报按 本地库 → TMDb → 留空 的顺序回退', () => {
      const posterBlock = service.slice(
        service.indexOf('resolveReminderPoster'),
        service.indexOf('private async findLocalMovieByTitle')
      )
      assert.ok(/getMovieById/.test(posterBlock), '应先用关联作品的海报')
      assert.ok(/findLocalMovieByTitle/.test(posterBlock), '其次在本地库里按标题找')
      assert.ok(/tmdbAPI\.searchMulti/.test(posterBlock), '本地没有再去 TMDb 搜')
      assert.ok(/return form;/.test(posterBlock), '都找不到时留空')
    })

    it('删除时区分手动与自动', () => {
      assert.ok(
        /item\.source === 'manual' && item\.entry_id/.test(service),
        '手动条目应真删除'
      )
      assert.ok(/dismissAutoReminder\(/.test(service), '自动条目应写忽略标记')
    })
  })

  describe('界面', () => {
    it('首页可添加、编辑、删除提醒', () => {
      assert.ok(/openAddReminder/.test(homeView), '缺少添加入口')
      assert.ok(/openEditReminder/.test(homeView), '缺少编辑入口')
      assert.ok(/askRemoveReminder/.test(homeView) && /confirmRemoveReminder/.test(homeView), '缺少删除确认')
      assert.ok(/ReminderEditModal/.test(homeView), '未挂载编辑弹窗')
    })

    it('手动条目有来源标记，已播出会灰显', () => {
      assert.ok(/update-reminder-badge/.test(homeView), '缺少「手动」标记')
      assert.ok(/update-reminder-card-past/.test(homeView), '缺少已播出样式')
      assert.ok(/item\.is_past \? '已播出'/.test(homeView), '已播出应显式标注')
    })

    it('没有关联作品的手动提醒不会跳到空白详情页', () => {
      assert.ok(
        /movie_id\?\.startsWith\('manual-'\)/.test(homeView),
        '应拦截手动提醒的详情跳转'
      )
    })

    it('影视库也能添加提醒', () => {
      assert.ok(/@add-reminder="openAddReminder"/.test(libraryView), '影视库未接入弹窗')
      assert.ok(/\$emit\('addReminder'\)/.test(libraryHeader), '影视库头部缺少按钮')
      assert.ok(/提供手动添加/.test(libraryHeader) || /添加提醒/.test(libraryHeader), '按钮文案缺失')
    })

    it('弹窗里的数字字段不会对数字调用 trim', () => {
      assert.ok(
        /const toNumberOrNull = \(value: string \| number \| null \| undefined\)/.test(modal),
        '数字解析应兼容 number'
      )
      assert.ok(
        /TextField[\s\S]{0,120}type="number"/.test(modal),
        '数字字段应使用 TextField（不会把值转成 number）'
      )
      assert.ok(
        /Number\(value\)/.test(modal),
        '数值应通过 Number() 转换，而不是依赖字符串方法'
      )
    })
  })
})
