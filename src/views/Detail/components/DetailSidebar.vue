<template>
  <div class="detail-sidebar-shell">
    <!-- 操作按钮 -->
    <div class="animate-slide-in-right" style="animation-delay: 0.08s;">
      <ActionButtons
        :movie="movie"
        @edit-record="$emit('editRecord')"
        @quick-record="$emit('quickRecord')"
        @mark-episode-watched="$emit('markEpisodeWatched')"
        @update-movie-info="$emit('updateMovieInfo')"
      />
    </div>

    <!-- 观看进度（仅剧集） -->
    <div v-if="movie.type === 'tv'" class="animate-slide-in-right" style="animation-delay: 0.1s;">
      <WatchProgress
        :movie="movie"
        :watch-progress="watchProgress"
        :get-progress-color="getProgressColor"
      />
    </div>

    <!-- 详细信息 -->
    <div class="animate-slide-in-right" style="animation-delay: 0.12s;">
      <MovieDetails
        :movie="movie"
        :format-date="formatDate"
        @updated="$emit('detailsUpdated', $event)"
      />
    </div>

    <div class="animate-slide-in-right" style="animation-delay: 0.16s;">
      <EpisodeGuideCard :movie="movie" />
    </div>

    <!-- 删除记录 -->
    <div class="animate-slide-in-right" style="animation-delay: 0.2s;">
      <DeleteSection @delete-record="$emit('deleteRecord')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButtons from './ActionButtons.vue';
import MovieDetails from './MovieDetails.vue';
import DeleteSection from './DeleteSection.vue';
import EpisodeGuideCard from './EpisodeGuideCard.vue';
import WatchProgress from './WatchProgress.vue';

import type { DetailSidebarProps, DetailSidebarEmits } from '../types';

type Props = DetailSidebarProps;
type Emits = DetailSidebarEmits;

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.detail-sidebar-shell {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* 右侧滑入动画
   注意：to 里不要再写 transform。forwards 会让 transform: translateX(0) 永久留在元素上，
   而祖先只要有 transform，子级的 position: fixed 就以它为包含块 —— 弹窗会被压进侧栏里。 */
@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.4s ease-out forwards;
  opacity: 0;
}
</style>
