<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Movie } from '@/lib/types/Movie'
import { Info } from 'lucide-vue-next'
import { tmdbProxyGet } from '@/lib/api/tmdbClient'

type Genre = {
    id: number
    name: string
}

type TrendingMoviesResponse = {
    results?: Movie[]
}

type GenreResponse = {
    genres?: Genre[]
}

const FALLBACK_HERO_URL =
    'https://placehold.co/1920x1080/191919/e0e0e0?text=Trending+Movie'
const FALLBACK_POSTER_URL =
    'https://placehold.co/500x750/191919/e0e0e0?text=No+Poster'
const MAX_INITIAL_MOVIES = 8

let activeController: AbortController | null = null

const genres = ref<Genre[]>([])
const trendingMovies = ref<Movie[]>([])
const popularMovies = ref<Movie[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const showAllTrendingMovies = ref(false)
const showAllPopularMovies = ref(false)

const isEmpty = computed(
    () =>
        !isLoading.value &&
        !errorMessage.value &&
        trendingMovies.value.length === 0,
)

const displayedTrendingMovies = computed(() => {
    return showAllTrendingMovies.value
        ? trendingMovies.value
        : trendingMovies.value.slice(0, MAX_INITIAL_MOVIES)
})

const displayedPopularMovies = computed(() => {
    return showAllPopularMovies.value
        ? popularMovies.value
        : popularMovies.value.slice(0, MAX_INITIAL_MOVIES)
})

const featuredMovie = computed(() => trendingMovies.value[0] ?? null)

const featuredTitle = computed(() => {
    if (!featuredMovie.value) {
        return 'Trending Movies'
    }

    return movieTitleLabel(featuredMovie.value)
})

const featuredOverview = computed(() => {
    if (!featuredMovie.value?.overview?.trim()) {
        return 'Discover what movie fans are watching this week.'
    }

    return featuredMovie.value.overview
})

const featuredReleaseYear = computed(() => {
    if (!featuredMovie.value?.release_date) {
        return 'TBA'
    }

    return featuredMovie.value.release_date.slice(0, 4)
})

const featuredScore = computed(() => {
    if (!featuredMovie.value?.vote_average) {
        return 'N/A'
    }

    return featuredMovie.value.vote_average.toFixed(1)
})

const featuredMeta = computed(() => {
    if (!featuredMovie.value) {
        return 'Updated weekly'
    }

    return `${featuredReleaseYear.value} • ${movieGenres(featuredMovie.value)} • ${featuredScore.value}`
})

const fetchTrendingMovies = async (
    signal: AbortSignal,
    timeWindow: 'week' | 'day' = 'week',
) => {
    const data = await tmdbProxyGet<TrendingMoviesResponse>(
        `/trending?time_window=${timeWindow}`,
        signal,
    )
    return data.results ?? []
}

const fetchGenres = async (signal: AbortSignal) => {
    const data = await tmdbProxyGet<GenreResponse>('/genres', signal)
    return data.genres ?? []
}

const fetchPopularMovies = async (signal: AbortSignal) => {
    const data = await tmdbProxyGet<TrendingMoviesResponse>('/discover', signal)
    return data.results ?? []
}

const genreNameById = computed(() => {
    return new Map(genres.value.map((genre) => [genre.id, genre.name]))
})

const movieTitleLabel = (movie: Movie) => {
    const cleanTitle = movie.title?.trim()
    return cleanTitle || 'Untitled movie'
}

const movieGenres = (movie: Movie) => {
    const mappedGenres = movie.genre_ids
        .map((genreId) => genreNameById.value.get(genreId))
        .filter((genreName): genreName is string => Boolean(genreName))
        .slice(0, 2)

    if (!mappedGenres.length) {
        return 'No genre listed'
    }

    return mappedGenres.join(', ')
}

const getPosterUrl = (posterPath: string | null | undefined) => {
    if (!posterPath) {
        return FALLBACK_POSTER_URL
    }

    return `https://image.tmdb.org/t/p/w500${posterPath}`
}

const getBackdropUrl = (backdropPath: string | null | undefined) => {
    if (!backdropPath) {
        return FALLBACK_HERO_URL
    }

    return `https://image.tmdb.org/t/p/original${backdropPath}`
}

const onPosterError = (event: Event) => {
    const image = event.target as HTMLImageElement | null
    if (!image || image.src === FALLBACK_POSTER_URL) {
        return
    }

    image.src = FALLBACK_POSTER_URL
}

const movieDetailsPath = (movie: Movie) => {
    return `/movie/${movie.id}`
}

const featuredMoviePath = computed(() => {
    if (!featuredMovie.value) {
        return '/'
    }

    return movieDetailsPath(featuredMovie.value)
})

const loadTrendingData = async () => {
    activeController?.abort()
    activeController = new AbortController()

    isLoading.value = true
    errorMessage.value = ''

    try {
        const [movies, popular, genreList] = await Promise.all([
            fetchTrendingMovies(activeController.signal),
            fetchPopularMovies(activeController.signal),
            fetchGenres(activeController.signal),
        ])

        trendingMovies.value = movies
        popularMovies.value = popular
        genres.value = genreList
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return
        }

        errorMessage.value =
            'We could not load trending movies right now. Check your connection and try again.'
        trendingMovies.value = []
        popularMovies.value = []
        genres.value = []
        console.error(error)
    } finally {
        isLoading.value = false
    }
}

