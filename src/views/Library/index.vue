<template>
  <div class="h-full flex flex-col bg-gray-50/50">
    <!-- 头部组件 -->
    <div class="shrink-0 relative z-50">
      <LibraryHeader
      :search-query="searchQuery"
      :selected-type="selectedType"
      :selected-status="selectedStatus"
      :selected-watch-time="selectedWatchTime"
      :selected-release-year="selectedReleaseYear"
      :watch-time-options="watchTimeOptions"
      :release-year-options="releaseYearOptions"
      :view-mode="viewMode"
      :is-selection-mode="isSelectionMode"
      :selected-count="selectedItems.length"
      :total-count="infiniteScroll.total.value || filteredItems.length"
      :show-search-stats="!infiniteScroll.isEmpty.value && !!searchQuery"
      @change-view-mode="saveViewMode"
      @enable-selection="enableSelectionMode"
      @cancel-selection="cancelSelectionMode"
      @confirm-delete="confirmDelete"
      @add-reminder="openAddReminder"
      @update:search-query="updateSearchQuery"
      @update:selected-type="updateSelectedType"
      @update:selected-status="updateSelectedStatus"
      @update:selected-watch-time="updateSelectedWatchTime"
      @update:selected-release-year="updateSelectedReleaseYear"
      />
    </div>

    <!-- 内容区域 -->
    <div
      id="scroll-container"
      class="flex-1 min-h-0 pb-8 px-8 animate-fade-in-up overflow-y-auto"
      style="animation-delay: 150ms;"
    >
      <div class="max-w-7xl mx-auto pt-6">
        <!-- 搜索统计 -->
        <div v-if="(searchQuery || selectedType || selectedStatus || selectedWatchTime || selectedReleaseYear) && !infiniteScroll.isEmpty.value" class="mb-4">
          <p class="text-sm text-gray-600">
            找到 <span class="font-medium">{{ infiniteScroll.total.value || filteredItems.length }}</span> 个结果
            <span v-if="searchQuery">关于 "<span class="font-medium">{{ searchQuery }}</span>"</span>
          </p>
        </div>
        <!-- 网格视图 -->
        <GridView
          v-if="!infiniteScroll.isEmpty.value && viewMode === 'grid'"
          :movies="infiniteScroll.items.value"
          :is-selection-mode="isSelectionMode"
          :is-item-selected="isItemSelected"
          :get-image-u-r-l="getImageURL"
          @toggle-select="toggleSelectItem"
          @navigate-to-detail="navigateToDetail"
        />

        <!-- 列表视图 -->
        <ListView
          v-else-if="!infiniteScroll.isEmpty.value && viewMode === 'list'"
          :movies="infiniteScroll.items.value"
          :is-selection-mode="isSelectionMode"
          :is-item-selected="isItemSelected"
          :get-image-u-r-l="getImageURL"
          @toggle-select="toggleSelectItem"
          @navigate-to-detail="navigateToDetail"
        />
        
        <!-- 状态组件 -->
        <LibraryStates
          :loading="infiniteScroll.loading.value"
          :is-empty="infiniteScroll.isEmpty.value"
          :has-more="infiniteScroll.hasMore.value"
          :item-count="infiniteScroll.items.value.length"
          :error="infiniteScroll.error.value"
          :search-query="searchQuery"
          @retry="infiniteScroll.refresh"
        />
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <DeleteConfirmDialog
      :show="showDeleteConfirm"
      :selected-count="selectedItems.length"
      :confirm-input="confirmInput"
      @update:confirm-input="confirmInput = $event"
      @cancel="cancelDelete"
      @confirm="executeDelete"
    />

    <!-- 添加更新提醒 -->
    <ReminderEditModal
      :is-open="reminderModalOpen"
      :prefill="reminderPrefill"
      :movies="reminderMovieOptions"
      @close="reminderModalOpen = false"
      @saved="handleReminderSaved"
      @deleted="reminderModalOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, onBeforeUnmount, onMounted, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMovieStore } from '../../stores/movie';
