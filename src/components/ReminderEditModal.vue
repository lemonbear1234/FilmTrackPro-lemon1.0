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
          剧集可以设更新周期，后续集数自动补齐；电影只记上映日。本地库和 TMDb 都能选，
          都没有的片名也可以直接存。
        </p>

        <!-- 作品选择 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="reminder-label reminder-label-inline">作品</label>
            <div class="reminder-type-group" role="group" aria-label="作品类型">
              <button
                v-for="option in TYPE_OPTIONS"
                :key="option.value"
                type="button"
                class="reminder-type-button"
                :class="{ 'reminder-type-button-active': mediaType === option.value }"
                :aria-pressed="mediaType === option.value"
                @click="setMediaType(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <TextField
            v-model="titleInput"
            :placeholder="isMovie ? '输入电影名，如：复仇者联盟5' : '输入剧名，或从本地影视库中选'"
            :leading-icon="SearchIcon"
            @update:model-value="handleTitleInput"
            @focus="showDropdown = true"
            @blur="scheduleHideDropdown"
          />

          <div v-if="showDropdown" class="reminder-suggestions">
            <template v-if="localMatches.length > 0">
              <p class="reminder-suggestions-group">本地影视库</p>
              <button
                v-for="movie in localMatches"
                :key="`local-${movie.id}`"
                type="button"
                class="reminder-suggestion"
                @mousedown.prevent="pickLocalMovie(movie)"
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
            </template>

            <template v-if="tmdbMatches.length > 0">
              <p class="reminder-suggestions-group">TMDb</p>
              <button
                v-for="item in tmdbMatches"
                :key="`tmdb-${item.media_type}-${item.id}`"
                type="button"
                class="reminder-suggestion"
                @mousedown.prevent="pickTmdbItem(item)"
              >
                <CachedImage
                  :src="getPosterURL(item.poster_path)"
                  :alt="getTmdbTitle(item)"
                  class-name="reminder-suggestion-poster"
                />
                <span class="flex-1 text-left">
                  <span class="block text-sm text-gray-900">{{ getTmdbTitle(item) }}</span>
                  <span class="block text-xs text-gray-400">
                    {{ item.media_type === 'tv' ? '剧集' : '电影' }}{{ getTmdbYear(item) ? ` · ${getTmdbYear(item)}` : '' }}
                  </span>
                </span>
              </button>
            </template>

            <p v-if="searching" class="px-3 py-2 text-xs text-gray-400">正在搜索 TMDb…</p>

            <button
              v-if="titleInput.trim()"
              type="button"
              class="reminder-suggestion reminder-suggestion-free"
              @mousedown.prevent="useFreeText"
            >
              <span class="flex-1 text-left">
                <span class="block text-sm text-gray-900">直接使用「{{ titleInput.trim() }}」</span>
                <span class="block text-xs text-gray-400">不关联作品，只按这个名称和日期提醒</span>
              </span>
            </button>
          </div>

          <div v-if="linkedMovie" class="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span class="reminder-chip">已关联本地作品</span>
            <span>{{ linkedMovie.title }}</span>
            <button type="button" class="text-blue-600 hover:text-blue-700" @click="clearLinkedMovie">
              取消关联
            </button>
          </div>
          <div v-else-if="tmdbId" class="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span class="reminder-chip">来自 TMDb</span>
            <span>{{ titleInput }}</span>
            <button type="button" class="text-blue-600 hover:text-blue-700" @click="clearLink">
              清除
            </button>
          </div>
        </div>

        <div :class="isMovie ? '' : 'space-y-3'">
          <div>
            <label class="reminder-label">{{ isMovie ? '上映日期' : '播出日期' }}</label>
            <DateField
              v-model="airDate"
              :placeholder="isMovie ? '选择上映日期' : '选择播出日期'"
              @update:model-value="dateTouched = true"
            />
          </div>
          <div v-if="!isMovie" class="grid grid-cols-3 gap-3">
            <div>
              <label class="reminder-label">季</label>
              <TextField v-model="seasonInput" type="number" input-mode="numeric" placeholder="如 8" />
            </div>
            <div>
              <label class="reminder-label">集</label>
              <TextField v-model="episodeInput" type="number" input-mode="numeric" placeholder="如 7" />
            </div>
            <div>
              <label class="reminder-label">本季共几集</label>
              <TextField
                v-model="totalEpisodesInput"
                type="number"
                input-mode="numeric"
                placeholder="如 10"
              />
            </div>
          </div>
        </div>

        <div v-if="!isMovie">
          <label class="reminder-label">更新周期</label>
          <div class="reminder-cycle-group" role="group" aria-label="更新周期">
            <button
              v-for="option in CYCLE_OPTIONS"
              :key="option.value"
              type="button"
              class="reminder-cycle-button"
              :class="{ 'reminder-cycle-button-active': cyclePreset === option.value }"
              :aria-pressed="cyclePreset === option.value"
              @click="cyclePreset = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <div v-if="cyclePreset === CUSTOM_CYCLE" class="mt-2">
            <TextField
              v-model="customCycleInput"
              type="number"
              input-mode="numeric"
              placeholder="每隔多少天更新一集，如 3"
            />
          </div>

          <div v-if="showWeekdayPicker" class="mt-3">
            <label class="reminder-label">每周更新日（可多选）</label>
            <div class="reminder-weekday-group" role="group" aria-label="每周更新日">
              <button
                v-for="day in WEEKDAY_OPTIONS"
                :key="`weekday-${day.value}`"
                type="button"
                class="reminder-weekday-button"
                :class="{ 'reminder-weekday-button-active': airWeekdays.includes(day.value) }"
                :aria-pressed="airWeekdays.includes(day.value)"
                :title="day.full"
                @click="toggleWeekday(day.value)"
              >
                {{ day.label }}
              </button>
            </div>
            <p class="reminder-hint">
              周一、周二双更的剧就把两天都勾上；不勾就按上面的周期平均推。
            </p>
          </div>

          <p class="reminder-hint">{{ cycleHint }}</p>
        </div>

        <div v-if="!isMovie">
          <label class="reminder-label">集标题（可选）</label>
          <TextField v-model="episodeNameInput" placeholder="如：第 8 集 · 归途" />
        </div>

        <div>
          <label class="reminder-label">备注（可选）</label>
          <TextAreaField v-model="notesInput" :rows="2" placeholder="例如：TMDb 日期未更新，按官方微博为准" />
        </div>

        <label
          v-if="!movieId"
          class="reminder-library-toggle"
          :class="{ 'reminder-library-toggle-disabled': !canAddToLibrary }"
        >
          <input
            v-model="addToLibrary"
            type="checkbox"
            class="reminder-checkbox"
            :disabled="!canAddToLibrary"
          />
          <span>
            <span class="block text-sm text-gray-800">同时加入影视库（想看）</span>
            <span class="block text-xs text-gray-400 mt-0.5">
              {{ canAddToLibrary
                ? '提醒和库记录一起生成，之后能从卡片直接打开详情'
                : '从 TMDb 结果里选一条，才能同时加入影视库' }}
            </span>
          </span>
        </label>

        <p v-if="errorMessage" class="reminder-error">{{ errorMessage }}</p>

        <div class="flex items-center justify-between pt-2">
          <button
            v-if="isEditing"
            type="button"
            class="reminder-delete-button"
            :disabled="busy"
            @click="handleDelete"
          >
            {{ resolvedRepeatDays >= 1 && !isMovie ? '删除整条周期提醒' : '删除这条提醒' }}
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
import type { Movie, MovieType, ReminderEditPrefill, ReminderEntryForm, TMDbMovie } from '../types';
import { tvReminderService } from '../services/reminder';
import { tmdbAPI } from '../utils/api';
import { todayLocalDate, weekdayOfDate } from '../utils/date';
import { useMovieStore } from '../stores/movie';

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
  /** 顺手往影视库加了一条记录，父组件需要刷新列表/统计 */
  (e: 'library-added'): void;
}>();