const retryLoad = () => {
    loadTrendingData()
}

const toggleShowAll = () => {
    showAllTrendingMovies.value = !showAllTrendingMovies.value
}

const toggleShowAllPopular = () => {
    showAllPopularMovies.value = !showAllPopularMovies.value
}


onMounted(async () => {
    await loadTrendingData()
})

onBeforeUnmount(() => {
    activeController?.abort()
})
</script>

<template>
    <!-- ═══════════════ HERO ═══════════════ -->
    <section
        class="hero-shell relative w-full flex items-end overflow-hidden"
    >
        <!-- Backdrop layer -->
        <div class="absolute inset-0 z-0">
            <div
                v-if="isLoading"
                class="w-full h-full hero-skeleton-backdrop skeleton-base"
            ></div>
            <img
                v-else
                class="hero-backdrop w-full h-full object-cover"
                :alt="
                    featuredMovie
                        ? `${movieTitleLabel(featuredMovie)} backdrop`
                        : 'Trending movie backdrop'
                "
                :src="getBackdropUrl(featuredMovie?.backdrop_path)"
            />
            <!-- Film grain texture -->
            <div class="absolute inset-0 hero-grain"></div>
            <!-- Multi-stop cinematic gradient -->
            <div class="absolute inset-0 hero-gradient"></div>
            <div class="absolute inset-0 hero-vignette"></div>
            <div
                class="absolute inset-0 bg-linear-to-r from-background via-background/50 to-transparent"
            ></div>
        </div>

        <!-- Hero content -->
        <div class="relative z-10 px-6 sm:px-8 md:px-16 pb-16 md:pb-20 max-w-4xl hero-content-enter">
            <template v-if="isLoading">
                <div class="flex items-center gap-3 mb-5">
                    <div class="h-7 w-32 rounded-lg skeleton-base"></div>
                    <div class="h-7 w-56 rounded-full skeleton-base"></div>
                </div>
                <div class="space-y-4 mb-7">
                    <div
                        class="h-14 md:h-18 w-[85%] rounded-xl skeleton-base"
                    ></div>
                    <div
                        class="h-14 md:h-18 w-[60%] rounded-xl skeleton-base"
                    ></div>
                </div>
                <div class="space-y-3 mb-9 max-w-2xl">
                    <div class="h-5 w-full rounded-lg skeleton-base"></div>
                    <div class="h-5 w-[92%] rounded-lg skeleton-base"></div>
                    <div class="h-5 w-[66%] rounded-lg skeleton-base"></div>
                </div>
                <div class="flex gap-3">
                    <div class="h-13 w-44 rounded-xl skeleton-base"></div>
                    <div class="h-13 w-36 rounded-xl skeleton-base"></div>
                </div>
            </template>

            <div v-else>
                <div
                    class="flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3 mb-5"
                >
                    <span
                        class="status-pill px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest font-label"
                        >Trending Now</span
                    >
                    <span
                        class="meta-chip text-xs sm:text-sm font-medium font-body leading-snug"
                        >{{ featuredMeta }}</span
                    >
                    <!-- Score badge -->
                    <span
                        v-if="featuredScore !== 'N/A'"
                        class="score-badge"
                        :aria-label="`TMDB score ${featuredScore}`"
                    >
                        <svg class="score-badge-ring" viewBox="0 0 36 36" aria-hidden="true">
                            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="2.5" />
                            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="100.5" :stroke-dashoffset="100.5 - (100.5 * Number(featuredScore)) / 10" stroke-linecap="round" transform="rotate(-90 18 18)" />
                        </svg>
                        <span class="score-badge-value">{{ featuredScore }}</span>
                    </span>
                </div>

                <h1
                    class="hero-title font-headline font-black text-5xl sm:text-6xl md:text-8xl mb-5 tracking-tighter leading-[0.92]"
                >
                    {{ featuredTitle }}
                </h1>

                <p
                    class="font-body hero-overview text-base sm:text-lg md:text-xl mb-9 max-w-2xl leading-relaxed line-clamp-4"
                >
                    {{ featuredOverview }}
                </p>

                <!-- Hero CTA -->
                <div class="flex flex-wrap items-center gap-3">
                    <RouterLink
                        :to="featuredMoviePath"
                        :aria-label="
                            featuredMovie
                                ? `View details for ${movieTitleLabel(featuredMovie)}`
                                : 'Go to trending movies'
                        "
                        class="hero-cta hero-cta-primary"
                    >
                        <Info class="w-5 h-5" />
                        View Details
                    </RouterLink>
                </div>
            </div>
        </div>
    </section>

    <!-- ═══════════════ TRENDING NOW ═══════════════ -->
    <section class="content-section section-warm pl-6 sm:pl-8 md:pl-16 pt-10">
        <div class="flex items-center justify-between pr-6 sm:pr-8 md:pr-16 mb-5">
            <h2
                class="section-heading font-headline font-bold text-xl sm:text-2xl tracking-tight flex items-center gap-3"
            >
                <span class="heading-bar"></span>
                Trending Now
            </h2>
            <button
                type="button"
                class="view-all-btn text-xs sm:text-sm uppercase tracking-widest transition-colors font-label"
                :disabled="isLoading || !trendingMovies.length"
                @click="toggleShowAll"
            >
                {{ showAllTrendingMovies ? 'Show Less' : 'View All' }}
            </button>
        </div>

        <!-- Loading skeletons -->
        <div v-if="isLoading" class="pr-6 sm:pr-8 md:pr-16 pb-10">
            <div class="flex gap-3 overflow-x-auto pb-2 editorial-mask">
                <div
                    class="min-w-[11rem] max-w-[11rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem]"
                    v-for="n in MAX_INITIAL_MOVIES"
                    :key="`skeleton-${n}`"
                >
                    <div
                        class="relative aspect-2/3 rounded-xl overflow-hidden mb-3 border movie-card-border skeleton-base"
                    ></div>
                    <div class="h-4 rounded-lg w-4/5 mb-2 skeleton-base"></div>
                    <div class="h-3 rounded-md w-3/5 skeleton-base"></div>
                </div>
            </div>
        </div>

        <!-- Error state -->
        <div v-else-if="errorMessage" class="pr-6 sm:pr-8 md:pr-16 pb-10">
            <div
                class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 max-w-xl"
            >
                <p class="text-sm text-destructive-foreground font-body mb-3">
                    {{ errorMessage }}
                </p>
                <button
                    type="button"
                    class="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold"
                    @click="retryLoad"
                >
                    Try again
                </button>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="isEmpty" class="pr-6 sm:pr-8 md:pr-16 pb-10">
            <div
                class="rounded-xl border border-outline-variant/20 p-4 max-w-xl"
            >
                <p class="text-sm text-on-surface-variant font-body">
                    No trending movies are available right now.
                </p>
            </div>
        </div>

        <!-- Movie cards -->
        <div
            v-else
            :class="
                showAllTrendingMovies
                    ? 'flex flex-wrap gap-3 pb-10 pr-6 sm:pr-8 md:pr-16'
                    : 'card-row flex gap-3 overflow-x-auto pb-10 editorial-mask scroll-smooth snap-x snap-mandatory'
            "
        >
            <div
                class="min-w-[11rem] max-w-[11rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem] snap-start group cursor-pointer card-stagger"
                v-for="(movie, index) in displayedTrendingMovies"
                :key="movie.id"
                :style="{ '--stagger': index }"
            >
                <RouterLink
                    :to="movieDetailsPath(movie)"
                    :aria-label="`View details for ${movieTitleLabel(movie)}`"
                    class="block"
                >
                    <div
                        class="poster-card relative aspect-2/3 rounded-xl overflow-hidden mb-3 border movie-card-border shadow-xl"
                    >
                        <img
                            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            :alt="`Poster for ${movie.title}`"
                            :src="getPosterUrl(movie.poster_path)"
                            loading="lazy"
                            decoding="async"
                            @error="onPosterError"
                        />
                        <!-- Vote badge -->
                        <span
                            v-if="movie.vote_average"
                            class="vote-badge"
                        >
                            {{ movie.vote_average.toFixed(1) }}
                        </span>
                        <!-- Hover overlay -->
                        <div class="poster-overlay poster-overlay-info">
                            <span class="overlay-title">{{ movieTitleLabel(movie) }}</span>
                            <span class="overlay-meta">{{ movie.release_date?.slice(0, 4) || 'TBA' }} · {{ movieGenres(movie) }}</span>
                        </div>
                    </div>
                    <h3
                        class="font-headline font-bold text-sm sm:text-base mb-0.5 group-hover:text-amber-400 transition-colors truncate title-tone"
                        :title="movieTitleLabel(movie)"
                    >
                        {{ movieTitleLabel(movie) }}
                    </h3>
                    <p
                        class="font-body text-[0.68rem] uppercase tracking-widest truncate genre-tone"
                        :title="movieGenres(movie)"
                    >
                        {{ movieGenres(movie) }}
                    </p>
                </RouterLink>
            </div>
        </div>
    </section>

    <!-- ═══════════════ DISCOVER ═══════════════ -->
    <section class="content-section section-cool pl-6 sm:pl-8 md:pl-16 pt-10 pb-6">
        <div class="flex items-center justify-between pr-6 sm:pr-8 md:pr-16 mb-5">
            <h2
                class="section-heading font-headline font-bold text-xl sm:text-2xl tracking-tight flex items-center gap-3"
            >
                <span class="heading-bar heading-bar-cool"></span>
                Discover
            </h2>
            <button
                type="button"
                class="view-all-btn text-xs sm:text-sm uppercase tracking-widest transition-colors font-label"
                :disabled="isLoading || !popularMovies.length"
                @click="toggleShowAllPopular"
            >
                {{ showAllPopularMovies ? 'Show Less' : 'View All' }}
            </button>
        </div>

        <!-- Loading skeletons -->
        <div v-if="isLoading" class="pr-6 sm:pr-8 md:pr-16 pb-10">
            <div class="flex gap-3 overflow-x-auto pb-2 editorial-mask">
                <div
                    class="min-w-[11rem] max-w-[11rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem]"
                    v-for="n in MAX_INITIAL_MOVIES"
                    :key="`popular-skeleton-${n}`"
                >
                    <div
                        class="relative aspect-2/3 rounded-xl overflow-hidden mb-3 border movie-card-border skeleton-base"
                    ></div>
                    <div class="h-4 rounded-lg w-4/5 mb-2 skeleton-base"></div>
                    <div class="h-3 rounded-md w-3/5 skeleton-base"></div>
                </div>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!popularMovies.length" class="pr-6 sm:pr-8 md:pr-16 pb-10">
            <div
                class="rounded-xl border border-outline-variant/20 p-4 max-w-xl"
            >
                <p class="text-sm text-on-surface-variant font-body">
                    No discover movies are available right now.
                </p>
            </div>
        </div>

        <!-- Movie cards -->
        <div
            v-else
            :class="
                showAllPopularMovies
                    ? 'flex flex-wrap gap-3 pb-10 pr-6 sm:pr-8 md:pr-16'
                    : 'card-row flex gap-3 overflow-x-auto pb-10 editorial-mask scroll-smooth snap-x snap-mandatory'
            "
        >
            <div
                class="min-w-[11rem] max-w-[11rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem] snap-start group cursor-pointer card-stagger"
                v-for="(movie, index) in displayedPopularMovies"
                :key="`popular-${movie.id}`"
                :style="{ '--stagger': index }"
            >
                <RouterLink
                    :to="movieDetailsPath(movie)"
                    :aria-label="`View details for ${movieTitleLabel(movie)}`"
                    class="block"
                >
                    <div
                        class="poster-card relative aspect-2/3 rounded-xl overflow-hidden mb-3 border movie-card-border shadow-xl"
                    >
                        <img
                            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            :alt="`Poster for ${movie.title}`"
                            :src="getPosterUrl(movie.poster_path)"
                            loading="lazy"
                            decoding="async"
                            @error="onPosterError"
                        />
                        <!-- Vote badge -->
                        <span
                            v-if="movie.vote_average"
                            class="vote-badge"
                        >
                            {{ movie.vote_average.toFixed(1) }}
                        </span>
                        <!-- Hover overlay -->
                        <div class="poster-overlay poster-overlay-info">
                            <span class="overlay-title">{{ movieTitleLabel(movie) }}</span>
                            <span class="overlay-meta">{{ movie.release_date?.slice(0, 4) || 'TBA' }} · {{ movieGenres(movie) }}</span>
                        </div>
                    </div>
                    <h3
                        class="font-headline font-bold text-sm sm:text-base mb-0.5 group-hover:text-amber-400 transition-colors truncate title-tone"
                        :title="movieTitleLabel(movie)"
                    >
                        {{ movieTitleLabel(movie) }}
                    </h3>
                    <p
                        class="font-body text-[0.68rem] uppercase tracking-widest truncate genre-tone"
                        :title="movieGenres(movie)"
                    >
                        {{ movieGenres(movie) }}
                    </p>
                </RouterLink>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* ─── Hero ─── */
