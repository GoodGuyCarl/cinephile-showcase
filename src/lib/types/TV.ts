export interface TVShow {
    adult: boolean
    backdrop_path: string | null
    genre_ids: number[]
    id: number
    name: string
    origin_country: string[]
    original_language: string
    original_name: string
    overview: string
    poster_path: string | null
    popularity: number
    first_air_date: string
    vote_average: number
    vote_count: number
}

export interface TVGenre {
    id: number
    name: string
}

export interface TVSeasonSummary {
    id: number
    season_number: number
    name: string
    episode_count: number
    poster_path: string | null
}

export interface TVEpisode {
    id: number
    episode_number: number
    name: string
    overview: string
    still_path: string | null
    air_date: string
}

export interface TVDetails {
    id: number
    name: string
    overview: string
    first_air_date: string
    vote_average: number
    backdrop_path: string | null
    poster_path: string | null
    genres: TVGenre[]
    number_of_seasons: number
    number_of_episodes: number
    seasons: TVSeasonSummary[]
}

export interface TVSeasonDetails {
    id: number
    name: string
    season_number: number
    overview: string
    air_date: string
    episodes: TVEpisode[]
}

export interface TVCastMember {
    id: number
    name: string
    character: string
    profile_path: string | null
}

export interface TVCrewMember {
    id: number
    name: string
    job: string
}

export interface TVCreditsResponse {
    cast?: TVCastMember[]
    crew?: TVCrewMember[]
}

export interface TVRecommendationsResponse {
    results?: TVShow[]
}
