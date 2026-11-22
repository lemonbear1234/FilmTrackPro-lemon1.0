<template>
  <Modal
    :is-open="isOpen"
    :title="isEditing ? '编辑更新提醒' : '添加更新提醒'"
    message=""
    hide-footer
    panel-class="max-w-lg"
    @close="handleClose"
  >
    <template #content>
      <div class="space-y-4">
        <p class="text-sm text-gray-500 leading-relaxed">
          TMDb 上没有、或播出日期不准的剧集，可以在这里自己填。海报会先在本地影视库里找，
          找不到再去 TMDb 取；都没有就留空。
        </p>

        <!-- 作品选择 -->
        <div>
          <label class="reminder-label">作品</label>
          <TextField
            v-model="titleInput"
            placeholder="输入作品名，或从本地影视库中选"
            :leading-icon="SearchIcon"
            @update:model-value="handleTitleInput"
            @blur="scheduleHideSuggestions"
          />

          <div v-if="showSuggestions" class="reminder-suggestions">
            <button
              v-for="movie in suggestions"
              :key="movie.id"
              type="button"
              class="reminder-suggestion"
              @mousedown.prevent="pickMovie(movie)"
            >
              <CachedImage
                :src="getPosterURL(movie.poster_path)"
                :alt="movie.title"
                class-name="reminder-suggestion-poster"
              />
              <span class="flex-1 text-left">
                <span class="block text-sm text-gray-900">{{ movie.title }}</span>
                <span class="block text-xs text-gray-400">
                  {{ movie.type === 'tv' ? '剧集' : '电影' }}{{ movie.year ? ` · ${movie.year}` : '' }}
                </span>
              </span>
            </button>
            <p v-if="suggestions.length === 0" class="px-3 py-2 text-xs text-gray-400">
              本地影视库里没有匹配的作品，会按当前输入直接保存
            </p>
          </div>

          <div v-if="linkedMovie" class="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span class="reminder-chip">已关联本地作品</span>
            <span>{{ linkedMovie.title }}</span>
            <button type="button" class="text-blue-600 hover:text-blue-700" @click="clearLinkedMovie">
              取消关联
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="reminder-label">播出日期</label>
            <DateField v-model="airDate" placeholder="选择播出日期" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="reminder-label">季</label>
              <TextField v-model="seasonInput" type="number" input-mode="numeric" placeholder="如 1" />
            </div>
            <div>
              <label class="reminder-label">集</label>
              <TextField v-model="episodeInput" type="number" input-mode="numeric" placeholder="如 8" />
            </div>
          </div>
        </div>

        <div>
          <label class="reminder-label">集标题（可选）</label>
          <TextField v-model="episodeNameInput" placeholder="如：第 8 集 · 归途" />
        </div>

        <div>
          <label class="reminder-label">备注（可选）</label>
          <TextAreaField v-model="notesInput" :rows="2" placeholder="例如：TMDb 日期未更新，按官方微博为准" />
        </div>

        <p v-if="errorMessage" class="reminder-error">{{ errorMessage }}</p>

        <div class="flex items-center justify-between pt-2">
          <button
            v-if="isEditing"
            type="button"
            class="reminder-delete-button"
            :disabled="busy"
            @click="handleDelete"
          >
            删除这条提醒
          </button>
          <span v-else />

          <div class="flex items-center gap-2">
            <button type="button" class="reminder-cancel-button" :disabled="busy" @click="handleClose">
              取消
            </button>
            <button type="button" class="reminder-save-button" :disabled="busy" @click="handleSave">
              {{ busy ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Search as SearchIcon } from 'lucide-vue-next';
import Modal from './ui/Modal.vue';
import TextField from './ui/TextField.vue';
import TextAreaField from './ui/TextAreaField.vue';
import DateField from './ui/DateField.vue';
import CachedImage from './ui/CachedImage.vue';
import type { Movie, ReminderEditPrefill, ReminderEntryForm } from '../types';
import { tvReminderService } from '../services/reminder';
import { tmdbAPI } from '../utils/api';
import { todayLocalDate } from '../utils/date';

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    prefill?: ReminderEditPrefill | null;
    /** 本地影视库列表，用于搜索建议 */
    movies?: Movie[];
  }>(),
  {
    prefill: null,
    movies: () => []
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', message: string): void;
  (e: 'deleted'): void;
}>();

const titleInput = ref('');
const airDate = ref('');
const seasonInput = ref('');
const episodeInput = ref('');
const episodeNameInput = ref('');
const notesInput = ref('');
const movieId = ref<string | null>(null);
const tmdbId = ref<number | null>(null);
const posterPath = ref<string | null>(null);
const showSuggestions = ref(false);
const busy = ref(false);
const errorMessage = ref('');

const isEditing = computed(() => Boolean(props.prefill?.entryId));

const linkedMovie = computed(() =>
  movieId.value ? props.movies.find(movie => movie.id === movieId.value) ?? null : null
);

const suggestions = computed(() => {
  const keyword = titleInput.value.trim().toLowerCase();
  if (!keyword) return [];
  return props.movies
    .filter(movie => movie.title?.toLowerCase().includes(keyword))
    .slice(0, 6);
});

const getPosterURL = (path?: string | null) => (path ? tmdbAPI.getImageURL(path) : '');

