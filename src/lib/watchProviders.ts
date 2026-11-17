export type WatchProvider = {
    provider_name: string
    logo_path: string | null
    display_priority: number
}

export type WatchProviderRegion = {
    link?: string
    flatrate?: WatchProvider[]
    free?: WatchProvider[]
    ads?: WatchProvider[]
    rent?: WatchProvider[]
    buy?: WatchProvider[]
}

export type WatchProvidersResponse = {
    id: number
    results?: Record<string, WatchProviderRegion>
}

/** Best-effort region for TMDB availability, defaulting to the US. */
export const getWatchRegion = () => {
    if (typeof navigator === 'undefined') {
        return 'US'
    }

    const locale = navigator.languages?.[0] || navigator.language || ''
    const region = locale.split('-')[1]

    return region ? region.toUpperCase() : 'US'
}
