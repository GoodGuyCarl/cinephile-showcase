<script setup lang="ts">
import { Mail, Send, CheckCircle2, ArrowRight } from 'lucide-vue-next'
import { ref, computed } from 'vue'

type FeedbackCategory = 'bug' | 'feature' | 'improvement' | 'other'

const email = ref('')
const category = ref<FeedbackCategory>('improvement')
const message = ref('')
const isSubmitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

const categories: {
    value: FeedbackCategory
    label: string
    emoji: string
    description: string
}[] = [
    {
        value: 'bug',
        label: 'Bug Report',
        emoji: '🐛',
        description: 'Something broken?',
    },
    {
        value: 'feature',
        label: 'Feature Request',
        emoji: '✨',
        description: 'Got an idea?',
    },
    {
        value: 'improvement',
        label: 'Improvement',
        emoji: '🔧',
        description: 'Make it better',
    },
    {
        value: 'other',
        label: 'Other',
        emoji: '💬',
        description: 'Anything else',
    },
]

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isEmailValid = computed(() => emailRegex.test(email.value))
const isEmailTouched = computed(() => email.value.length > 0)

const isFormValid = computed(() => {
    return isEmailValid.value && message.value.trim().length >= 10
})

const messageProgress = computed(() => {
    return Math.min((message.value.length / 2000) * 100, 100)
})

const submitFeedback = async () => {
    if (!isFormValid.value || isSubmitting.value) {
        return
    }

    isSubmitting.value = true
    submitError.value = ''

    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email.value.trim(),
                category: category.value,
                message: message.value.trim(),
            }),
        })

        if (!response.ok) {
            if (response.status === 429) {
                submitError.value =
                    'Too many feedback submissions. Please try again later.'
            } else if (response.status === 400) {
                submitError.value =
                    'Invalid feedback. Please check your entry and try again.'
            } else if (response.status >= 500) {
                submitError.value =
                    'Server error. Your feedback could not be saved.'
            } else {
                submitError.value =
                    'Failed to submit feedback. Please try again.'
            }
            return
        }

        submitSuccess.value = true
        email.value = ''
        category.value = 'improvement'
        message.value = ''

        setTimeout(() => {
            submitSuccess.value = false
        }, 5000)
    } catch (error) {
        console.error(error)
        submitError.value =
            'Network error. Please check your connection and try again.'
    } finally {
        isSubmitting.value = false
    }
}

const resetForm = () => {
    email.value = ''
    category.value = 'improvement'
    message.value = ''
    submitError.value = ''
    submitSuccess.value = false
}
</script>

