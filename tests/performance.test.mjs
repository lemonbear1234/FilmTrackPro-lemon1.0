import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const abs = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/**
 * 在线播放功能已整体移除。
 * 原先本文件覆盖播放链路（片单 SWR / 匹配缓存 / 并行水合）的性能回归；
 * 功能下线后，这些优化对象均不存在，改为断言相关代码已彻底清理。
 */
describe('在线播放性能相关代码已整体移除', () => {
  it('播放链路模块文件均已删除', () => {
    const removed = [
      'src/services/video-source.ts',
      'src/views/Detail/composables/useDetailPlayer.ts',
      'src/views/Detail/playbackFallback.ts',
      'src-tauri/src/stream_proxy.rs'
    ]
    for (const p of removed) {
      assert.ok(!existsSync(abs(p)), `应已删除: ${p}`)
    }
  })

  it('源码中不再引用片单 / 播放代理符号', () => {
    const files = [
      'src/App.vue',
      'src/views/Detail/index.vue',
      'src/components/ui/SettingsModal.vue',
      'src-tauri/src/main.rs'
    ]
    for (const p of files) {
      const src = readFileSync(abs(p), 'utf8')
      for (const needle of ['video-source', 'getSourceProfiles', 'whenSourceProfilesRefreshed', 'get_stream_proxy_base_url', 'start_stream_proxy_server']) {
        assert.ok(!src.includes(needle), `${p} 不应再引用 ${needle}`)
      }
    }
  })
})