import { useAppStore } from '../../stores/app';
import { debounce, tmdbAPI } from '../../utils/api';
import { fuzzySearchAsync } from '../../utils/search';
import { databaseAPI } from '../../services/database-api';
import {
  matchesTypeFilter,
  matchesWatchTimeFilter,
  matchesReleaseYearFilter,
  WATCH_TIME_BASE_OPTIONS,
  RELEASE_YEAR_BASE_OPTIONS
} from '../../utils/constants';
import { useInfiniteScroll, type LoadFunction } from '../../composables/useInfiniteScroll';
import StorageService, { StorageKey } from '../../utils/storage';

// 类型导入
import type { MovieRecord, ViewMode } from './types';

// 组件导入
import LibraryHeader from './components/LibraryHeader.vue';
import GridView from './components/GridView.vue';
import ListView from './components/ListView.vue';
import LibraryStates from './components/LibraryStates.vue';
import DeleteConfirmDialog from './components/DeleteConfirmDialog.vue';
import ReminderEditModal from '../../components/ReminderEditModal.vue';
import { toast } from '../../utils/toast';
import type { Movie, ReminderEditPrefill } from '../../types';

const router = useRouter();
const route = useRoute();
const movieStore = useMovieStore();
const appStore = useAppStore();

// 状态管理
const searchQuery = ref('');
const selectedType = ref('');
const selectedStatus = ref('');
const selectedWatchTime = ref('');
const selectedReleaseYear = ref('');
const viewMode = ref<ViewMode>('grid');
const allMovies = ref<MovieRecord[]>([]);
const filteredItemsSource = shallowRef<MovieRecord[]>([]);
// 每部作品的全部真实观看日期：movieId -> YYYY-MM-DD[]
const watchDatesByMovie = ref<Record<string, string[]>>({});
let filterTaskId = 0;

// ==================== 添加更新提醒 ====================
const reminderModalOpen = ref(false);
const reminderPrefill = ref<ReminderEditPrefill | null>(null);
const reminderMovieOptions = ref<Movie[]>([]);

const openAddReminder = async () => {
  reminderPrefill.value = null;

  // 选择器要能搜到整个影视库，而不只是当前筛选结果
  if (reminderMovieOptions.value.length === 0) {
    const result = await databaseAPI.getMovies();
    if (result.success && result.data) {
      reminderMovieOptions.value = result.data;
    }
  }

  reminderModalOpen.value = true;
};

const handleReminderSaved = (message: string) => {
  reminderModalOpen.value = false;
  toast.success(message);
};

// 动态筛选项：年份从库内数据生成，保证只出现有数据的选项
const releaseYearOptions = computed(() => {
  const years = new Set<number>();
  for (const m of allMovies.value) {
    if (m.year && m.year > 0) years.add(m.year);
  }
  const sorted = [...years].sort((a, b) => b - a);
  return [
    ...RELEASE_YEAR_BASE_OPTIONS,
    ...sorted.map((y) => ({ value: String(y), label: `${y} 年` }))
  ];
});

const watchTimeOptions = computed(() => {
  const years = new Set<number>();
  for (const dates of Object.values(watchDatesByMovie.value)) {
    for (const d of dates) {
      const y = parseInt(d.slice(0, 4), 10);
      if (y > 0) years.add(y);
    }
  }
  const sorted = [...years].sort((a, b) => b - a);
  return [
    ...WATCH_TIME_BASE_OPTIONS,
    ...sorted.map((y) => ({ value: String(y), label: `${y} 年` }))
  ];
});

// 批量选择状态
const isSelectionMode = ref(false);
const selectedItems = ref<string[]>([]);
const showDeleteConfirm = ref(false);
const confirmInput = ref('');

// 加载视图模式
const loadViewMode = () => {
  const saved = StorageService.get<'grid' | 'list'>(StorageKey.LIBRARY_VIEW_MODE);
  if (saved && ['grid', 'list'].includes(saved)) {
    viewMode.value = saved;
  }
};

// 保存视图模式到存储
const saveViewMode = (mode: 'grid' | 'list') => {
  viewMode.value = mode;
  StorageService.set(StorageKey.LIBRARY_VIEW_MODE, mode);
};