<template>
    <main
        class="feedback-shell min-h-svh relative overflow-hidden text-on-surface mt-6"
    >
        <!-- Background layers -->
        <div class="absolute inset-0 shell-overlay"></div>
        <div class="absolute inset-0 shell-grain"></div>

        <!-- Floating ambient orbs -->
        <div class="ambient-orb ambient-orb-1"></div>
        <div class="ambient-orb ambient-orb-2"></div>
        <div class="ambient-orb ambient-orb-3"></div>

        <div
            class="relative z-10 max-w-screen-2xl mx-auto px-4 md:px-8 lg:px-12 py-12 md:py-16"
        >
            <div class="max-w-2xl feedback-entrance">
                <!-- Header -->
                <div class="mb-10 space-y-4">
                    <div class="space-y-3">
                        <div
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase header-badge"
                        >
                            <span class="badge-dot"></span>
                            We're listening
                        </div>
                        <h1
                            class="font-headline text-4xl md:text-5xl font-black tracking-tight header-title"
                        >
                            Help us improve
                        </h1>
                        <p
                            class="text-lg max-w-lg leading-relaxed header-subtitle"
                        >
                            Your feedback shapes the future of Cinephile. Share
                            your thoughts, report bugs, or suggest features.
                        </p>
                    </div>
                </div>

                <!-- Glassmorphism Card -->
                <div class="glass-card">
                    <div class="glass-card-inner">
                        <!-- Success State -->
                        <transition
                            enter-active-class="transition-all duration-500 ease-out"
                            enter-from-class="opacity-0 scale-90 translate-y-4"
                            enter-to-class="opacity-100 scale-100 translate-y-0"
                            leave-active-class="transition-all duration-300 ease-in"
                            leave-from-class="opacity-100 scale-100"
                            leave-to-class="opacity-0 scale-95"
                        >
                            <div v-if="submitSuccess" class="success-banner">
                                <div class="success-icon-ring">
                                    <CheckCircle2 class="w-7 h-7" />
                                </div>
                                <div class="space-y-1">
                                    <h3 class="font-bold text-lg">
                                        Thank you for your feedback!
                                    </h3>
                                    <p class="text-sm opacity-80">
                                        We appreciate your input and will review
                                        it shortly.
                                    </p>
                                </div>
                            </div>
                        </transition>

                        <form
                            @submit.prevent="submitFeedback"
                            class="space-y-7"
                        >
                            <!-- Category Pills -->
                            <div class="space-y-3">
                                <label
                                    class="block text-sm font-semibold field-label"
                                >
                                    What's this about?
                                </label>
                                <div
                                    class="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
                                >
                                    <button
                                        v-for="cat in categories"
                                        :key="cat.value"
                                        type="button"
                                        @click="category = cat.value"
                                        :class="[
                                            'category-pill',
                                            category === cat.value &&
                                                'category-pill-active',
                                        ]"
                                        :aria-pressed="
                                            category === cat.value
                                                ? 'true'
                                                : 'false'
                                        "
                                    >
                                        <span class="text-xl leading-none">{{
                                            cat.emoji
                                        }}</span>
                                        <span
                                            class="text-sm font-semibold leading-tight"
                                            >{{ cat.label }}</span
                                        >
                                        <span
                                            class="text-[11px] leading-tight opacity-60"
                                            >{{ cat.description }}</span
                                        >
                                    </button>
                                </div>
                            </div>

                            <!-- Email Field -->
                            <div class="space-y-2">
                                <label
                                    for="feedback-email"
                                    class="block text-sm font-semibold field-label"
                                >
                                    Email address
                                </label>
                                <div class="relative group">
                                    <Mail
                                        class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none field-icon"
                                    />
                                    <input
                                        id="feedback-email"
                                        v-model="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        class="glass-input glass-input-icon"
                                        required
                                        autocomplete="email"
                                    />
                                </div>
                                <p class="text-xs">
                                    <span
                                        v-if="!isEmailTouched"
                                        class="field-hint"
                                    >
                                        We'll only use this to respond if
                                        needed.
                                    </span>
                                    <span
                                        v-else-if="isEmailValid"
                                        class="field-hint-valid"
                                    >
                                        ✓ Valid email
                                    </span>
                                    <span v-else class="field-hint-invalid">
                                        Please enter a valid email address
                                    </span>
                                </p>
                            </div>

                            <!-- Message Field -->
                            <div class="space-y-2">
                                <label
                                    for="feedback-message"
                                    class="block text-sm font-semibold field-label"
                                >
                                    Your feedback
                                </label>
                                <textarea
                                    id="feedback-message"
                                    v-model="message"
                                    placeholder="Tell us what's on your mind... (minimum 10 characters)"
                                    maxlength="2000"
                                    rows="5"
                                    class="glass-input glass-textarea"
                                    required
                                ></textarea>
                                <div
                                    class="flex items-center justify-between text-xs"
                                >
                                    <p class="field-hint">
                                        <span v-if="message.length < 10">
                                            {{ 10 - message.length }} more
                                            character{{
                                                10 - message.length !== 1
                                                    ? 's'
                                                    : ''
                                            }}
                                            needed
                                        </span>
                                        <span v-else class="field-hint-valid"
                                            >✓ Looks good</span
                                        >
                                    </p>
                                    <div class="flex items-center gap-2">
                                        <div class="progress-track">
                                            <div
                                                class="progress-fill"
                                                :style="{
                                                    width: `${messageProgress}%`,
                                                }"
                                            ></div>
                                        </div>
                                        <span class="field-counter">
                                            {{ message.length }} / 2000
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- Error State -->
                            <transition
                                enter-active-class="transition-all duration-300 ease-out"
                                enter-from-class="opacity-0 translate-y-2"
                                enter-to-class="opacity-100 translate-y-0"
                                leave-active-class="transition-all duration-200 ease-in"
                                leave-from-class="opacity-100 translate-y-0"
                                leave-to-class="opacity-0 translate-y-2"
                            >
                                <div
                                    v-if="submitError"
                                    class="error-banner"
                                    role="alert"
                                >
                                    <span class="shrink-0">⚠️</span>
                                    {{ submitError }}
                                </div>
                            </transition>

                            <!-- Form Actions -->
                            <div class="flex items-center gap-3 pt-2">
                                <button
                                    type="submit"
                                    :disabled="!isFormValid || isSubmitting"
                                    class="submit-button"
                                >
                                    <span
                                        v-if="isSubmitting"
                                        class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                                    ></span>
                                    <Send
                                        v-else
                                        class="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                                    />
                                    {{
                                        isSubmitting
                                            ? 'Sending...'
                                            : 'Send feedback'
                                    }}
                                </button>

                                <button
                                    v-if="!submitSuccess"
                                    type="button"
                                    @click="resetForm"
                                    class="clear-button"
                                >
                                    Clear
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Quick Tips -->
                <div class="mt-12 pt-10 tips-divider">
                    <h3 class="font-semibold tips-title mb-4">Quick tips</h3>
                    <ul class="space-y-3">
                        <li class="tip-item">
                            <ArrowRight class="tip-icon" />
                            <span
                                >Be specific — details help us understand and
                                fix issues faster</span
                            >
                        </li>
                        <li class="tip-item">
                            <ArrowRight class="tip-icon" />
                            <span
                                >For bugs, describe what happened and what you
                                expected</span
                            >
                        </li>
                        <li class="tip-item">
                            <ArrowRight class="tip-icon" />
                            <span
                                >All feedback is reviewed by yours truly — I read
                                everything</span
                            >
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </main>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   Shell & Background
   ═══════════════════════════════════════════ */
