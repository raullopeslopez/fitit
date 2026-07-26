"""Draw the Fitit mark and write the app icons.

The mark (direction B3) is a loaded bar seen head-on, which happens to suggest
an F: two plate stacks and the sleeve, as three rounded rectangles on a 64x64
canvas. Three rectangles is the whole thing, so they're drawn here rather than
rasterized from an SVG — no toolchain, no binary asset without a source.

    uv run --with pillow python frontend/scripts/make_icons.py

Run it from the repo root; it overwrites the PNGs in frontend/public/.
"""

import pathlib

from PIL import Image, ImageDraw

# Reference geometry, on the 64x64 canvas of the design handoff.
CANVAS = 64
SHORT_PLATE = (10, 18, 9, 28)  # x, y, w, h
LONG_PLATE = (24, 10, 9, 44)
SLEEVE = (33, 28, 18, 8)
RADIUS = 3

# Dark-theme palette: the mark is amber on near-black, with the sleeve muted so
# the two plate stacks read as the subject.
BACKGROUND = "#0b0c0e"
PLATE = "#ff6a2c"
SLEEVE_COLOR = "#9ba1a9"

# Maskable icons get cropped to whatever shape the launcher likes, and the only
# guarantee is the central 80% circle. The mark's bounding box has a diagonal of
# 60 units, so at full size its corners sit outside that circle; 0.8 pulls the
# whole thing inside with room to spare.
SAFE_SCALE = 0.8
SUPERSAMPLE = 4

BBOX = (
    min(SHORT_PLATE[0], LONG_PLATE[0], SLEEVE[0]),
    min(SHORT_PLATE[1], LONG_PLATE[1], SLEEVE[1]),
    max(r[0] + r[2] for r in (SHORT_PLATE, LONG_PLATE, SLEEVE)),
    max(r[1] + r[3] for r in (SHORT_PLATE, LONG_PLATE, SLEEVE)),
)


def draw_mark(size, background, plate, sleeve, scale=SAFE_SCALE):
    """The mark at `size` px, drawn 4x and downsampled for clean rounded edges."""
    px = size * SUPERSAMPLE
    image = Image.new("RGBA", (px, px), background or (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)

    # Centre the mark's bounding box on the canvas, then shrink it into the
    # safe zone. Everything below is in reference units until the last step.
    unit = px / CANVAS * scale
    offset_x = px / 2 - (BBOX[0] + BBOX[2]) / 2 * unit
    offset_y = px / 2 - (BBOX[1] + BBOX[3]) / 2 * unit

    def rect(spec, fill):
        x, y, w, h = spec
        pen.rounded_rectangle(
            (
                offset_x + x * unit,
                offset_y + y * unit,
                offset_x + (x + w) * unit,
                offset_y + (y + h) * unit,
            ),
            radius=RADIUS * unit,
            fill=fill,
        )

    rect(SHORT_PLATE, plate)
    rect(LONG_PLATE, plate)
    rect(SLEEVE, sleeve)
    return image.resize((size, size), Image.LANCZOS)


def main():
    public = pathlib.Path(__file__).resolve().parents[1] / "public"
    for size in (192, 512):
        draw_mark(size, BACKGROUND, PLATE, SLEEVE_COLOR).save(public / f"icon-{size}.png")
    # The tab icon is the app icon; nothing is legible at 32px that isn't.
    draw_mark(64, BACKGROUND, PLATE, SLEEVE_COLOR).save(public / "favicon.png")
    # Android draws a notification badge as a silhouette: it throws the colour
    # away and keeps the shape, so the badge is white on transparent and the
    # gaps between the three rectangles are what makes it a mark rather than a
    # blob. Slightly larger, because it renders at 24dp.
    draw_mark(96, None, "#ffffff", "#ffffff", scale=0.92).save(public / "badge-96.png")


if __name__ == "__main__":
    main()
