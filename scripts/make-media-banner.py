"""
Builds the /media page banner: a mosaic of the gallery photographs with the
Telugu Desam Party emblem set in the middle.

WHY A GENERATED BANNER
Every other page's banner is a single photograph that says what the page is
about. /media is about the whole archive, so no single frame represents it —
it was borrowing a photograph that also appeared as a tile in the gallery
directly below, which read as a mistake. A mosaic says "this is the collection"
in the way a single frame cannot.

Output is a real file in public/photos/, so it goes through the same responsive
pipeline and caching rules as the photography.

Run:  python scripts/make-media-banner.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "public" / "photos"
EMBLEM = ROOT / "public" / "tdp-emblem.png"

W, H = 2400, 1000          # wide: the band is ~2.5:1 at desktop
COLS, ROWS = 6, 3
GAP = 5
INK = (10, 10, 9)
BRAND = (253, 216, 0)

# Chosen for variety of subject and for reading well at thumbnail size: party
# events, constituency work, temple service and cultural programmes.
TILES = [
    "with-chandrababu-naidu", "addressing-itdp-telangana", "bonalu-bangaru-bonam",
    "kuchipudi-natyotsavam-stage", "with-nara-lokesh", "medchal-constituency-meeting",
    "ntr-anniversary-tribute", "greeting-chandrababu-naidu", "jonnawada-kamakshi-thayi",
    "mahanadu-2025", "with-party-leadership", "tdp-44-anniversary",
    "medchal-constituency-dais", "with-nandamuri-balakrishna", "kuchipudi-natya-kshetram",
    "csr-summit-hyderabad", "amaravati-cm-meeting", "endowments-minister-anam",
]

# Focal points, mirrored from the FOCUS map in src/data/photos.js so the tiles
# crop around their subjects rather than their centres.
FOCUS = {
    "with-chandrababu-naidu": (0.50, 0.30), "addressing-itdp-telangana": (0.56, 0.30),
    "bonalu-bangaru-bonam": (0.47, 0.58), "kuchipudi-natyotsavam-stage": (0.58, 0.44),
    "with-nara-lokesh": (0.52, 0.28), "medchal-constituency-meeting": (0.45, 0.24),
    "ntr-anniversary-tribute": (0.55, 0.42), "greeting-chandrababu-naidu": (0.50, 0.26),
    "jonnawada-kamakshi-thayi": (0.38, 0.52), "mahanadu-2025": (0.55, 0.45),
    "with-party-leadership": (0.62, 0.40), "tdp-44-anniversary": (0.48, 0.45),
    "medchal-constituency-dais": (0.62, 0.46), "with-nandamuri-balakrishna": (0.58, 0.28),
    "kuchipudi-natya-kshetram": (0.45, 0.46), "csr-summit-hyderabad": (0.59, 0.46),
    "amaravati-cm-meeting": (0.57, 0.40), "endowments-minister-anam": (0.50, 0.40),
}


def cover(img, w, h, fx=0.5, fy=0.5):
    """object-fit: cover with an object-position focal point."""
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = max(w, int(iw * scale + 0.5)), max(h, int(ih * scale + 0.5))
    img = img.resize((nw, nh), Image.LANCZOS)
    x = int((nw - w) * fx)
    y = int((nh - h) * fy)
    return img.crop((x, y, x + w, y + h))


def main():
    canvas = Image.new("RGB", (W, H), INK)
    tw = (W - GAP * (COLS - 1)) // COLS
    th = (H - GAP * (ROWS - 1)) // ROWS

    placed = 0
    for i, slug in enumerate(TILES[: COLS * ROWS]):
        src = PHOTOS / f"{slug}.jpg"
        if not src.exists():
            print(f"  missing, skipped: {slug}")
            continue
        fx, fy = FOCUS.get(slug, (0.5, 0.5))
        tile = cover(Image.open(src).convert("RGB"), tw, th, fx, fy)
        canvas.paste(tile, ((i % COLS) * (tw + GAP), (i // COLS) * (th + GAP)))
        placed += 1

    # Darken the whole mosaic. It sits behind white banner type, and eighteen
    # competing photographs at full contrast is noise rather than a background.
    canvas = Image.blend(canvas, Image.new("RGB", (W, H), INK), 0.42)

    # Emblem in the middle, on a party-yellow disc, with a soft shadow so it
    # reads against whatever tile happens to be behind it.
    d = ImageDraw.Draw(canvas)
    r = int(H * 0.20)
    cx, cy = W // 2, H // 2

    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).ellipse(
        [cx - r - 18, cy - r - 18, cx + r + 18, cy + r + 18], fill=150
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(Image.new("RGB", (W, H), INK), (0, 0), shadow)

    d = ImageDraw.Draw(canvas)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BRAND)

    em = Image.open(EMBLEM).convert("RGBA")
    box = em.split()[3].getbbox()
    if box:
        em = em.crop(box)
    side = int(r * 1.5)
    em = em.resize((side, int(em.height * side / em.width)), Image.LANCZOS)
    canvas.paste(em, (cx - em.width // 2, cy - em.height // 2), em)

    # JPEG fallback plus the same responsive WebP ladder every other photograph
    # gets, so <Picture> can serve a phone the 480px variant instead of a 2400px
    # mosaic.
    out = PHOTOS / "media-collage.jpg"
    canvas.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"  {out.name:<34}{W}x{H}  {out.stat().st_size / 1024:>6.0f} KB  ({placed} tiles)")

    for w in (480, 768, 1200, 1800, W):
        h = round(H * w / W)
        v = canvas.resize((w, h), Image.LANCZOS)
        f = PHOTOS / f"media-collage-{w}.webp"
        v.save(f, "WEBP", quality=82, method=6)
        print(f"  {f.name:<34}{w}x{h}  {f.stat().st_size / 1024:>6.0f} KB")


if __name__ == "__main__":
    main()
