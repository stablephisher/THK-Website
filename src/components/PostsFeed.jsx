import { useEffect, useRef, useState } from 'react'
import { social } from '../data/site'

const X_ACCOUNT = social.find((s) => s.name === 'X')

/**
 * Embedded recent posts from the office's X account.
 *
 * HOW IT DEGRADES
 * The markup is a plain anchor to the profile. X's widgets.js replaces that
 * anchor with an iframe once it loads; if the script is blocked, fails, or the
 * account is ever restricted, the anchor simply stays a working link. That is
 * the whole fallback strategy, and it is why the link text has to read as
 * something a visitor would want to click rather than as a placeholder.
 *
 * WHY IT LOADS LATE
 * widgets.js is a third-party script on a site that otherwise makes none. It is
 * injected only when the section is near the viewport, so it costs nothing on
 * pages that are never scrolled that far, and never blocks first paint.
 *
 * PRERENDER SAFETY
 * Everything touching `document` is inside the effect. scripts/prerender.js
 * runs this through renderToString, where the anchor is all that is emitted —
 * which is also what a non-JS crawler sees, and it is a real link.
 */
const SCRIPT_SRC = 'https://platform.twitter.com/widgets.js'

const PostsFeed = ({ limit = 3, className = '', label = 'Recent posts on X' }) => {
  const holder = useRef(null)
  const started = useRef(false)
  const [state, setState] = useState('idle') // idle | loading | ready | failed

  // Deliberately [] — this must run once. An earlier version depended on
  // `state`, so every transition tore down the observer and restarted the
  // timeout, and the deadline fired before the script was ever injected.
  // The guards are refs for the same reason.
  useEffect(() => {
    const node = holder.current
    if (!node || !X_ACCOUNT) return

    let cancelled = false
    let deadline

    const render = () => {
      if (cancelled) return
      const api = window.twttr?.widgets
      if (!api) return setState('failed')
      api
        .load(node)
        .then(() => !cancelled && setState('ready'))
        .catch(() => !cancelled && setState('failed'))
    }

    const start = () => {
      if (cancelled || started.current) return
      started.current = true
      setState('loading')

      // Only now does the clock start. If the widget has not rendered within
      // 12s — blocked, offline, throttled — drop the loading state and let the
      // anchor stand as the visible link.
      deadline = setTimeout(() => {
        if (!cancelled) setState((prev) => (prev === 'ready' ? prev : 'failed'))
      }, 12000)

      if (window.twttr?.widgets) return render()

      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
      const target = existing ?? document.createElement('script')
      target.addEventListener('load', render, { once: true })
      target.addEventListener('error', () => !cancelled && setState('failed'), { once: true })
      if (!existing) {
        target.src = SCRIPT_SRC
        target.async = true
        document.head.appendChild(target)
      }
    }

    // Already on screen at mount, or no IntersectionObserver: load now. The
    // rect check also covers environments where the observer never fires
    // because the document is not being painted.
    const near = () => {
      const r = node.getBoundingClientRect()
      return r.top < window.innerHeight + 400 && r.bottom > -400
    }
    if (typeof IntersectionObserver === 'undefined' || near()) {
      start()
      return () => {
        cancelled = true
        clearTimeout(deadline)
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          start()
        }
      },
      { rootMargin: '400px' }
    )
    io.observe(node)

    // Backstop for the same non-painting case: if nothing has fired after a
    // few seconds but the section has since scrolled into range, load anyway.
    const poll = setInterval(() => {
      if (started.current) return clearInterval(poll)
      if (near()) {
        clearInterval(poll)
        io.disconnect()
        start()
      }
    }, 1000)

    return () => {
      cancelled = true
      io.disconnect()
      clearInterval(poll)
      clearTimeout(deadline)
    }
  }, [])

  if (!X_ACCOUNT) return null

  return (
    <div className={className}>
      <div ref={holder} className="min-h-[8rem]">
        <a
          className="twitter-timeline"
          data-tweet-limit={limit}
          data-theme="light"
          data-chrome="noheader nofooter noborders transparent"
          data-dnt="true"
          href={X_ACCOUNT.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label} ({X_ACCOUNT.handle})
        </a>
      </div>

      {state === 'failed' && (
        <p className="mt-4 text-sm text-ink-600">
          Posts could not be loaded here.{' '}
          <a
            href={X_ACCOUNT.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-800 underline underline-offset-4"
          >
            Read them on X
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      )}
    </div>
  )
}

export default PostsFeed
