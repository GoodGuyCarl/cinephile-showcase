import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { LRUCache } from 'lru-cache'

// Load local overrides first, then default env file.
dotenv.config({ path: '.env.local' })
dotenv.config()

const app = express()

const normalizeEnvSecret = (value) => {
    const raw = String(value || '').trim()
    if (!raw) {
        return ''
    }

    if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
    ) {
        return raw.slice(1, -1).trim()
    }

    return raw
}

const TMDB_API_KEY = normalizeEnvSecret(process.env.TMDB_API_KEY)
const TMDB_ACCESS_TOKEN = normalizeEnvSecret(process.env.TMDB_ACCESS_TOKEN)
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_FETCH_TIMEOUT_MS = Number(process.env.TMDB_FETCH_TIMEOUT_MS || 15000)
const TMDB_FETCH_RETRIES = Number(process.env.TMDB_FETCH_RETRIES || 2)
const CACHE = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 10,
})

const DAILY_QUOTA_TTL_MS = 24 * 60 * 60 * 1000
const DAILY_QUOTAS = new LRUCache({
    max: 5000,
    ttl: DAILY_QUOTA_TTL_MS,
})
const DEFAULT_DAILY_LIMIT = 3000

const BOT_UA_REGEX =
    /(curl|wget|python-requests|httpclient|scrapy|crawler|spider|headlesschrome|phantomjs)/i

if (!TMDB_API_KEY && !TMDB_ACCESS_TOKEN) {
    console.warn(
        'TMDB credentials are missing. Set TMDB_ACCESS_TOKEN (preferred) or TMDB_API_KEY.',
    )
}

// Vercel puts one proxy in front of the function, so there the forwarded hop is the caller.
const TRUST_PROXY =
    Boolean(process.env.VERCEL) ||
    String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true'

app.set('trust proxy', TRUST_PROXY ? 1 : false)
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
                formAction: ["'none'"],
            },
        },
        crossOriginResourcePolicy: { policy: 'same-site' },
        referrerPolicy: { policy: 'no-referrer' },
    }),
)

// Parse JSON with size limit to prevent abuse
app.use(express.json({ limit: '10kb' }))

const getClientKey = (req) =>
    `ip:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown-ip')}`

const DEBUG_MODE = ['true', '1', 'yes'].includes(
    String(
        process.env.DEBUG_MODE || '',
    )
        .trim()
        .toLowerCase(),
)
const DEV_MODE = DEBUG_MODE

if (DEV_MODE) {
    console.log(
        '[DEV/DEBUG MODE] Rate limiting, bot protection, and quotas are disabled.',
    )
}

const checkDailyQuota = (req, res, next) => {
    if (DEV_MODE) {
        return next()
    }

    const key = getClientKey(req)
    const record = DAILY_QUOTAS.get(key)

    if (!record) {
        DAILY_QUOTAS.set(key, {
            count: 1,
            maxDaily: DEFAULT_DAILY_LIMIT,
        })
        return next()
    }

    if (record.count >= record.maxDaily) {
        const ttlMs = DAILY_QUOTAS.getRemainingTTL(key)
        if (ttlMs > 0) {
            res.setHeader('Retry-After', String(Math.ceil(ttlMs / 1000)))
        }
        return res.status(429).json({
            error: 'Daily request quota reached. Please try again later.',
        })
    }

    record.count += 1
    return next()
}

const botGuard = (req, res, next) => {
    if (DEV_MODE) {
        return next()
    }

    const userAgent = String(req.headers['user-agent'] || '').trim()

    if (!userAgent || BOT_UA_REGEX.test(userAgent)) {
        return res.status(403).json({
            error: 'Automated traffic is blocked on this endpoint.',
        })
    }

    return next()
}

const burstLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 90,
    skip: () => DEV_MODE,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientKey,
    handler: (_req, res) => {
        res.status(429).json({
            error: 'Too many requests. Please slow down and try again.',
        })
    },
})