const movieStore = useMovieStore();

/** 新建时默认「每周」，绝大多数剧都是周更 */
const NEW_ENTRY_REPEAT_DAYS = 7;
const CUSTOM_CYCLE = -1;
const CYCLE_OPTIONS = [
  { value: 0, label: '单集' },
  { value: 1, label: '每天' },
  { value: 7, label: '每周' },
  { value: 14, label: '每两周' },
  { value: 30, label: '每月' },
  { value: CUSTOM_CYCLE, label: '自定义' }
];
const TYPE_OPTIONS: Array<{ value: MovieType; label: string }> = [
  { value: 'movie', label: '电影' },
  { value: 'tv', label: '剧集' }
];
/** 周几多选：1=周一 … 7=周日，和 date.ts 的 weekdayOfDate 对齐 */
const WEEKDAY_OPTIONS = [
  { value: 1, label: '一', full: '周一' },
  { value: 2, label: '二', full: '周二' },
  { value: 3, label: '三', full: '周三' },
  { value: 4, label: '四', full: '周四' },
  { value: 5, label: '五', full: '周五' },
  { value: 6, label: '六', full: '周六' },
  { value: 7, label: '日', full: '周日' }
];

const titleInput = ref('');
const airDate = ref('');
const seasonInput = ref('');
const episodeInput = ref('');
const totalEpisodesInput = ref('');
const airWeekdays = ref<number[]>([]);
const episodeNameInput = ref('');
const notesInput = ref('');
const cyclePreset = ref<number>(NEW_ENTRY_REPEAT_DAYS);
const customCycleInput = ref('');
const movieId = ref<string | null>(null);
const tmdbId = ref<number | null>(null);
const posterPath = ref<string | null>(null);
const mediaType = ref<MovieType>('tv');
const addToLibrary = ref(true);
const dateTouched = ref(false);
const showDropdown = ref(false);
const searching = ref(false);
const tmdbResults = ref<TMDbMovie[]>([]);
const busy = ref(false);
const errorMessage = ref('');

