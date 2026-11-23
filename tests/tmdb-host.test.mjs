import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * TMDb 域名容灾
 *
 * api.themoviedb.org 在部分网络下会被阻断，表现是请求挂住十几秒才失败，
 * 搜索和刷新都像卡死。api.tmdb.org 是官方备用域名，接口完全一致。
 * 这里守住三件事：默认走备用域名、主域名留作退路、超时真正生效。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const config = read('config/app.config.ts')
const api = read('src/utils/api.ts')

describe('TMDb 域名容灾', () => {
  it('默认使用官方备用域名，主域名留作退路', () => {
    assert.ok(
      /baseUrl: 'https:\/\/api\.tmdb\.org\/3'/.test(config),
      '默认域名应换成 api.tmdb.org，主域名在部分网络下会挂住'
    )
    assert.ok(
      /fallbackBaseUrls: \['https:\/\/api\.themoviedb\.org\/3'\]/.test(config),
      '应保留 api.themoviedb.org 作为备用，换域名时至少有一个能通'
    )
  })

  it('请求超时真正接到 axios 上，否则挂住的请求永远不会触发切换', () => {
    assert.ok(
      /timeout: APP_CONFIG\.tmdb\.request\.timeout/.test(api),
      'axios 实例缺少 timeout，请求会一直挂着'
    )
    assert.ok(
      !/timeout: 0/.test(config),
      '不能把超时设成 0（等于不限时）'
    )
  })

  it('切域名只针对连不上，4xx/5xx 不重试', () => {
    assert.ok(/async function tmdbGet/.test(api), '缺少统一请求入口 tmdbGet')
    assert.ok(
      /hasHttpResponse/.test(api),
      '需要有「有响应即域名可达」的判断，否则 404/429 会被当成网络故障乱换域名'
    )
    assert.ok(
      /if \(hasHttpResponse\(error\)\) \{\s*throw error;/.test(api),
      '有 HTTP 响应时应直接抛出，交给 429 退避逻辑处理'
    )
  })

  it('所有请求都走统一入口，不再直连 tmdbClient.get', () => {
    const directCalls = api.match(/tmdbClient\.get[<(]/g) ?? []
    assert.equal(
      directCalls.length,
      1,
      `除 tmdbGet 内部外不应再直连 tmdbClient.get（当前 ${directCalls.length} 处），否则那部分不享受域名容灾`
    )
    assert.ok(
      (api.match(/requestWithRateLimitRetry\(\(\) => tmdbGet/g) ?? []).length >= 2,
      '搜索/详情与剧照两条链路都应改走 tmdbGet'
    )
  })

  it('记住跑通的域名，避免每次启动都先撞一遍被阻断的地址', () => {
    assert.ok(/filmtrack:tmdb-base-url/.test(api), '缺少域名记忆的存储键')
    assert.ok(/rememberBaseUrl/.test(api), '成功一次后应记住可用域名')
    assert.ok(
      /readStoredBaseUrl\(\) \?\? TMDB_BASE_URLS\[0\]/.test(api),
      '启动时应优先读上次成功的域名，读不到再回落到默认'
    )
  })
})
