<script setup lang="ts">
import { computed } from 'vue'
import type { WatchProviderRegion } from '@/lib/watchProviders'

const props = defineProps<{
    region: WatchProviderRegion | null
}>()

const providers = computed(() => {
    const region = props.region
    if (!region) {
        return []
    }

    const preferred =
        region.flatrate?.length
            ? region.flatrate
            : region.free?.length
              ? region.free
              : region.rent?.length
                ? region.rent
                : region.buy

    return (preferred ?? []).slice(0, 6)
})

const watchLink = computed(() => props.region?.link ?? '')
</script>

<template>
    <div v-if="providers.length && watchLink" class="space-y-2">
        <p
            class="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-label"
        >
            Where to watch
        </p>
        <div class="flex flex-wrap items-center gap-2">
            <a
                v-for="provider in providers"
                :key="provider.provider_name"
                :href="watchLink"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-lg border border-white/15 bg-black/30 p-1 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
                <img
                    v-if="provider.logo_path"
                    :src="`https://image.tmdb.org/t/p/w45${provider.logo_path}`"
                    :alt="provider.provider_name"
                    class="h-8 w-8 rounded-md object-cover"
                    loading="lazy"
                />
                <span
                    v-else
                    class="flex h-8 items-center px-2 text-xs font-semibold text-white"
                >
                    {{ provider.provider_name }}
                </span>
            </a>
        </div>
        <p class="text-[0.65rem] text-on-surface-variant">
            Streaming data powered by JustWatch
        </p>
    </div>
</template>