const isEditing = computed(() => Boolean(props.prefill?.entryId));
const isMovie = computed(() => mediaType.value === 'movie');

const linkedMovie = computed(() =>
  movieId.value ? props.movies.find(movie => movie.id === movieId.value) ?? null : null
);

/** 本地库匹配：标题包含即可，最多 4 条 */
const localMatches = computed(() => {
  const keyword = titleInput.value.trim().toLowerCase();
  if (!keyword) return [];
  return props.movies
    .filter(movie => movie.title?.toLowerCase().includes(keyword))
    .slice(0, 4);
});

const getTmdbTitle = (item: TMDbMovie) => item.title || item.name || '';
const getTmdbYear = (item: TMDbMovie) => (item.release_date || item.first_air_date || '').slice(0, 4);

/**
 * TMDb 结果：不按当前类型过滤——用户可能默认停在「剧集」却搜的是电影，
 * 过滤掉就永远搜不到。只把当前类型的结果排在前面，选中后类型会自动跟着变。
 */
const tmdbMatches = computed(() => {
  const seen = new Set<number>();
  const all = tmdbResults.value
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .filter(item => Boolean(getTmdbTitle(item)))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  return [
    ...all.filter(item => item.media_type === mediaType.value),
    ...all.filter(item => item.media_type !== mediaType.value)
  ].slice(0, 6);
});

const canAddToLibrary = computed(() => !movieId.value && Boolean(tmdbId.value));

const getPosterURL = (path?: string | null) => (path ? tmdbAPI.getImageURL(path) : '');

/** 数字字段统一在这里转，兼容字符串与数字，避免 type=number 时再踩 .trim() 的坑 */
const toNumberOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/** 自定义周期是否填了合法的天数（1-365） */
const customCycleValid = computed(() => {
  if (cyclePreset.value !== CUSTOM_CYCLE) return true;
  const value = toNumberOrNull(customCycleInput.value);
  return value !== null && value >= 1 && value <= 365;
});

/** 最终落库的 repeat_days，0 表示不重复 */
const resolvedRepeatDays = computed(() => {
  if (cyclePreset.value !== CUSTOM_CYCLE) {
    return cyclePreset.value;
  }
  const value = toNumberOrNull(customCycleInput.value);
  return value === null ? 0 : Math.floor(value);
});

