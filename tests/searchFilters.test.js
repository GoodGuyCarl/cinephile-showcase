process.env.VERCEL = '1'

import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const realFetch = globalThis.fetch

const DRAMA_MOVIE = {
    id: 550,
    title: 'Fight Club',
    genre_ids: [18, 53],
    original_language: 'en',
    vote_average: 8.4,
}
const ACTION_MOVIE = {
    id: 603,
    title: 'The Matrix',
    genre_ids: [28, 878],
    original_language: 'en',
    vote_average: 8.2,
}
const NEWS_SHOW = {
    id: 9999,
    name: '60 Minutes',
    genre_ids: [10763],
    original_language: 'en',
    vote_average: 7,
}
const DRAMA_SHOW = {
    id: 1396,
    name: 'Breaking Bad',
    genre_ids: [18, 80],
    original_language: 'en',
    vote_average: 8.9,
}

const listPayload = (results) => ({
    page: 1,
    total_pages: 1,
    total_results: results.length,
    results,
})

const payloadFor = (pathname) => {
    if (/^\/(search|discover|trending)\/movie/.test(pathname)) {
        return listPayload([DRAMA_MOVIE, ACTION_MOVIE])
    }

    return listPayload([NEWS_SHOW, DRAMA_SHOW])
}

let server
let baseUrl

beforeAll(async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => {
            const target = new URL(String(url))
            if (target.hostname !== 'api.themoviedb.org') {
                return realFetch(url)
            }

            const payload = payloadFor(target.pathname.replace(/^\/3/, ''))
            return { ok: true, status: 200, json: async () => payload }
        }),
    )

    const { default: app } = await import('../server/index.js')
    server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
    vi.unstubAllGlobals()
    await new Promise((resolve) => server.close(resolve))
})

const getJson = async (path) => {
    const response = await realFetch(`${baseUrl}${path}`)
    expect(response.status).toBe(200)
    return response.json()
}

const ids = (payload) => payload.results.map((item) => item.id)

describe('search returns every row TMDB sent', () => {
    it('keeps a Drama movie in the typeahead search', async () => {
        expect(ids(await getJson('/api/tmdb/search?q=fight'))).toEqual([
            550, 603,
        ])
    })

    it('keeps a Drama movie in the paginated search', async () => {
        expect(ids(await getJson('/api/tmdb/search/results?q=fight'))).toEqual(
            [550, 603],
        )
    })

    it('keeps a News show in the typeahead TV search', async () => {
        expect(ids(await getJson('/api/tmdb/tv/search?q=60'))).toEqual([
            9999, 1396,
        ])
    })

    it('keeps a News show in the paginated TV search', async () => {
        expect(ids(await getJson('/api/tmdb/tv/search/results?q=60'))).toEqual(
            [9999, 1396],
        )
    })
})

describe('browse lists keep their genre exclusions', () => {
    it('leaves the Drama movie out of trending', async () => {
        expect(ids(await getJson('/api/tmdb/trending'))).toEqual([603])
    })

    it('leaves the Drama movie out of discover', async () => {
        expect(ids(await getJson('/api/tmdb/discover'))).toEqual([603])
    })

    it('leaves the News show out of trending TV', async () => {
        expect(ids(await getJson('/api/tmdb/tv/trending'))).toEqual([1396])
    })

    it('leaves the News show out of discover TV', async () => {
        expect(ids(await getJson('/api/tmdb/tv/discover'))).toEqual([1396])
    })
})