// 同步筛选基础结果，搜索单独异步处理以避免空搜索时加载 vendor-search
const baseFilteredItems = computed(() => {
  let results = [...allMovies.value];

  // 按类型筛选（动漫为标签筛选，其余为数据库类型筛选）
  if (selectedType.value) {
    results = results.filter(movie => matchesTypeFilter(movie, selectedType.value));
  }

  // 按状态筛选
  if (selectedStatus.value) {
    results = results.filter(movie => movie.status === selectedStatus.value);
  }

  // 按上映时间（年份 / 年代）筛选
  if (selectedReleaseYear.value) {
    results = results.filter(movie => matchesReleaseYearFilter(movie.year, selectedReleaseYear.value));
  }

  // 按观看时间筛选（本月 / 本年 / 去年 / 具体年份）
  if (selectedWatchTime.value) {
    results = results.filter(movie => matchesWatchTimeFilter(watchDatesByMovie.value[movie.id], selectedWatchTime.value));
  }

  return results;
});

const filteredItems = computed(() => filteredItemsSource.value);

const refreshFilteredItems = async () => {
  const currentTaskId = ++filterTaskId;
  const baseResults = [...baseFilteredItems.value];
  const query = searchQuery.value.trim();

  if (!query) {
    filteredItemsSource.value = baseResults;
    return;
  }

  const searchResults = await fuzzySearchAsync(baseResults, query, {
    searchFields: ['title', 'original_title'],
    enablePinyin: true,
    minLength: 1
  });

  if (currentTaskId !== filterTaskId) {
    return;
  }

  filteredItemsSource.value = searchResults.map(result => result.item);
};

// 无限滚动加载函数
const loadMovies: LoadFunction<MovieRecord> = async (page: number, pageSize: number) => {
  try {
    // 如果是第一页，先加载所有数据
    if (page === 1) {
      const response = await movieStore.fetchMovies();
      if (response?.success) {
        allMovies.value = movieStore.movies;
      }
      // 加载真实观看日期用于「观看时间」筛选（失败时退化为空映射，不影响其它筛选）
      try {
        const datesRes = await databaseAPI.getAllWatchDates();
        if (datesRes?.success && datesRes.data) {
          watchDatesByMovie.value = datesRes.data;
        }
      } catch (e) {
        console.warn('加载观看时间失败:', e);
      }
    }

    await refreshFilteredItems();

    // 等待筛选结果写回
    await nextTick();

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = filteredItems.value.slice(startIndex, endIndex);
    const hasMore = endIndex < filteredItems.value.length;



    return {
      data: items,
      hasMore,
      total: filteredItems.value.length
    };
  } catch (error) {
    console.error('加载影视数据失败:', error);
    throw error;
  }
};

// 使用无限滚动，指定滚动容器
const infiniteScroll = useInfiniteScroll(loadMovies, {
  pageSize: 20,
  threshold: 200,
  immediate: false,
  container: '#scroll-container'
});

// 更新函数
const updateSearchQuery = (value: string) => {
  searchQuery.value = value;
};

const updateSelectedType = (value: string) => {
  selectedType.value = value;
};

const updateSelectedStatus = (value: string) => {
  selectedStatus.value = value;
};

const updateSelectedWatchTime = (value: string) => {
  selectedWatchTime.value = value;
};

const updateSelectedReleaseYear = (value: string) => {
  selectedReleaseYear.value = value;
};

// 导航到详情页
const navigateToDetail = (movieId: string) => {
  router.push({ name: 'Detail', params: { id: movieId } });
};

// 获取图片URL
const getImageURL = (path: string | undefined) => {
  return tmdbAPI.getImageURL(path);
};

// 启用选择模式
const enableSelectionMode = () => {
  isSelectionMode.value = true;
  selectedItems.value = [];
};

// 取消选择模式
const cancelSelectionMode = () => {
  isSelectionMode.value = false;
  selectedItems.value = [];
};