.hero-shell {
    height: 85vh;
    max-height: 52rem;
    min-height: 28rem;
    background: oklch(0.1 0.015 250);
}

.hero-backdrop {
    animation: ken-burns 28s ease-in-out infinite alternate;
    will-change: transform;
}

@keyframes ken-burns {
    0% {
        transform: scale(1) translate(0, 0);
    }
    100% {
        transform: scale(1.08) translate(-1.5%, -1%);
    }
}

.hero-grain {
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    background-repeat: repeat;
    pointer-events: none;
    mix-blend-mode: overlay;
}

.hero-gradient {
    background:
        linear-gradient(to top, #0e0e0e 0%, transparent 52%),
        linear-gradient(to bottom, rgba(14, 14, 14, 0.35) 0%, transparent 28%);
}

.hero-vignette {
    background:
        radial-gradient(
            ellipse at 18% 45%,
            oklch(0.18 0.04 245 / 0.6),
            transparent 55%
        ),
        linear-gradient(
            155deg,
            oklch(0.15 0.03 235 / 0.55),
            transparent 42%,
            oklch(0.12 0.02 260 / 0.4)
        );
}

.hero-title {
    text-shadow:
        0 2px 24px oklch(0.08 0.02 250 / 0.7),
        0 0 80px oklch(0.08 0.01 250 / 0.35);
}

.hero-overview {
    color: oklch(0.78 0.02 240);
}

/* Hero CTAs */
.hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 1.8rem;
    border-radius: 0.85rem;
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    transition: all 200ms ease;
    transform: scale(1);
}

