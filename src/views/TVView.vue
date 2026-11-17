<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tmdbProxyGet } from '@/lib/api/tmdbClient'
import { setDocumentTitle } from '@/lib/utils'
import WhereToWatch from '@/components/WhereToWatch.vue'
import {
    getWatchRegion,
    type WatchProviderRegion,
    type WatchProvidersResponse,
} from '@/lib/watchProviders'
import type {
    TVCastMember,
    TVCreditsResponse,
    TVDetails,
    TVRecommendationsResponse,
    TVShow,
} from '@/lib/types/TV'
import { useRoute } from 'vue-router'

const route = useRoute()

const FALLBACK_HERO =
    'https://placehold.co/1920x1080/191919/e0e0e0?text=No+Backdrop'
const FALLBACK_POSTER =
    'https://placehold.co/500x750/191919/e0e0e0?text=No+Poster'
const FALLBACK_PERSON =
    'https://placehold.co/320x320/191919/e0e0e0?text=No+Photo'

const show = ref<TVDetails | null>(null)
const cast = ref<TVCastMember[]>([])
const recommendations = ref<TVShow[]>([])
const watchProviders = ref<WatchProvidersResponse | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const regionalWatchProviders = computed<WatchProviderRegion | null>(() => {
    const results = watchProviders.value?.results
    if (!results) {
        return null
    }

    return results[getWatchRegion()] ?? null
})

let activeController: AbortController | null = null

const heroUrl = computed(() => {
    if (!show.value?.backdrop_path) {
        return FALLBACK_HERO
    }

    return `https://image.tmdb.org/t/p/original${show.value.backdrop_path}`
})

const firstAirYear = computed(() => {
    const date = show.value?.first_air_date
    return date ? date.slice(0, 4) : 'TBA'
})

const genreLabel = computed(() => {
    const genres = show.value?.genres ?? []
    if (!genres.length) {
        return 'Genre not available'
    }

    return genres
        .slice(0, 3)
        .map((genre) => genre.name)
        .join(' • ')
})

const scoreLabel = computed(() => {
    const score = show.value?.vote_average
    return score ? score.toFixed(1) : 'N/A'
})

const heroTitleText = computed(() => show.value?.name?.trim() ?? '')

const heroTitleSizeClass = computed(() => {
    const length = heroTitleText.value.length
    if (length <= 28) {
        return 'hero-title--xl'
    }

    if (length <= 46) {
        return 'hero-title--lg'
    }

    if (length <= 64) {
        return 'hero-title--md'
    }

    return 'hero-title--sm'
})

const heroTitleLongTokenClass = computed(() => {
    const longestToken = heroTitleText.value
        .split(/\s+/)
        .reduce((maxLength, token) => Math.max(maxLength, token.length), 0)

    return longestToken >= 18 ? 'hero-title--break-anywhere' : ''
})

const topCast = computed(() => cast.value.slice(0, 8))
const topRecommendations = computed(() => recommendations.value.slice(0, 8))

const getPosterUrl = (posterPath: string | null | undefined) => {
    if (!posterPath) {
        return FALLBACK_POSTER
    }

    return `https://image.tmdb.org/t/p/w500${posterPath}`
}

const getProfileUrl = (profilePath: string | null | undefined) => {
    if (!profilePath) {
        return FALLBACK_PERSON
    }

    return `https://image.tmdb.org/t/p/w300${profilePath}`
}

const getShowPath = (id: number) => `/tv/${id}`