const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    skip: () => DEV_MODE,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientKey,
    handler: (_req, res) => {
        res.status(429).json({
            error: 'Search rate limit reached. Please wait before searching again.',
        })
    },
})

const jsonError = (res, status, message) => {
    return res.status(status).json({ error: message })
}

const clampPositiveInt = (value, fallback, max = 100) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }

    return Math.min(Math.floor(parsed), max)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const retryableStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504])

class ProxyRequestError extends Error {
    constructor(message, options = {}) {
        super(message)
        this.name = 'ProxyRequestError'
        this.status = options.status || 502
        this.upstreamStatus = options.upstreamStatus || null
        this.code = options.code || 'UPSTREAM_ERROR'
    }
}

const isRetryableNetworkError = (error) => {
    const causeCode = error?.cause?.code
    const errorCode = error?.code
    const message = String(error?.message || '').toLowerCase()

    return (
        causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
        causeCode === 'UND_ERR_HEADERS_TIMEOUT' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNRESET' ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'EAI_AGAIN' ||
        message.includes('fetch failed') ||
        message.includes('timed out')
    )
}

const isJwtLike = (value) =>
    /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)

const resolveTmdbAuth = () => {
    const tokenCandidate = TMDB_ACCESS_TOKEN || TMDB_API_KEY

    if (tokenCandidate) {
        if (tokenCandidate.startsWith('Bearer ')) {
            return { authorization: tokenCandidate, apiKey: '' }
        }

        if (isJwtLike(tokenCandidate)) {
            return { authorization: `Bearer ${tokenCandidate}`, apiKey: '' }
        }
    }

    if (TMDB_API_KEY) {
        return { authorization: '', apiKey: TMDB_API_KEY }
    }

    return { authorization: '', apiKey: '' }
}

const mapTmdbUpstreamStatus = (upstreamStatus) => {
    if ([400, 401, 403, 404, 422].includes(upstreamStatus)) {
        return upstreamStatus
    }

    if (upstreamStatus === 429) {
        return 503
    }

    return 502
}

const handleTmdbRouteError = (res, error, fallbackMessage) => {
    if (error instanceof ProxyRequestError) {
        return res.status(error.status).json({
            error: fallbackMessage,
            upstream_status: error.upstreamStatus,
            code: error.code,
        })
    }

    console.error(error)
    return jsonError(res, 502, fallbackMessage)
}

const fetchTmdb = async (path, queryParams = {}) => {
    const timeoutMs = clampPositiveInt(TMDB_FETCH_TIMEOUT_MS, 15000, 120000)
    const maxRetries = clampPositiveInt(TMDB_FETCH_RETRIES, 2, 5)
    const auth = resolveTmdbAuth()
    const query = new URLSearchParams()
    Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).length > 0) {
            query.set(key, String(value))
        }
    })

    if (auth.apiKey) {
        query.set('api_key', auth.apiKey)
    }

    const queryString = query.toString()
    const url = `${TMDB_BASE_URL}${path}${queryString ? `?${queryString}` : ''}`

    const headers = {
        accept: 'application/json',
    }

    if (auth.authorization) {
        headers.Authorization = auth.authorization
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            controller.abort()
        }, timeoutMs)

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: controller.signal,
            })

            if (!response.ok) {
                const body = await response.text()

                if (
                    retryableStatusCodes.has(response.status) &&
                    attempt < maxRetries
                ) {
                    await sleep(250 * (attempt + 1))
                    continue
                }

                throw new ProxyRequestError(
                    `TMDB request failed (${response.status}): ${body.slice(0, 200)}`,
                    {
                        status: mapTmdbUpstreamStatus(response.status),
                        upstreamStatus: response.status,
                        code: 'TMDB_UPSTREAM_STATUS',
                    },
                )
            }

            return response.json()
        } catch (error) {
            const timedOut =
                error instanceof DOMException && error.name === 'AbortError'
            const retryable = timedOut || isRetryableNetworkError(error)

            if (retryable && attempt < maxRetries) {
                await sleep(250 * (attempt + 1))
                continue
            }

            if (timedOut) {
                throw new ProxyRequestError(
                    `TMDB request timed out after ${timeoutMs}ms.`,
                    {
                        status: 504,
                        code: 'TMDB_TIMEOUT',
                    },
                )
            }

            if (isRetryableNetworkError(error)) {
                throw new ProxyRequestError('TMDB upstream network failure.', {
                    status: 502,
                    code: 'TMDB_NETWORK',
                })
            }

            throw error
        } finally {
            clearTimeout(timeoutId)
        }
    }

    throw new Error('TMDB request failed after retries.')
}