/** 只有每周 / 每两周才需要选周几，其余周期按天数推 */
const showWeekdayPicker = computed(
  () => !isMovie.value && (resolvedRepeatDays.value === 7 || resolvedRepeatDays.value === 14)
);

const weekdayText = computed(() => {
  if (airWeekdays.value.length === 0) return '';
  return airWeekdays.value
    .slice()
    .sort((a, b) => a - b)
    .map(day => WEEKDAY_OPTIONS.find(option => option.value === day)?.full ?? '')
    .filter(Boolean)
    .join('、');
});

const cycleHint = computed(() => {
  if (!customCycleValid.value) {
    return '自定义周期请填 1-365 之间的天数';
  }
  if (resolvedRepeatDays.value < 1) {
    return '只提醒这一集；后续集数可以在保存后按周期补上';
  }

  const total = toNumberOrNull(totalEpisodesInput.value);
  const baseEpisode = toNumberOrNull(episodeInput.value);
  const span = total && baseEpisode ? `，按本季 ${total} 集收尾` : '';

  if (weekdayText.value) {
    return `${weekdayText.value}更新${span}；没填「本季共几集」就只提醒你填的这一集`;
  }
  return `每 ${resolvedRepeatDays.value} 天更新一集${span}；没填「本季共几集」就只提醒你填的这一集`;
});

const toggleWeekday = (day: number) => {
  if (airWeekdays.value.includes(day)) {
    airWeekdays.value = airWeekdays.value.filter(value => value !== day);
  } else {
    airWeekdays.value = [...airWeekdays.value, day].sort((a, b) => a - b);
  }
};

/** 把已有的 repeat_days 还原到选项上 */
const applyRepeatDays = (days: number | null | undefined) => {
  const value = days == null ? 0 : Math.floor(Number(days));
  if (!Number.isFinite(value) || value <= 0) {
    cyclePreset.value = 0;
    customCycleInput.value = '';
    return;
  }
  if (CYCLE_OPTIONS.some(option => option.value === value)) {
    cyclePreset.value = value;
    customCycleInput.value = '';
    return;
  }
  cyclePreset.value = CUSTOM_CYCLE;
  customCycleInput.value = String(value);
};

const resetForm = () => {
  const prefill = props.prefill;
  titleInput.value = prefill?.title ?? '';
  airDate.value = prefill?.airDate || todayLocalDate();
  seasonInput.value = prefill?.season ? String(prefill.season) : '';
  episodeInput.value = prefill?.episode ? String(prefill.episode) : '';
  totalEpisodesInput.value = prefill?.totalEpisodes ? String(prefill.totalEpisodes) : '';
  airWeekdays.value = prefill?.airWeekdays
    ? [...prefill.airWeekdays]
    : prefill?.entryId
      ? []
      : [weekdayOfDate(airDate.value)].filter(day => Number.isFinite(day));
  episodeNameInput.value = prefill?.episodeName ?? '';
  notesInput.value = prefill?.notes ?? '';
  mediaType.value = prefill?.mediaType ?? 'tv';
  applyRepeatDays(prefill?.repeatDays ?? (prefill?.entryId ? 0 : NEW_ENTRY_REPEAT_DAYS));
  movieId.value = prefill?.movieId ?? null;
  tmdbId.value = prefill?.tmdbId ?? null;
  posterPath.value = prefill?.posterPath ?? null;
  // 新建默认勾上；编辑时不动用户的库，避免改个日期就悄悄多出一条记录
  addToLibrary.value = !prefill?.entryId;
  dateTouched.value = Boolean(prefill?.airDate) || Boolean(prefill?.entryId);
  tmdbResults.value = [];
  searching.value = false;
  errorMessage.value = '';
  showDropdown.value = false;
};

// 只勾了一天时，让它跟着播出日期走，避免「日期是周四、周更日却是周一」
watch(airDate, value => {
  if (isMovie.value || !value) return;
  if (airWeekdays.value.length > 1) return;

  const weekday = weekdayOfDate(value);
  if (Number.isFinite(weekday)) {
    airWeekdays.value = [weekday];
  }
});

