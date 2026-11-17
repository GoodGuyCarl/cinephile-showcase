process.env.VERCEL = '1'

const {
    isAnimeContent,
    matchesLanguageFilter,
    matchesMinRatingFilter,
    normalizeMinRating,
    normalizeSearchLanguage,
    normalizeSearchYear,
    shouldExcludedByGenre,
    shouldExcludeNewsOrTalkForTV,
    validatePageNumber,
    validateSeasonOrEpisodeNumber,
    validateTmdbId,
} = await import('../server/index.js')

import { describe, expect, it } from 'vitest'

describe('matchesLanguageFilter', () => {
    it('matches exact language', () => {
        expect(
            matchesLanguageFilter({ original_language: 'en' }, 'en'),
        ).toBe(true)
    })

    it('matches base language of region code', () => {
        expect(
            matchesLanguageFilter({ original_language: 'en' }, 'en-US'),
        ).toBe(true)
    })

    it('compares case-insensitively', () => {
        expect(
            matchesLanguageFilter({ original_language: 'en' }, 'EN-us'),
        ).toBe(true)
    })

    it('rejects a different language', () => {
        expect(
            matchesLanguageFilter({ original_language: 'ja' }, 'en'),
        ).toBe(false)
    })

    it('passes everything when no language is expected', () => {
        expect(
            matchesLanguageFilter({ original_language: 'ja' }, undefined),
        ).toBe(true)
        expect(matchesLanguageFilter({ original_language: 'ja' }, '')).toBe(
            true,
        )
    })

    it('returns false for missing items instead of throwing', () => {
        expect(matchesLanguageFilter(undefined, 'en')).toBe(false)
        expect(matchesLanguageFilter({}, 'en')).toBe(false)
    })
})

describe('matchesMinRatingFilter', () => {
    it('keeps items at or above the floor', () => {
        expect(matchesMinRatingFilter({ vote_average: 8 }, 7)).toBe(true)
        expect(matchesMinRatingFilter({ vote_average: 7 }, 7)).toBe(true)
    })

    it('drops items below the floor', () => {
        expect(matchesMinRatingFilter({ vote_average: 5 }, 7)).toBe(false)
        expect(matchesMinRatingFilter({}, 1)).toBe(false)
    })
})

describe('validatePageNumber', () => {
    it('accepts pages within range', () => {
        expect(validatePageNumber(1)).toBe(1)
        expect(validatePageNumber(6)).toBe(6)
        expect(validatePageNumber(1000)).toBe(1000)
    })

    it('rejects pages above the max', () => {
        expect(validatePageNumber(1001)).toBeNull()
    })

    it('rejects non-integer and out-of-range values', () => {
        expect(validatePageNumber('abc')).toBeNull()
        expect(validatePageNumber(0)).toBeNull()
        expect(validatePageNumber(-1)).toBeNull()
        expect(validatePageNumber(NaN)).toBeNull()
        expect(validatePageNumber(1.5)).toBeNull()
    })

    it('rejects a missing page instead of defaulting to 1', () => {
        expect(validatePageNumber(undefined)).toBeNull()
    })
})

describe('validateSeasonOrEpisodeNumber', () => {
    it('rejects zero unless zero is allowed', () => {
        expect(validateSeasonOrEpisodeNumber(0)).toBeNull()
        expect(validateSeasonOrEpisodeNumber(1)).toBe(1)
    })

    it('accepts season zero when zero is allowed', () => {
        expect(validateSeasonOrEpisodeNumber('0', 500, true)).toBe(0)
        expect(validateSeasonOrEpisodeNumber(1, 500, true)).toBe(1)
    })

    it('still enforces bounds when zero is allowed', () => {
        expect(validateSeasonOrEpisodeNumber(-1, 500, true)).toBeNull()
        expect(validateSeasonOrEpisodeNumber(501, 500, true)).toBeNull()
    })
})

