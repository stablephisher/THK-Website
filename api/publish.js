import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Publishes a gallery photograph or a written update by committing it to the
 * repository, which Vercel then redeploys automatically.
 *
 * WHY A COMMIT RATHER THAN A DATABASE
 * The site is a static build: every page is prerendered and every photograph
 * goes through a build-time pipeline. Content that lives in the repository gets
 * all of that for free — prerendering, the entity graph, the CDN caching rules
 * — and stays reviewable in git history, which matters for a politician's site
 * where anything published is on the record. A database would need a second
 * runtime and would sit outside all of it.
 *
 * SECURITY
 * - GITHUB_TOKEN and ADMIN_PASSWORD are server-side environment variables. This
 *   file runs only on Vercel; neither value is ever sent to the browser.
 * - The repository is PUBLIC, so the token must be a fine-grained PAT scoped to
 *   Contents: read and write on this one repository and nothing else.
 * - The password is compared with a timing-safe digest comparison, so a wrong
 *   guess takes the same time as a right one.
 * - Uploads are capped and their type is checked against the actual magic
 *   bytes, not the filename or the declared MIME type.
 *
 * Required environment variables (Vercel > Settings > Environment Variables):
 *   ADMIN_PASSWORD   a long random string
 *   GITHUB_TOKEN     fine-grained PAT, Contents: read and write, this repo only
 *   GITHUB_REPO      optional, defaults to shivaganeshtalikota/THK-Website
 *   GITHUB_BRANCH    optional, defaults to main
 */

const REPO = process.env.GITHUB_REPO || 'shivaganeshtalikota/THK-Website'
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const MANIFEST = 'src/data/uploads.json'
const UPLOAD_DIR = 'public/photos/uploads'

const MAX_BYTES = 4 * 1024 * 1024 // Vercel caps a function request body at ~4.5MB

// Checked against the file's real first bytes rather than its name.
const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },
]

const api = async (path, token, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'thk-website-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${res.status}: ${detail.slice(0, 300)}`)
  }
  return res.json()
}

/** Constant-time password check. Digest first so lengths always match. */
const passwordOk = (given, expected) => {
  if (typeof given !== 'string' || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item'

const detect = (buf) =>
  SIGNATURES.find((s) => s.magic.every((byte, i) => buf[i] === byte)) ?? null

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { ADMIN_PASSWORD, GITHUB_TOKEN } = process.env
  if (!ADMIN_PASSWORD || !GITHUB_TOKEN) {
    return res.status(500).json({
      error: 'Server is not configured. ADMIN_PASSWORD and GITHUB_TOKEN must be set in Vercel.',
    })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
  const { password, kind, title, description, image, filename } = body

  if (!passwordOk(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' })
  }
  if (!title || String(title).trim().length < 3) {
    return res.status(400).json({ error: 'A title of at least 3 characters is required.' })
  }
  if (kind !== 'photo' && kind !== 'update') {
    return res.status(400).json({ error: 'kind must be "photo" or "update".' })
  }

  // Validate the upload BEFORE any network call, so a bad file returns the real
  // reason rather than a generic failure from further down the pipeline.
  let base64 = null
  let buf = null
  let sig = null
  if (kind === 'photo') {
    if (!image) return res.status(400).json({ error: 'An image file is required.' })
    base64 = String(image).includes(',') ? String(image).split(',')[1] : String(image)
    buf = Buffer.from(base64, 'base64')
    if (buf.length === 0) return res.status(400).json({ error: 'The image was empty.' })
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({
        error: `That image is ${(buf.length / 1024 / 1024).toFixed(1)}MB. The limit is 4MB — please resize it first.`,
      })
    }
    sig = detect(buf)
    if (!sig) {
      return res.status(415).json({ error: 'That file is not a JPEG, PNG or WebP image.' })
    }
  }

  try {
    // ---- read the current manifest and branch head ------------------------
    const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`, GITHUB_TOKEN)
    const headSha = ref.object.sha
    const headCommit = await api(`/repos/${REPO}/git/commits/${headSha}`, GITHUB_TOKEN)

    let manifest = { photos: [], updates: [] }
    try {
      const file = await api(
        `/repos/${REPO}/contents/${MANIFEST}?ref=${BRANCH}`,
        GITHUB_TOKEN
      )
      manifest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
    } catch {
      // First publish: the manifest does not exist yet. The default above is
      // committed as part of this same commit.
    }
    manifest.photos ??= []
    manifest.updates ??= []

    const now = new Date().toISOString()
    const id = `${now.slice(0, 10)}-${slugify(title)}`
    const treeItems = []
    let addedPath = null

    // ---- the image, if this is a photo ------------------------------------
    if (kind === 'photo') {
      addedPath = `${UPLOAD_DIR}/${id}.${sig.ext}`
      const blob = await api(`/repos/${REPO}/git/blobs`, GITHUB_TOKEN, {
        method: 'POST',
        body: JSON.stringify({ content: base64, encoding: 'base64' }),
      })
      treeItems.push({ path: addedPath, mode: '100644', type: 'blob', sha: blob.sha })

      manifest.photos.unshift({
        id,
        title: String(title).trim(),
        description: String(description ?? '').trim(),
        src: `/photos/uploads/${id}.${sig.ext}`,
        bytes: buf.length,
        publishedAt: now,
      })
    } else {
      manifest.updates.unshift({
        id,
        title: String(title).trim(),
        summary: String(description ?? '').trim(),
        date: now.slice(0, 10),
        publishedAt: now,
      })
    }

    // ---- manifest + image land in ONE commit, so Vercel deploys once ------
    const manifestBlob = await api(`/repos/${REPO}/git/blobs`, GITHUB_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`).toString('base64'),
        encoding: 'base64',
      }),
    })
    treeItems.push({ path: MANIFEST, mode: '100644', type: 'blob', sha: manifestBlob.sha })

    const tree = await api(`/repos/${REPO}/git/trees`, GITHUB_TOKEN, {
      method: 'POST',
      body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeItems }),
    })
    const commit = await api(`/repos/${REPO}/git/commits`, GITHUB_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        message: `Publish ${kind}: ${String(title).trim()}\n\nAdded from the admin panel.`,
        tree: tree.sha,
        parents: [headSha],
      }),
    })
    await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, GITHUB_TOKEN, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    })

    return res.status(200).json({
      ok: true,
      commit: commit.sha.slice(0, 7),
      path: addedPath,
      message: 'Published. The site rebuilds automatically and will show it in a minute or two.',
    })
  } catch (err) {
    // The message can carry GitHub's response; keep it out of the client.
    console.error('publish failed:', err)
    return res.status(502).json({ error: 'Could not publish. Please try again.' })
  }
}
