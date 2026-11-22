import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 更新提醒：从 TMDb 直接选片、顺手进影视库、已播出折叠、每天一列布局
 *
 * 起因：想给一部还没入库的电影（比如复仇者联盟5）记上映日，
 * 以前必须先去影视库建一条「想看」，再回来加提醒，两步才能完成一件事。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const schema = read('src/services/database/schema.ts')
const dao = read('src/services/database/dao/reminder-entry.dao.ts')
const service = read('src/services/reminder.ts')
const modal = read('src/components/ReminderEditModal.vue')
const homeView = read('src/views/Home.vue')
const cardView = read('src/components/ReminderCard.vue')
const libraryView = read('src/views/Library/index.vue')
const types = read('src/types/index.ts')
const pkg = read('package.json')

describe('更新提醒：TMDb 直选与自动进库', () => {
  describe('数据结构', () => {
    it('提醒条目记录电影/剧集类型，老库能补列', () => {
      assert.ok(
        /CREATE TABLE IF NOT EXISTS reminder_entries[\s\S]*?media_type TEXT/.test(schema),
        'reminder_entries 缺少 media_type'
      )
      assert.ok(
        /ALTER TABLE reminder_entries ADD COLUMN media_type TEXT/.test(schema),
        '缺少 media_type 补列迁移'
      )
      assert.ok(/LATEST_SCHEMA_VERSION = 6/.test(schema), '迁移版本应推进到 6')
      assert.ok(
        /version: 6,[\s\S]{0,200}reminder-media-type/.test(schema),
        '缺少 v6 迁移'
      )
    })

    it('类型定义贯通表单、条目、列表项与编辑预填', () => {
      assert.ok(/media_type\?: MovieType \| null/.test(types), '实体缺 media_type')
      assert.ok(/mediaType\?: MovieType \| null/.test(types), '编辑预填缺 mediaType')
    })

    it('增改都会写类型字段', () => {
      assert.ok(/media_type,\s*\n\s*notes/.test(dao), '查询未取 media_type')
      assert.ok(/media_type = \$10/.test(dao), '更新未写 media_type')
      assert.ok(/form\.media_type \?\? null/.test(dao), '写入时应允许为空')
    })
  })

  describe('服务层', () => {
    it('电影不落季集与周期，避免推算出不存在的集数', () => {
      const start = service.indexOf('private normalizeForm')
      const block = service.slice(start, service.indexOf('public async deleteReminder', start))
      assert.ok(/form\.media_type !== 'movie'/.test(block), '应按类型分流')
      assert.ok(/season_number: null/.test(block), '电影应清空季')
      assert.ok(/episode_number: null/.test(block), '电影应清空集')
      assert.ok(/repeat_days: null/.test(block), '电影应清空更新周期')
    })

    it('海报只接受标题确实对得上的 TMDb 结果', () => {
      assert.ok(/isTitleMatch/.test(service), '缺少标题比对，容易张冠李戴')
      assert.ok(
        /source\.startsWith\(target\) && source\.length - target\.length <= 8/.test(service),
        '应允许「主标题 + 副标题」的前缀展开，但不认系列里的另一部'
      )
      assert.ok(
        !/lower\.includes\(movie\.title\?\.toLowerCase\(\)/.test(service),
        '不应再用反方向包含匹配，避免「复仇者联盟5」命中「复仇者联盟」'
      )
    })

    it('列表项带上类型，卡片才能区分上映与播出', () => {
      assert.ok(/media_type: entry\.media_type \?\? linkedMovie\?\.type \?\? null/.test(service), '未把类型带到列表项')
    })
  })

  describe('弹窗', () => {
    it('作品输入会同时搜本地库和 TMDb', () => {
      assert.ok(/tmdbAPI\.searchMulti/.test(modal), '未接入 TMDb 在线搜索')
      assert.ok(/本地影视库/.test(modal), '缺少本地库分组')
      assert.ok(/TMDb/.test(modal), '缺少 TMDb 分组')
      assert.ok(/runTmdbSearch/.test(modal), '缺少防抖搜索')
    })

    it('库里没有时可以直接用输入的名称保存', () => {
      assert.ok(/直接使用「/.test(modal), '缺少兜底入口')
      assert.ok(/useFreeText/.test(modal), '兜底入口未清掉关联')
    })

    it('选中 TMDb 结果会带出类型、海报与上映日期', () => {
      assert.ok(/pickTmdbItem/.test(modal), '缺少 TMDb 结果选择')
      assert.ok(/posterPath\.value = item\.poster_path/.test(modal), '未带出海报')
      assert.ok(/airDate\.value = tmdbDate/.test(modal), '未带出上映/首播日期')
      assert.ok(/!dateTouched\.value && tmdbDate/.test(modal), '不应覆盖用户手填的日期')
    })

    it('电影隐藏季集与更新周期，日期改叫上映日期', () => {
      assert.ok(/v-if="!isMovie"/.test(modal), '电影应隐藏季集与周期')
      assert.ok(/'上映日期' : '播出日期'|isMovie \? '上映日期'/.test(modal), '日期标签未按类型切换')
    })

    it('保存时可按勾选顺手建「想看」记录', () => {
      assert.ok(/同时加入影视库/.test(modal), '缺少加入影视库的开关')
      assert.ok(/movieStore\.addMovie/.test(modal), '未调用新增作品')
      assert.ok(/status: 'planned'/.test(modal), '新记录应为「想看」')
      assert.ok(/emit\('library-added'\)/.test(modal), '建库后应通知父组件刷新')
      assert.ok(/props\.movies\.find\(movie => movie\.tmdb_id === tmdbId\.value\)/.test(modal), '已存在时不应重复建库')
    })

    it('加入影视库失败不阻断提醒本身', () => {
      assert.ok(/warning: string/.test(modal), '应把失败降级为提示')
      assert.ok(/warning \? `\$\{baseMessage\}（\$\{warning\}）` : baseMessage/.test(modal), '提示语应带上失败原因')
    })
  })
})

describe('更新提醒：已播出收进折叠区', () => {
  it('保留期缩到一周', () => {
    assert.ok(/PAST_MANUAL_KEEP_DAYS = 7/.test(service), '已播出保留期应为 7 天')
    assert.ok(/PAST_KEEP_DAYS = 7/.test(homeView), '界面提示的天数应与服务一致')
  })

  it('读取时清理过期的单集条目，周期原点不动', () => {
    assert.ok(/purgeExpiredReminders/.test(service), '读取时未清理过期条目')
    assert.ok(/repeat_days IS NULL OR repeat_days < 1/.test(dao), '清理不应误删周期条目')
  })

  it('已播出单独成区，默认折叠', () => {
    assert.ok(/pastReminderItems/.test(homeView), '缺少已播出集合')
    assert.ok(/showPastReminders = ref\(false\)/.test(homeView), '默认应折叠')
    assert.ok(/已播出 · \{\{ pastReminderItems\.length \}\} 条/.test(homeView), '折叠标题应带数量')
  })

  it('可以一键清空已播出', () => {
    assert.ok(/askClearPast/.test(homeView), '缺少清空入口')
    assert.ok(/clearPastReminders/.test(service), '缺少批量清空')
    assert.ok(/source = 'manual' AND id IN/.test(dao), '批量删除只应作用于手动条目')
  })

  it('卡片上写明已播出多久', () => {
    assert.ok(/已播出 · \$\{days\} 天前/.test(cardView), '缺少「N 天前」')
    assert.ok(/已播出 · 昨天/.test(cardView), '昨天应单独表述')
  })
})

describe('更新提醒：每天一列的布局', () => {
  it('四天凑成一组，同一天多部在列内往下叠', () => {
    assert.ok(/upcomingChunks/.test(homeView), '缺少按天分组')
    assert.ok(/chunks\.push\(groups\.slice\(index, index \+ 4\)\)/.test(homeView), '应按四天一组切分')
    assert.ok(/xl:grid-cols-4/.test(homeView), '宽屏应为四列')
    assert.ok(/reminder-day-column/.test(homeView), '缺少每天一列的容器')
  })

  it('窄屏降级为两列/一列，卡片不至于挤成一条缝', () => {
    assert.ok(/grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/.test(homeView), '缺少响应式列数')
  })

  it('卡片抽成独立组件，列表与已播出区共用', () => {
    assert.ok(/import ReminderCard from '\.\.\/components\/ReminderCard\.vue'/.test(homeView), '未引入卡片组件')
    assert.ok(/<ReminderCard/.test(homeView), '未使用卡片组件')
  })
})

describe('影视库：顺手建库后的刷新', () => {
  it('弹窗建库后影视库会刷新列表', () => {
    assert.ok(/@library-added="handleLibraryAdded"/.test(libraryView), '影视库未监听建库事件')
    assert.ok(/fetchMovies\(\{ force: true \}\)/.test(libraryView), '应强制刷新列表')
  })

  it('测试脚本包含本文件', () => {
    assert.ok(/tests\/reminder-library\.test\.mjs/.test(pkg), 'package.json 未登记本测试')
  })
})