.hero-cta:active {
    transform: scale(0.96);
}

.hero-cta-primary {
    background: oklch(0.73 0.16 76);
    color: oklch(0.15 0.03 80);
    box-shadow: 0 0 0 0 oklch(0.73 0.16 76 / 0);
}

.hero-cta-primary:hover {
    background: oklch(0.78 0.14 80);
    box-shadow: 0 0 28px oklch(0.73 0.16 76 / 0.3);
}

.hero-cta-ghost {
    background: oklch(0.2 0.02 240 / 0.45);
    color: oklch(0.92 0.02 240);
    border: 1px solid oklch(0.5 0.03 240 / 0.35);
    backdrop-filter: blur(6px);
}

.hero-cta-ghost:hover {
    background: oklch(0.25 0.02 240 / 0.6);
    border-color: oklch(0.7 0.12 76 / 0.4);
    color: oklch(0.88 0.12 80);
}

/* Hero content fade-in */
.hero-content-enter {
    animation: hero-fade-up 600ms ease-out both;
}

@keyframes hero-fade-up {
    from {
        opacity: 0;
        transform: translateY(18px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Score badge (circular) */
.score-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    color: oklch(0.86 0.13 82);
    flex-shrink: 0;
}

.score-badge-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.score-badge-value {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
}

/* ─── Status pill / meta chip ─── */
.status-pill {
    background: oklch(0.72 0.16 76 / 0.18);
    color: oklch(0.86 0.13 82);
    border: 1px solid oklch(0.72 0.16 76 / 0.4);
}

.meta-chip {
    display: inline-flex;
    align-items: center;
    color: oklch(0.8 0.03 238);
    background: oklch(0.22 0.02 240 / 0.55);
    border: 1px solid oklch(0.4 0.03 240 / 0.35);
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    max-width: min(90vw, 24rem);
    white-space: normal;
}

@media (max-width: 639px) {
    .meta-chip {
        border-radius: 0.65rem;
        padding: 0.3rem 0.55rem;
        font-size: 0.72rem;
    }
}

/* ─── Content sections ─── */
.content-section {
    position: relative;
}

.section-warm {
    background: linear-gradient(
        180deg,
        transparent 0%,
        oklch(0.14 0.015 60 / 0.18) 35%,
        oklch(0.14 0.015 60 / 0.22) 65%,
        transparent 100%
    );
}

.section-cool {
    background: linear-gradient(
        180deg,
        transparent 0%,
        oklch(0.14 0.02 245 / 0.2) 35%,
        oklch(0.14 0.02 245 / 0.24) 65%,
        transparent 100%
    );
}

/* Section headings */
.heading-bar {
    display: block;
    width: 3px;
    height: 1.75rem;
    border-radius: 999px;
    background: linear-gradient(
        to bottom,
        oklch(0.78 0.14 76),
        oklch(0.68 0.16 55)
    );
    flex-shrink: 0;
}

.heading-bar-cool {
    background: linear-gradient(
        to bottom,
        oklch(0.72 0.12 230),
        oklch(0.58 0.14 260)
    );
}

.section-heading {
    color: oklch(0.94 0.01 250);
}

/* View all button */
.view-all-btn {
    color: oklch(0.72 0.04 235);
    white-space: nowrap;
}

.view-all-btn:hover {
    color: oklch(0.82 0.13 76);
}

.view-all-btn:disabled {
    color: oklch(0.45 0.02 240);
    cursor: not-allowed;
}

/* ─── Poster cards ─── */
.poster-card {
    transition: transform 300ms ease, box-shadow 300ms ease, border-color 300ms ease;
}

.group:hover .poster-card {
    transform: translateY(-6px) scale(1.02);
    box-shadow:
        0 12px 32px oklch(0.08 0.01 250 / 0.5),
        0 0 0 1px oklch(0.6 0.1 76 / 0.15);
    border-color: oklch(0.55 0.08 76 / 0.35);
}

.group:focus-within .poster-card {
    border-color: oklch(0.7 0.14 76 / 0.55);
}

.movie-card-border {
    border-color: oklch(0.3 0.02 240 / 0.3);
}

/* Vote badge */
.vote-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    padding: 0.2rem 0.45rem;
    border-radius: 0.5rem;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    background: oklch(0.12 0.01 250 / 0.82);
    color: oklch(0.86 0.13 76);
    border: 1px solid oklch(0.5 0.1 76 / 0.3);
    backdrop-filter: blur(6px);
    z-index: 2;
    opacity: 0;
    transition: opacity 200ms ease;
}

.group:hover .vote-badge {
    opacity: 1;
}

/* Poster overlay — shared */
.poster-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: oklch(0.08 0.01 250 / 0);
    backdrop-filter: blur(0px);
    transition: all 300ms ease;
    opacity: 0;
    z-index: 1;
}

