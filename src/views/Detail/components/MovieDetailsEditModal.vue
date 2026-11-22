<template>
  <Modal
    :is-open="isOpen"
    type="info"
    title="修改详细信息"
    message=""
    :show-cancel="false"
    :hide-footer="true"
    @close="$emit('close')"
    @cancel="$emit('close')"
  >
    <template #content>
      <div class="space-y-4" @keydown.enter.prevent="handleSave">
        <!-- 添加日期 -->
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium text-gray-700">添加日期</span>
          <input
            v-model="form.createdAt"
            type="date"
            class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <span class="mt-1 block text-xs text-gray-400">用于列表按添加时间排序</span>
        </label>

        <!-- 季数 / 集数 -->
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-gray-700">总季数</span>
            <input
              v-model="form.totalSeasons"
              type="number"
              min="1"
              placeholder="留空表示未知"
              class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-gray-700">总集数</span>
            <input
              v-model="form.totalEpisodes"
              type="number"
              min="1"
              placeholder="留空表示未知"
              class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <!-- 时长 / TMDb ID -->
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-gray-700">时长（分钟）</span>
            <input
              v-model="form.runtime"
              type="number"
              min="0"
              placeholder="如 120"
              class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-gray-700">TMDb ID</span>
            <input
              v-model="form.tmdbId"
              type="number"
              min="0"
              placeholder="如 30981"
              class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <p class="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
          改 TMDb ID 只影响跳转链接，不会重新抓取海报和简介；需要重新抓取请用「更新影视信息」。
        </p>

        <p
          v-if="errorMessage"
          class="rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 break-words"
        >
          {{ errorMessage }}
        </p>

        <!-- 底部操作区：直接绑定保存，不再经 Modal 的 confirm 事件中转 -->
        <div class="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            class="inline-flex justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            :disabled="isBusy"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="inline-flex justify-center rounded-xl border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isBusy"
            @click="handleSave"
          >
            {{ isBusy ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Modal from '../../../components/ui/Modal.vue';
import type { Movie } from '../../../types';
import type { MovieDetailsExtraPatch } from '../types';

const props = defineProps<{
  isOpen: boolean;
  movie: Movie;
  saving: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', patch: MovieDetailsExtraPatch): void;
  (e: 'error', message: string): void;
}>();

const form = reactive({
  createdAt: '',
  totalSeasons: '',
  totalEpisodes: '',
  runtime: '',
  tmdbId: ''
});

// 点击瞬间立即置位，保证「点了有没有反应」一眼可见
const localBusy = ref(false);
const isBusy = computed(() => localBusy.value || props.saving);

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const text = String(value);
  // 兼容 "2026-11-18T15:00:00Z" / "2026-11-18 15:00:00" / "2026-11-18"
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
};

const toNumberInput = (value?: number | null) => (value === null || value === undefined ? '' : String(value));

const resetForm = () => {
  form.createdAt = toDateInput(props.movie.created_at);
  form.totalSeasons = toNumberInput(props.movie.total_seasons);
  form.totalEpisodes = toNumberInput(props.movie.total_episodes);
  form.runtime = toNumberInput(props.movie.runtime);
  form.tmdbId = toNumberInput(props.movie.tmdb_id);
};

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      localBusy.value = false;
      resetForm();
    }
  },
  { immediate: true }
);

watch(
  () => props.movie.id,
  () => {
    if (props.isOpen) resetForm();
  }
);

// 父组件保存结束后解除本地占用
watch(
  () => props.saving,
  (value) => {
    if (!value) localBusy.value = false;
  }
);

/**
 * 把输入框的值转成数字。
 * 注意：`<input type="number">` 配 v-model 时 Vue 会自动把值转成 number（castToNumber），
 * 所以这里必须同时兼容 number 和 string，不能直接调 .trim()，否则会抛 TypeError。
 */
const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

const handleSave = () => {
  if (isBusy.value) return;

  localBusy.value = true;
  // 兜底：父组件若没有回应，3 秒后恢复按钮，避免永久卡在「保存中…」
  window.setTimeout(() => {
    localBusy.value = false;
  }, 3000);

  try {
    // 日期统一存成 ISO 字符串（本地中午，避免时区把日期推前一天）
    const createdAt = form.createdAt
      ? new Date(`${form.createdAt}T12:00:00`).toISOString()
      : null;

    emit('save', {
      created_at: createdAt,
      total_seasons: parseNumber(form.totalSeasons),
      total_episodes: parseNumber(form.totalEpisodes),
      runtime: parseNumber(form.runtime),
      tmdb_id: parseNumber(form.tmdbId)
    });
  } catch (error) {
    // 不再只写控制台：出错必须让用户看见，否则表现就是「点了没反应」
    localBusy.value = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error('构造保存数据失败:', error);
    emit('error', `保存失败：${message}`);
  }
};
</script>