const fromCache = async (key, ttlMs, fetcher) => {
    const cached = CACHE.get(key)
    if (cached) {
        return cached
    }

    const fresh = await fetcher()
    CACHE.set(key, fresh, { ttl: ttlMs })
    return fresh
}

export const validateTmdbId = (id) => {
    const parsed = Number(id)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export const validateSeasonOrEpisodeNumber = (value, max = 1000, allowZero = false) => {
    const parsed = Number(value)
    const min = allowZero ? 0 : 1
    return Number.isInteger(parsed) && parsed >= min && parsed <= max
        ? parsed
        : null
}

export const validatePageNumber = (value, max = 1000) => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null
}

export const normalizeSearchLanguage = (value) => {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    if (!trimmed) {
        return null
    }

    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(trimmed)) {
        return null
    }

    return trimmed
}

export const normalizeSearchYear = (value) => {
    if (value === undefined || value === null || value === '') {
        return null
    }

    const parsed = Number(value)
    const maxYear = new Date().getFullYear() + 1
    if (!Number.isInteger(parsed) || parsed < 1878 || parsed > maxYear) {
        return null
    }

    return parsed
}

export const normalizeMinRating = (value) => {
    if (value === undefined || value === null || value === '') {
        return 0
    }

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        return null
    }

    if (parsed < 0 || parsed > 10) {
        return null
    }

    return Math.round(parsed * 10) / 10
}

export const matchesLanguageFilter = (item, expectedLanguage) => {
    if (!expectedLanguage) {
        return true
    }

    const expected = expectedLanguage.toLowerCase().split('-')[0]

    return String(item?.original_language || '').toLowerCase() === expected
}

export const matchesMinRatingFilter = (item, minRating) => {
    return Number(item?.vote_average || 0) >= minRating
}

const EXCLUDED_MOVIE_GENRES = [
    18, // Drama
]

const EXCLUDED_TV_NEWS_TALK_GENRES = [
    10763, // News
    10767, // Talk
]

export const isAnimeContent = (item) => {
    const genreIds = item?.genre_ids || []
    const isJapanese =
        String(item?.original_language || '').toLowerCase() === 'ja'

    return isJapanese && genreIds.includes(16)
}

export const shouldExcludedByGenre = (item) => {
    const genreIds = item?.genre_ids || []

    return (
        EXCLUDED_MOVIE_GENRES.some((id) => genreIds.includes(id)) ||
        isAnimeContent(item)
    )
}

export const shouldExcludeNewsOrTalkForTV = (item) => {
    const genreIds = item?.genre_ids || []
    return EXCLUDED_TV_NEWS_TALK_GENRES.some((id) => genreIds.includes(id))
}

app.use('/api/tmdb', burstLimiter, botGuard, checkDailyQuota)

app.get('/api/tmdb/trending', async (req, res) => {
    const timeWindow = req.query.time_window === 'day' ? 'day' : 'week'

    try {
        const data = await fromCache(
            `trending:${timeWindow}`,
            1000 * 60 * 2,
            async () => {
                const rawData = await fetchTmdb(`/trending/movie/${timeWindow}`)
                return {
                    ...rawData,
                    results: (rawData.results || []).filter(
                        (item) => !shouldExcludedByGenre(item),
                    ),
                }
            },
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load trending movies.',
        )
    }
})