.group:hover .poster-overlay {
    background: oklch(0.08 0.01 250 / 0.65);
    backdrop-filter: blur(4px);
    opacity: 1;
}

/* Resume overlay variant */
.resume-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border-radius: 0.65rem;
    background: oklch(0.73 0.16 76 / 0.9);
    color: oklch(0.15 0.02 80);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transform: translateY(6px);
    transition: transform 300ms ease;
}

.group:hover .resume-badge {
    transform: translateY(0);
}

.resume-icon {
    font-size: 0.65rem;
}

/* Info overlay variant (trending / discover) */
.poster-overlay-info {
    justify-content: flex-end;
    align-items: flex-start;
    padding: 0.75rem;
    background: linear-gradient(
        to top,
        oklch(0.06 0.01 250 / 0.88) 0%,
        oklch(0.06 0.01 250 / 0.4) 55%,
        transparent 100%
    );
    backdrop-filter: none;
}

.group:hover .poster-overlay-info {
    background: linear-gradient(
        to top,
        oklch(0.06 0.01 250 / 0.92) 0%,
        oklch(0.06 0.01 250 / 0.5) 60%,
        transparent 100%
    );
    backdrop-filter: none;
}

.overlay-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: oklch(0.96 0.01 250);
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.overlay-meta {
    font-size: 0.65rem;
    color: oklch(0.7 0.03 240);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

/* Episode badge */
.episode-badge {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.18rem 0.5rem;
    border-radius: 0.4rem;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: oklch(0.18 0.02 245 / 0.82);
    color: oklch(0.82 0.08 230);
    border: 1px solid oklch(0.45 0.06 235 / 0.35);
    backdrop-filter: blur(4px);
    z-index: 2;
}

/* ─── Card text ─── */
.title-tone {
    color: oklch(0.92 0.01 255);
}

.genre-tone {
    color: oklch(0.6 0.03 235);
}

/* ─── Card stagger animation ─── */
.card-stagger {
    animation: card-enter 450ms ease-out both;
    animation-delay: calc(var(--stagger, 0) * 60ms);
}

@keyframes card-enter {
    from {
        opacity: 0;
        transform: translateY(14px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* ─── Skeletons ─── */
.hero-skeleton-backdrop {
    background:
        radial-gradient(
            circle at 22% 28%,
            oklch(0.35 0.03 225 / 0.25),
            transparent 58%
        ),
        linear-gradient(
            120deg,
            oklch(0.12 0.015 248 / 0.9),
            oklch(0.18 0.02 244 / 0.92)
        );
}

.skeleton-base {
    position: relative;
    overflow: hidden;
    background: oklch(0.22 0.015 240 / 0.55);
}

.skeleton-base::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
        110deg,
        transparent 0%,
        oklch(0.6 0.02 242 / 0.1) 45%,
        transparent 100%
    );
    animation: skeleton-shimmer 1.4s linear infinite;
}

@keyframes skeleton-shimmer {
    100% {
        transform: translateX(100%);
    }
}

/* ─── Reduced motion ─── */
@media (prefers-reduced-motion: reduce) {
    .hero-backdrop {
        animation: none !important;
    }
    .hero-content-enter {
        animation: none !important;
    }
    .card-stagger {
        animation: none !important;
        opacity: 1;
    }
    .poster-card,
    .poster-overlay,
    .resume-badge,
    .vote-badge {
        transition-duration: 0.01ms !important;
    }
}
</style>
