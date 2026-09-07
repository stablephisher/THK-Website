import { useState } from 'react'
import Seo from '../components/Seo'

/**
 * Publishing panel.
 *
 * Posts a photograph or a written update to /api/publish, which commits it to
 * the repository; Vercel redeploys and the site picks it up. Nothing is stored
 * here and no credential is held in the page beyond the session — the password
 * travels with each request and is verified server-side, where the GitHub token
 * lives.
 *
 * Deliberately noindex: this is an operational page, not content, and it must
 * never appear in search results next to the pages that are.
 */
const MAX_MB = 4

const field =
  'mt-2 w-full border border-ink-300 bg-white px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-900'
const labelCls = 'block font-sans text-micro uppercase tracking-[0.14em] text-ink-600'

const Admin = () => {
  const [password, setPassword] = useState('')
  const [kind, setKind] = useState('photo')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState(null) // {type, text}
  const [busy, setBusy] = useState(false)

  const pickFile = (e) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setStatus({
        type: 'error',
        text: `That image is ${(f.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_MB}MB — please resize it first.`,
      })
    } else {
      setStatus(null)
    }
  }

  const readAsBase64 = (f) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = () => reject(new Error('Could not read that file.'))
      r.readAsDataURL(f)
    })

  const submit = async (e) => {
    e.preventDefault()
    setStatus(null)

    if (!password) return setStatus({ type: 'error', text: 'Enter the password.' })
    if (title.trim().length < 3)
      return setStatus({ type: 'error', text: 'Give it a title of at least 3 characters.' })
    if (kind === 'photo' && !file)
      return setStatus({ type: 'error', text: 'Choose an image to upload.' })
    if (file && file.size > MAX_MB * 1024 * 1024)
      return setStatus({ type: 'error', text: `The image must be under ${MAX_MB}MB.` })

    setBusy(true)
    try {
      const payload = { password, kind, title: title.trim(), description: description.trim() }
      if (kind === 'photo') {
        payload.image = await readAsBase64(file)
        payload.filename = file.name
      }
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`)

      setStatus({ type: 'ok', text: `${data.message} Commit ${data.commit}.` })
      setTitle('')
      setDescription('')
      setFile(null)
      setPreview(null)
      e.target.reset?.()
    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title="Publish" noindex />

      <section className="section bg-ink-50">
        <div className="container-custom">
          <div className="mx-auto max-w-2xl">
            <p className="eyebrow">Office Use</p>
            <h1 className="mt-5 font-display text-title text-ink-900">Publish to the site</h1>
            <p className="mt-4 text-ink-600">
              Adds a photograph to the gallery, or a written update to “From the office”.
              Publishing commits it to the repository and the site rebuilds on its own —
              give it a minute or two to appear.
            </p>

            <form onSubmit={submit} className="mt-10 space-y-7">
              <div>
                <label className={labelCls} htmlFor="pw">
                  Password
                </label>
                <input
                  id="pw"
                  type="password"
                  autoComplete="current-password"
                  className={field}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <fieldset>
                <legend className={labelCls}>What are you publishing?</legend>
                <div className="mt-3 flex gap-3">
                  {[
                    ['photo', 'A photograph'],
                    ['update', 'A written update'],
                  ].map(([value, text]) => (
                    <label
                      key={value}
                      className={`cursor-pointer border px-5 py-3 text-sm font-semibold transition-colors ${
                        kind === value
                          ? 'border-ink-900 bg-ink-900 text-white'
                          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="kind"
                        value={value}
                        checked={kind === value}
                        onChange={() => setKind(value)}
                        className="sr-only"
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className={labelCls} htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  className={field}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    kind === 'photo'
                      ? 'Bonalu celebrations at Golconda'
                      : 'Statement on the Wipro Circle demonstration'
                  }
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="desc">
                  Description
                </label>
                <textarea
                  id="desc"
                  rows={4}
                  className={field}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    kind === 'photo'
                      ? 'Shown as the caption, and read aloud by screen readers.'
                      : 'A short paragraph. This is what appears under the headline.'
                  }
                />
              </div>

              {kind === 'photo' && (
                <div>
                  <label className={labelCls} htmlFor="file">
                    Image — JPEG, PNG or WebP, under {MAX_MB}MB
                  </label>
                  <input
                    id="file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={pickFile}
                    className="mt-2 block w-full text-sm text-ink-700 file:mr-4 file:border-0 file:bg-ink-900 file:px-5 file:py-3 file:font-sans file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800"
                  />
                  {preview && (
                    <img
                      src={preview}
                      alt=""
                      className="mt-4 max-h-64 w-auto border border-ink-200"
                    />
                  )}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Publishing…' : 'Publish'}
              </button>

              {status && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`border-l-2 py-2 pl-4 text-sm ${
                    status.type === 'ok'
                      ? 'border-green-600 text-green-800'
                      : 'border-red-600 text-red-800'
                  }`}
                >
                  {status.text}
                </p>
              )}
            </form>
          </div>
        </div>
      </section>
    </>
  )
}

export default Admin
