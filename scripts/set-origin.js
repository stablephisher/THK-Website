/**
 * Rewrites the site's canonical origin everywhere it is hard-coded.
 *
 * WHY THIS EXISTS
 * The origin appears in src/data/site.js, in ~17 static tags in index.html
 * (canonical, the whole Open Graph block, the JSON-LD @id graph), in
 * robots.txt, in the generated sitemap, and burned into the social card image.
 * Editing those by hand is how they drift apart.
 *
 * It matters more than it looks. While the origin pointed at a domain that had
 * not been registered yet, every share of the site produced a text-only card:
 * WhatsApp fetched the page fine, read the title and description, then tried to
 * load og:image from a host that did not resolve and silently gave up. The page
 * looked perfect; only the preview was broken.
 *
 *   node scripts/set-origin.js https://talikotaharikrishna.com
 *
 * Then `npm run assets` to reburn the card, and `npm run build`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const next = process.argv[2]
if (!next || !/^https:\/\/[a-z0-9.-]+$/i.test(next) || next.endsWith('/')) {
  console.error(
    'Usage: node scripts/set-origin.js https://example.com\n' +
      '  (https, no trailing slash, no path)'
  )
  process.exit(1)
}

// The current origin is whatever site.js says, so this is idempotent and needs
// no list of previous values.
const sitePath = join(ROOT, 'src', 'data', 'site.js')
const site = readFileSync(sitePath, 'utf8')
const current = site.match(/url:\s*'(https:\/\/[^']+)'/)?.[1]
if (!current) {
  console.error('Could not read the current origin from src/data/site.js')
  process.exit(1)
}
if (current === next) {
  console.log(`Origin is already ${next} — nothing to do.`)
  process.exit(0)
}

const host = (u) => u.replace(/^https:\/\//, '')
const FILES = ['src/data/site.js', 'index.html', 'public/robots.txt', 'public/sitemap.xml']

let total = 0
for (const rel of FILES) {
  const p = join(ROOT, rel)
  const before = readFileSync(p, 'utf8')
  const after = before.split(current).join(next).split(host(current)).join(host(next))
  if (after !== before) {
    // Written as bytes with LF: the CSP whitelists index.html's inline script by
    // a hash over its exact bytes, and a CRLF rewrite would change the digest
    // and get the script blocked in production.
    writeFileSync(p, after.replace(/\r\n/g, '\n'), 'utf8')
    const n = before.split(current).length - 1
    total += n
    console.log(`  ${rel.padEnd(24)} ${n} occurrence${n === 1 ? '' : 's'}`)
  }
}

console.log(`\n${current} -> ${next}  (${total} replacements)`)
console.log('Now run:  npm run assets   (reburns the domain into the social card)')
console.log('Then:     npm run build')
