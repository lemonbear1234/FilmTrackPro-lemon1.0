<template>
  <div class="h-full bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50 relative">
    <div class="h-full overflow-y-auto">
    <div class="max-w-7xl mx-auto p-6 space-y-8">
      <!-- 页面标题和快速操作 -->
      <div class="flex items-center justify-between animate-fade-in-up" style="animation-delay: 0ms;">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 mb-2">影迹</h1>
          <p class="text-gray-600">管理你的电影、剧集和追剧进度</p>
        </div>
        <div class="flex space-x-3">
          <router-link
            to="/record"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            <PlusIcon class="w-5 h-5 mr-2" />
            添加影视
          </router-link>
        </div>
      </div>

      <!-- 统计概览（口径：真实观看时间；电影/剧集分开统计月/年） -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up" style="animation-delay: 100ms;">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">统计概览</h2>
          <span class="text-xs text-gray-400">按真实观看时间统计</span>
        </div>

        <div v-if="loadingStats" class="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div v-for="i in 8" :key="`stat-sk-${i}`" class="stats-card stats-card-blue">
            <div class="stats-card-content gap-3">
              <Skeleton variant="circle" />
              <div class="flex-1 space-y-2">
                <Skeleton variant="line" width="60%" />
                <Skeleton variant="line" width="40%" height="18px" />
              </div>
            </div>
          </div>
        </div>

        <EmptyState
          v-else-if="statsError"
          tone="danger"
          title="统计数据没能加载出来"
          :description="statsError"
          action-label="重试"
          @action="loadStatistics"
        />

        <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div class="stats-card stats-card-blue">
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><FilmIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">电影总数</p><p class="stats-card-value">{{ animatedMovieTotal }}</p></div>
            </div>
          </div>

          <div class="stats-card stats-card-teal">
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><TrendingUpIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">剧集总数</p><p class="stats-card-value">{{ animatedTvTotal }}</p></div>
            </div>
          </div>

          <div class="stats-card stats-card-yellow">
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><StarIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">平均评分</p><p class="stats-card-value">{{ averageRatingDisplay }}</p></div>
            </div>
          </div>

          <div class="stats-card stats-card-purple">
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><ClockIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">累计观看</p><p class="stats-card-value">{{ animatedWatchMinutes }}</p></div>
            </div>
          </div>

          <div
            class="stats-card stats-card-indigo stats-card-clickable"
            role="button"
            tabindex="0"
            title="查看本月观看的电影"
            @click="navigateToLibrary('this-month', 'movie')"
            @keydown.enter="navigateToLibrary('this-month', 'movie')"
            @keydown.space.prevent="navigateToLibrary('this-month', 'movie')"
          >
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><CalendarIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">本月电影</p><p class="stats-card-value">{{ animatedMonthMovie }}</p></div>
            </div>
          </div>

          <div
            class="stats-card stats-card-green stats-card-clickable"
            role="button"
            tabindex="0"
            title="查看本月观看的剧集"
            @click="navigateToLibrary('this-month', 'tv')"
            @keydown.enter="navigateToLibrary('this-month', 'tv')"
            @keydown.space.prevent="navigateToLibrary('this-month', 'tv')"
          >
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><CheckCircleIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">本月剧集</p><p class="stats-card-value">{{ animatedMonthTv }}</p></div>
            </div>
          </div>

          <div
            class="stats-card stats-card-pink stats-card-clickable"
            role="button"
            tabindex="0"
            title="查看本年观看的电影"
            @click="navigateToLibrary('this-year', 'movie')"
            @keydown.enter="navigateToLibrary('this-year', 'movie')"
            @keydown.space.prevent="navigateToLibrary('this-year', 'movie')"
          >
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><TrendingUpIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">本年电影</p><p class="stats-card-value">{{ animatedYearMovie }}</p></div>
            </div>
          </div>

          <div
            class="stats-card stats-card-orange stats-card-clickable"
            role="button"
            tabindex="0"
            title="查看本年观看的剧集"
            @click="navigateToLibrary('this-year', 'tv')"
            @keydown.enter="navigateToLibrary('this-year', 'tv')"
            @keydown.space.prevent="navigateToLibrary('this-year', 'tv')"
          >
            <div class="stats-card-content">
              <div class="stats-card-icon-wrap"><CalendarIcon class="stats-card-icon" /></div>
              <div><p class="stats-card-label">本年剧集</p><p class="stats-card-value">{{ animatedYearTv }}</p></div>
            </div>
          </div>
        </div>

        <!-- 详细统计：近 12 个月趋势 + 分布 -->
        <div v-if="!loadingStats && !statsError" class="mt-6 pt-6 border-t border-gray-100">
          <h3 class="text-base font-semibold text-gray-800 mb-4">近 12 个月观看趋势</h3>
          <div class="trend-chart">
            <div v-for="point in detailedStats.monthly_trend" :key="point.month" class="trend-col">
              <div class="trend-bars">
                <div class="trend-bar trend-bar-movie" :style="{ height: trendHeight(point.movie_count) }" :title="`${point.month} 电影 ${point.movie_count}`"></div>
                <div class="trend-bar trend-bar-tv" :style="{ height: trendHeight(point.tv_count) }" :title="`${point.month} 剧集 ${point.tv_count}`"></div>
              </div>
              <span class="trend-label">{{ point.month.slice(5) }}月</span>
            </div>
          </div>
          <div class="flex items-center gap-5 mt-4 text-xs text-gray-500">
            <span class="flex items-center gap-1.5"><i class="trend-legend-dot trend-bar-movie"></i>电影</span>
            <span class="flex items-center gap-1.5"><i class="trend-legend-dot trend-bar-tv"></i>剧集</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div>
              <p class="text-sm font-medium text-gray-700 mb-2">电影类型分布</p>
              <p class="text-xs text-gray-500 leading-relaxed">{{ formatDistribution(detailedStats.movie_genre_distribution) }}</p>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-700 mb-2">剧集类型分布</p>
              <p class="text-xs text-gray-500 leading-relaxed">{{ formatDistribution(detailedStats.tv_genre_distribution) }}</p>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-700 mb-2">状态分布</p>
              <p class="text-xs text-gray-500 leading-relaxed">{{ formatStatusDistribution(detailedStats.status_distribution) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 观影待办 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up" style="animation-delay: 125ms;">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">观影待办</h2>
            <p class="text-gray-500 text-sm mt-1">接下来看什么；新集播出日程见下方「更新提醒」</p>
          </div>
          <router-link
            to="/library"
            class="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            打开影视库
          </router-link>
        </div>

        <div
          v-if="loadingWatching"
          class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
        >
          <div v-for="i in 3" :key="`todo-sk-${i}`" class="todo-card-skeleton">
            <Skeleton variant="line" width="35%" height="14px" />
            <Skeleton variant="line" width="80%" height="16px" />
            <Skeleton variant="line" width="50%" />
            <Skeleton variant="line" width="65%" />
          </div>
        </div>

        <EmptyState
          v-else-if="actionItems.length === 0"
          tone="info"
          title="现在没有待办"
          description="还没有在追的剧集。新集播出日程看下方「更新提醒」。"
          hint="也可以从命令面板（⌘K）直接打开任意作品"
        />

        <div v-else class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          <button
            v-for="item in visibleActionItems"
            :key="`${item.type}-${item.movieId}`"
            type="button"
            class="todo-card text-left"
            @click="navigateToDetail(item.movieId)"
          >
            <div class="todo-card-header">
              <span class="todo-card-tag" :class="`todo-card-tag-${item.type}`">{{ getActionTypeLabel(item.type) }}</span>
              <span class="todo-card-link">{{ item.actionLabel }}</span>
            </div>
            <div class="todo-card-title">{{ item.title }}</div>
            <div class="todo-card-subtitle">{{ item.subtitle }}</div>
            <div class="todo-card-reason">{{ item.reason }}</div>
          </button>
        </div>

        <div v-if="actionItems.length > TODO_PREVIEW_LIMIT" class="mt-4 flex justify-center">
          <button
            type="button"
            class="text-sm font-medium text-blue-600 hover:text-blue-700"
            @click="showAllTodos = !showAllTodos"
          >
            {{ showAllTodos ? '收起' : `展开全部 ${actionItems.length} 项` }}
          </button>
        </div>
      </div>

      <!-- 更新提醒 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up" style="animation-delay: 150ms;">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center space-x-3">
            <div class="p-2 rounded-full bg-blue-50 text-blue-600">
              <BellRingIcon class="w-5 h-5" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-gray-900">更新提醒</h2>
              <p class="text-gray-500 text-sm">
                {{ reminderRange >= 90 ? '全部' : `未来 ${reminderRange} 天` }}的播出 · 同一部剧只占一项
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
          <button
            class="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors duration-200"
            @click="openAddReminder"
          >
            <PlusIcon class="w-4 h-4 mr-1.5" />
            添加提醒
          </button>
          <div class="reminder-range" role="group" aria-label="提醒查看范围">
            <button
              v-for="option in reminderRangeOptions"
              :key="`range-${option.value}`"
              type="button"
              class="reminder-range-button"
              :class="{ 'reminder-range-button-active': reminderRange === option.value }"
              :aria-pressed="reminderRange === option.value"
              @click="setReminderRange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <button
            class="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors duration-200 disabled:opacity-60"
            @click="handleRefreshReminders"
            :disabled="loadingReminders"
          >
            <svg v-if="loadingReminders" class="animate-spin h-4 w-4 mr-2 text-blue-600" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h4z"></path>
            </svg>
            <span>{{ loadingReminders ? '刷新中...' : '刷新提醒' }}</span>
          </button>
          </div>
        </div>

        <div
          v-if="loadingReminders"
          class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]"
        >
          <div v-for="i in 4" :key="`rm-sk-${i}`" class="update-reminder-skeleton">
            <Skeleton variant="block" width="64px" height="96px" />
            <div class="flex-1 space-y-2">
              <Skeleton variant="line" width="70%" height="14px" />
              <Skeleton variant="line" width="40%" />
              <Skeleton variant="line" width="55%" />
            </div>
          </div>
        </div>

        <EmptyState
          v-else-if="reminderError"
          tone="danger"
          title="提醒没能加载出来"
          :description="reminderError"
          action-label="重试"
          :action-icon="RefreshCcwIcon"
          @action="refreshReminders"
        />

        <div
          v-else-if="reminderGroups.length === 0 && reminderBeyondRange > 0"
          class="reminder-empty-range"
        >
          <p class="font-medium text-gray-700">当前 {{ reminderRange >= 90 ? '全部' : `未来 ${reminderRange} 天` }}没有要更新的</p>
          <p class="text-sm text-gray-500 mt-1">
            另有 {{ reminderBeyondRange }} 条手动提醒在更远处，切到「全部」可以查看。
          </p>
        </div>

        <EmptyState
          v-else-if="reminderGroups.length === 0"
          tone="info"
          :icon="BellRingIcon"
          title="近期没有即将更新的剧集"
          description="加几部在追的剧集，影迹会自动整理播出表；TMDb 上没有的，也可以手动添加。"
          action-label="手动添加提醒"
          :action-icon="PlusIcon"
          hint="今天有新集时会通过桌面通知提醒你（需要授予通知权限）"
          @action="openAddReminder"
        />

        <div v-else class="space-y-6">
          <!-- 未来：每天一列，四天一组横向排；同一天多部在列内往下叠 -->
          <div
            v-for="(chunk, chunkIndex) in upcomingChunks"
            :key="`chunk-${chunkIndex}`"
            class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-6 items-start"
          >
            <div v-for="group in chunk" :key="group.date" class="reminder-day-column">
              <div class="reminder-day-head">
                <CalendarIcon class="w-4 h-4 text-blue-500" />
                <span>{{ formatReminderDate(group.date) }}</span>
              </div>
              <div class="space-y-3">
                <ReminderCard
                  v-for="item in group.items"
                  :key="`${item.movie_id}-${item.air_date}-${item.episode_number ?? 'na'}`"
                  :item="item"
                  @open="handleReminderClick(item)"
                  @edit="openEditReminder(item)"
                  @remove="askRemoveReminder(item)"
                />
              </div>
            </div>
          </div>

          <p v-if="reminderBeyondRange > 0" class="reminder-beyond-hint">
            另有 {{ reminderBeyondRange }} 条手动提醒在当前范围之外，切到「全部」可以查看
          </p>

          <!-- 已播出：默认折叠，只保留最近一周，可一键清空 -->
          <div v-if="pastReminderItems.length > 0" class="reminder-past-section">
            <div class="reminder-past-head">
              <button type="button" class="reminder-past-toggle" @click="showPastReminders = !showPastReminders">
                <ChevronRightIcon
                  class="w-4 h-4 transition-transform duration-200"
                  :class="{ 'rotate-90': showPastReminders }"
                />
                <span>已播出 · {{ pastReminderItems.length }} 条</span>
                <span class="reminder-past-hint">保留最近 {{ PAST_KEEP_DAYS }} 天</span>
              </button>
              <button type="button" class="reminder-past-clear" @click="askClearPast">
                清空已播出
              </button>
            </div>
            <div v-if="showPastReminders" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
              <ReminderCard
                v-for="item in pastReminderItems"
                :key="`past-${item.movie_id}-${item.air_date}-${item.episode_number ?? 'na'}`"
                :item="item"
                @open="handleReminderClick(item)"
                @edit="openEditReminder(item)"
                @remove="askRemoveReminder(item)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 正在追剧 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up" style="animation-delay: 200ms;">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">正在追剧</h2>
        </div>
        
        <div
          v-if="loadingWatching"
          class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]"
        >
          <div v-for="i in 6" :key="`wt-sk-${i}`" class="space-y-2">
            <Skeleton variant="poster" />
            <Skeleton variant="line" width="80%" />
          </div>
        </div>

        <EmptyState
          v-else-if="watchingError"
          tone="danger"
          title="追剧数据没能加载出来"
          :description="watchingError"
          action-label="重试"
          @action="() => loadWatchingMovies()"
        />

        <EmptyState
          v-else-if="watchingMovies.length === 0"
          tone="info"
          :icon="FilmIcon"
          title="还没有在追的作品"
          description="挑一部开始，观看进度会自动显示在这里。"
          action-label="添加新作品"
          :action-icon="PlusIcon"
          hint="也可以按 ⌘/Ctrl+3 直接跳到添加记录页"
          @action="navigateToRecord"
        />
        
        <div v-else class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
          <div
            v-for="movie in watchingMovies"
            :key="movie.id"
            @click="navigateToDetail(movie.id)"
            class="group cursor-pointer"
          >
            <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-200 group-hover:shadow-lg transition-shadow duration-200">
              <CachedImage
                :src="getMovieImageURL(movie.poster_path)"
                :alt="movie.title"
                class-name="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                  <p class="text-white text-sm font-medium truncate">{{ movie.title }}</p>
                  <div v-if="movie.type === 'tv'" class="mt-1">
                    <p class="text-white text-xs">
                      {{ getTotalWatchedEpisodes(movie) }}/{{ movie.total_episodes || '?' }} 集
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近重刷记录 -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in-up" style="animation-delay: 300ms;">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">最近观看</h2>
          <router-link
            to="/history"
            class="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            查看全部
          </router-link>
        </div>
        
        <div
          v-if="loadingHistory"
          class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]"
        >
          <div v-for="i in 6" :key="`hist-sk-${i}`" class="space-y-2">
            <Skeleton variant="poster" />
            <Skeleton variant="line" width="80%" />
          </div>
        </div>

        <EmptyState
          v-else-if="historyError"
          tone="danger"
          title="最近观看没能加载出来"
          :description="historyError"
          action-label="重试"
          @action="loadReplayHistory"
        />

        <EmptyState
          v-else-if="recentHistory.length === 0"
          tone="info"
          :icon="ClockIcon"
          title="还没有最近观看记录"
          description="标记完成或重刷一部作品后，最近观看就会出现在这里。"
        />
        
        <div v-else class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
          <div
            v-for="movie in recentHistory"
            :key="movie.id"
            @click="navigateToDetail(movie.id)"
            class="group cursor-pointer"
          >
            <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-200 group-hover:shadow-lg transition-shadow duration-200">
              <CachedImage
                :src="getMovieImageURL(movie.poster_path)"
                :alt="movie.title"
                class-name="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                  <p class="text-white text-sm font-medium truncate">{{ movie.title }}</p>
                  <div class="flex items-center justify-between mt-1">
                    <span :class="getStatusBadgeClass(movie.status)" class="text-xs px-2 py-1 rounded">
                      {{ getStatusLabel(movie.status) }}
                    </span>
                    <div v-if="movie.personal_rating" class="flex items-center">
                      <StarIcon class="w-3 h-3 text-yellow-400 mr-1" />
                      <span class="text-white text-xs">{{ formatRating(movie.personal_rating) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>

    <ReminderEditModal
      :is-open="reminderModalOpen"
      :prefill="reminderPrefill"
      :movies="reminderMovieOptions"
      @close="reminderModalOpen = false"
      @saved="handleReminderSaved"
      @deleted="handleReminderDeleted"
      @library-added="handleLibraryAdded"
    />

    <Modal
      :is-open="Boolean(reminderPendingRemoval)"
      type="confirm"
      :title="reminderRemovalCopy.title"
      :message="reminderRemovalCopy.message"
      :confirm-text="reminderRemovalCopy.confirmText"
      show-cancel
      @close="reminderPendingRemoval = null"
      @cancel="reminderPendingRemoval = null"
      @confirm="confirmRemoveReminder"
    />

    <Modal
      :is-open="pastClearConfirmOpen"
      type="confirm"
      title="清空已播出的提醒？"
      :message="`会把列表里 ${pastReminderItems.length} 条已播出的手动提醒全部删掉，周期提醒的原点不受影响。`"
      confirm-text="清空"
      show-cancel
      @close="pastClearConfirmOpen = false"
      @cancel="pastClearConfirmOpen = false"
      @confirm="confirmClearPast"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatRating, getStatusLabel, getStatusBadgeClass } from '../utils/constants'
import { useCountUp } from '../composables/useCountUp'
import { APP_CONFIG } from '../../config/app.config'
import {
  Plus as PlusIcon,
  Film as FilmIcon,
  CheckCircle as CheckCircleIcon,
  Star as StarIcon,
  Calendar as CalendarIcon,
  TrendingUp as TrendingUpIcon,
  Clock as ClockIcon,
  BellRing as BellRingIcon,
  RefreshCcw as RefreshCcwIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-vue-next'
import Skeleton from '../components/common/Skeleton.vue'
import EmptyState from '../components/common/EmptyState.vue'
import CachedImage from '../components/ui/CachedImage.vue'
import Modal from '../components/ui/Modal.vue'
import ReminderEditModal from '../components/ReminderEditModal.vue'
import ReminderCard from '../components/ReminderCard.vue'
import { toast } from '../utils/toast'
import { tvReminderService } from '../services/reminder'
import type { TVEpisodeReminder, ReminderEditPrefill } from '../types'
import { useHomeData } from './Home/composables/useHomeData'

const router = useRouter()
const navigateToRecord = () => router.push('/record')

// 统计卡片跳转到影视库，并带上观看时间 + 类型筛选
const navigateToLibrary = (watchTime: 'this-month' | 'this-year', type: 'movie' | 'tv') => {
  router.push({
    name: 'Library',
    query: { watchTime, type }
  })
}

const {
  movieStore,
  loadingStats,
  loadingWatching,
  loadingHistory,
  loadingReminders,
  statsError,
  watchingError,
  historyError,
  reminderError,
  statistics,
  detailedStats,
  watchingMovies,
  recentHistory,
  reminderGroups,
  actionItems,
  getMovieImageURL,
  navigateToDetail,
  getTotalWatchedEpisodes,
  getRelativeDayLabel,
  formatReminderDate,
  loadStatistics,
  loadWatchingMovies,
  loadReplayHistory,
  loadUpdateReminders,
  refreshReminders,
  initializeData,
  reminderRange,
  reminderRangeOptions,
  reminderBeyondRange,
  reminderMovieOptions,
  loadReminderMovieOptions,
  setReminderRange
} = useHomeData()

// ==================== 更新提醒：手动增删改 ====================
const reminderModalOpen = ref(false)
const reminderPrefill = ref<ReminderEditPrefill | null>(null)
const reminderPendingRemoval = ref<TVEpisodeReminder | null>(null)

const openAddReminder = async () => {
  reminderPrefill.value = null
  await loadReminderMovieOptions()
  reminderModalOpen.value = true
}

// 周期提醒里按周期自动补出来的场次（不是用户当初填的那一集）
const isCycleOccurrence = (item: TVEpisodeReminder) =>
  item.source === 'manual' && (item.occurrence_sequence ?? 0) > 0

/** 已播出的手动提醒保留一周，和 service 里的清理阈值保持一致 */
const PAST_KEEP_DAYS = 7
const showPastReminders = ref(false)
const pastClearConfirmOpen = ref(false)

/** 未来的提醒：每个日期一组，四天凑成一行 */
const upcomingChunks = computed(() => {
  const groups = reminderGroups.value.filter(group => !group.items.every(item => item.is_past))
  const chunks: typeof groups[] = []
  for (let index = 0; index < groups.length; index += 4) {
    chunks.push(groups.slice(index, index + 4))
  }
  return chunks
})

/** 已播出：统一收进底部折叠区，按日期倒序，最近的在前 */
const pastReminderItems = computed(() =>
  reminderGroups.value
    .filter(group => group.items.every(item => item.is_past))
    .flatMap(group => group.items)
    .sort((left, right) => new Date(right.air_date).getTime() - new Date(left.air_date).getTime())
)

const reminderRemovalCopy = computed(() => {
  const item = reminderPendingRemoval.value
  if (!item) return { title: '', message: '', confirmText: '确定' }

  if (isCycleOccurrence(item)) {
    return {
      title: '跳过这一集？',
      message: '只跳过这一集，周期提醒里的其他集数还会照常出现。',
      confirmText: '跳过'
    }
  }

  if (item.source === 'manual') {
    const days = item.repeat_days ?? 0
    return days >= 1
      ? {
          title: '删除这条周期提醒？',
          message: `删掉后整条周期提醒都没了，按每 ${days} 天自动补出来的后续集数也会一起消失。`,
          confirmText: '删除'
        }
      : {
          title: '删除这条提醒？',
          message: '手动添加的提醒删掉就没了，之后不会再出现。',
          confirmText: '删除'
        }
  }

  return {
    title: '忽略这条提醒？',
    message: '忽略后这条自动提醒不会再出现，TMDb 数据变化也不会覆盖这个选择。',
    confirmText: '忽略'
  }
})

const openEditReminder = async (item: TVEpisodeReminder) => {
  // 自动补出来的场次用「原点」还原成用户填的那一集，免得把周期起点改到未来
  const base = item.cycle_base
  reminderPrefill.value = {
    entryId: item.entry_id,
    movieId: item.movie_id?.startsWith('manual-') ? null : item.movie_id,
    title: item.title,
    tmdbId: item.tmdb_id ?? null,
    posterPath: item.poster_path ?? null,
    airDate: base?.air_date ?? item.air_date,
    season: base ? base.season_number ?? null : item.season_number ?? null,
    episode: base ? base.episode_number ?? null : item.episode_number ?? null,
    episodeName: base ? base.episode_name ?? null : item.episode_name ?? null,
    repeatDays: item.repeat_days ?? 0,
    mediaType: item.media_type ?? null,
    totalEpisodes: item.total_episodes ?? null,
    airWeekdays: item.air_weekdays ?? null,
    notes: item.notes ?? null
  }
  await loadReminderMovieOptions()
  reminderModalOpen.value = true
}

// 手动条目变了，不用重新联网，复用已缓存的 TMDb 详情即可
const reloadReminderList = () => loadUpdateReminders(watchingMovies.value)

const handleReminderSaved = async (message: string) => {
  reminderModalOpen.value = false
  toast.success(message)
  await reloadReminderList()
}

const handleReminderDeleted = async () => {
  reminderModalOpen.value = false
  toast.success('提醒已删除')
  await reloadReminderList()
}

/** 弹窗里顺手往影视库加了一条，统计和「正在追剧」的候选都要跟着更新 */
const handleLibraryAdded = async () => {
  await Promise.all([loadStatistics(), loadReminderMovieOptions(true)])
}

const askClearPast = () => {
  if (pastReminderItems.value.length === 0) return
  pastClearConfirmOpen.value = true
}

const confirmClearPast = async () => {
  const targets = [...pastReminderItems.value]
  pastClearConfirmOpen.value = false

  const result = await tvReminderService.clearPastReminders(targets)
  if (!result.success) {
    toast.error(result.error || '清空失败，请重试')
    return
  }

  toast.success(`已清空 ${result.data ?? targets.length} 条已播出的提醒`)
  await reloadReminderList()
}

const askRemoveReminder = (item: TVEpisodeReminder) => {
  reminderPendingRemoval.value = item
}

const confirmRemoveReminder = async () => {
  const target = reminderPendingRemoval.value
  if (!target) return

  const result = await tvReminderService.dismissReminder(target)
  reminderPendingRemoval.value = null

  if (!result.success) {
    toast.error(result.error || '操作失败，请重试')
    return
  }

  toast.success(
    isCycleOccurrence(target)
      ? '已跳过这一集'
      : target.source === 'manual'
        ? '提醒已删除'
        : '已忽略这条提醒'
  )
  await reloadReminderList()
}

const handleReminderClick = (item: TVEpisodeReminder) => {
  // 没关联本地作品的手动提醒没有详情页，点开就是编辑
  if (item.movie_id?.startsWith('manual-')) {
    if (item.source === 'manual') void openEditReminder(item)
    return
  }

  navigateToDetail(item.movie_id)
}

// 刷新提醒：确实联网后才给反馈，避免「点了没反应」的错觉
const handleRefreshReminders = async () => {
  await refreshReminders()
  const total = reminderGroups.value.reduce((sum, group) => sum + group.items.length, 0)
  if (reminderError.value) {
    toast.error(reminderError.value)
    return
  }
  toast.success(
    total > 0
      ? `已刷新，未来 ${reminderRange.value} 天共 ${total} 条更新`
      : `已刷新，未来 ${reminderRange.value} 天暂无更新`
  )
}

// 统计卡数字增长动画：8 张卡 40ms 错峰，800ms ease-out
const animatedMovieTotal = useCountUp(
  computed(() => statistics.value.total_movie_count ?? 0),
  { duration: 800, delay: 0 }
)
const animatedTvTotal = useCountUp(
  computed(() => statistics.value.total_tv_count ?? 0),
  { duration: 800, delay: 40 }
)
// 平均评分：原始数值在 0-10 区间，显示时除以 2（→0-5）保留 1 位小数
const animatedAverageRating = useCountUp(
  computed(() => {
    const raw = statistics.value.average_rating ?? 0
    return raw > 0 ? raw / 2 : 0
  }),
  { duration: 800, delay: 80, decimals: 1 }
)
const averageRatingDisplay = computed(() =>
  animatedAverageRating.value > 0 ? formatRating(animatedAverageRating.value) : '0.0'
)
const animatedWatchMinutes = useCountUp(
  computed(() => statistics.value.total_watch_minutes ?? 0),
  { duration: 800, delay: 120 }
)
const animatedMonthMovie = useCountUp(
  computed(() => statistics.value.movies_this_month_movie ?? 0),
  { duration: 800, delay: 160 }
)
const animatedMonthTv = useCountUp(
  computed(() => statistics.value.movies_this_month_tv ?? 0),
  { duration: 800, delay: 200 }
)
const animatedYearMovie = useCountUp(
  computed(() => statistics.value.movies_this_year_movie ?? 0),
  { duration: 800, delay: 240 }
)
const animatedYearTv = useCountUp(
  computed(() => statistics.value.movies_this_year_tv ?? 0),
  { duration: 800, delay: 280 }
)

// 趋势柱高：以当月最大值为基准缩放到 76px，全 0 时给一个最小高度避免不可见
const trendHeight = (count: number): string => {
  const max = Math.max(
    1,
    ...detailedStats.value.monthly_trend.flatMap(p => [p.movie_count, p.tv_count])
  )
  return `${Math.max(3, Math.round((count / max) * 76))}px`
}

const formatDistribution = (
  items: { name: string; count: number }[]
): string => {
  if (!items.length) return '暂无数据'
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1
  return items
    .slice(0, 3)
    .map(item => `${item.name} ${Math.round((item.count / total) * 100)}%`)
    .join(' · ')
}

const formatStatusDistribution = (
  items: { name: string; count: number; type: 'movie' | 'tv' }[]
): string => {
  if (!items.length) return '暂无数据'
  const labelMap: Record<string, string> = {
    watching: '在看', completed: '已看', planned: '想看', paused: '暂停', dropped: '弃坑'
  }
  return items
    .slice(0, 4)
    .map(item => `${item.type === 'movie' ? '影' : '剧'}·${labelMap[item.name] ?? item.name} ${item.count}`)
    .join(' · ')
}

const getActionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    continue: '继续追剧',
    resume: '恢复进度',
    'caught-up': '已追到最新',
    review: '待复核'
  }

  return labels[type] || '待处理'
}

