import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * 「修改详细信息」数字字段契约测试
 *
 * 背景：弹窗里的总季数/总集数/时长/TMDb ID 都是 <input type="number">。
 * Vue 的 vModelText 在 type="number" 时会自动把输入值转成 number（castToNumber），
 * 所以这些 v-model 绑定的值运行时是 number，而不是初始值那种 string。
 *
 * 旧实现里 parseNumber(value) 直接调用 value.trim()，用户一旦在数字框里输入内容，
 * 点保存就会抛 TypeError: value.trim is not a function；异常又被只写 console 的 catch 吞掉，
 * 表现就是「点了保存完全没反应」（日期字段是文本，所以改日期反而正常）。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const modal = read('src/views/Detail/components/MovieDetailsEditModal.vue')
const details = read('src/views/Detail/components/MovieDetails.vue')

describe('修改详细信息：数字输入兼容', () => {
  it('parseNumber 必须同时接受 number 和 string', () => {
    assert.ok(
      /typeof\s+value\s*===\s*'number'/.test(modal),
      'parseNumber 需要先判断 typeof value === "number"，否则数字输入会因 .trim 报错'
    )
    assert.ok(
      /String\(value\)\.trim\(\)/.test(modal),
      'parseNumber 应该用 String(value).trim() 而不是直接 value.trim()'
    )
    assert.ok(
      !/\bvalue\.trim\(\)/.test(modal),
      '不能直接对可能是 number 的 value 调用 .trim()'
    )
  })

  it('数字字段用 type="number" 时不能被当作字符串接口', () => {
    const numberInputs = modal.match(/type="number"/g) || []
    assert.ok(numberInputs.length >= 4, `应至少有 4 个数字输入框，实际 ${numberInputs.length}`)
  })

  it('保存时必须把 TMDb ID 一并提交', () => {
    assert.ok(/tmdb_id:\s*parseNumber\(/.test(modal), '保存 payload 缺少 tmdb_id')
    assert.ok(/created_at:\s*/.test(modal), '保存 payload 缺少 created_at')
  })

  it('构造保存数据抛错时要向上抛给界面，而不是只写 console', () => {
    assert.ok(
      /emit\('error'/.test(modal),
      'catch 分支必须 emit error，否则用户只会看到「没反应」'
    )
    assert.ok(
      /@error="handleEditError"/.test(details),
      '详细信息卡片需要监听 error 事件并显示提示'
    )
  })
})
