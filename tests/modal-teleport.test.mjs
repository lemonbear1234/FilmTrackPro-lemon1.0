import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * 弹窗挂载位置契约测试
 *
 * 详情页侧栏、影视库内容区都套着入场动画（animate-slide-in-right / animate-fade-in-up）。
 * CSS 里只要祖先带 transform，子级的 position: fixed 就会以该祖先为包含块，
 * 弹窗会被压进几百像素宽的卡片里 —— 表现为「点编辑/删除完全没反应」。
 * 所以所有弹窗类组件都必须 Teleport 到 body。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const expectIncludes = (source, needle, message) => {
  assert.ok(source.includes(needle), `${message}\n缺少片段: ${needle}`)
}

describe('弹窗 Teleport 到 body', () => {
  it('通用 Modal 组件挂到 body', () => {
    const modal = read('src/components/ui/Modal.vue')
    expectIncludes(modal, '<Teleport to="body">', 'Modal 应 Teleport 到 body')
  })

  it('删除确认弹窗挂到 body', () => {
    const dialog = read('src/views/Library/components/DeleteConfirmDialog.vue')
    expectIncludes(dialog, '<Teleport to="body">', 'DeleteConfirmDialog 应 Teleport 到 body')
  })

  it('重刷记录弹窗挂到 body', () => {
    const replay = read('src/views/Detail/components/ReplayRecordSection.vue')
    expectIncludes(replay, '<Teleport to="body">', '重刷记录弹窗应 Teleport 到 body')
  })

  it('侧栏滑入动画的结束帧不保留 transform（否则会劫持后代 fixed 定位）', () => {
    const sidebar = read('src/views/Detail/components/DetailSidebar.vue')
    assert.ok(
      /@keyframes slide-in-right\s*\{[\s\S]*?to\s*\{[^}]*\}/.test(sidebar),
      '应有 slide-in-right 动画'
    )
    const keyframes = sidebar.match(/@keyframes slide-in-right\s*\{[\s\S]*?\n\}/)
    assert.ok(keyframes, '应能解析 slide-in-right 关键帧')
    const toBlock = keyframes[0].match(/\bto\s*\{([^}]*)\}/)
    assert.ok(toBlock, '关键帧应包含 to')
    assert.ok(
      !toBlock[1].includes('transform'),
      '滑入动画的 to 不应声明 transform，否则 forwards 会让祖先永久保留 transform'
    )
  })
})
