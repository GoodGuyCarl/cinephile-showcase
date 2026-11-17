<script setup lang="ts">
import { Menu, Search, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { tmdbProxyGet } from '@/lib/api/tmdbClient'
import { Analytics } from '@vercel/analytics/vue'
import { SpeedInsights } from '@vercel/speed-insights/vue'

type SearchMovie = {
    id: number
    title: string
    release_date: string
    poster_path: string | null
}

type SearchTV = {
    id: number
    name: string
    first_air_date: string
    poster_path: string | null
}

type SearchResult = {
    id: number
    label: string
    date: string
    mediaType: 'movie' | 'tv'
    poster_path: string | null
}

const route = useRoute()
const router = useRouter()
const showNav = computed(() => !route.meta.hideNav)

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const isSearchLoading = ref(false)
const searchError = ref('')
const isMobileMenuOpen = ref(false)

const navItems = [
    { to: '/', label: 'Movies' },
    { to: '/shows', label: 'TV Shows' },
    { to: '/feedback', label: 'Feedback' },
]

let debounceId: ReturnType<typeof setTimeout> | null = null
let activeSearchController: AbortController | null = null

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)

const showSearchDropdown = computed(() => {
    if (!hasSearchQuery.value) {
        return false
    }

    return (
        isSearchLoading.value ||
        Boolean(searchError.value) ||
        searchResults.value.length > 0
    )
})

const formatReleaseYear = (releaseDate: string) => {
    if (!releaseDate) {
        return 'TBA'
    }

    return releaseDate.slice(0, 4)
}

