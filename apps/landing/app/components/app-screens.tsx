import type { LandingScreens } from '@/content/landing-content'
import { useEffect, useRef, useState } from 'react'

/**
 * Real screenshots of the app running against live data, framed in CSS-drawn
 * phones. Nothing staged: what the section shows is what the store delivers.
 *
 * The captures come from the backoffice and there can be any number of them,
 * so the row is a scroll-snap slider: it swipes on a phone, it scrolls with
 * the arrows on a desktop, and it still works with JavaScript disabled since
 * the scrolling itself is native.
 */
export function AppScreens({ content }: { content: LandingScreens }) {
  const trackRef = useRef<HTMLUListElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Arrows and dots are shown only once the row really overflows: three
  // captures on a wide screen are all visible at once, nothing to navigate.
  const [isScrollable, setIsScrollable] = useState(false)
  const screens = content.screens

  useEffect(() => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const handleScroll = (): void => {
      setActiveIndex(readActiveIndex(track))
    }
    const measure = (): void => {
      setIsScrollable(track.scrollWidth > track.clientWidth + 1)
    }
    measure()
    track.addEventListener('scroll', handleScroll, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => {
      track.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [screens])

  function goTo(index: number): void {
    const track = trackRef.current
    const slide = track?.children[index]
    if (!track || !(slide instanceof HTMLElement)) {
      return
    }
    // Measured between the two boxes rather than from `offsetLeft`, which is
    // relative to the positioned wrapper holding the arrows, not to the track.
    const offset = slide.getBoundingClientRect().left - track.getBoundingClientRect().left
    const left = track.scrollLeft + offset - (track.clientWidth - slide.offsetWidth) / 2
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <section aria-label="Captures d’écran de l’application" className="border-y border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow text-earth-600">{content.eyebrow}</p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          {content.title}
        </h2>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-soft">
          {content.body}
        </p>

        <div className="relative mt-12">
          <ul
            ref={trackRef}
            className="slider-track mx-auto flex w-fit max-w-full snap-x snap-mandatory gap-10 overflow-x-auto px-1 pb-2"
          >
            {screens.map(screen => (
              <li key={screen.imageUrl} className="w-[16rem] shrink-0 snap-center">
                <figure>
                  <div className="overflow-hidden rounded-[2.2rem] border-[6px] border-ink bg-ink shadow-[0_12px_32px_rgba(42,41,36,0.18)]">
                    <img
                      src={screen.imageUrl}
                      alt={screen.alt}
                      loading="lazy"
                      className="block w-full rounded-[1.9rem]"
                    />
                  </div>
                  <figcaption className="mt-4 text-center text-sm font-semibold text-ink-soft">
                    {screen.caption}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>

          {isScrollable && (
            <>
              <SliderArrow
                direction="prev"
                disabled={activeIndex === 0}
                onClick={() => goTo(activeIndex - 1)}
              />
              <SliderArrow
                direction="next"
                disabled={activeIndex === screens.length - 1}
                onClick={() => goTo(activeIndex + 1)}
              />
            </>
          )}
        </div>

        {isScrollable && (
          <div className="mt-6 flex justify-center gap-2.5">
            {screens.map((screen, index) => (
              <button
                key={screen.imageUrl}
                type="button"
                aria-label={`Voir ${screen.caption}`}
                aria-current={index === activeIndex}
                className={`h-2.5 rounded-full transition-all ${
                  index === activeIndex ? 'w-6 bg-green-400' : 'w-2.5 bg-line hover:bg-ink-faint'
                }`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

interface SliderArrowProps {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}

/** Desktop-only control: on a phone the track is swiped, not clicked. */
function SliderArrow({ direction, disabled, onClick }: SliderArrowProps) {
  const isPrev = direction === 'prev'
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={isPrev ? 'Écran précédent' : 'Écran suivant'}
      onClick={onClick}
      className={`absolute top-[38%] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-xl text-ink shadow-[0_4px_16px_rgba(42,41,36,0.12)] transition-opacity hover:bg-paper disabled:pointer-events-none disabled:opacity-0 md:flex ${
        isPrev ? '-left-4' : '-right-4'
      }`}
    >
      <span aria-hidden="true">{isPrev ? '←' : '→'}</span>
    </button>
  )
}

/** The slide whose center sits closest to the middle of the visible track. */
function readActiveIndex(track: HTMLUListElement): number {
  const trackRect = track.getBoundingClientRect()
  const center = trackRect.left + trackRect.width / 2
  let closest = 0
  let smallestGap = Number.POSITIVE_INFINITY
  Array.from(track.children).forEach((child, index) => {
    if (!(child instanceof HTMLElement)) {
      return
    }
    const rect = child.getBoundingClientRect()
    const gap = Math.abs(rect.left + rect.width / 2 - center)
    if (gap < smallestGap) {
      smallestGap = gap
      closest = index
    }
  })
  return closest
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