watch(
  () => [props.isOpen, props.prefill] as const,
  ([open]) => {
    if (open) {
      resetForm();
    }
  },
  { immediate: true }
);

let searchTimer: number | undefined;
let searchToken = 0;

const runTmdbSearch = (keyword: string) => {
  window.clearTimeout(searchTimer);
  const query = keyword.trim();

  if (query.length < 2) {
    tmdbResults.value = [];
    searching.value = false;
    return;
  }

  searching.value = true;
  const token = ++searchToken;

  searchTimer = window.setTimeout(async () => {
    try {
      const result = await tmdbAPI.searchMulti(query);
      if (token !== searchToken) return;
      tmdbResults.value = result.success ? result.data?.results ?? [] : [];
    } catch (error) {
      if (token === searchToken) {
        tmdbResults.value = [];
        console.warn('TMDb 搜索失败:', error);
      }
    } finally {
      if (token === searchToken) {
        searching.value = false;
      }
    }
  }, 350);
};

const handleTitleInput = (value: string) => {
  titleInput.value = value;
  showDropdown.value = value.trim().length > 0;

  // 手动改动标题后，原来的关联就不再可信
  if (linkedMovie.value && linkedMovie.value.title !== value) {
    clearLink();
  } else if (tmdbId.value && !movieId.value) {
    tmdbId.value = null;
    posterPath.value = null;
  }

  runTmdbSearch(value);
};

let hideTimer: number | undefined;
const scheduleHideDropdown = () => {
  hideTimer = window.setTimeout(() => {
    showDropdown.value = false;
  }, 150);
};

const setMediaType = (type: MovieType) => {
  if (mediaType.value === type) return;
  mediaType.value = type;

  if (type === 'movie') {
    seasonInput.value = '';
    episodeInput.value = '';
    totalEpisodesInput.value = '';
    airWeekdays.value = [];
    episodeNameInput.value = '';
    cyclePreset.value = 0;
    customCycleInput.value = '';
  } else if (cyclePreset.value === 0) {
    cyclePreset.value = NEW_ENTRY_REPEAT_DAYS;
  }

  // 换了类型，TMDb 结果要按新类型重新筛
  if (titleInput.value.trim().length >= 2) {
    runTmdbSearch(titleInput.value);
  }
};

const clearLink = () => {
  movieId.value = null;
  tmdbId.value = null;
  posterPath.value = null;
};

const clearLinkedMovie = () => {
  clearLink();
};

const pickLocalMovie = (movie: Movie) => {
  window.clearTimeout(hideTimer);
  titleInput.value = movie.title;
  movieId.value = movie.id;
  tmdbId.value = movie.tmdb_id ?? null;
  posterPath.value = movie.poster_path ?? null;
  mediaType.value = movie.type;

  if (movie.type === 'movie') {
    seasonInput.value = '';
    episodeInput.value = '';
    totalEpisodesInput.value = '';
    airWeekdays.value = [];
    episodeNameInput.value = '';
    cyclePreset.value = 0;
  } else {
    // 本地剧集可能带着 TMDb ID，顺手把「下一集 / 总集数」补齐
    if (movie.tmdb_id) void applyTmdbTvDetail(movie.tmdb_id);
  }

  showDropdown.value = false;
};

/**
 * 选中 TMDb 剧集后拉一次详情，把「下一集」的季/集/日期和本季总集数带上
 * 关键：不能用 first_air_date（那是全剧首播，可能早到 2019 年），
 * 否则一填周期就会从首播日往后推，算出「第 377 集」这种数字
 */
