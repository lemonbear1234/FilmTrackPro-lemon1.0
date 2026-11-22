<template>
  <div
    class="update-reminder-card"
    :class="{ 'update-reminder-card-past': item.is_past }"
    @click="emit('open')"
  >
    <div class="update-reminder-actions">
      <button
        v-if="item.source === 'manual'"
        type="button"
        class="update-reminder-action"
        :title="isCycleOccurrence ? '编辑整条周期提醒' : '编辑这条提醒'"
        @click.stop="emit('edit')"
      >
        <PencilIcon class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class="update-reminder-action update-reminder-action-danger"
        :title="removalLabel"
        @click.stop="emit('remove')"
      >
        <XIcon class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="update-reminder-poster">
      <CachedImage
        :src="posterURL"
        :alt="item.title"
        class-name="w-full h-full object-cover"
      />
    </div>

    <div class="update-reminder-info">
      <p class="update-reminder-title">
        <span class="update-reminder-title-text">{{ item.title }}</span>
        <span v-if="item.source === 'manual'" class="update-reminder-badge">手动</span>
        <span v-if="cycleLabel" class="update-reminder-badge update-reminder-badge-cycle">
          {{ cycleLabel }}
        </span>
      </p>
      <div class="update-reminder-meta">
        <span class="update-reminder-episode">{{ episodeLabel }}</span>
        <span class="update-reminder-day" :class="{ 'update-reminder-day-past': item.is_past }">
          {{ dayLabel }}
        </span>
      </div>
      <p v-if="item.episode_name" class="update-reminder-name">{{ item.episode_name }}</p>
      <p v-else-if="item.notes" class="update-reminder-name">{{ item.notes }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Pencil as PencilIcon, X as XIcon } from 'lucide-vue-next';
import CachedImage from './ui/CachedImage.vue';
import type { TVEpisodeReminder } from '../types';
import { tmdbAPI } from '../utils/api';
import { daysFromToday } from '../utils/date';

const props = defineProps<{ item: TVEpisodeReminder }>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'edit'): void;
  (e: 'remove'): void;
}>();

/** 周期提醒里按周期自动补出来的场次（不是用户当初填的那一集） */
const isCycleOccurrence = computed(
  () => props.item.source === 'manual' && (props.item.occurrence_sequence ?? 0) > 0
);

const posterURL = computed(() =>
  props.item.poster_path ? tmdbAPI.getImageURL(props.item.poster_path) : ''
);

const removalLabel = computed(() => {
  if (isCycleOccurrence.value) return '跳过这一集';
  return props.item.source === 'manual' ? '删除这条提醒' : '忽略这条提醒';
});

/** 卡片上的周期标记，没有周期就不显示 */
const cycleLabel = computed(() => {
  const days = props.item.repeat_days ?? 0;
  if (props.item.source !== 'manual' || days < 1) return '';
  if (days === 1) return '每天';
  if (days === 7) return '每周';
  if (days === 14) return '每两周';
  if (days === 30) return '每月';
  return `每 ${days} 天`;
});

const episodeLabel = computed(() => {
  const { season_number: season, episode_number: episode, media_type: mediaType } = props.item;

  if (season || episode) {
    const parts = [];
    if (season) parts.push(`第${season}季`);
    if (episode) parts.push(`第${episode}集`);
    return parts.join(' · ');
  }

  if (mediaType === 'movie') return '上映日';
  return props.item.source === 'manual' ? '播出提醒' : '新集即将上线';
});

/** 已播出时给出「N 天前」，比单纯一个「已播出」更能说明新旧 */
const dayLabel = computed(() => {
  if (!props.item.is_past) {
    return getRelativeDayLabel(props.item.air_date) || '即将播出';
  }

  const diff = daysFromToday(props.item.air_date);
  if (Number.isNaN(diff) || diff >= 0) return '已播出';

  const days = Math.abs(diff);
  if (days === 1) return '已播出 · 昨天';
  if (days === 2) return '已播出 · 前天';
  return `已播出 · ${days} 天前`;
});

const getRelativeDayLabel = (dateStr: string) => {
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === 2) return '后天';
  if (diffDays > 2) return `还有${diffDays}天`;
  return '';
};
</script>

<style scoped>
.update-reminder-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.7rem;
  border: 1px solid rgba(243, 244, 246, 1);
  border-radius: 0.85rem;
  background: rgba(249, 250, 251, 0.6);
  cursor: pointer;
  transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
}

.update-reminder-card:hover {
  border-color: rgba(191, 219, 254, 1);
  box-shadow: 0 12px 26px -20px rgba(15, 23, 42, 0.45);
  transform: translateY(-2px);
}

.update-reminder-card-past {
  opacity: 0.62;
}

.update-reminder-actions {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 160ms ease;
  z-index: 2;
}

.update-reminder-card:hover .update-reminder-actions,
.update-reminder-card:focus-within .update-reminder-actions {
  opacity: 1;
}

.update-reminder-action {
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

.update-reminder-action:hover {
  color: #1d4ed8;
  border-color: rgba(191, 219, 254, 1);
}

.update-reminder-action-danger:hover {
  color: #dc2626;
  border-color: rgba(254, 202, 202, 1);
}

.update-reminder-poster {
  width: 3.5rem;
  height: 5.25rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #e5e7eb;
}

.update-reminder-poster :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.update-reminder-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.3rem;
}

.update-reminder-title {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: #111827;
  min-width: 0;
}

.update-reminder-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.update-reminder-badge {
  flex-shrink: 0;
  border-radius: 9999px;
  background: rgba(219, 234, 254, 0.95);
  padding: 0.05rem 0.4rem;
  font-size: 0.62rem;
  font-weight: 500;
  color: #1d4ed8;
}

.update-reminder-badge-cycle {
  background: rgba(224, 231, 255, 0.9);
  color: #4338ca;
}

.update-reminder-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.update-reminder-episode {
  font-size: 0.8rem;
  font-weight: 600;
  color: #2563eb;
  white-space: nowrap;
}

.update-reminder-name {
  font-size: 0.78rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.update-reminder-day {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: #2563eb;
  background: rgba(219, 234, 254, 0.7);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  white-space: nowrap;
}

.update-reminder-day-past {
  color: #64748b;
  background: rgba(226, 232, 240, 0.8);
}
</style>
