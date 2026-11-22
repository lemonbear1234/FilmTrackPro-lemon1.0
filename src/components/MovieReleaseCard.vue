<template>
  <div
    class="movie-release-card"
    :class="{ 'movie-release-card-past': item.is_past }"
    @click="emit('open')"
  >
    <div class="movie-release-actions">
      <button
        v-if="item.source === 'manual'"
        type="button"
        class="movie-release-action"
        title="编辑上映提醒"
        @click.stop="emit('edit')"
      >
        <PencilIcon class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class="movie-release-action movie-release-action-danger"
        :title="item.source === 'manual' ? '删除这条提醒' : '忽略这条提醒'"
        @click.stop="emit('remove')"
      >
        <XIcon class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="movie-release-poster">
      <CachedImage
        :src="posterURL"
        :alt="item.title"
        class-name="w-full h-full object-cover"
      />
    </div>

    <div class="movie-release-info">
      <p class="movie-release-title">{{ item.title }}</p>
      <p class="movie-release-date">{{ dateLabel }}</p>
      <span class="movie-release-countdown" :class="countdownTone">{{ countdownLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Pencil as PencilIcon, X as XIcon } from 'lucide-vue-next';
import CachedImage from './ui/CachedImage.vue';
import type { TVEpisodeReminder } from '../types';
import { tmdbAPI } from '../utils/api';
import { daysFromToday, weekdayOfDate } from '../utils/date';

const props = defineProps<{ item: TVEpisodeReminder }>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'edit'): void;
  (e: 'remove'): void;
}>();

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const posterURL = computed(() =>
  props.item.poster_path ? tmdbAPI.getImageURL(props.item.poster_path) : ''
);

const parsedDate = computed(() => {
  const date = new Date(props.item.air_date);
  return Number.isNaN(date.getTime()) ? null : date;
});

/** 跨年就把年份带上，不然 2027 的片子看着像下个月 */
const dateLabel = computed(() => {
  const date = parsedDate.value;
  if (!date) return props.item.air_date;

  const weekday = WEEKDAY_LABELS[weekdayOfDate(props.item.air_date) - 1] ?? '';
  const thisYear = new Date().getFullYear();
  const prefix =
    date.getFullYear() === thisYear
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

  return weekday ? `${prefix} · ${weekday}` : prefix;
});

const offsetDays = computed(() => daysFromToday(props.item.air_date));

const countdownLabel = computed(() => {
  if (Number.isNaN(offsetDays.value)) return '待定档';
  if (offsetDays.value === 0) return '今天上映';
  if (offsetDays.value > 0) return `${offsetDays.value} 天后`;

  const past = Math.abs(offsetDays.value);
  return past === 1 ? '已上映 · 昨天' : `已上映 · ${past} 天前`;
});

/** 远期档期降成灰色，近期用琥珀色提示「快到了」 */
const countdownTone = computed(() => {
  if (Number.isNaN(offsetDays.value)) return 'is-far';
  if (offsetDays.value < 0) return 'is-past';
  if (offsetDays.value <= 30) return 'is-soon';
  if (offsetDays.value <= 90) return 'is-near';
  return 'is-far';
});
</script>

<style scoped>
.movie-release-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem;
  border: 1px solid rgba(253, 230, 138, 0.7);
  border-radius: 0.85rem;
  background: rgba(255, 251, 235, 0.55);
  cursor: pointer;
  transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
}

.movie-release-card:hover {
  border-color: rgba(251, 191, 36, 0.85);
  box-shadow: 0 12px 26px -20px rgba(146, 64, 14, 0.55);
  transform: translateY(-2px);
}

.movie-release-card-past {
  opacity: 0.6;
  background: rgba(248, 250, 252, 0.7);
  border-color: rgba(226, 232, 240, 0.9);
}

.movie-release-actions {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 160ms ease;
  z-index: 2;
}

.movie-release-card:hover .movie-release-actions,
.movie-release-card:focus-within .movie-release-actions {
  opacity: 1;
}

.movie-release-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.95);
  color: #64748b;
  transition: color 140ms ease, border-color 140ms ease;
}

.movie-release-action:hover {
  color: #b45309;
  border-color: rgba(253, 230, 138, 1);
}

.movie-release-action-danger:hover {
  color: #dc2626;
  border-color: rgba(254, 202, 202, 1);
}

.movie-release-poster {
  width: 2.75rem;
  height: 4rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #e5e7eb;
}

.movie-release-poster :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.movie-release-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.movie-release-title {
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.movie-release-date {
  font-size: 0.74rem;
  color: #6b7280;
  white-space: nowrap;
}

.movie-release-countdown {
  border-radius: 9999px;
  padding: 0.05rem 0.45rem;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.movie-release-countdown.is-soon {
  background: rgba(254, 243, 199, 0.95);
  color: #b45309;
}

.movie-release-countdown.is-near {
  background: rgba(254, 243, 199, 0.7);
  color: #a16207;
}

.movie-release-countdown.is-far {
  background: rgba(241, 245, 249, 0.95);
  color: #7c8798;
}

.movie-release-countdown.is-past {
  background: rgba(226, 232, 240, 0.8);
  color: #64748b;
}
</style>