// 待办卡片默认只露前 6 项，多的点「展开全部」
const TODO_PREVIEW_LIMIT = 6
const showAllTodos = ref(false)
const visibleActionItems = computed(() =>
  showAllTodos.value ? actionItems.value : actionItems.value.slice(0, TODO_PREVIEW_LIMIT)
)

onMounted(() => {
  // 延迟执行，确保组件完全挂载
  setTimeout(() => {
    initializeData();
  }, 100);
})
</script>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 页面进入动画 */
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out both;
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

/* 悬停效果 */
.group:hover .group-hover\:scale-105 {
  transform: scale(1.05);
}

/* 卡片悬停阴影 */
.group-hover\:shadow-lg:hover {
  box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.reminder-range {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 0.65rem;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.reminder-range-button {
  padding: 0.3rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: #64748b;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.reminder-range-button:hover {
  color: #1d4ed8;
}

.reminder-range-button-active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.reminder-day-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.reminder-day-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #334155;
}

.reminder-empty-range {
  padding: 1.5rem;
  border: 1px dashed rgba(226, 232, 240, 1);
  border-radius: 0.85rem;
  background: rgba(248, 250, 252, 0.7);
  text-align: center;
}

.reminder-beyond-hint {
  font-size: 0.78rem;
  color: #94a3b8;
  text-align: center;
  padding: 0.25rem 0;
}

.reminder-past-section {
  border-top: 1px dashed rgba(226, 232, 240, 1);
  padding-top: 1rem;
}

.reminder-past-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.reminder-past-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #64748b;
}

