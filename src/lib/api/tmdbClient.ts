const DEFAULT_PROXY_TIMEOUT_MS = 15000

type TmdbProxyGetOptions = {
    signal?: AbortSignal
    timeoutMs?: number
}

export class TmdbApiError extends Error {
    status: number | null
    code: string
    details: unknown

    constructor(
        message: string,
        options: {
            status?: number | null
            code: string
            details?: unknown
        },
    ) {
        super(message)
        this.name = 'TmdbApiError'
        this.status = options.status ?? null
        this.code = options.code
        this.details = options.details
    }
}

const normalizeOptions = (
    signalOrOptions?: AbortSignal | TmdbProxyGetOptions,
): TmdbProxyGetOptions => {
    if (!signalOrOptions) {
        return {}
    }

    if (
        typeof signalOrOptions === 'object' &&
        'aborted' in signalOrOptions &&
        'addEventListener' in signalOrOptions
    ) {
        return { signal: signalOrOptions as AbortSignal }
    }

    return signalOrOptions as TmdbProxyGetOptions
}

export const tmdbProxyGet = async <T>(
    path: string,
    signalOrOptions?: AbortSignal | TmdbProxyGetOptions,
): Promise<T> => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const options = normalizeOptions(signalOrOptions)
    const timeoutMs =
        typeof options.timeoutMs === 'number' && options.timeoutMs > 0
            ? Math.floor(options.timeoutMs)
            : DEFAULT_PROXY_TIMEOUT_MS

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const forwardAbort = () => controller.abort()
    options.signal?.addEventListener('abort', forwardAbort)

    if (options.signal?.aborted) {
        controller.abort()
    }

    try {
        const response = await fetch(`/api/tmdb${normalizedPath}`, {
            method: 'GET',
            headers: {
                accept: 'application/json',
            },
            signal: controller.signal,
        })

        if (!response.ok) {
            let errorPayload: unknown = null
            try {
                errorPayload = await response.json()
            } catch {
                errorPayload = null
            }

            const responseError =
                typeof errorPayload === 'object' &&
                errorPayload !== null &&
                'error' in errorPayload &&
                typeof (errorPayload as { error?: unknown }).error === 'string'
                    ? (errorPayload as { error: string }).error
                    : `Proxy request failed (${response.status})`

            throw new TmdbApiError(responseError, {
                status: response.status,
                code: 'HTTP_ERROR',
                details: errorPayload,
            })
        }

        return (await response.json()) as T
    } catch (error) {
        const timedOut =
            error instanceof DOMException &&
            error.name === 'AbortError' &&
            !options.signal?.aborted

        if (timedOut) {
            throw new TmdbApiError(`Request timed out after ${timeoutMs}ms`, {
                status: 504,
                code: 'TIMEOUT',
            })
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error
        }

        if (error instanceof TmdbApiError) {
            throw error
        }

        throw new TmdbApiError('Network request failed.', {
            status: null,
            code: 'NETWORK_ERROR',
            details: error,
        })
    } finally {
        clearTimeout(timeoutId)
        options.signal?.removeEventListener('abort', forwardAbort)
    }
}
