import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveApp } from './helpers/serve.js'

let app
let baseUrl

beforeAll(async () => {
    app = await serveApp({
        env: { DEBUG_MODE: 'false', TRUST_PROXY: 'true' },
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

const callMany = async (forwardedForFor) => {
    const statuses = []
    for (let i = 1; i <= 32; i += 1) {
        const response = await search(forwardedForFor(i))
        statuses.push(response.status)
    }
    return statuses
}

describe('rate limit buckets behind a trusted proxy', () => {
    it('keys on the forwarded client address', async () => {
        const statuses = await callMany(() => '203.0.113.7')

        expect(statuses.slice(0, 30)).toEqual(Array(30).fill(400))
        expect(statuses.slice(30)).toEqual([429, 429])
    })

    it('treats two forwarded clients as two buckets', async () => {
        const statuses = await callMany((i) => `203.0.114.${i}`)

        expect(statuses).toEqual(Array(32).fill(400))
    })
})
