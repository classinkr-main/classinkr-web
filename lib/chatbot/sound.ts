/**
 * Web Audio API based Synthesized UI Sound Effects
 * Creates pure, clean micro audio feedbacks without downloading files
 */

let audioCtx: AudioContext | null = null

const isBrowser = typeof window !== "undefined"
let isMutedState = false

// Restore settings from localStorage on client side
if (isBrowser) {
    isMutedState = localStorage.getItem("classin_chatbot_muted") === "true"
}

function getAudioContext(): AudioContext | null {
    if (!isBrowser) return null
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
            audioCtx = new AudioContextClass()
        }
    }
    return audioCtx
}

export function isMuted(): boolean {
    return isMutedState
}

export function setMuted(muted: boolean): void {
    isMutedState = muted
    if (isBrowser) {
        localStorage.setItem("classin_chatbot_muted", muted ? "true" : "false")
    }
}

/**
 * 1. Open Dialog Sound
 * Sine wave sweep that rises smoothly from 320Hz to 640Hz (Arpeggio effect)
 */
export function playOpenSound(): void {
    if (isMutedState) return
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
        void ctx.resume()
    }

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.18)

    gainNode.gain.setValueAtTime(0.001, now)
    gainNode.gain.linearRampToValueAtTime(0.05, now + 0.04)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.18)
}

/**
 * 2. Close Dialog Sound
 * Sine wave sweep that falls smoothly from 500Hz to 250Hz
 */
export function playCloseSound(): void {
    if (isMutedState) return
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
        void ctx.resume()
    }

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(500, now)
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.15)

    gainNode.gain.setValueAtTime(0.001, now)
    gainNode.gain.linearRampToValueAtTime(0.04, now + 0.03)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.15)
}

/**
 * 3. Message Send Sound
 * Short band-passed noise burst (Swoosh effect)
 */
export function playSendSound(): void {
    if (isMutedState) return
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
        void ctx.resume()
    }

    const now = ctx.currentTime
    const bufferSize = ctx.sampleRate * 0.08
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    // Populate with white noise
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.setValueAtTime(1000, now)
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.08)
    filter.Q.setValueAtTime(4, now)

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0.06, now)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    noise.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)

    noise.start(now)
    noise.stop(now + 0.08)
}

/**
 * 4. Message Receive Finish Sound
 * Resonant double-sine wave synthesis mimicking a metal bell (Ting effect)
 */
export function playReceiveSound(): void {
    if (isMutedState) return
    const ctx = getAudioContext()
    if (!ctx) return

    if (ctx.state === "suspended") {
        void ctx.resume()
    }

    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain()
    const gain2 = ctx.createGain()

    osc1.type = "sine"
    osc1.frequency.setValueAtTime(987.77, now) // B5 note

    osc2.type = "sine"
    osc2.frequency.setValueAtTime(1479.98, now) // F#6 note (harmonic 5th)

    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.linearRampToValueAtTime(0.06, now + 0.01)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    gain2.gain.setValueAtTime(0.001, now)
    gain2.gain.linearRampToValueAtTime(0.02, now + 0.005)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.20)

    osc1.connect(gain1)
    osc2.connect(gain2)

    gain1.connect(ctx.destination)
    gain2.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)

    osc1.stop(now + 0.45)
    osc2.stop(now + 0.45)
}