const applyTmdbTvDetail = async (id: number, fallbackDate?: string) => {
  try {
    const detail = await tmdbAPI.getTVDetails(id);
    const data = detail.success ? detail.data : undefined;

    if (!data) {
      if (!dateTouched.value && fallbackDate) airDate.value = fallbackDate;
      return;
    }

    const target = data.next_episode_to_air ?? data.last_episode_to_air ?? null;

    if (!target) {
      const date = data.first_air_date || fallbackDate;
      if (!dateTouched.value && date) airDate.value = date;
      return;
    }

    if (!seasonInput.value) seasonInput.value = String(target.season_number ?? '');
    if (!episodeInput.value) episodeInput.value = String(target.episode_number ?? '');

    const total = (data.seasons ?? []).find(
      season => season.season_number === target.season_number
    )?.episode_count;
    if (total && !totalEpisodesInput.value) totalEpisodesInput.value = String(total);

    if (!dateTouched.value && target.air_date) airDate.value = target.air_date;
    if (target.air_date && !props.prefill?.entryId) {
      airWeekdays.value = [weekdayOfDate(target.air_date)];
    }
  } catch (error) {
    console.warn('读取 TMDb 剧集排期失败:', error);
    if (!dateTouched.value && fallbackDate) airDate.value = fallbackDate;
  }
};

const pickTmdbItem = async (item: TMDbMovie) => {
  window.clearTimeout(hideTimer);
  const type: MovieType = item.media_type === 'tv' ? 'tv' : 'movie';

  titleInput.value = getTmdbTitle(item);
  movieId.value = null;
  tmdbId.value = item.id;
  posterPath.value = item.poster_path ?? null;
  mediaType.value = type;

  if (type === 'movie') {
    seasonInput.value = '';
    episodeInput.value = '';
    totalEpisodesInput.value = '';
    airWeekdays.value = [];
    episodeNameInput.value = '';
    cyclePreset.value = 0;

    if (!dateTouched.value && item.release_date) {
      airDate.value = item.release_date;
    }
  } else {
    await applyTmdbTvDetail(item.id, item.first_air_date);
  }

  showDropdown.value = false;
};

/** 兜底：库里和 TMDb 都没选，就用当前输入直接存 */
const useFreeText = () => {
  window.clearTimeout(hideTimer);
  clearLink();
  showDropdown.value = false;
};

const buildForm = (linkedId: string | null): ReminderEntryForm => ({
  movie_id: linkedId,
  title: titleInput.value.trim(),
  tmdb_id: tmdbId.value,
  poster_path: posterPath.value,
  air_date: airDate.value,
  season_number: isMovie.value ? null : toNumberOrNull(seasonInput.value),
  episode_number: isMovie.value ? null : toNumberOrNull(episodeInput.value),
  episode_name: isMovie.value ? null : episodeNameInput.value.trim() || null,
  repeat_days: !isMovie.value && resolvedRepeatDays.value >= 1 ? resolvedRepeatDays.value : null,
  media_type: mediaType.value,
  season_total_episodes: isMovie.value ? null : toNumberOrNull(totalEpisodesInput.value),
  air_weekdays:
    !isMovie.value && showWeekdayPicker.value && airWeekdays.value.length > 0
      ? [...airWeekdays.value].sort((a, b) => a - b)
      : null,
  notes: notesInput.value.trim() || null
});

/**
 * 需要的话顺带把作品加进影视库（想看）
 * 失败不阻断提醒本身，只把情况写进最终提示
 */
const ensureLibraryRecord = async (): Promise<{ id: string | null; warning: string }> => {
  const existing = tmdbId.value
    ? props.movies.find(movie => movie.tmdb_id === tmdbId.value)
    : undefined;

  if (existing) {
    return { id: existing.id, warning: '' };
  }

  if (!addToLibrary.value || !canAddToLibrary.value || !tmdbId.value) {
    return { id: null, warning: '' };
  }

  const created = await movieStore.addMovie({
    tmdb_id: tmdbId.value,
    type: mediaType.value,
    status: 'planned'
  });

  if (!created.success || !created.data) {
    return { id: null, warning: created.error || '加入影视库失败' };
  }

  emit('library-added');
  return { id: created.data, warning: '' };
};