const getSearchResultPath = (item: SearchResult) => {
    return item.mediaType === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`
}

const clearSearchTimer = () => {
    if (!debounceId) {
        return
    }

    clearTimeout(debounceId)
    debounceId = null
}

const performSearch = async (query: string) => {
    activeSearchController?.abort()
    activeSearchController = new AbortController()

    isSearchLoading.value = true
    searchError.value = ''

    try {
        const [movieData, tvData] = await Promise.all([
            tmdbProxyGet<{ results?: SearchMovie[] }>(
                `/search?q=${encodeURIComponent(query)}`,
                activeSearchController.signal,
            ),
            tmdbProxyGet<{ results?: SearchTV[] }>(
                `/tv/search?q=${encodeURIComponent(query)}`,
                activeSearchController.signal,
            ),
        ])

        const movieResults: SearchResult[] = (movieData.results ?? [])
            .slice(0, 3)
            .map((movie) => ({
                id: movie.id,
                label: movie.title,
                date: movie.release_date,
                mediaType: 'movie',
                poster_path: movie.poster_path || null,
            }))

        const tvResults: SearchResult[] = (tvData.results ?? [])
            .slice(0, 3)
            .map((show) => ({
                id: show.id,
                label: show.name,
                date: show.first_air_date,
                mediaType: 'tv',
                poster_path: show.poster_path || null,
            }))

        searchResults.value = [...movieResults, ...tvResults].slice(0, 6)
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return
        }

        searchResults.value = []
        searchError.value = 'Search is unavailable right now. Please try again.'
    } finally {
        isSearchLoading.value = false
    }
}

const resetSearch = () => {
    searchQuery.value = ''
    searchResults.value = []
    searchError.value = ''
    isSearchLoading.value = false
    activeSearchController?.abort()
    clearSearchTimer()
}

const toggleMobileMenu = () => {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const closeMobileMenu = () => {
    isMobileMenuOpen.value = false
}

const handleSearchSubmit = () => {
    const trimmed = searchQuery.value.trim()
    if (trimmed) {
        router.push({ name: 'search', query: { q: trimmed } })
        resetSearch()
        closeMobileMenu()
    }
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isMobileMenuOpen.value) {
        closeMobileMenu()
    }
}

watch(searchQuery, (value) => {
    const trimmed = value.trim()
    searchError.value = ''

    clearSearchTimer()
    activeSearchController?.abort()

    if (!trimmed) {
        searchResults.value = []
        isSearchLoading.value = false
        return
    }

    debounceId = setTimeout(() => {
        performSearch(trimmed)
    }, 500)
})

watch(
    () => route.path,
    () => {
        closeMobileMenu()
        const title = route.meta.title as string | undefined
        if (title) {
            document.title = title
        }
    },
    { immediate: true },
)

watch(isMobileMenuOpen, (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
})

if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown)
}

onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleGlobalKeydown)
    }

    document.body.style.overflow = ''
    clearSearchTimer()
    activeSearchController?.abort()
})
</script>

<template>
    <Analytics />
    <SpeedInsights />
    <nav
        v-if="showNav"
        class="fixed top-0 w-full z-50 bg-neutral-950/70 backdrop-blur-xl shadow-[0_0_32px_rgba(245,158,11,0.05)]"
    >
        <div
            class="flex justify-between items-center px-4 md:px-6 xl:px-8 py-3 md:py-4 w-full max-w-screen-2xl mx-auto gap-4"
        >
            <div class="flex items-center gap-5 md:gap-10 min-w-0">
                <RouterLink
                    to="/"
                    class="text-xl md:text-2xl font-black tracking-tighter text-amber-500 font-headline truncate"
                >
                    CINEPHILE</RouterLink
                >
                <div class="hidden md:flex items-center gap-8">
                    <RouterLink
                        v-for="item in navItems"
                        :key="item.to"
                        :to="item.to"
                        :active-class="`text-amber-500 font-bold border-b-2 border-amber-500 pb-1 font-body text-sm uppercase tracking-wider   `"
                        :class="`hover:text-neutral-100 transition-colors font-body text-sm uppercase tracking-wider`"
                    >
                        {{ item.label }}
                    </RouterLink>
                </div>
            </div>

            <div class="flex items-center gap-3 md:gap-4">
                <div class="relative group hidden md:block">
                    <input
                        v-model="searchQuery"
                        class="bg-surface-container-highest border-none rounded-full py-2.5 px-5 pl-11 text-sm text-on-surface-variant w-56 lg:w-64 focus:ring-1 focus:ring-primary transition-all"
                        placeholder="Search titles..."
                        type="text"
                        autocomplete="off"
                        aria-label="Search movie titles"
                        @keydown.enter="handleSearchSubmit"
                    />
                    <Search
                        class="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors"
                    />

                    <div
                        v-if="showSearchDropdown"
                        class="absolute top-[calc(100%+0.6rem)] left-0 right-0 z-60 rounded-xl border border-outline-variant/40 bg-neutral-950/95 backdrop-blur-lg p-2 shadow-2xl space-y-1"
                    >
                        <p
                            v-if="isSearchLoading"
                            class="px-3 py-2 text-xs text-neutral-300 uppercase tracking-wider"
                        >
                            Searching titles...
                        </p>

                        <p
                            v-else-if="searchError"
                            class="px-3 py-2 text-xs text-amber-200"
                        >
                            {{ searchError }}
                        </p>

                        <p
                            v-else-if="!searchResults.length"
                            class="px-3 py-2 text-xs text-neutral-300 uppercase tracking-wider"
                        >
                            No titles found
                        </p>

                        <RouterLink
                            v-for="item in searchResults"
                            :key="`desktop-${item.mediaType}-${item.id}`"
                            :to="getSearchResultPath(item)"
                            class="flex gap-3 px-2 py-2 rounded-lg hover:bg-neutral-900/60 transition-colors group cursor-pointer items-start"
                            @click="resetSearch"
                        >
                            <!-- Poster Image -->
                            <div
                                v-if="item.poster_path"
                                class="shrink-0 w-10 h-14 rounded-md overflow-hidden bg-neutral-800 border border-neutral-700/50 group-hover:border-amber-500/30 transition-colors"
                            >
                                <img
                                    :src="`https://image.tmdb.org/t/p/w92${item.poster_path}`"
                                    :alt="`${item.label} poster`"
                                    class="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <div
                                v-else
                                class="shrink-0 w-10 h-14 rounded-md bg-neutral-800 border border-neutral-700/50 flex items-center justify-center"
                            >
                                <span class="text-xs text-neutral-500"
                                    >No image</span
                                >
                            </div>

                            <!-- Text Content -->
                            <div class="flex-1 min-w-0">
                                <span
                                    class="block truncate text-sm text-on-surface group-hover:text-amber-300 transition-colors"
                                    >{{ item.label }}</span
                                >
                                <span class="text-[0.66rem] text-neutral-400"
                                    >{{ item.mediaType.toUpperCase() }} •
                                    {{ formatReleaseYear(item.date) }}</span
                                >
                            </div>
                        </RouterLink>
                    </div>
                </div>

                <button
                    type="button"
                    class="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-xl border border-neutral-700/70 text-neutral-200 hover:text-amber-300 hover:border-amber-300/55 transition-colors"
                    :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'"
                    :aria-expanded="isMobileMenuOpen"
                    aria-controls="mobile-nav-panel"
                    @click="toggleMobileMenu"
                >
                    <X v-if="isMobileMenuOpen" class="w-5 h-5" />
                    <Menu v-else class="w-5 h-5" />
                </button>
            </div>
        </div>

        <div
            id="mobile-nav-panel"
            class="md:hidden border-t border-neutral-800/80 overflow-hidden transition-all duration-250 ease-out"
            :class="
                isMobileMenuOpen
                    ? 'max-h-[80vh] opacity-100'
                    : 'max-h-0 opacity-0 pointer-events-none'
            "
        >
            <div
                class="px-4 py-4 space-y-4 bg-neutral-950/95 max-h-[75vh] overflow-y-auto"
            >
                <div class="relative">
                    <input
                        v-model="searchQuery"
                        class="w-full bg-surface-container-highest border-none rounded-xl py-3 px-4 pl-11 text-sm text-on-surface-variant focus:ring-1 focus:ring-primary transition-all"
                        placeholder="Search titles..."
                        type="text"
                        autocomplete="off"
                        aria-label="Search movie titles"
                        @keydown.enter="handleSearchSubmit"
                    />
                    <Search
                        class="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    />

                    <div
                        v-if="showSearchDropdown"
                        class="mt-2 rounded-xl border border-outline-variant/40 bg-neutral-950/95 p-2 shadow-2xl space-y-1"
                    >
                        <p
                            v-if="isSearchLoading"
                            class="px-3 py-2 text-xs text-neutral-300 uppercase tracking-wider"
                        >
                            Searching titles...
                        </p>

                        <p
                            v-else-if="searchError"
                            class="px-3 py-2 text-xs text-amber-200"
                        >
                            {{ searchError }}
                        </p>

                        <p
                            v-else-if="!searchResults.length"
                            class="px-3 py-2 text-xs text-neutral-300 uppercase tracking-wider"
                        >
                            No titles found
                        </p>

                        <RouterLink
                            v-for="item in searchResults"
                            :key="`mobile-${item.mediaType}-${item.id}`"
                            :to="getSearchResultPath(item)"
                            class="flex gap-3 px-2 py-2 rounded-lg hover:bg-neutral-900/60 transition-colors group cursor-pointer items-start"
                            @click="resetSearch"
                        >
                            <!-- Poster Image -->
                            <div
                                v-if="item.poster_path"
                                class="shrink-0 w-10 h-14 rounded-md overflow-hidden bg-neutral-800 border border-neutral-700/50 group-hover:border-amber-500/30 transition-colors"
                            >
                                <img
                                    :src="`https://image.tmdb.org/t/p/w92${item.poster_path}`"
                                    :alt="`${item.label} poster`"
                                    class="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <div
                                v-else
                                class="shrink-0 w-10 h-14 rounded-md bg-neutral-800 border border-neutral-700/50 flex items-center justify-center"
                            >
                                <span class="text-xs text-neutral-500"
                                    >No image</span
                                >
                            </div>

                            <!-- Text Content -->
                            <div class="flex-1 min-w-0">
                                <span
                                    class="block truncate text-sm text-on-surface group-hover:text-amber-300 transition-colors"
                                    >{{ item.label }}</span
                                >
                                <span class="text-[0.66rem] text-neutral-400"
                                    >{{ item.mediaType.toUpperCase() }} •
                                    {{ formatReleaseYear(item.date) }}</span
                                >
                            </div>
                        </RouterLink>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-2 pb-1">
                    <RouterLink
                        v-for="item in navItems"
                        :key="`mobile-${item.to}`"
                        :to="item.to"
                        class="mobile-nav-link"
                        @click="closeMobileMenu"
                    >
                        {{ item.label }}
                    </RouterLink>
                </div>
            </div>
        </div>
    </nav>
    <RouterView />
</template>
<style>
.material-symbols-outlined {
    font-variation-settings:
        'FILL' 0,
        'wght' 400,
        'GRAD' 0,
        'opsz' 24;
}
body {
    background-color: #0e0e0e;
    color: #ffffff;
    font-family: 'Be Vietnam Pro', sans-serif;
    overflow-x: hidden;
}
.hero-gradient {
    background: linear-gradient(
        to top,
        #0e0e0e 0%,
        transparent 40%,
        rgba(14, 14, 14, 0.4) 100%
    );
}
.editorial-mask {
    mask-image: linear-gradient(to right, black 85%, transparent 100%);
}
.search-result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-radius: 0.65rem;
    padding: 0.6rem 0.75rem;
    color: #f4f4f5;
    font-size: 0.82rem;
    letter-spacing: 0.01em;
    transition:
        background-color 180ms ease,
        color 180ms ease;
}
.search-result-item:hover {
    background: rgba(245, 158, 11, 0.14);
    color: #fde68a;
}
.search-result-item:focus-visible,
.mobile-nav-link:focus-visible,
nav button:focus-visible,
nav input:focus-visible,
nav a:focus-visible {
    outline: 2px solid rgba(253, 230, 138, 0.86);
    outline-offset: 2px;
}
.mobile-nav-link {
    min-height: 44px;
    display: flex;
    align-items: center;
    border-radius: 0.7rem;
    padding: 0.72rem 0.84rem;
    color: #f4f4f5;
    font-size: 0.78rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition:
        background-color 180ms ease,
        color 180ms ease;
}
.mobile-nav-link:hover,
.mobile-nav-link.router-link-active {
    background: rgba(245, 158, 11, 0.14);
    color: #fde68a;
}
::-webkit-scrollbar {
    width: 8px;
}
::-webkit-scrollbar-track {
    background: #0e0e0e;
}
::-webkit-scrollbar-thumb {
    background: #262626;
    border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
    background: #ffad3a;
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation: none !important;
        transition-duration: 0.01ms !important;
        transition-delay: 0ms !important;
        scroll-behavior: auto !important;
    }
}
</style>
