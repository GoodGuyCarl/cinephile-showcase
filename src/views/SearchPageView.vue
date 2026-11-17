<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-vue-next'
import { tmdbProxyGet } from '@/lib/api/tmdbClient'

interface SearchMovie {
    id: number
    title: string
    poster_path: string | null
    backdrop_path: string | null
    release_date: string
    original_language?: string
    vote_average: number
    overview: string
}

interface SearchTV {
    id: number
    name: string
    poster_path: string | null
    backdrop_path: string | null
    first_air_date: string
    original_language?: string
    vote_average: number
    overview: string
}

type SearchItem = (SearchMovie | SearchTV) & {
    mediaType: 'movie' | 'tv'
    label: string
    releaseDate: string
}

const route = useRoute()
const router = useRouter()

const query = computed(() => (route.query.q as string) || '')
const searchResults = ref<SearchItem[]>([])
const isLoading = ref(false)
const error = ref('')
const currentPage = ref(1)
const totalPages = ref(0)
const totalResults = ref(0)

type MediaTypeFilter = 'all' | 'movie' | 'tv'

const filters = ref({
    mediaType: 'all' as MediaTypeFilter,
    year: '',
    language: 'all',
    minRating: 0,
})

let searchController: AbortController | null = null
const isSyncingFromRoute = ref(false)

const hasNoResults = computed(
    () => !isLoading.value && filteredResults.value.length === 0,
)
const showPagination = computed(() => totalPages.value > 1)
const isPrevDisabled = computed(() => isLoading.value || currentPage.value <= 1)
const isNextDisabled = computed(
    () => isLoading.value || currentPage.value >= totalPages.value,
)

const languageOptions = computed(() => {
    const uniqueLanguages = new Set<string>()

    for (const item of searchResults.value) {
        const language = item.original_language
        if (language) {
            uniqueLanguages.add(language)
        }
    }

    return ['all', ...Array.from(uniqueLanguages).sort()]
})

const filteredResults = computed(() => {
    return searchResults.value.filter((item) => {
        const matchesMediaType =
            filters.value.mediaType === 'all' ||
            item.mediaType === filters.value.mediaType

        const matchesYear =
            filters.value.year.length < 4 ||
            (item.releaseDate ?? '').slice(0, 4) === filters.value.year

        const itemLanguage = item.original_language ?? ''
        const matchesLanguage =
            filters.value.language === 'all' ||
            itemLanguage === filters.value.language

        const matchesRating =
            (item.vote_average ?? 0) >= Number(filters.value.minRating)

        return (
            matchesMediaType && matchesYear && matchesLanguage && matchesRating
        )
    })
})

const activeFiltersCount = computed(() => {
    let count = 0

    if (filters.value.mediaType !== 'all') count += 1
    if (filters.value.year.trim()) count += 1
    if (filters.value.language !== 'all') count += 1
    if (Number(filters.value.minRating) > 0) count += 1

    return count
})

const parsePositiveInt = (value: unknown, fallback: number) => {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const sanitizeYear = (value: unknown) => {
    return String(value ?? '')
        .replace(/\D/g, '')
        .slice(0, 4)
}

const clampRating = (value: unknown) => {
    const parsed = Number.parseFloat(String(value ?? '0'))
    if (!Number.isFinite(parsed)) return 0
    return Math.min(Math.max(parsed, 0), 10)
}

const syncStateFromRoute = () => {
    isSyncingFromRoute.value = true

    currentPage.value = parsePositiveInt(route.query.page, 1)

    const mediaType = route.query.type
    filters.value.mediaType =
        mediaType === 'movie' || mediaType === 'tv' ? mediaType : 'all'

    filters.value.year = sanitizeYear(route.query.year)
    filters.value.language =
        typeof route.query.language === 'string' && route.query.language.trim()
            ? route.query.language.trim()
            : 'all'
    filters.value.minRating = clampRating(route.query.rating)

    isSyncingFromRoute.value = false
}

const updateRouteQuery = (
    overrides: Record<string, string | undefined> = {},
) => {
    const nextQuery: Record<string, string> = {}

    if (query.value.trim()) {
        nextQuery.q = query.value.trim()
    }

    if (currentPage.value > 1) {
        nextQuery.page = String(currentPage.value)
    }

    if (filters.value.mediaType !== 'all') {
        nextQuery.type = filters.value.mediaType
    }

    if (filters.value.year.trim()) {
        nextQuery.year = filters.value.year.trim()
    }

    if (filters.value.language !== 'all') {
        nextQuery.language = filters.value.language
    }

    if (Number(filters.value.minRating) > 0) {
        nextQuery.rating = String(filters.value.minRating)
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === '') {
            delete nextQuery[key]
        } else {
            nextQuery[key] = value
        }
    }

    router.replace({ query: nextQuery })
}