const loadShowData = async (idParam: string | string[] | undefined) => {
    const parsedId = Number(idParam)
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
        show.value = null
        cast.value = []
        recommendations.value = []
        watchProviders.value = null
        errorMessage.value =
            'We could not find this TV show. Try opening it again from the shows page.'
        return
    }

    activeController?.abort()
    activeController = new AbortController()

    isLoading.value = true
    errorMessage.value = ''

    try {
        const [details, credits, related, providers] = await Promise.all([
            tmdbProxyGet<TVDetails>(`/tv/${parsedId}`, activeController.signal),
            tmdbProxyGet<TVCreditsResponse>(
                `/tv/${parsedId}/credits`,
                activeController.signal,
            ),
            tmdbProxyGet<TVRecommendationsResponse>(
                `/tv/${parsedId}/recommendations?page=1`,
                activeController.signal,
            ),
            tmdbProxyGet<WatchProvidersResponse>(
                `/watch-providers/tv/${parsedId}`,
                activeController.signal,
            ).catch(() => null),
        ])

        show.value = details
        cast.value = credits.cast ?? []
        recommendations.value = related.results ?? []
        watchProviders.value = providers
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return
        }

        show.value = null
        cast.value = []
        recommendations.value = []
        watchProviders.value = null
        errorMessage.value =
            'We could not load this TV show right now. Check your connection and try again.'
        console.error(error)
    } finally {
        isLoading.value = false
    }
}

watch(
    () => route.params.id,
    (id) => {
        loadShowData(id)
    },
    { immediate: true },
)

watch(
    () => show.value?.name,
    (name) => {
        if (name) {
            setDocumentTitle(`${name} | CINEPHILE`)
        }
    },
)

onBeforeUnmount(() => {
    activeController?.abort()
})
</script>

