'use client'

import { useEffect, useState } from 'react'

/**
 * Typewriter idle animation — the same idea as Zanara's `.sub` loop: type a
 * line, hold it, erase it, type the next one. Runs indefinitely so the hero
 * never sits still.
 *
 * The full set of lines is also rendered for screen readers (visually hidden),
 * so the animation does not make the page unreadable to assistive tech.
 */
export default function Typewriter({ lines, typeMs = 45, holdMs = 4200 }) {
  const [text, setText] = useState(lines[0] ?? '')

  useEffect(() => {
    let running = true
    const onVisibility = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    let li = 0
    let ci = (lines[0] ?? '').length
    let phase = 'hold' // hold -> erase -> type -> hold ...
    let holdUntil = performance.now() + holdMs
    let timer = null

    const step = () => {
      if (!running) {
        timer = setTimeout(step, 250)
        return
      }

      const now = performance.now()

      if (phase === 'hold') {
        if (now < holdUntil) {
          timer = setTimeout(step, 80)
          return
        }
        phase = 'erase'
      } else if (phase === 'erase') {
        ci -= 3
        if (ci <= 0) {
          ci = 0
          li = (li + 1) % lines.length
          phase = 'type'
        }
        setText(lines[li].slice(0, ci))
      } else {
        ci += 2
        if (ci >= lines[li].length) {
          ci = lines[li].length
          phase = 'hold'
          holdUntil = now + holdMs
        }
        setText(lines[li].slice(0, ci))
      }

      timer = setTimeout(step, typeMs)
    }

    timer = setTimeout(step, typeMs)

    return () => {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timer)
    }
  }, [lines, typeMs, holdMs])

  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="type-caret" aria-hidden="true">
        ▌
      </span>
      <span className="sr-only">{lines.join(' ')}</span>
    </>
  )
}