app.get('/api/tmdb/discover', async (_req, res) => {
    try {
        const data = await fromCache(
            'discover:movie',
            1000 * 60 * 2,
            async () => {
                const rawData = await fetchTmdb('/discover/movie', {
                    include_adult: 'false',
                    include_null_first_air_dates: 'false',
                    language: 'en-US',
                    page: 1,
                    sort_by: 'popularity.desc',
                    with_original_language: 'en',
                })

                return {
                    ...rawData,
                    results: (rawData.results || []).filter(
                        (item) => !shouldExcludedByGenre(item),
                    ),
                }
            },
        )

        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load discover movies.',
        )
    }
})

app.get('/api/tmdb/genres', async (_req, res) => {
    try {
        const data = await fromCache(
            'genres:movie:list',
            1000 * 60 * 60 * 24,
            () => fetchTmdb('/genre/movie/list', { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to load genres.')
    }
})

app.get('/api/tmdb/search', searchLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim()
    if (!query || query.length > 120) {
        return jsonError(res, 400, 'Search query is missing or invalid.')
    }

    try {
        const data = await fromCache(
            `search:${query.toLowerCase()}`,
            1000 * 30,
            () =>
                fetchTmdb('/search/movie', {
                    language: 'en-US',
                    page: 1,
                    query,
                }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to search movies.')
    }
})

// Full-page search with pagination support
app.get('/api/tmdb/search/results', searchLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim()
    const page = validatePageNumber(req.query.page ?? 1)
    const year = normalizeSearchYear(req.query.year)
    const language = normalizeSearchLanguage(req.query.language)
    const minRating = normalizeMinRating(req.query.rating)

    if (!query || query.length > 120) {
        return jsonError(res, 400, 'Search query is missing or invalid.')
    }

    if (page === null) {
        return jsonError(res, 400, 'Invalid page request.')
    }

    if (
        (req.query.year !== undefined && year === null) ||
        (req.query.language !== undefined && language === null) ||
        minRating === null
    ) {
        return jsonError(res, 400, 'Search filters are invalid.')
    }

    try {
        const cacheKey = [
            'search',
            query.toLowerCase(),
            `page:${page}`,
            `year:${year ?? 'all'}`,
            `language:${language ?? 'all'}`,
            `rating:${minRating}`,
        ].join(':')
        const data = await fromCache(
            cacheKey,
            1000 * 60, // 60 second TTL for paginated results
            async () => {
                const rawData = await fetchTmdb('/search/movie', {
                    language: 'en-US',
                    page,
                    query,
                    include_adult: 'false',
                    ...(year ? { primary_release_year: year } : {}),
                })

                const filteredResults = (rawData.results || []).filter(
                    (item) =>
                        matchesLanguageFilter(item, language) &&
                        matchesMinRatingFilter(item, minRating),
                )

                const hasUserFilters = Boolean(language) || minRating > 0

                return {
                    ...rawData,
                    ...(hasUserFilters
                        ? {
                              page: 1,
                              total_pages: 1,
                              total_results: filteredResults.length,
                          }
                        : {}),
                    results: filteredResults,
                }
            },
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to search movies.')
    }
})

app.get('/api/tmdb/tv/trending', async (req, res) => {
    const timeWindow = req.query.time_window === 'day' ? 'day' : 'week'

    try {
        const data = await fromCache(
            `tv:trending:${timeWindow}`,
            1000 * 60 * 2,
            async () => {
                const rawData = await fetchTmdb(`/trending/tv/${timeWindow}`)
                return {
                    ...rawData,
                    results: (rawData.results || []).filter(
                        (item) => !shouldExcludeNewsOrTalkForTV(item),
                    ),
                }
            },
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load trending TV shows.',
        )
    }
})

app.get('/api/tmdb/tv/discover', async (_req, res) => {
    try {
        const data = await fromCache('discover:tv', 1000 * 60 * 2, async () => {
            const rawData = await fetchTmdb('/discover/tv', {
                include_adult: 'false',
                include_null_first_air_dates: 'false',
                language: 'en-US',
                page: 1,
                sort_by: 'popularity.desc',
                with_original_language: 'en',
            })

            return {
                ...rawData,
                results: (rawData.results || []).filter(
                    (item) => !shouldExcludeNewsOrTalkForTV(item),
                ),
            }
        })

        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load discover TV shows.',
        )
    }
})

app.get('/api/tmdb/tv/genres', async (_req, res) => {
    try {
        const data = await fromCache(
            'genres:tv:list',
            1000 * 60 * 60 * 24,
            () => fetchTmdb('/genre/tv/list', { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to load TV genres.')
    }
})

app.get('/api/tmdb/tv/search', searchLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim()
    if (!query || query.length > 120) {
        return jsonError(res, 400, 'Search query is missing or invalid.')
    }

    try {
        const data = await fromCache(
            `tv:search:${query.toLowerCase()}`,
            1000 * 30,
            () =>
                fetchTmdb('/search/tv', {
                    language: 'en-US',
                    page: 1,
                    query,
                }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to search TV shows.')
    }
})

// Full-page TV search with pagination support
app.get('/api/tmdb/tv/search/results', searchLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim()
    const page = validatePageNumber(req.query.page ?? 1)
    const year = normalizeSearchYear(req.query.year)
    const language = normalizeSearchLanguage(req.query.language)
    const minRating = normalizeMinRating(req.query.rating)

    if (!query || query.length > 120) {
        return jsonError(res, 400, 'Search query is missing or invalid.')
    }

    if (page === null) {
        return jsonError(res, 400, 'Invalid page request.')
    }

    if (
        (req.query.year !== undefined && year === null) ||
        (req.query.language !== undefined && language === null) ||
        minRating === null
    ) {
        return jsonError(res, 400, 'Search filters are invalid.')
    }

    try {
        const cacheKey = [
            'tv:search',
            query.toLowerCase(),
            `page:${page}`,
            `year:${year ?? 'all'}`,
            `language:${language ?? 'all'}`,
            `rating:${minRating}`,
        ].join(':')
        const data = await fromCache(
            cacheKey,
            1000 * 60, // 60 second TTL for paginated results
            async () => {
                const rawData = await fetchTmdb('/search/tv', {
                    language: 'en-US',
                    page,
                    query,
                    include_adult: 'false',
                    ...(year ? { first_air_date_year: year } : {}),
                })

                const filteredResults = (rawData.results || []).filter(
                    (item) =>
                        matchesLanguageFilter(item, language) &&
                        matchesMinRatingFilter(item, minRating),
                )

                const hasUserFilters = Boolean(language) || minRating > 0

                return {
                    ...rawData,
                    ...(hasUserFilters
                        ? {
                              page: 1,
                              total_pages: 1,
                              total_results: filteredResults.length,
                          }
                        : {}),
                    results: filteredResults,
                }
            },
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to search TV shows.')
    }
})

app.get('/api/tmdb/tv/:id', async (req, res) => {
    const tvId = validateTmdbId(req.params.id)
    if (!tvId) {
        return jsonError(res, 400, 'Invalid TV show id.')
    }

    try {
        const data = await fromCache(`tv:${tvId}:details`, 1000 * 60 * 10, () =>
            fetchTmdb(`/tv/${tvId}`, { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load TV show details.',
        )
    }
})

app.get('/api/tmdb/tv/:id/credits', async (req, res) => {
    const tvId = validateTmdbId(req.params.id)
    if (!tvId) {
        return jsonError(res, 400, 'Invalid TV show id.')
    }

    try {
        const data = await fromCache(`tv:${tvId}:credits`, 1000 * 60 * 10, () =>
            fetchTmdb(`/tv/${tvId}/credits`, { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to load TV credits.')
    }
})

app.get('/api/tmdb/tv/:id/recommendations', async (req, res) => {
    const tvId = validateTmdbId(req.params.id)
    const page = Number(req.query.page || 1)

    if (!tvId || !Number.isInteger(page) || page <= 0 || page > 5) {
        return jsonError(res, 400, 'Invalid recommendation request.')
    }

    try {
        const data = await fromCache(
            `tv:${tvId}:recommendations:${page}`,
            1000 * 60 * 5,
            () =>
                fetchTmdb(`/tv/${tvId}/recommendations`, {
                    language: 'en-US',
                    page,
                }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load TV recommendations.',
        )
    }
})

app.get('/api/tmdb/tv/:id/season/:season', async (req, res) => {
    const tvId = validateTmdbId(req.params.id)
    const seasonNumber = validateSeasonOrEpisodeNumber(req.params.season, 500, true)

    if (!tvId || seasonNumber === null) {
        return jsonError(res, 400, 'Invalid season request.')
    }

    try {
        const data = await fromCache(
            `tv:${tvId}:season:${seasonNumber}`,
            1000 * 60 * 10,
            () =>
                fetchTmdb(`/tv/${tvId}/season/${seasonNumber}`, {
                    language: 'en-US',
                }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load season details.',
        )
    }
})

app.get('/api/tmdb/movie/:id', async (req, res) => {
    const movieId = validateTmdbId(req.params.id)
    if (!movieId) {
        return jsonError(res, 400, 'Invalid movie id.')
    }

    try {
        const data = await fromCache(
            `movie:${movieId}:details`,
            1000 * 60 * 10,
            () => fetchTmdb(`/movie/${movieId}`, { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to load movie details.')
    }
})

app.get('/api/tmdb/movie/:id/credits', async (req, res) => {
    const movieId = validateTmdbId(req.params.id)
    if (!movieId) {
        return jsonError(res, 400, 'Invalid movie id.')
    }

    try {
        const data = await fromCache(
            `movie:${movieId}:credits`,
            1000 * 60 * 10,
            () => fetchTmdb(`/movie/${movieId}/credits`, { language: 'en-US' }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(res, error, 'Unable to load movie credits.')
    }
})

app.get('/api/tmdb/movie/:id/recommendations', async (req, res) => {
    const movieId = validateTmdbId(req.params.id)
    const page = Number(req.query.page || 1)

    if (!movieId || !Number.isInteger(page) || page <= 0 || page > 5) {
        return jsonError(res, 400, 'Invalid recommendation request.')
    }

    try {
        const data = await fromCache(
            `movie:${movieId}:recommendations:${page}`,
            1000 * 60 * 5,
            () =>
                fetchTmdb(`/movie/${movieId}/recommendations`, {
                    language: 'en-US',
                    page,
                }),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load recommendations.',
        )
    }
})

app.get('/api/tmdb/watch-providers/:type/:id', async (req, res) => {
    const mediaType = req.params.type
    const mediaId = validateTmdbId(req.params.id)

    if (
        (mediaType !== 'movie' && mediaType !== 'tv') ||
        !mediaId
    ) {
        return jsonError(res, 400, 'Invalid watch provider request.')
    }

    try {
        const data = await fromCache(
            `watch-providers:${mediaType}:${mediaId}`,
            1000 * 60 * 60 * 24,
            () => fetchTmdb(`/${mediaType}/${mediaId}/watch/providers`),
        )
        return res.json(data)
    } catch (error) {
        return handleTmdbRouteError(
            res,
            error,
            'Unable to load watch providers.',
        )
    }
})

// Feedback submission with strict security controls
const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 3, // Max 3 submissions per hour
    skip: () => DEV_MODE,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientKey,
    handler: (_req, res) => {
        res.status(429).json({
            error: 'Feedback submission limit reached. Please try again later.',
        })
    },
})

const sanitizeString = (input) => {
    if (typeof input !== 'string') {
        return ''
    }

    // Remove null bytes without a regex control character pattern
    let clean = input.replaceAll('\u0000', '')

    // Trim whitespace and limit length
    clean = clean.trim().substring(0, 2000)

    return clean
}

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const sanitized = sanitizeString(email)
    return emailRegex.test(sanitized) && sanitized.length <= 254
        ? sanitized
        : null
}

const validateFeedbackSubmission = (body) => {
    const errors = []

    const email = validateEmail(body.email)
    if (!email) {
        errors.push('Invalid email address')
    }

    const validCategories = ['bug', 'feature', 'improvement', 'other']
    if (!validCategories.includes(body.category)) {
        errors.push('Invalid feedback category')
    }

    const message = sanitizeString(body.message)
    if (message.length < 10 || message.length > 2000) {
        errors.push('Feedback must be between 10 and 2000 characters')
    }

    return { email, category: body.category, message, errors }
}

app.post('/api/feedback', feedbackLimiter, async (req, res) => {
    // Validate Content-Type
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
        return jsonError(res, 400, 'Invalid Content-Type')
    }

    // Validate body exists
    if (!req.body || typeof req.body !== 'object') {
        return jsonError(res, 400, 'Invalid request body')
    }

    // Validate and sanitize input
    const validation = validateFeedbackSubmission(req.body)
    if (validation.errors.length > 0) {
        return jsonError(res, 400, 'Validation failed')
    }

    // Log feedback securely (no PII in logs)
    console.log(
        `[FEEDBACK] Category: ${validation.category}, Length: ${validation.message.length}`,
    )

    // Send to Discord webhook
    const webhookUrl = normalizeEnvSecret(
        process.env.DISCORD_FEEDBACK_WEBHOOK_URL,
    )

    if (!webhookUrl) {
        console.warn(
            '[FEEDBACK] DISCORD_FEEDBACK_WEBHOOK_URL is not configured. Feedback was validated but not delivered.',
        )
        return res.status(200).json({
            success: true,
            message: 'Feedback received. Thank you!',
        })
    }

    const categoryConfig = {
        bug: { label: '🐛 Bug Report', color: 0xef4444 },
        feature: { label: '✨ Feature Request', color: 0xa855f7 },
        improvement: { label: '🔧 Improvement', color: 0x3b82f6 },
        other: { label: '💬 Other', color: 0x6b7280 },
    }

    const cat = categoryConfig[validation.category] || categoryConfig.other

    const embed = {
        title: cat.label,
        color: cat.color,
        fields: [
            {
                name: '📧 Email',
                value: validation.email,
                inline: true,
            },
            {
                name: '📂 Category',
                value: validation.category,
                inline: true,
            },
            {
                name: '💬 Message',
                value:
                    validation.message.length > 1024
                        ? `${validation.message.substring(0, 1021)}...`
                        : validation.message,
            },
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Cinephile Feedback',
        },
    }

    try {
        const discordController = new AbortController()
        const discordTimeout = setTimeout(
            () => discordController.abort(),
            10000,
        )

        const discordRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                allowed_mentions: { parse: [] },
                embeds: [embed],
            }),
            signal: discordController.signal,
        })

        clearTimeout(discordTimeout)

        if (!discordRes.ok) {
            const errorText = await discordRes.text().catch(() => '')
            console.error(
                `[FEEDBACK] Discord webhook failed (${discordRes.status}): ${errorText.slice(0, 200)}`,
            )
            return jsonError(
                res,
                502,
                'Feedback could not be delivered. Please try again later.',
            )
        }

        return res.status(200).json({
            success: true,
            message: 'Feedback received. Thank you!',
        })
    } catch (error) {
        const timedOut =
            error instanceof DOMException && error.name === 'AbortError'
        console.error(
            `[FEEDBACK] Discord webhook error: ${timedOut ? 'timeout' : error.message}`,
        )
        return jsonError(
            res,
            502,
            'Feedback could not be delivered. Please try again later.',
        )
    }
})

export default app