const performSearch = async (searchQuery: string, page: number = 1) => {
    if (!searchQuery.trim()) {
        searchResults.value = []
        totalPages.value = 0
        totalResults.value = 0
        return
    }

    searchController?.abort()
    searchController = new AbortController()

    isLoading.value = true
    error.value = ''

    try {
        const filterParams = new URLSearchParams({
            q: searchQuery,
            page: String(page),
        })

        if (filters.value.year.trim()) {
            filterParams.set('year', filters.value.year.trim())
        }

        if (filters.value.language !== 'all') {
            filterParams.set('language', filters.value.language)
        }

        if (Number(filters.value.minRating) > 0) {
            filterParams.set('rating', String(filters.value.minRating))
        }

        const moviePromise =
            filters.value.mediaType === 'tv'
                ? Promise.resolve({
                      results: [],
                      total_results: 0,
                      total_pages: 0,
                  })
                : tmdbProxyGet<{
                      results?: SearchMovie[]
                      total_results?: number
                      total_pages?: number
                  }>(
                      `/search/results?${filterParams.toString()}`,
                      searchController.signal,
                  )

        const tvPromise =
            filters.value.mediaType === 'movie'
                ? Promise.resolve({
                      results: [],
                      total_results: 0,
                      total_pages: 0,
                  })
                : tmdbProxyGet<{
                      results?: SearchTV[]
                      total_results?: number
                      total_pages?: number
                  }>(
                      `/tv/search/results?${filterParams.toString()}`,
                      searchController.signal,
                  )

        const [movieData, tvData] = await Promise.all([moviePromise, tvPromise])

        const movieResults: SearchItem[] = (movieData.results ?? []).map(
            (movie) => ({
                ...movie,
                mediaType: 'movie' as const,
                label: movie.title,
                releaseDate: movie.release_date,
            }),
        )

        const tvResults: SearchItem[] = (tvData.results ?? []).map((show) => ({
            ...show,
            mediaType: 'tv' as const,
            label: show.name,
            releaseDate: show.first_air_date,
        }))

        const combined = [...movieResults, ...tvResults]
            .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
            .slice(0, 20)

        searchResults.value = combined
        totalResults.value =
            (movieData.total_results ?? 0) + (tvData.total_results ?? 0)
        totalPages.value = Math.ceil(totalResults.value / 20)
        currentPage.value = page
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            return
        }

        searchResults.value = []
        error.value = 'Failed to fetch search results. Please try again.'
    } finally {
        isLoading.value = false
    }
}

