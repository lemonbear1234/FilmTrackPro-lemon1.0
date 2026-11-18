<template>
  <Modal
    :is-open="isOpen"
    type="info"
    title="修改详细信息"
    message=""
    :show-cancel="true"
    :confirm-disabled="saving"
    :confirm-text="saving ? '保存中…' : '保存'"
    cancel-text="取消"
    @close="$emit('close')"
    @cancel="$emit('close')"
    @confirm="handleSave"
  >
    <template #content>
      <div class="space-y-4">
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
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import Modal from '../../../components/ui/Modal.vue';
import type { Movie } from '../../../types';
import type { MovieDetailsExtraPatch } from '../types';

const props = defineProps<{
  isOpen: boolean;
  movie: Movie;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', patch: MovieDetailsExtraPatch): void;
}>();

const form = reactive({
  createdAt: '',
  totalSeasons: '',
  totalEpisodes: '',
  runtime: '',
  tmdbId: ''
});

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
    if (open) resetForm();
  },
  { immediate: true }
);

watch(
  () => props.movie.id,
  () => {
    if (props.isOpen) resetForm();
  }
);

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

const handleSave = () => {
  if (props.saving) return;

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
};
</script>