const handleSave = async () => {
  if (busy.value) return;

  if (!titleInput.value.trim()) {
    errorMessage.value = '请先填写作品名称';
    return;
  }
  if (!airDate.value) {
    errorMessage.value = '请选择日期';
    return;
  }
  if (!isMovie.value && !customCycleValid.value) {
    errorMessage.value = '自定义周期请填 1-365 之间的天数';
    return;
  }

  if (!isMovie.value) {
    const total = toNumberOrNull(totalEpisodesInput.value);
    const episode = toNumberOrNull(episodeInput.value);

    if (total !== null && episode === null) {
      errorMessage.value = '填了本季总集数，请同时填清起始集数';
      return;
    }
    if (total !== null && episode !== null && total < episode) {
      errorMessage.value = '本季总集数不能小于起始集数';
      return;
    }
    if (total !== null && (total < 1 || total > 999)) {
      errorMessage.value = '本季总集数请填 1-999 之间的数字';
      return;
    }
  }

  busy.value = true;
  errorMessage.value = '';

  try {
    let linkedId = movieId.value;
    let warning = '';

    if (!linkedId) {
      const libraryResult = await ensureLibraryRecord();
      linkedId = libraryResult.id;
      warning = libraryResult.warning;
    }

    const form = buildForm(linkedId);

    // 没填总集数但知道 TMDb ID：保存前补一次，省得用户自己去查「这季共几集」
    if (!isMovie.value && !form.season_total_episodes && tmdbId.value && form.season_number) {
      try {
        const seasonDetail = await tmdbAPI.getTVSeasonDetails(tmdbId.value, form.season_number);
        const count = seasonDetail.success ? seasonDetail.data?.episodes?.length ?? 0 : 0;
        if (count > 0) {
          form.season_total_episodes = count;
        }
      } catch (error) {
        console.warn('读取本季集数失败，按未填处理:', error);
      }
    }
    const result = isEditing.value && props.prefill?.entryId
      ? await tvReminderService.updateReminder(props.prefill.entryId, form)
      : await tvReminderService.createReminder(form);

    if (!result.success) {
      errorMessage.value = result.error || '保存失败，请重试';
      return;
    }

    const baseMessage = isEditing.value ? '提醒已更新' : '提醒已添加';
    emit('saved', warning ? `${baseMessage}（${warning}）` : baseMessage);
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

.reminder-label-inline {
  margin-bottom: 0;
}

.reminder-type-group {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.15rem;
  border-radius: 0.6rem;
  background: #f1f5f9;
}

.reminder-type-button {
  border-radius: 0.45rem;
  padding: 0.18rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 500;
  color: #64748b;
  transition: all 140ms ease;
}

.reminder-type-button-active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.reminder-cycle-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.reminder-cycle-button {
  border-radius: 0.65rem;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: #ffffff;
  padding: 0.32rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: #475569;
  transition: all 140ms ease;
}

.reminder-cycle-button:hover {
  border-color: rgba(147, 197, 253, 0.9);
  color: #1d4ed8;
}

.reminder-cycle-button-active {
  border-color: rgba(37, 99, 235, 0.9);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-weight: 600;
}

.reminder-weekday-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.reminder-weekday-button {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(226, 232, 240, 1);
  background: rgba(248, 250, 252, 0.9);
  font-size: 0.78rem;
  color: #475569;
  transition: all 160ms ease;
}

.reminder-weekday-button:hover {
  border-color: rgba(191, 219, 254, 1);
  color: #1d4ed8;
}

.reminder-weekday-button-active {
  border-color: rgba(37, 99, 235, 0.9);
  background: rgba(37, 99, 235, 1);
  color: #ffffff;
}

.reminder-weekday-button-active:hover {
  color: #ffffff;
}

.reminder-hint {
  margin-top: 0.4rem;
  font-size: 0.72rem;
  line-height: 1.5;
  color: #94a3b8;
}

.reminder-suggestions {
  margin-top: 0.4rem;
  max-height: 17rem;
  overflow-y: auto;
  border-radius: 0.75rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
  padding: 0.25rem;
}

.reminder-suggestions-group {
  padding: 0.3rem 0.5rem 0.15rem;
  font-size: 0.68rem;
  font-weight: 500;
  color: #94a3b8;
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

.reminder-suggestion-free {
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 0 0 0.6rem 0.6rem;
  margin-top: 0.15rem;
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

.reminder-library-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #f8fafc;
  padding: 0.55rem 0.7rem;
  cursor: pointer;
}

.reminder-library-toggle-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.reminder-checkbox {
  margin-top: 0.15rem;
  width: 0.95rem;
  height: 0.95rem;
  accent-color: #2563eb;
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