const getItemPath = (item: SearchItem) => {
    return item.mediaType === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`
}

const formatReleaseYear = (date: string) => {
    if (!date) return 'TBA'
    return date.slice(0, 4)
}

const getRatingColor = (rating: number) => {
    if (rating >= 8) return 'text-green-400'
    if (rating >= 6) return 'text-amber-400'
    if (rating >= 4) return 'text-orange-400'
    return 'text-red-400'
}

const goToPage = (page: number) => {
    if (isLoading.value || totalPages.value < 1) {
        return
    }

    const safePage = Math.min(Math.max(page, 1), totalPages.value)
    if (safePage === currentPage.value) {
        return
    }

    currentPage.value = safePage
    updateRouteQuery()
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

const goBack = () => {
    router.back()
}

const resetFilters = () => {
    filters.value.mediaType = 'all'
    filters.value.year = ''
    filters.value.language = 'all'
    filters.value.minRating = 0
    currentPage.value = 1
    updateRouteQuery({ page: undefined })
}

const getRouteSearchSignature = (queryParams: Record<string, unknown>) => {
    return JSON.stringify({
        q: typeof queryParams.q === 'string' ? queryParams.q.trim() : '',
        page: parsePositiveInt(queryParams.page, 1),
        type:
            queryParams.type === 'movie' || queryParams.type === 'tv'
                ? queryParams.type
                : 'all',
        year: sanitizeYear(queryParams.year),
        language:
            typeof queryParams.language === 'string'
                ? queryParams.language.trim()
                : 'all',
        rating: clampRating(queryParams.rating),
    })
}

watch(
    filters,
    () => {
        if (isSyncingFromRoute.value) {
            return
        }

        currentPage.value = 1
        updateRouteQuery({ page: undefined })
    },
    { deep: true },
)

watch(
    () => route.query,
    (newQuery, previousQuery) => {
        syncStateFromRoute()

        const incomingQuery = typeof newQuery.q === 'string' ? newQuery.q : ''
        if (!incomingQuery.trim()) {
            searchResults.value = []
            totalPages.value = 0
            totalResults.value = 0
            return
        }

        const incomingPage = parsePositiveInt(newQuery.page, 1)
        const newSignature = getRouteSearchSignature(
            newQuery as Record<string, unknown>,
        )
        const previousSignature = getRouteSearchSignature(
            (previousQuery ?? {}) as Record<string, unknown>,
        )

        if (newSignature !== previousSignature) {
            performSearch(incomingQuery, incomingPage)
        }
    },
    { immediate: true },
)

onMounted(() => {
    syncStateFromRoute()
})

onBeforeUnmount(() => {
    searchController?.abort()
})
</script>

<template>
    <div class="min-h-screen bg-neutral-950 pt-20 px-4 md:px-6 xl:px-8 pb-12">
        <div class="w-full max-w-screen-2xl mx-auto">
            <!-- Header -->
            <div class="flex items-center gap-4 mb-8">
                <button
                    type="button"
                    @click="goBack"
                    class="flex items-center justify-center h-10 w-10 rounded-lg border border-neutral-700/70 text-neutral-200 hover:text-amber-300 hover:border-amber-300/55 transition-colors"
                    aria-label="Go back"
                >
                    <ArrowLeft class="w-5 h-5" />
                </button>
                <h1
                    class="text-2xl md:text-3xl font-black text-neutral-100 truncate"
                >
                    Results for
                    <span class="text-amber-500">{{ query }}</span>
                </h1>
            </div>

            <!-- Loading State -->
            <div
                v-if="isLoading && searchResults.length === 0"
                class="flex items-center justify-center py-16"
            >
                <div class="flex flex-col items-center gap-4">
                    <Loader2 class="w-8 h-8 text-amber-500 animate-spin" />
                    <p class="text-neutral-400">Searching titles...</p>
                </div>
            </div>

            <!-- Error State -->
            <div
                v-else-if="error"
                class="flex items-center justify-center py-16"
            >
                <div class="flex flex-col items-center gap-4 text-center">
                    <AlertCircle class="w-8 h-8 text-red-400" />
                    <p class="text-neutral-300">{{ error }}</p>
                    <button
                        type="button"
                        @click="performSearch(query, 1)"
                        class="mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-neutral-950 font-semibold rounded-lg transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>

            <!-- No Results State -->
            <div
                v-else-if="hasNoResults"
                class="flex items-center justify-center py-16"
            >
                <div class="text-center">
                    <p class="text-neutral-400 mb-2">
                        No titles found matching
                    </p>
                    <p class="text-neutral-500">"{{ query }}"</p>
                </div>
            </div>

            <!-- Results Grid -->
            <div v-else>
                <!-- Filters -->
                <div
                    class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 md:p-5"
                >
                    <div class="flex items-center justify-between gap-3 mb-4">
                        <p class="text-sm font-semibold text-neutral-100">
                            Filters
                            <span
                                v-if="activeFiltersCount"
                                class="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300"
                            >
                                {{ activeFiltersCount }} active
                            </span>
                        </p>
                        <button
                            v-if="activeFiltersCount"
                            type="button"
                            @click="resetFilters"
                            class="text-xs font-semibold text-neutral-300 hover:text-amber-300 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>

                    <div
                        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
                    >
                        <label class="flex flex-col gap-1.5">
                            <span
                                class="text-xs text-neutral-400 uppercase tracking-wide"
                                >Media type</span
                            >
                            <select
                                v-model="filters.mediaType"
                                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                                <option value="all">All</option>
                                <option value="movie">Movies</option>
                                <option value="tv">TV</option>
                            </select>
                        </label>

                        <label class="flex flex-col gap-1.5">
                            <span
                                class="text-xs text-neutral-400 uppercase tracking-wide"
                                >Release year</span
                            >
                            <input
                                v-model="filters.year"
                                type="text"
                                inputmode="numeric"
                                maxlength="4"
                                placeholder="e.g. 2024"
                                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                        </label>

                        <label class="flex flex-col gap-1.5">
                            <span
                                class="text-xs text-neutral-400 uppercase tracking-wide"
                                >Language</span
                            >
                            <select
                                v-model="filters.language"
                                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                                <option value="all">All languages</option>
                                <option
                                    v-for="language in languageOptions.filter(
                                        (value) => value !== 'all',
                                    )"
                                    :key="language"
                                    :value="language"
                                >
                                    {{ language.toUpperCase() }}
                                </option>
                            </select>
                        </label>

                        <label class="flex flex-col gap-1.5">
                            <span
                                class="text-xs text-neutral-400 uppercase tracking-wide"
                                >Min rating</span
                            >
                            <select
                                v-model.number="filters.minRating"
                                class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                                <option :value="0">Any rating</option>
                                <option :value="5">5+</option>
                                <option :value="6">6+</option>
                                <option :value="7">7+</option>
                                <option :value="8">8+</option>
                                <option :value="9">9+</option>
                            </select>
                        </label>
                    </div>
                </div>

                <!-- Results Count -->
                <p class="text-sm text-neutral-400 mb-6">
                    Found {{ totalResults }} results (showing page
                    {{ currentPage }} of {{ totalPages }})
                    <span class="text-neutral-500">•</span>
                    Showing {{ filteredResults.length }} after filters
                </p>

                <!-- Grid -->
                <div
                    class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 mb-8"
                >
                    <RouterLink
                        v-for="item in filteredResults"
                        :key="`${item.mediaType}-${item.id}`"
                        :to="getItemPath(item)"
                        class="group"
                    >
                        <div
                            class="relative overflow-hidden rounded-lg bg-neutral-800 border border-neutral-700/50 group-hover:border-amber-500/30 transition-all duration-200 aspect-2/3 shrink-0"
                        >
                            <!-- Poster Image -->
                            <img
                                v-if="item.poster_path"
                                :src="`https://image.tmdb.org/t/p/w500${item.poster_path}`"
                                :alt="`${item.label} poster`"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                            />
                            <div
                                v-else
                                class="w-full h-full flex items-center justify-center bg-linear-to-br from-neutral-700 to-neutral-800"
                            >
                                <span
                                    class="text-xs text-neutral-500 text-center px-2"
                                    >No poster available</span
                                >
                            </div>

                            <!-- Overlay -->
                            <div
                                class="absolute inset-0 bg-linear-to-t from-neutral-950/90 via-neutral-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3"
                            >
                                <!-- Rating Badge -->
                                <div class="mb-2">
                                    <span
                                        :class="[
                                            'text-sm font-bold',
                                            getRatingColor(item.vote_average),
                                        ]"
                                    >
                                        ★ {{ item.vote_average.toFixed(1) }}
                                    </span>
                                </div>

                                <!-- Media Type & Year -->
                                <p class="text-[0.7rem] text-neutral-400">
                                    {{ item.mediaType.toUpperCase() }} •
                                    {{ formatReleaseYear(item.releaseDate) }}
                                </p>
                            </div>
                        </div>

                        <!-- Title -->
                        <h3
                            class="mt-2 text-sm font-semibold text-neutral-100 truncate group-hover:text-amber-300 transition-colors line-clamp-2"
                        >
                            {{ item.label }}
                        </h3>
                    </RouterLink>
                </div>

                <!-- Pagination -->
                <div
                    v-if="showPagination"
                    class="flex items-center justify-center gap-2 mt-12 flex-wrap"
                >
                    <button
                        type="button"
                        @click="goToPage(currentPage - 1)"
                        :disabled="isPrevDisabled"
                        class="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:border-neutral-800 disabled:text-neutral-600 transition-colors"
                    >
                        Previous
                    </button>

                    <div class="flex gap-1 flex-wrap justify-center">
                        <button
                            v-for="page in Math.min(5, totalPages)"
                            :key="page"
                            type="button"
                            @click="goToPage(page)"
                            :disabled="isLoading"
                            :class="[
                                'px-3 py-2 rounded-lg border transition-colors disabled:opacity-50',
                                currentPage === page
                                    ? 'bg-amber-600 border-amber-600 text-neutral-950 font-semibold'
                                    : 'border-neutral-700 text-neutral-300 hover:border-amber-500/50 hover:text-amber-400',
                            ]"
                        >
                            {{ page }}
                        </button>
                        <span
                            v-if="totalPages > 5"
                            class="px-2 py-2 text-neutral-500"
                            >...</span
                        >
                    </div>

                    <button
                        type="button"
                        @click="goToPage(currentPage + 1)"
                        :disabled="isNextDisabled"
                        class="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:border-neutral-800 disabled:text-neutral-600 transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
