import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * 更新提醒：刷新与范围契约测试
 *
 * 两个此前的问题：
 * 1. 「刷新提醒」形同虚设。getTVDetails 走 apiCache（24 小时），刷新按钮只是重新读缓存，
 *    拿回的还是同一份数据，用户看到的就是「点了没反应」。
 * 2. 范围写死 7 天，没有入口调整。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const api = read('src/utils/api.ts')
const reminder = read('src/services/reminder.ts')
const homeData = read('src/views/Home/composables/useHomeData.ts')
const homeView = read('src/views/Home.vue')

describe('更新提醒：真刷新', () => {
  it('_request 支持跳过缓存', () => {
    assert.ok(
      /options: \{ bypassCache\?: boolean \} = \{\}/.test(api),
      '_request 需要 bypassCache 参数'
    )
    assert.ok(
      /if \(!options\.bypassCache\) \{\s*const cachedResult = apiCache\.get/.test(api),
      'bypassCache 为 true 时不能再读缓存'
    )
  })

  it('强刷使用独立的队列键，避免复用飞行中的旧请求', () => {
    assert.ok(
      /#refresh-/.test(api),
      '强刷应换一个队列键，否则会命中 tmdbQueue 的进行中请求'
    )
  })

  it('getTVDetails 透传 forceRefresh', () => {
    assert.ok(
      /getTVDetails\(tvId: number, options: \{ forceRefresh\?: boolean \} = \{\}\)/.test(api),
      'getTVDetails 需要 forceRefresh 参数'
    )
    assert.ok(
      /bypassCache: options\.forceRefresh/.test(api),
      'getTVDetails 应把 forceRefresh 映射到 bypassCache'
    )
  })

  it('提醒服务把 forceRefresh 传到每部剧的详情请求', () => {
    assert.ok(
      /forceRefresh\?: boolean/.test(reminder),
      'ReminderOptions 缺少 forceRefresh'
    )
    assert.ok(
      /getTVDetails\(show\.tmdb_id!, \{ forceRefresh: options\.forceRefresh \}\)/.test(reminder),
      '提醒服务没有把 forceRefresh 传下去'
    )
  })

  it('「刷新提醒」走强制联网，并给出结果反馈', () => {
    assert.ok(
      /loadUpdateReminders\(latestWatching, \{ forceRefresh: true \}\)/.test(homeData),
      'refreshReminders 必须强制联网'
    )
    assert.ok(
      /toast\.success\([\s\S]{0,200}已刷新/.test(homeView),
      '刷新完成后应有明确反馈，避免误判为没反应'
    )
  })
})

describe('更新提醒：范围可调', () => {
  it('提供 7 / 14 / 30 天三档', () => {
    for (const day of [7, 14, 30]) {
      assert.ok(
        new RegExp(`value: ${day},`).test(homeData),
        `缺少 ${day} 天选项`
      )
    }
  })

  it('选择结果会记住', () => {
    assert.ok(
      /filmtrack-reminder-range/.test(homeData) && /localStorage\.setItem/.test(homeData),
      '范围需要持久化到 localStorage'
    )
  })

  it('改范围只重新筛选，不重复联网', () => {
    const setter = homeData.slice(homeData.indexOf('const setReminderRange'))
    assert.ok(
      /loadUpdateReminders\(watchingMovies\.value\)/.test(setter),
      '改范围应复用缓存重新分组'
    )
    assert.ok(
      !/forceRefresh: true/.test(setter.split('};')[0]),
      '改范围不应强制联网'
    )
  })

  it('天数会传进提醒服务并被夹在合理区间', () => {
    assert.ok(/days: reminderRange\.value/.test(homeData), '加载提醒时应带上当前范围')
    assert.ok(
      /Math\.min\(60, Math\.max\(1, options\.days/.test(reminder),
      '异常天数应被夹到 1–60 天'
    )
  })

  it('页面上有范围切换入口', () => {
    assert.ok(/reminder-range/.test(homeView), '缺少范围分段控件')
    assert.ok(
      /未来 \{\{ reminderRange \}\} 天内/.test(homeView),
      '副标题应显示当前范围'
    )
  })
})