.reminder-past-toggle:hover {
  color: #1d4ed8;
}

.reminder-past-hint {
  font-size: 0.72rem;
  font-weight: 400;
  color: #94a3b8;
}

.reminder-past-clear {
  font-size: 0.75rem;
  color: #94a3b8;
}

.reminder-past-clear:hover {
  color: #dc2626;
}

.stats-card {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  padding: 1rem;
  color: #fff;
  box-shadow: 0 14px 32px -22px rgba(15, 23, 42, 0.8);
  transition:
    transform 220ms ease,
    box-shadow 220ms ease,
    filter 220ms ease;
}

.stats-card::before {
  content: '';
  position: absolute;
  inset: auto -25% -65% auto;
  width: 8rem;
  height: 8rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.18);
  filter: blur(6px);
  transition:
    transform 220ms ease,
    opacity 220ms ease;
}

.stats-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 45%);
  opacity: 0;
  transition: opacity 220ms ease;
}

.stats-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 22px 40px -24px rgba(15, 23, 42, 0.65);
  filter: saturate(1.06);
}

.stats-card:hover::before {
  transform: scale(1.18);
}

.stats-card:hover::after {
  opacity: 1;
}

/* 可点击统计卡（本月/本年电影/剧集）：跳转到影视库对应筛选 */
.stats-card-clickable {
  cursor: pointer;
}

