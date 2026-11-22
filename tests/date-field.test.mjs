import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * 日期选择器（DateField）契约测试
 *
 * 守护两类曾经真实出现的问题：
 *  1. 面板 Teleport 到 body 后，点击面板内按钮会触发触发器 blur，面板被判「点外面」直接关闭，
 *     表现为「点左右箭头想换月份，结果面板消失了 / 月份没变」。
 *  2. 只能逐月翻页，跨年选月份要连点十几次箭头 —— 现在提供 日 / 月 / 年 三级视图。
 */

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

const expectIncludes = (source, needle, message) => {
  assert.ok(source.includes(needle), `${message}\n缺少片段: ${needle}`)
}

const dateField = read('src/components/ui/DateField.vue')

describe('日期选择器 DateField 月份切换', () => {
  it('焦点落在面板内按钮时不应关闭面板', () => {
    expectIncludes(
      dateField,
      'panelRef.value?.contains(activeElement)',
      'blur 回调需要同时排除面板自身'
    )
  })

  it('标题可点击切换 日 / 月 / 年 三级视图', () => {
    expectIncludes(dateField, "ref<'days' | 'months' | 'years'>('days')", '应维护三级视图状态')
    expectIncludes(dateField, '@click="toggleTitleView"', '标题应可点击切换视图')
    expectIncludes(dateField, 'v-else-if="viewMode === \'months\'"', '应有月份网格视图')
    expectIncludes(dateField, 'v-else class="date-month-grid date-year-grid"', '应有年份网格视图')
  })

  it('选择月份/年份后回到日期网格', () => {
    expectIncludes(dateField, 'const pickMonth = (month: number) => {', '应有月份选择处理')
    expectIncludes(dateField, 'const pickYear = (year: number) => {', '应有年份选择处理')
    assert.ok(
      /const pickMonth[\s\S]*?viewMode\.value = 'days'/.test(dateField),
      '选完月份应回到日期视图'
    )
    assert.ok(
      /const pickYear[\s\S]*?viewMode\.value = 'months'/.test(dateField),
      '选完年份应进入月份视图'
    )
  })

  it('箭头行为随视图变化（月/年/十年）', () => {
    expectIncludes(dateField, 'const stepBackward = () => {', '应有统一的向后翻页处理')
    expectIncludes(dateField, 'const stepForward = () => {', '应有统一的向前翻页处理')
    expectIncludes(dateField, 'YEARS_PER_PAGE', '年份视图应按页展示')
  })

  it('打开面板时重置回日期视图', () => {
    assert.ok(
      /if \(!isOpen\.value\) \{[\s\S]*?viewMode\.value = 'days'/.test(dateField),
      '每次打开应回到日期视图，避免停留在上次的年份列表'
    )
  })
})

describe('日期选择器 DateField 本地时区', () => {
  it('使用本地日期而非 UTC 日期', () => {
    expectIncludes(dateField, 'todayLocalDate()', '应使用本地日期函数')
    assert.ok(
      !dateField.includes("toISOString().split('T')[0]"),
      '不应再用 toISOString() 取日期（东八区凌晨会算成昨天）'
    )
  })

  it('日期工具与校验统一走 utils/date', () => {
    const dateUtil = read('src/utils/date.ts')
    expectIncludes(dateUtil, 'export function todayLocalDate()', '应导出 todayLocalDate')
    expectIncludes(dateUtil, 'export function formatLocalDate(', '应导出 formatLocalDate')
  })
})
