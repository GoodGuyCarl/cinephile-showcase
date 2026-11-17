import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveApp } from './helpers/serve.js'

let app
let baseUrl

beforeAll(async () => {
    app = await serveApp({
        env: { DEBUG_MODE: 'false', TRUST_PROXY: 'false' },
        unset: ['VERCEL'],
    })
    baseUrl = app.baseUrl
})

afterAll(async () => {
    await app.close()
})

const search = (forwardedFor) =>
    fetch(`${baseUrl}/api/tmdb/search?q=`, {
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; test)',
            'x-forwarded-for': forwardedFor,
        },
    })

describe('rate limit buckets with no proxy in front', () => {
    it('ignores a forwarded address the caller made up', async () => {
        const statuses = []
        for (let i = 1; i <= 32; i += 1) {
            const response = await search(`198.51.100.${i}`)
            statuses.push(response.status)
        }

        expect(statuses.slice(0, 30)).toEqual(Array(30).fill(400))
        expect(statuses.slice(30)).toEqual([429, 429])
    })
})
