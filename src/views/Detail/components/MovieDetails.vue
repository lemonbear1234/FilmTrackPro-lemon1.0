<template>
  <div class="card p-6">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900">详细信息</h3>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        title="修改详细信息"
        @click="openEdit"
      >
        <Pencil class="h-3.5 w-3.5" />
        编辑
      </button>
    </div>

    <div class="space-y-3 text-sm">
      <div class="flex justify-between">
        <span class="text-gray-600">添加日期</span>
        <span class="font-medium">{{ formatDate(movie.created_at) }}</span>
      </div>
      <div v-if="movie.total_seasons" class="flex justify-between">
        <span class="text-gray-600">总季数</span>
        <span class="font-medium">{{ movie.total_seasons }}</span>
      </div>
      <div v-if="movie.total_episodes" class="flex justify-between">
        <span class="text-gray-600">总集数</span>
        <span class="font-medium">{{ movie.total_episodes }}</span>
      </div>
      <div v-if="movie.runtime" class="flex justify-between">
        <span class="text-gray-600">时长</span>
        <span class="font-medium">{{ movie.runtime }} 分钟</span>
      </div>

      <div class="flex justify-between">
        <span class="text-gray-600">TMDb ID</span>
        <a 
          :href="`https://www.themoviedb.org/${movie.type}/${movie.tmdb_id}`" 
          target="_blank"
          class="font-medium text-blue-600 hover:text-blue-800"
        >
          {{ movie.tmdb_id }}
        </a>
      </div>
    </div>

    <MovieDetailsEditModal
      :is-open="editOpen"
      :movie="movie"
      :saving="saving"
      :error-message="editError"
      @close="closeEdit"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Pencil } from 'lucide-vue-next';
import MovieDetailsEditModal from './MovieDetailsEditModal.vue';
import { useMovieStore } from '../../../stores/movie';
import { toast } from '../../../utils/toast';

import type { Movie } from '../../../types';
import type { DetailPropsWithFormat, MovieDetailsExtraPatch } from '../types';

type Props = DetailPropsWithFormat;

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'updated', movie: Movie): void;
}>();

const movieStore = useMovieStore();
const editOpen = ref(false);
const saving = ref(false);
const editError = ref('');

const openEdit = () => {
  editError.value = '';
  editOpen.value = true;
};

const closeEdit = () => {
  editOpen.value = false;
};

const handleSave = async (patch: MovieDetailsExtraPatch) => {
  if (!props.movie || saving.value) return;

  saving.value = true;
  editError.value = '';
  try {
    const result = await movieStore.updateMovieExtraInfo(props.movie.id, patch);
    if (result.success && result.data) {
      emit('updated', result.data as Movie);
      editOpen.value = false;
      toast.success('详细信息已更新');
    } else {
      editError.value = result.error || '更新失败，请稍后重试';
      toast.error(editError.value);
    }
  } catch (error) {
    editError.value = error instanceof Error ? error.message : String(error);
    toast.error(editError.value);
  } finally {
    saving.value = false;
  }
};
</script>