// 切换选择项
const toggleSelectItem = (id: string) => {
  const index = selectedItems.value.indexOf(id);
  if (index === -1) {
    selectedItems.value.push(id);
  } else {
    selectedItems.value.splice(index, 1);
  }
};

// 检查项目是否被选中
const isItemSelected = (id: string) => {
  return selectedItems.value.includes(id);
};

// 确认删除
const confirmDelete = () => {
  if (selectedItems.value.length === 0) return;
  showDeleteConfirm.value = true;
  confirmInput.value = '';
};

// 取消删除
const cancelDelete = () => {
  showDeleteConfirm.value = false;
  confirmInput.value = '';
};

// 优化的批量删除函数
const executeDelete = async () => {
  if (confirmInput.value !== 'y') return;

  if (selectedItems.value.length === 0) {
    appStore.modalService.showInfo('提示', '没有选择任何影视作品');
    return;
  }
  
  try {
    appStore.setLoading(true);
    
    // 记录删除成功的数量
    let successCount = 0;
    let failedCount = 0;
    
    // 添加延迟函数
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // 不使用事务，逐个删除选中的项目
    for (const id of selectedItems.value) {
      try {
        const result = await movieStore.deleteMovie(id);
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          console.error(`删除影视作品 ${id} 失败:`, result.error);
        }
        // 每次删除操作后添加延迟，避免数据库锁定
        await delay(100);
      } catch (error) {
        failedCount++;
        console.error(`删除影视作品 ${id} 出错:`, error);
        // 出错后也添加延迟
        await delay(100);
      }
    }
    
    // 添加额外延迟，确保所有操作完成
    await delay(500);
    
    // 刷新数据
    await movieStore.fetchMovies();
    allMovies.value = movieStore.movies;
    
    // 重置状态
    showDeleteConfirm.value = false;
    cancelSelectionMode();
    infiniteScroll.refresh();
    
    // 显示结果消息
    if (failedCount === 0) {
      appStore.modalService.showInfo(
        '删除成功',
        `已成功删除 ${successCount} 个影视作品`
      );
    } else {
      appStore.modalService.showWarning(
        '部分删除成功',
        `成功删除 ${successCount} 个影视作品，失败 ${failedCount} 个`
      );
    }
  } catch (error) {
    console.error('批量删除失败:', error);
    appStore.modalService.showError(
      '删除失败',
      `删除过程中发生错误: ${error}`
    );
  } finally {
    appStore.setLoading(false);
  }
};

// 监听筛选条件变化
watch([selectedType, selectedStatus, selectedWatchTime, selectedReleaseYear], () => {
  infiniteScroll.refresh();
});

// 监听搜索查询变化
watch(searchQuery, () => {
  infiniteScroll.refresh();
});

// 监听 LibraryStates 空态发出的"清除搜索"动作
const handleClearSearch = () => {
  searchQuery.value = '';
  selectedType.value = '';
  selectedStatus.value = '';
  selectedWatchTime.value = '';
  selectedReleaseYear.value = '';
};

// 初始化
onMounted(() => {
  // 加载保存的视图模式
  loadViewMode();

  window.addEventListener('library-clear-search', handleClearSearch);

  // 从查询参数初始化筛选器
  applyRouteQuery();

  // 手动触发初始加载
  nextTick(() => {
    infiniteScroll.triggerLoad();
  });
});

// 从路由 query 应用筛选（供首页统计卡片跳转等场景复用）
function applyRouteQuery() {
  selectedStatus.value = (route.query.status as string) || '';
  selectedType.value = (route.query.type as string) || '';
  selectedWatchTime.value = (route.query.watchTime as string) || '';
  selectedReleaseYear.value = (route.query.year as string) || '';
  searchQuery.value = (route.query.query as string) || '';
}

// 同组件不同 query 跳转时（如首页卡片 → 影视库），同步筛选条件
watch(
  () => route.query,
  () => {
    applyRouteQuery();
  },
  { deep: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('library-clear-search', handleClearSearch);
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 页面进入动画 */
.animate-fade-in-down {
  animation: fadeInDown 0.4s ease-out both;
}

.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out both;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
