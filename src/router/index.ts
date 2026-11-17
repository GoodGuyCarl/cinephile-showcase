import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    scrollBehavior(_to, _from, savedPosition) {
        if (savedPosition) {
            return savedPosition
        }

        return { left: 0, top: 0 }
    },
    routes: [
        {
            path: '/',
            name: 'home',
            component: () => import('@/views/HomeView.vue'),
            meta: { title: 'CINEPHILE' },
        },
        {
            path: '/movie/:id',
            name: 'movie',
            component: () => import('@/views/MovieView.vue'),
            meta: { hideNav: true, title: 'Movie Details' },
        },
        {
            path: '/tv/:id',
            name: 'tv',
            component: () => import('@/views/TVView.vue'),
            meta: { hideNav: true, title: 'TV Details' },
        },
        {
            path: '/shows',
            name: 'shows',
            component: () => import('@/views/ShowsView.vue'),
            meta: { title: 'Shows' },
        },
        {
            path: '/search',
            name: 'search',
            component: () => import('@/views/SearchPageView.vue'),
            meta: { title: 'Search Results' },
        },
        {
            path: '/anime',
            name: 'anime',
            component: () => import('@/views/ComingSoonView.vue'),
            meta: { title: 'Anime' },
        },
        {
            path: '/feedback',
            name: 'feedback',
            component: () => import('@/views/FeedbackView.vue'),
            meta: { title: 'Feedback' },
        },
    ],
})

export default router