.feedback-shell {
    background: oklch(0.13 0.02 250);
}

.shell-overlay {
    background:
        radial-gradient(
            ellipse 70% 50% at 65% 30%,
            oklch(0.28 0.06 260 / 0.5),
            transparent
        ),
        radial-gradient(
            ellipse 50% 60% at 20% 80%,
            oklch(0.22 0.04 200 / 0.3),
            transparent
        ),
        linear-gradient(
            175deg,
            oklch(0.1 0.02 250 / 0.7),
            oklch(0.14 0.02 250 / 0.95)
        );
}

.shell-grain {
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events: none;
}

/* Floating ambient orbs */
.ambient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    animation: float 20s ease-in-out infinite;
}

.ambient-orb-1 {
    width: 300px;
    height: 300px;
    top: 10%;
    right: 10%;
    background: oklch(0.4 0.12 280 / 0.15);
    animation-delay: 0s;
}

.ambient-orb-2 {
    width: 200px;
    height: 200px;
    bottom: 20%;
    left: 5%;
    background: oklch(0.35 0.1 200 / 0.1);
    animation-delay: -7s;
}

.ambient-orb-3 {
    width: 150px;
    height: 150px;
    top: 50%;
    right: 30%;
    background: oklch(0.45 0.08 80 / 0.08);
    animation-delay: -14s;
}

@keyframes float {
    0%,
    100% {
        transform: translate(0, 0) scale(1);
    }
    33% {
        transform: translate(15px, -20px) scale(1.05);
    }
    66% {
        transform: translate(-10px, 15px) scale(0.95);
    }
}

/* ═══════════════════════════════════════════
   Entrance Animation
   ═══════════════════════════════════════════ */
