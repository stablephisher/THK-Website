import Reveal from './Reveal'
import Picture from './Picture'

/**
 * Shared page header.
 *
 * Two modes:
 *  - with `photo`: a full-bleed image with a TOP scrim and the title over it
 *  - without: a dark editorial band
 *
 * The copy sits at the top of the band, under a gradient that is dark at the
 * masthead and fully transparent by the middle. The previous arrangement put it
 * at the bottom behind a bottom-up scrim, which meant the darkest part of the
 * frame was the half containing the photograph's subject, and on a phone the
 * heading crowded straight up against the navigation bar. This way the type sits
 * in a band that is dark because it is meant to be, and the lower half of the
 * photograph is left completely alone.
 *
 * `focus` overrides the photograph's own measured focal point (photo.focus) for
 * this one placement. It is a CSS object-position value, not a class.
 *
 * The band is 52vh / 64vh rather than 46vh / 56vh. That is a legibility fix as
 * much as a design one: the eyebrow + h1 + lead stack is a fixed height, so a
 * taller band pushes it into a lower fraction of the frame, where the scrim is
 * strong. Measured with scripts/audit-images.py — at 56vh the text reached 66%
 * of the band and white type over the brighter photographs fell to 1.3:1; at
 * 64vh the same scrim clears 5.5:1 everywhere.
 */
const PageHero = ({ eyebrow, title, lead, photo, focus, compact = false, children }) => {
  return (
    <section className={`relative isolate flex items-start overflow-hidden border-b-[6px] border-brand-500 bg-ink-950 ${
        compact
          ? 'min-h-[34vh] lg:min-h-[38vh]'
          : 'min-h-[78vh] sm:min-h-[70vh] lg:min-h-0 lg:h-[clamp(34rem,40vw,46rem)]'
      }`}>
      {photo && (
        <div className="absolute inset-0">
          <Picture
            photo={photo}
            rounded=""
            aspect="auto"
            priority
            sizes="100vw"
            className="!absolute inset-0 h-full w-full"
            position={focus}
            imgClassName="animate-slow-zoom"
          />
          <div className="absolute inset-0 scrim-top" aria-hidden="true" />
        </div>
      )}

      {/* pt clears the fixed masthead explicitly rather than by eye — the
          heading was touching the navigation on short viewports. */}
      <div className="on-dark container-custom relative z-10 pb-16 pt-[calc(var(--nav-h)+2rem)] sm:pt-[calc(var(--nav-h)+3rem)]">
        <div className="max-w-none">
          {eyebrow && (
            <Reveal as="p" delay={0.05} className="label-rule !text-brand-400 before:!bg-brand-500">
              {eyebrow}
            </Reveal>
          )}
          <Reveal as="h1" delay={0.13} className="display-wrap mt-6 max-w-none font-display text-[clamp(1.75rem,1.1rem+2.5vw,3.5rem)] font-bold tracking-[-0.02em] text-white">
            {title}
          </Reveal>
          {lead && (
            <Reveal as="p" delay={0.21} className="mt-6 max-w-3xl text-lead text-white/80">
              {lead}
            </Reveal>
          )}
          {children}
        </div>
      </div>
    </section>
  )
}

export default PageHero