describe('normalizeSearchLanguage', () => {
    it('keeps well-formed tags unchanged', () => {
        expect(normalizeSearchLanguage('en-US')).toBe('en-US')
        expect(normalizeSearchLanguage('en')).toBe('en')
    })

    it('rejects malformed tags and non-strings', () => {
        expect(normalizeSearchLanguage('e')).toBeNull()
        expect(normalizeSearchLanguage('english')).toBeNull()
        expect(normalizeSearchLanguage('')).toBeNull()
        expect(normalizeSearchLanguage(null)).toBeNull()
        expect(normalizeSearchLanguage(123)).toBeNull()
    })

    it('rejects a lowercase region', () => {
        expect(normalizeSearchLanguage('en-us')).toBeNull()
    })
})

describe('normalizeSearchYear', () => {
    it('accepts a full year', () => {
        expect(normalizeSearchYear('2024')).toBe(2024)
    })

    it('rejects partial years and out-of-range values', () => {
        expect(normalizeSearchYear('2')).toBeNull()
        expect(normalizeSearchYear(1877)).toBeNull()
        expect(normalizeSearchYear('abc')).toBeNull()
    })

    it('treats a missing year as no filter', () => {
        expect(normalizeSearchYear(undefined)).toBeNull()
        expect(normalizeSearchYear(null)).toBeNull()
        expect(normalizeSearchYear('')).toBeNull()
    })
})

describe('normalizeMinRating', () => {
    it('defaults to zero when absent', () => {
        expect(normalizeMinRating(undefined)).toBe(0)
        expect(normalizeMinRating(null)).toBe(0)
        expect(normalizeMinRating('')).toBe(0)
    })

    it('rounds to one decimal place', () => {
        expect(normalizeMinRating('9')).toBe(9)
        expect(normalizeMinRating('9.05')).toBe(9.1)
    })

    it('rejects ratings outside 0 to 10', () => {
        expect(normalizeMinRating(11)).toBeNull()
        expect(normalizeMinRating(-1)).toBeNull()
    })
})

describe('isAnimeContent', () => {
    it('flags Japanese animation', () => {
        expect(
            isAnimeContent({ original_language: 'ja', genre_ids: [16] }),
        ).toBe(true)
    })

    it('keeps Japanese live action', () => {
        expect(
            isAnimeContent({ original_language: 'ja', genre_ids: [28, 878] }),
        ).toBe(false)
    })

    it('keeps non-Japanese animation', () => {
        expect(
            isAnimeContent({ original_language: 'en', genre_ids: [16] }),
        ).toBe(false)
    })

    it('returns false for missing items instead of throwing', () => {
        expect(isAnimeContent({})).toBe(false)
        expect(isAnimeContent(undefined)).toBe(false)
    })
})

describe('shouldExcludedByGenre', () => {
    it('excludes Drama movies', () => {
        expect(shouldExcludedByGenre({ genre_ids: [18] })).toBe(true)
    })

    it('keeps non-excluded movie genres', () => {
        expect(shouldExcludedByGenre({ genre_ids: [28] })).toBe(false)
    })

    it('keeps items without genres', () => {
        expect(shouldExcludedByGenre({})).toBe(false)
    })
})

describe('shouldExcludeNewsOrTalkForTV', () => {
    it('excludes News and Talk', () => {
        expect(shouldExcludeNewsOrTalkForTV({ genre_ids: [10763] })).toBe(true)
        expect(shouldExcludeNewsOrTalkForTV({ genre_ids: [10767] })).toBe(true)
    })

    it('keeps other genres and missing items', () => {
        expect(shouldExcludeNewsOrTalkForTV({ genre_ids: [18] })).toBe(false)
        expect(shouldExcludeNewsOrTalkForTV(undefined)).toBe(false)
    })
})

describe('validateTmdbId', () => {
    it('accepts a numeric id string', () => {
        expect(validateTmdbId('550')).toBe(550)
    })

    it('rejects non-numeric, zero, negative and empty ids', () => {
        expect(validateTmdbId('abc')).toBeNull()
        expect(validateTmdbId('0')).toBeNull()
        expect(validateTmdbId('-1')).toBeNull()
        expect(validateTmdbId('')).toBeNull()
    })

    it('accepts leading zeros as the same numeric id', () => {
        expect(validateTmdbId('0550')).toBe(550)
    })
})