.feedback-entrance {
    animation: entrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes entrance {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* ═══════════════════════════════════════════
   Header
   ═══════════════════════════════════════════ */
.header-badge {
    background: oklch(0.25 0.04 260 / 0.6);
    border: 1px solid oklch(0.5 0.06 260 / 0.3);
    color: oklch(0.78 0.08 260);
    backdrop-filter: blur(8px);
}

.badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: oklch(0.75 0.15 145);
    box-shadow: 0 0 8px oklch(0.75 0.15 145 / 0.6);
    animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
    0%,
    100% {
        opacity: 1;
        box-shadow: 0 0 8px oklch(0.75 0.15 145 / 0.6);
    }
    50% {
        opacity: 0.7;
        box-shadow: 0 0 14px oklch(0.75 0.15 145 / 0.4);
    }
}

.header-title {
    color: oklch(0.95 0.01 250);
    letter-spacing: -0.02em;
}

.header-subtitle {
    color: oklch(0.65 0.03 250);
}

/* ═══════════════════════════════════════════
   Glassmorphism Card
   ═══════════════════════════════════════════ */
.glass-card {
    position: relative;
    border-radius: 1.25rem;
    padding: 1px;
    background: linear-gradient(
        135deg,
        oklch(0.55 0.06 260 / 0.4),
        oklch(0.35 0.04 250 / 0.15),
        oklch(0.5 0.05 200 / 0.25)
    );
}

.glass-card-inner {
    border-radius: calc(1.25rem - 1px);
    padding: 2rem;
    background: oklch(0.16 0.02 250 / 0.85);
    backdrop-filter: blur(24px) saturate(1.3);
    box-shadow:
        0 0 0 1px oklch(0.3 0.03 250 / 0.1) inset,
        0 1px 0 oklch(0.5 0.04 250 / 0.08) inset,
        0 8px 32px oklch(0.05 0.02 250 / 0.4),
        0 2px 8px oklch(0.05 0.02 250 / 0.2);
}

@media (min-width: 640px) {
    .glass-card-inner {
        padding: 2.5rem;
    }
}

/* ═══════════════════════════════════════════
   Category Pills
   ═══════════════════════════════════════════ */
.category-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.85rem 0.5rem;
    border-radius: 0.875rem;
    border: 1px solid oklch(0.4 0.03 250 / 0.3);
    background: oklch(0.2 0.02 250 / 0.5);
    color: oklch(0.72 0.03 250);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    text-align: center;
}

.category-pill:hover {
    border-color: oklch(0.5 0.06 260 / 0.5);
    background: oklch(0.24 0.03 260 / 0.6);
    color: oklch(0.88 0.04 260);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px oklch(0.2 0.04 260 / 0.2);
}

.category-pill:focus-visible {
    outline: 2px solid oklch(0.6 0.1 260);
    outline-offset: 2px;
}

.category-pill-active {
    border-color: oklch(0.6 0.12 260 / 0.6);
    background: linear-gradient(
        145deg,
        oklch(0.28 0.06 260 / 0.8),
        oklch(0.22 0.05 250 / 0.8)
    );
    color: oklch(0.92 0.04 260);
    box-shadow:
        0 0 0 1px oklch(0.5 0.1 260 / 0.15) inset,
        0 4px 20px oklch(0.3 0.08 260 / 0.25);
    transform: translateY(-1px);
}

/* ═══════════════════════════════════════════
   Form Fields
   ═══════════════════════════════════════════ */
.field-label {
    color: oklch(0.82 0.02 250);
    letter-spacing: 0.01em;
}

.field-icon {
    color: oklch(0.5 0.03 250);
    transition: color 0.2s ease;
}

.group:focus-within .field-icon {
    color: oklch(0.7 0.1 260);
}

.glass-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid oklch(0.35 0.03 250 / 0.4);
    background: oklch(0.14 0.015 250 / 0.6);
    color: oklch(0.92 0.01 250);
    font-size: 0.9375rem;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    outline: none;
}

.glass-input-icon {
    padding-left: 2.75rem;
}

.glass-input::placeholder {
    color: oklch(0.45 0.02 250);
}

