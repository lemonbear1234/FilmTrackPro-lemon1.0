import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 电影上映从「按天排列的剧集列」里拆出来，单独成区
 *
 * 动画/剧集是这周的事，电影定档往往提前几个月，
 * 混在日列里会让整行只放一两张卡，还会被 7 天窗口直接切掉。
 * 顺带收口：最近观看不应该混进「想看」——那是收藏，不是观看记录。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const service = read('src/services/reminder.ts')
const homeView = read('src/views/Home.vue')
const homeData = read('src/views/Home/composables/useHomeData.ts')
const movieCard = read('src/components/MovieReleaseCard.vue')
const movieDao = read('src/services/database/dao/movie.dao.ts')

describe('电影上映单独成区', () => {
  it('电影不受剧集窗口限制，但仍受保留期约束', () => {
    assert.ok(
      /if \(item\.media_type === 'movie'\) return offset >= -PAST_MANUAL_KEEP_DAYS/.test(service),
      '电影不应被 7 天窗口切掉'
    )
    assert.ok(
      /return offset <= days/.test(service),
      '剧集仍按窗口过滤'
    )
  })

  it('「范围外」计数不再把电影算进去', () => {
    assert.ok(/private isMovieEntry\(entry: ReminderEntry\)/.test(service), '缺少电影判定')
    assert.ok(
      /if \(this\.isMovieEntry\(entry\)\) return false/.test(service),
      '电影永远可见，不该计入「另有 N 条在范围外」'
    )
  })

  it('首页把电影从日列里拆出来，剧集区只剩剧集', () => {
    assert.ok(/const movieReminderItems = computed/.test(homeView), '缺少电影集合')
    assert.ok(
      /group\.items\.filter\(item => item\.media_type !== 'movie'\)/.test(homeView),
      '剧集分组应剔除电影'
    )
    assert.ok(/<MovieReleaseCard/.test(homeView), '电影卡片应使用独立组件')
    assert.ok(/电影上映/.test(homeView), '缺少电影上映区块标题')
    assert.ok(
      /不受剧集窗口限制/.test(homeView),
      '要说明电影不跟着剧集窗口走'
    )
  })

  it('电影卡给出上映日、周几和倒计时', () => {
    assert.ok(/weekdayOfDate/.test(movieCard), '上映日应带上周几')
    assert.ok(/今天上映/.test(movieCard))
    assert.ok(/天后/.test(movieCard))
    assert.ok(/已上映/.test(movieCard), '上映过的要降级显示')
  })

  it('今日新集通知不把电影上映算成「新集」', () => {
    assert.ok(
      /filter\(\(item\) => item\.media_type !== 'movie'\)/.test(homeData),
      '通知文案说的是新集，电影上映别混进来'
    )
  })
})

describe('最近观看不混入想看', () => {
  it('历史查询排除 planned', () => {
    assert.ok(
      /WHERE status <> 'planned'/.test(movieDao),
      '想看只是收藏，没有观看记录就不该出现在最近观看/观看历史里'
    )
  })
})
