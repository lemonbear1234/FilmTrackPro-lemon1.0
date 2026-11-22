import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { buildMovieActionItems } from '../src/utils/watchInsights.ts'

/**
 * 「观影待办」职责边界测试
 *
 * 首页原本有两块内容重复：待办里的「新集提醒」卡片，和下方的「更新提醒」列表，
 * 用的都是同一批 TMDb 播出数据、同一部剧、同一个集数，只是样式不同。
 *
 * 现在待办只负责「接下来看什么」（继续追剧 / 恢复进度），播出日程统一交给
 * 下方「更新提醒」；同一部作品在待办里也只出现一次。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const tvMovie = (overrides = {}) => ({
  id: 'm1',
  title: '示例剧',
  type: 'tv',
  status: 'watching',
  current_season: 1,
  current_episode: 3,
  total_seasons: 1,
  total_episodes: 12,
  seasons_data: null,
  ...overrides,
})

describe('观影待办：不再重复「新集提醒」', () => {
  it('只产出继续追剧 / 恢复进度两类', () => {
    const items = buildMovieActionItems([
      tvMovie({ id: 'a' }),
      tvMovie({ id: 'b', status: 'paused' }),
    ])

    assert.ok(items.length >= 2, `应至少两项，实际 ${items.length}`)
    for (const item of items) {
      assert.notEqual(item.type, 'upcoming', '待办里不应再出现「新集提醒」卡片')
    }
  })

  it('同一部作品在待办里只出现一次', () => {
    const items = buildMovieActionItems([
      tvMovie({ id: 'dup' }),
      tvMovie({ id: 'dup' }),
      tvMovie({ id: 'other' }),
    ])

    const ids = items.map((item) => item.movieId)
    assert.equal(new Set(ids).size, ids.length, `存在重复作品：${ids.join(', ')}`)
  })

  it('待办不再接收 reminders 参数', () => {
    const source = read('src/utils/watchInsights.ts')
    assert.ok(
      /export function buildMovieActionItems\(movies: Movie\[\]\)/.test(source),
      'buildMovieActionItems 只应接收 movies，播出日程由「更新提醒」负责'
    )
    assert.ok(!/type: 'upcoming'/.test(source), '不应再生成 upcoming 类型的待办卡')
  })

  it('首页待办由「在追」列表派生，加载顺序不影响结果', () => {
    const source = read('src/views/Home/composables/useHomeData.ts')
    assert.ok(
      /const actionItems = computed<MovieActionItem\[\]>\(\(\) => buildMovieActionItems\(watchingMovies\.value\)\)/.test(source),
      '待办应为 computed 派生，避免多处赋值互相覆盖'
    )
    assert.ok(
      !/actionItems\.value\s*=/.test(source),
      '不应再对 actionItems 直接赋值'
    )
  })
})