.glass-input:focus {
    border-color: oklch(0.55 0.1 260 / 0.7);
    background: oklch(0.16 0.02 250 / 0.7);
    box-shadow:
        0 0 0 3px oklch(0.5 0.1 260 / 0.12),
        0 0 20px oklch(0.4 0.08 260 / 0.08) inset;
}

.glass-textarea {
    resize: none;
    min-height: 8rem;
}

.field-hint {
    color: oklch(0.55 0.02 250);
}

.field-hint-valid {
    color: oklch(0.7 0.12 150);
}

.field-hint-invalid {
    color: oklch(0.75 0.18 25);
}

.field-counter {
    color: oklch(0.5 0.02 250);
    font-variant-numeric: tabular-nums;
}

/* Progress track for character count */
.progress-track {
    width: 3rem;
    height: 3px;
    border-radius: 2px;
    background: oklch(0.25 0.02 250);
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, oklch(0.6 0.12 260), oklch(0.65 0.14 200));
    transition: width 0.3s ease;
}

/* ═══════════════════════════════════════════
   Success & Error Banners
   ═══════════════════════════════════════════ */
.success-banner {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    border-radius: 0.875rem;
    background: linear-gradient(
        135deg,
        oklch(0.3 0.08 150 / 0.2),
        oklch(0.25 0.06 160 / 0.15)
    );
    border: 1px solid oklch(0.6 0.12 150 / 0.3);
    color: oklch(0.85 0.08 150);
    margin-bottom: 0.5rem;
}

.success-icon-ring {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: oklch(0.6 0.15 150 / 0.15);
    color: oklch(0.75 0.15 150);
    flex-shrink: 0;
    animation: success-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes success-pop {
    0% {
        transform: scale(0);
    }
    60% {
        transform: scale(1.2);
    }
    100% {
        transform: scale(1);
    }
}

.error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: 0.75rem;
    background: oklch(0.25 0.06 25 / 0.3);
    border: 1px solid oklch(0.55 0.15 25 / 0.3);
    color: oklch(0.82 0.1 25);
    font-size: 0.875rem;
}

/* ═══════════════════════════════════════════
   Buttons
   ═══════════════════════════════════════════ */
.submit-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 0.75rem;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: linear-gradient(
        135deg,
        oklch(0.55 0.12 260),
        oklch(0.5 0.14 280)
    );
    color: oklch(0.98 0 0);
    box-shadow:
        0 2px 8px oklch(0.4 0.1 260 / 0.3),
        0 0 0 1px oklch(0.6 0.1 260 / 0.15) inset;
}

.submit-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow:
        0 4px 16px oklch(0.4 0.12 260 / 0.4),
        0 0 0 1px oklch(0.65 0.12 260 / 0.2) inset;
    background: linear-gradient(
        135deg,
        oklch(0.6 0.13 260),
        oklch(0.55 0.15 280)
    );
}

.submit-button:active:not(:disabled) {
    transform: translateY(0);
}

.submit-button:disabled {
    cursor: not-allowed;
    transform: none;
    background: oklch(0.25 0.01 250);
    color: oklch(0.45 0.01 250);
    box-shadow: none;
}

.clear-button {
    padding: 0.75rem 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid oklch(0.35 0.03 250 / 0.4);
    background: transparent;
    color: oklch(0.7 0.02 250);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.clear-button:hover {
    border-color: oklch(0.45 0.04 250 / 0.5);
    background: oklch(0.2 0.02 250 / 0.3);
    color: oklch(0.85 0.02 250);
}

/* ═══════════════════════════════════════════
   Quick Tips
   ═══════════════════════════════════════════ */
.tips-divider {
    border-top: 1px solid oklch(0.3 0.03 250 / 0.25);
}

.tips-title {
    color: oklch(0.78 0.02 250);
}

.tip-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: oklch(0.6 0.02 250);
    line-height: 1.5;
}

.tip-icon {
    width: 1rem;
    height: 1rem;
    margin-top: 0.2rem;
    flex-shrink: 0;
    color: oklch(0.55 0.08 260);
}
</style>
