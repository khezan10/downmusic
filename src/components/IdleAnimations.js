'use client'

import { useEffect, useRef } from 'react'

/**
 * Idle animations for the hero, ported from the Zanara landing page
 * (`zanara-project/src/idle.js` and `src/title.js`):
 *
 *   1. Eyebrow glitch — periodic RGB split + skew, then clean.
 *   2. Card breathe — the input card pulses a soft lime glow.
 *   3. Title hop — hovering the title bounces each letter once.
 *
 * All of them pause when the tab is hidden, and none of them gate on
 * `prefers-reduced-motion`: the user has Windows animations off, so the page
 * must not look dead. Reduced motion only removes the *movement*.
 */
export default function IdleAnimations({ titleRef, eyebrowRef, cardRef }) {
  const frameRef = useRef(null)

  useEffect(() => {
    let running = true
    const onVisibility = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    // --- 1. Eyebrow glitch ---------------------------------------------
    const eyebrow = eyebrowRef?.current
    let glitchTimer = null

    const scheduleGlitch = () => {
      glitchTimer = setTimeout(() => {
        if (!running) return scheduleGlitch()

        eyebrow.style.textShadow = '-2px 0 rgba(255,60,120,0.8), 2px 0 rgba(180,255,43,0.8)'
        eyebrow.style.transform = 'translateX(2px) skewX(-8deg)'

        setTimeout(() => {
          eyebrow.style.textShadow = 'none'
          eyebrow.style.transform = 'none'
        }, 140)

        setTimeout(() => {
          if (!running) return scheduleGlitch()
          eyebrow.style.textShadow = '2px 0 rgba(255,60,120,0.8), -2px 0 rgba(180,255,43,0.8)'
          eyebrow.style.transform = 'translateX(-2px) skewX(6deg)'

          setTimeout(() => {
            eyebrow.style.textShadow = 'none'
            eyebrow.style.transform = 'none'
          }, 110)
        }, 220)

        scheduleGlitch()
      }, 5000 + Math.random() * 4000)
    }

    if (eyebrow) scheduleGlitch()

    // --- 2. Card breathe ----------------------------------------------
    const card = cardRef?.current
    const t0 = performance.now()

    const breathe = (now) => {
      frameRef.current = requestAnimationFrame(breathe)
      if (!running || !card) return
      const t = (now - t0) * 0.001
      const g = 0.5 + 0.5 * Math.sin(t * 2.09)
      card.style.boxShadow = `0 0 ${(10 + g * 18).toFixed(1)}px rgba(180,255,43,${(
        0.05 +
        g * 0.1
      ).toFixed(3)}), inset 0 0 ${(6 + g * 10).toFixed(1)}px rgba(180,255,43,0.04)`
    }

    if (card) frameRef.current = requestAnimationFrame(breathe)

    // --- 3. Title hop on hover ---------------------------------------
    const title = titleRef?.current
    let tickFrame = null
    const chars = title ? Array.from(title.querySelectorAll('.ch')) : []

    chars.forEach((el) => {
      el.style.pointerEvents = 'auto'
      el.addEventListener('pointerenter', () => {
        el._hop = 1
      })
    })

    const tick = () => {
      tickFrame = requestAnimationFrame(tick)
      if (!running) return
      chars.forEach((el) => {
        if (el._hop > 0) {
          el._hop = Math.max(0, el._hop - 0.06)
          const y = -Math.sin(el._hop * Math.PI) * 22
          el.style.transform = `translateY(${y.toFixed(2)}px)`
        } else if (el.style.transform !== 'translateY(0px)') {
          el.style.transform = 'translateY(0px)'
        }
      })
    }

    if (chars.length) tickFrame = requestAnimationFrame(tick)

    return () => {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(glitchTimer)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (tickFrame) cancelAnimationFrame(tickFrame)
    }
  }, [titleRef, eyebrowRef, cardRef])

  return null
}