<template>
    <main class="relative pb-20">
        <section
            class="hero-shell relative w-full overflow-hidden"
        >
            <div class="absolute inset-0 z-0">
                <div
                    v-if="isLoading"
                    class="w-full h-full hero-skeleton-backdrop skeleton-base"
                ></div>
                <img
                    v-else
                    class="hero-backdrop w-full h-full object-cover"
                    :src="heroUrl"
                    :alt="show ? `${show.name} backdrop` : 'TV backdrop'"
                />
                <div class="absolute inset-0 hero-grain"></div>
                <div class="absolute inset-0 hero-gradient"></div>
                <div class="absolute inset-0 hero-vignette"></div>
                <div
                    class="absolute inset-0 bg-linear-to-r from-background via-background/45 to-transparent"
                ></div>
            </div>

            <div class="absolute z-60 left-8 md:left-16 top-22 md:top-24">
                <RouterLink to="/shows" class="back-home-link">
                    <ArrowLeft class="w-3.5 h-3.5" />
                    Back to Shows
                </RouterLink>
            </div>

            <div
                v-if="isLoading"
                class="relative z-10 h-full flex items-end px-8 md:px-16 pb-14"
            >
                <div class="max-w-3xl space-y-6 w-full">
                    <div
                        class="h-14 md:h-20 w-full rounded-xl skeleton-base"
                    ></div>
                    <div class="h-4 w-50 rounded-md skeleton-base"></div>
                    <div class="h-13 w-44 rounded-xl skeleton-base"></div>
                </div>
            </div>

            <div
                v-else-if="errorMessage"
                class="relative z-10 h-full flex items-end px-8 md:px-16 pb-14"
            >
                <div
                    class="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 max-w-lg space-y-3"
                >
                    <p class="text-sm text-destructive-foreground font-body">
                        {{ errorMessage }}
                    </p>
                    <RouterLink to="/shows" class="back-home-link inline-flex"
                        >Browse TV shows</RouterLink
                    >
                </div>
            </div>

            <div
                v-else-if="show"
                class="relative z-10 h-full flex items-end px-8 md:px-16 pb-14"
            >
                <div class="max-w-3xl space-y-6">
                    <span
                        class="status-pill px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest font-label"
                    >
                        TV Show Details
                    </span>
                    <h1
                        :class="[
                            'hero-title font-headline font-black tracking-tighter leading-[0.92] hero-title-shadow',
                            heroTitleSizeClass,
                            heroTitleLongTokenClass,
                        ]"
                    >
                        {{ show.name }}
                    </h1>
                    <div
                        class="flex flex-wrap items-center gap-4 text-sm md:text-base text-on-surface-variant font-label"
                    >
                        <span class="text-primary font-bold">{{
                            firstAirYear
                        }}</span>
                        <span
                            class="w-1 h-1 bg-neutral-700 rounded-full"
                        ></span>
                        <span>{{ show.number_of_seasons }} seasons</span>
                        <span
                            class="w-1 h-1 bg-neutral-700 rounded-full"
                        ></span>
                        <span>{{ genreLabel }}</span>
                        <span
                            class="w-1 h-1 bg-neutral-700 rounded-full"
                        ></span>
                        <!-- Score badge -->
                        <span
                            v-if="scoreLabel !== 'N/A'"
                            class="score-badge"
                            :aria-label="`TMDB score ${scoreLabel}`"
                        >
                            <svg class="score-badge-ring" viewBox="0 0 36 36" aria-hidden="true">
                                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="2.5" />
                                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="100.5" :stroke-dashoffset="100.5 - (100.5 * Number(scoreLabel)) / 10" stroke-linecap="round" transform="rotate(-90 18 18)" />
                            </svg>
                            <span class="score-badge-value">{{ scoreLabel }}</span>
                        </span>
                        <span v-else class="text-on-surface font-semibold">N/A</span>
                    </div>
                    <div class="pt-2">
                        <WhereToWatch :region="regionalWatchProviders" />
                    </div>
                </div>
            </div>
        </section>

        <section
            v-if="show && !isLoading"
            class="max-w-screen-2xl mx-auto px-8 md:px-16 pt-10 md:pt-12 relative z-10 space-y-16"
        >
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div class="lg:col-span-8 space-y-12">
                    <div class="space-y-5">
                        <h2 class="font-headline text-2xl font-bold">
                            Overview
                        </h2>
                        <p
                            class="font-body text-on-surface-variant leading-relaxed"
                        >
                            {{ show.overview || 'No overview available.' }}
                        </p>
                    </div>

                    <div class="space-y-5">
                        <h2 class="font-headline text-2xl font-bold">
                            Top Cast
                        </h2>
                        <div
                            class="flex gap-6 overflow-x-auto pb-4 custom-scrollbar"
                        >
                            <div
                                class="w-30 shrink-0"
                                v-for="member in topCast"
                                :key="member.id"
                            >
                                <img
                                    :src="getProfileUrl(member.profile_path)"
                                    :alt="`Photo of ${member.name}`"
                                    class="w-30 h-30 rounded-full object-cover"
                                />
                                <p class="mt-3 text-sm font-semibold truncate">
                                    {{ member.name }}
                                </p>
                                <p
                                    class="text-xs text-on-surface-variant truncate"
                                >
                                    {{ member.character }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <aside class="lg:col-span-4">
                    <div
                        class="bg-surface-container-low p-8 rounded-2xl border border-outline-variant/10 space-y-6"
                    >
                        <h3 class="font-headline text-xl font-bold">
                            Series Stats
                        </h3>
                        <p class="text-sm text-on-surface-variant">
                            Seasons: {{ show.number_of_seasons }}
                        </p>
                        <p class="text-sm text-on-surface-variant">
                            Episodes: {{ show.number_of_episodes }}
                        </p>
                        <p class="text-sm text-on-surface-variant">
                            First air date: {{ show.first_air_date || 'TBA' }}
                        </p>
                    </div>
                </aside>
            </div>

            <div class="space-y-6">
                <h2 class="font-headline text-2xl font-bold">
                    You may also like
                </h2>
                <div
                    class="card-row flex gap-3 overflow-x-auto pb-3 editorial-mask scroll-smooth snap-x snap-mandatory"
                >
                    <div
                        class="card-cell min-w-[11rem] max-w-[11rem] sm:min-w-[12.5rem] sm:max-w-[12.5rem] snap-start group cursor-pointer card-stagger"
                        v-for="(item, index) in topRecommendations"
                        :key="item.id"
                        :style="{ '--stagger': index }"
                    >
                        <RouterLink
                            :to="getShowPath(item.id)"
                            :aria-label="`View details for ${item.name}`"
                            class="block"
                        >
                            <div
                                class="poster-card relative aspect-2/3 rounded-xl overflow-hidden mb-3 border movie-card-border shadow-xl"
                            >
                                <img
                                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    :src="getPosterUrl(item.poster_path)"
                                    :alt="item.name"
                                    loading="lazy"
                                />
                                <!-- Vote badge -->
                                <span
                                    v-if="item.vote_average"
                                    class="vote-badge"
                                >
                                    {{ item.vote_average.toFixed(1) }}
                                </span>
                                <!-- Hover overlay -->
                                <div class="poster-overlay poster-overlay-info">
                                    <span class="overlay-title">{{ item.name }}</span>
                                    <span class="overlay-meta">{{ item.first_air_date?.slice(0, 4) || 'TBA' }}</span>
                                </div>
                            </div>
                            <h3
                                class="font-headline font-bold text-sm sm:text-base mb-0.5 group-hover:text-amber-400 transition-colors truncate title-tone"
                                :title="item.name"
                            >
                                {{ item.name }}
                            </h3>
                            <p
                                class="font-body text-[0.68rem] uppercase tracking-widest truncate genre-tone"
                            >
                                {{ item.first_air_date?.slice(0, 4) || 'Year unknown' }}
                            </p>
                        </RouterLink>
                    </div>
                </div>
            </div>
        </section>
    </main>
</template>

<style scoped>
/* ─── Hero ─── */
.hero-shell {
    height: 72vh;
    min-height: 38.75rem;
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

/* Status pill */
.status-pill {
    background: oklch(0.72 0.16 76 / 0.18);
    color: oklch(0.86 0.13 82);
    border: 1px solid oklch(0.72 0.16 76 / 0.4);
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

.hero-title {
    max-inline-size: 18ch;
    text-wrap: balance;
    overflow-wrap: break-word;
    hyphens: auto;
}

.hero-title-shadow {
    text-shadow:
        0 2px 24px oklch(0.08 0.02 250 / 0.7),
        0 0 80px oklch(0.08 0.01 250 / 0.35);
}

.hero-title--xl {
    font-size: clamp(2.6rem, 7.1vw, 7rem);
}

.hero-title--lg {
    font-size: clamp(2.3rem, 6.2vw, 6rem);
}

.hero-title--md {
    font-size: clamp(2rem, 5.5vw, 5rem);
}

.hero-title--sm {
    font-size: clamp(1.7rem, 4.7vw, 4.1rem);
    line-height: 0.96;
}

.hero-title--break-anywhere {
    overflow-wrap: anywhere;
    word-break: break-word;
}

@media (max-width: 768px) {
    .hero-title {
        max-inline-size: 14ch;
    }
}

.back-home-link {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 0.9rem;
    border-radius: 0.75rem;
    font-size: 0.76rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    color: oklch(0.84 0.04 228);
    border: 1px solid oklch(0.48 0.03 232 / 0.4);
    background: oklch(0.23 0.03 236 / 0.38);
    backdrop-filter: blur(8px);
    transition:
        color 180ms ease,
        border-color 180ms ease,
        background-color 180ms ease;
}

.back-home-link:hover {
    color: oklch(0.84 0.12 80);
    border-color: oklch(0.72 0.14 76 / 0.45);
    background: oklch(0.26 0.04 236 / 0.56);
}

/* ─── Poster cards (More Like This) ─── */
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

/* Poster overlay */
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

.title-tone {
    color: oklch(0.92 0.01 255);
}

.genre-tone {
    color: oklch(0.6 0.03 235);
}

/* Card stagger animation */
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
    .card-stagger {
        animation: none !important;
        opacity: 1;
    }
    .poster-card,
    .poster-overlay,
    .vote-badge {
        transition-duration: 0.01ms !important;
    }
}
</style>
