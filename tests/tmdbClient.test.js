import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TmdbApiError, tmdbProxyGet } from '../src/lib/api/tmdbClient.ts'

const fetchMock = vi.fn()

beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
})

const errorResponse = (status, body) => ({
    ok: false,
    status,
    json: async () => body,
})

const neverSettlingFetch = (url, init) => {
    return new Promise((resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
            reject(new DOMException('This operation was aborted', 'AbortError'))
            return
        }
        signal?.addEventListener('abort', () => {
            reject(new DOMException('This operation was aborted', 'AbortError'))
        })
    })
}

describe('tmdbProxyGet', () => {
    it('accepts a bare AbortSignal as the second argument', async () => {
        fetchMock.mockResolvedValue(okResponse({ title: 'Fight Club' }))
        const controller = new AbortController()
        const result = await tmdbProxyGet('movie/550', controller.signal)
        expect(result).toEqual({ title: 'Fight Club' })
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('accepts an options object with signal and timeoutMs', async () => {
        fetchMock.mockResolvedValue(okResponse({ title: 'Dune' }))
        const controller = new AbortController()
        const result = await tmdbProxyGet('movie/550', {
            signal: controller.signal,
            timeoutMs: 1000,
        })
        expect(result).toEqual({ title: 'Dune' })
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('normalises a path without a leading slash', async () => {
        fetchMock.mockResolvedValue(okResponse({}))
        await tmdbProxyGet('movie/550')
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.calls[0][0]).toBe('/api/tmdb/movie/550')
    })

    it('resolves a 200 JSON response to the parsed body', async () => {
        fetchMock.mockResolvedValue(okResponse({ id: 550, title: 'Fight Club' }))
        const result = await tmdbProxyGet('movie/550')
        expect(result).toEqual({ id: 550, title: 'Fight Club' })
    })

    it('rejects a non-2xx response with the server error message', async () => {
        const body = { error: 'Movie not found', stack: 'secret-stack', raw: 'secret-body' }
        fetchMock.mockResolvedValue(errorResponse(404, body))
        const error = await tmdbProxyGet('movie/999').catch((e) => e)
        expect(error).toBeInstanceOf(TmdbApiError)
        expect(error.code).toBe('HTTP_ERROR')
        expect(error.status).toBe(404)
        expect(error.message).toBe('Movie not found')
        expect(error.message).not.toContain('secret-stack')
        expect(error.message).not.toContain('secret-body')
    })

    it('rejects with HTTP_ERROR when the error body has no JSON', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => {
                throw new SyntaxError('Unexpected end of JSON input')
            },
        })
        const error = await tmdbProxyGet('movie/550').catch((e) => e)
        expect(error).toBeInstanceOf(TmdbApiError)
        expect(error.code).toBe('HTTP_ERROR')
        expect(error.status).toBe(500)
    })

    it('rejects with NETWORK_ERROR when fetch fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'))
        const error = await tmdbProxyGet('movie/550').catch((e) => e)
        expect(error).toBeInstanceOf(TmdbApiError)
        expect(error.code).toBe('NETWORK_ERROR')
        expect(error.status).toBeNull()
    })

    it('rejects with TIMEOUT when the internal timeout fires', async () => {
        fetchMock.mockImplementation(neverSettlingFetch)
        const error = await tmdbProxyGet('movie/550', { timeoutMs: 20 }).catch((e) => e)
        expect(error).toBeInstanceOf(TmdbApiError)
        expect(error.code).toBe('TIMEOUT')
        expect(error.status).toBe(504)
    })

    it('rejects with AbortError when the caller aborts', async () => {
        fetchMock.mockImplementation(neverSettlingFetch)
        const caller = new AbortController()
        const pending = tmdbProxyGet('movie/550', {
            signal: caller.signal,
            timeoutMs: 5000,
        })
        setTimeout(() => caller.abort(), 10)
        const error = await pending.catch((e) => e)
        expect(error).toBeInstanceOf(DOMException)
        expect(error.name).toBe('AbortError')
        expect(error).not.toBeInstanceOf(TmdbApiError)
    })

    it('aborts immediately when the signal is already aborted', async () => {
        const caller = new AbortController()
        caller.abort()
        fetchMock.mockImplementation((url, init) => {
            if (init?.signal?.aborted) {
                return Promise.reject(
                    new DOMException('This operation was aborted', 'AbortError'),
                )
            }
            return Promise.resolve(okResponse({ ok: true }))
        })
        const error = await tmdbProxyGet('movie/550', caller.signal).catch((e) => e)
        expect(error).toBeInstanceOf(DOMException)
        expect(error.name).toBe('AbortError')
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    })
})