/** 数字字段统一在这里转，兼容字符串与数字，避免 type=number 时再踩 .trim() 的坑 */
const toNumberOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const resetForm = () => {
  const prefill = props.prefill;
  titleInput.value = prefill?.title ?? '';
  airDate.value = prefill?.airDate || todayLocalDate();
  seasonInput.value = prefill?.season ? String(prefill.season) : '';
  episodeInput.value = prefill?.episode ? String(prefill.episode) : '';
  episodeNameInput.value = prefill?.episodeName ?? '';
  notesInput.value = prefill?.notes ?? '';
  movieId.value = prefill?.movieId ?? null;
  tmdbId.value = prefill?.tmdbId ?? null;
  posterPath.value = prefill?.posterPath ?? null;
  errorMessage.value = '';
  showSuggestions.value = false;
};

watch(
  () => [props.isOpen, props.prefill] as const,
  ([open]) => {
    if (open) {
      resetForm();
    }
  },
  { immediate: true }
);

const handleTitleInput = (value: string) => {
  titleInput.value = value;
  showSuggestions.value = value.trim().length > 0;
  // 手动改动标题后，原来的关联就不再可信
  if (linkedMovie.value && linkedMovie.value.title !== value) {
    movieId.value = null;
    tmdbId.value = null;
    posterPath.value = null;
  }
};

let hideTimer: number | undefined;
const scheduleHideSuggestions = () => {
  hideTimer = window.setTimeout(() => {
    showSuggestions.value = false;
  }, 120);
};

const pickMovie = (movie: Movie) => {
  window.clearTimeout(hideTimer);
  titleInput.value = movie.title;
  movieId.value = movie.id;
  tmdbId.value = movie.tmdb_id ?? null;
  posterPath.value = movie.poster_path ?? null;
  showSuggestions.value = false;
};

const clearLinkedMovie = () => {
  movieId.value = null;
  tmdbId.value = null;
  posterPath.value = null;
};

const buildForm = (): ReminderEntryForm => ({
  movie_id: movieId.value,
  title: titleInput.value.trim(),
  tmdb_id: tmdbId.value,
  poster_path: posterPath.value,
  air_date: airDate.value,
  season_number: toNumberOrNull(seasonInput.value),
  episode_number: toNumberOrNull(episodeInput.value),
  episode_name: episodeNameInput.value.trim() || null,
  notes: notesInput.value.trim() || null
});

const handleSave = async () => {
  if (busy.value) return;

  if (!titleInput.value.trim()) {
    errorMessage.value = '请先填写作品名称';
    return;
  }
  if (!airDate.value) {
    errorMessage.value = '请选择播出日期';
    return;
  }

  busy.value = true;
  errorMessage.value = '';

  try {
    const form = buildForm();
    const result = isEditing.value && props.prefill?.entryId
      ? await tvReminderService.updateReminder(props.prefill.entryId, form)
      : await tvReminderService.createReminder(form);

    if (!result.success) {
      errorMessage.value = result.error || '保存失败，请重试';
      return;
    }

    emit('saved', isEditing.value ? '提醒已更新' : '提醒已添加');
  } catch (error) {
    console.error('保存提醒失败:', error);
    errorMessage.value = error instanceof Error ? error.message : '保存失败，请重试';
  } finally {
    busy.value = false;
  }
};

const handleDelete = async () => {
  if (busy.value || !props.prefill?.entryId) return;

  busy.value = true;
  errorMessage.value = '';

  try {
    const result = await tvReminderService.deleteReminder(props.prefill.entryId);
    if (!result.success) {
      errorMessage.value = result.error || '删除失败，请重试';
      return;
    }
    emit('deleted');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除失败，请重试';
  } finally {
    busy.value = false;
  }
};

const handleClose = () => {
  if (busy.value) return;
  emit('close');
};
</script>

<style scoped>
.reminder-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: #64748b;
}

.reminder-suggestions {
  margin-top: 0.4rem;
  max-height: 15rem;
  overflow-y: auto;
  border-radius: 0.75rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
  padding: 0.25rem;
}

.reminder-suggestion {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.65rem;
  border-radius: 0.6rem;
  padding: 0.4rem 0.5rem;
  transition: background-color 140ms ease;
}

.reminder-suggestion:hover {
  background: rgba(239, 246, 255, 0.9);
}

.reminder-suggestion-poster {
  width: 2rem;
  height: 3rem;
  flex-shrink: 0;
  border-radius: 0.35rem;
  object-fit: cover;
  background: #f1f5f9;
}

.reminder-chip {
  border-radius: 9999px;
  background: rgba(219, 234, 254, 0.95);
  padding: 0.1rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 500;
  color: #1d4ed8;
}

.reminder-error {
  border-radius: 0.65rem;
  background: rgba(254, 242, 242, 0.95);
  border: 1px solid rgba(254, 202, 202, 0.9);
  padding: 0.5rem 0.75rem;
  font-size: 0.78rem;
  color: #b91c1c;
}

.reminder-save-button {
  border-radius: 0.75rem;
  background: #2563eb;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #ffffff;
  transition: background-color 160ms ease;
}

.reminder-save-button:hover:not(:disabled) {
  background: #1d4ed8;
}

.reminder-save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reminder-cancel-button {
  border-radius: 0.75rem;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: #ffffff;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #475569;
}

.reminder-cancel-button:hover:not(:disabled) {
  background: #f8fafc;
}

.reminder-delete-button {
  font-size: 0.8rem;
  color: #dc2626;
}

.reminder-delete-button:hover:not(:disabled) {
  color: #b91c1c;
}
</style>