.stats-card-clickable:focus-visible {
  outline: 3px solid rgba(59, 130, 246, 0.7);
  outline-offset: 2px;
}

.stats-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
}

.stats-card-icon-wrap {
  display: inline-flex;
  margin-right: 0.75rem;
  border-radius: 9999px;
  padding: 0.7rem;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
  transition:
    transform 220ms ease,
    background-color 220ms ease,
    box-shadow 220ms ease;
}

.stats-card:hover .stats-card-icon-wrap {
  transform: scale(1.14) rotate(-4deg);
  background: rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 24px -16px rgba(255, 255, 255, 0.9);
}

.stats-card-icon {
  width: 2rem;
  height: 2rem;
  transition: transform 220ms ease;
}

.stats-card:hover .stats-card-icon {
  transform: scale(1.1);
}

.stats-card-label {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.82);
}

.stats-card-value {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  transition: transform 220ms ease;
}

.stats-card:hover .stats-card-value {
  transform: translateY(-1px);
}

.stats-card-blue {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.stats-card-green {
  background: linear-gradient(135deg, #16a34a, #15803d);
}

.stats-card-yellow {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.stats-card-indigo {
  background: linear-gradient(135deg, #6366f1, #4338ca);
}

.stats-card-pink {
  background: linear-gradient(135deg, #ec4899, #db2777);
}

.stats-card-teal {
  background: linear-gradient(135deg, #0d9488, #0f766e);
}

.stats-card-purple {
  background: linear-gradient(135deg, #9333ea, #7e22ce);
}

.stats-card-orange {
  background: linear-gradient(135deg, #f97316, #ea580c);
}

.todo-card {
  position: relative;
  overflow: hidden;
  border-radius: 1.25rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background:
    radial-gradient(circle at top right, rgba(191, 219, 254, 0.3), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  padding: 1rem;
  transition:
    transform 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease;
}

.todo-card:hover {
  transform: translateY(-4px);
  border-color: rgba(96, 165, 250, 0.55);
  box-shadow: 0 18px 34px -24px rgba(15, 23, 42, 0.45);
}

.todo-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.85rem;
  gap: 0.75rem;
}

.todo-card-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.todo-card-tag-continue {
  background: rgba(219, 234, 254, 0.95);
  color: #1d4ed8;
}

.todo-card-tag-resume {
  background: rgba(254, 240, 138, 0.95);
  color: #a16207;
}

.todo-card-tag-caught-up {
  background: rgba(226, 232, 240, 0.95);
  color: #475569;
}


.todo-card-link {
  font-size: 0.78rem;
  font-weight: 600;
  color: #2563eb;
}

.todo-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.todo-card-subtitle {
  margin-top: 0.35rem;
  font-size: 0.88rem;
  color: #1d4ed8;
}

.todo-card-reason {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #64748b;
}

/* —— 骨架占位 —— */
.todo-card-skeleton {
  border-radius: 1.25rem;
  border: 1px solid rgba(226, 232, 240, 0.7);
  background: rgba(255, 255, 255, 0.7);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.update-reminder-skeleton {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.7rem;
  border: 1px solid rgba(243, 244, 246, 1);
  border-radius: 0.85rem;
  background: rgba(249, 250, 251, 0.6);
}

/* 近 12 个月观看趋势 */
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 100px;
  padding: 6px 2px 0;
  border-bottom: 1px solid rgba(229, 231, 235, 0.9);
}

.trend-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 76px;
}

.trend-bar {
  width: 9px;
  border-radius: 3px 3px 0 0;
  transition: filter 180ms ease;
}

.trend-bar:hover {
  filter: brightness(1.08);
}

.trend-bar-movie {
  background: linear-gradient(180deg, #60a5fa, #2563eb);
}

.trend-bar-tv {
  background: linear-gradient(180deg, #5eead4, #0d9488);
}

.trend-label {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}

.trend-legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}
</style>
