"""Rasteriza los iconos servidos (`frontend/public/*.png`) desde el kit de marca.

La fuente de verdad son los SVG de `brand/` — la retícula "celda" descrita en
`brand/README.md`. Aquí no se redibuja la geometría: se leen los `<rect>` del SVG
y se pintan con Pillow, de modo que si el kit cambia, los PNG cambian con él.

Los SVG del kit son sólo rectángulos (más un fondo con `rx` en el icono de app),
así que un parser mínimo basta y no hace falta cairo/resvg/ImageMagick.

    cd frontend && python tools/make_icons.py

Genera:
    public/icon-512.png   icono PWA / notificaciones   (retícula 3×3 sobre tinta)
    public/icon-192.png   idem, tamaño Android
    public/favicon.png    fallback del favicon SVG     (retícula 2×2)
    public/badge-96.png   badge de notificación Android (silueta, se enmascara)
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "brand"
PUBLIC = ROOT / "frontend" / "public"

# Supermuestreo: los cuadrados caen en coordenadas fraccionarias y la esquina
# redondeada del icono de app necesita antialias. 4× y reducimos con LANCZOS.
SS = 4

RECT = re.compile(r"<rect\b([^>]*)/?>")
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
VIEWBOX = re.compile(r'viewBox="([\d.\s-]+)"')
TRANSLATE = re.compile(r"translate\(([-\d.]+)[\s,]+([-\d.]+)\)")


def parse(svg_path):
    """Devuelve (lado_del_viewbox, [(x, y, w, h, fill, rx), ...])."""
    text = svg_path.read_text(encoding="utf-8")
    side = float(VIEWBOX.search(text).group(1).split()[2])

    # El icono de app envuelve la retícula en <g transform="translate(dx dy)">.
    dx = dy = 0.0
    shift = TRANSLATE.search(text)
    group_at = text.find("<g ") if shift else -1

    rects = []
    for match in RECT.finditer(text):
        attrs = dict(ATTR.findall(match.group(1)))
        inside_group = group_at != -1 and match.start() > group_at
        ox, oy = (float(shift.group(1)), float(shift.group(2))) if inside_group else (dx, dy)
        rects.append(
            (
                float(attrs.get("x", 0)) + ox,
                float(attrs.get("y", 0)) + oy,
                float(attrs["width"]),
                float(attrs["height"]),
                attrs.get("fill", "#000000"),
                float(attrs.get("rx", 0)),
            )
        )
    return side, rects


def render(svg_path, size, override=None, skip_background=False, square_background=False):
    """Rasteriza el SVG a `size` px.

    `override` repinta todo de un color; `skip_background` deja fuera el cuadro
    de fondo; `square_background` le quita el redondeo (icono `maskable`).
    """
    side, rects = parse(svg_path)
    scale = size * SS / side
    canvas = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    for x, y, w, h, fill, rx in rects:
        is_background = w == side and h == side
        if skip_background and is_background:
            continue
        box = [x * scale, y * scale, (x + w) * scale - 1, (y + h) * scale - 1]
        color = override or fill
        if is_background and square_background:
            rx = 0
        if rx:
            draw.rounded_rectangle(box, radius=rx * scale, fill=color)
        else:
            draw.rectangle(box, fill=color)

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    jobs = [
        ("fitit-icono-app.svg", "icon-512.png", 512, {}),
        ("fitit-icono-app.svg", "icon-192.png", 192, {}),
        # `maskable`: Android recorta el icono con su propia forma, así que el
        # fondo va a sangre. Con las esquinas del kit se redondearía dos veces
        # y asomaría el fondo del lanzador. La retícula ocupa el 66 % central,
        # dentro de la zona segura del 80 %.
        ("fitit-icono-app.svg", "icon-512-maskable.png", 512, {"square_background": True}),
        ("fitit-icono-app.svg", "icon-192-maskable.png", 192, {"square_background": True}),
        ("fitit-favicon.svg", "favicon.png", 64, {}),
        # El badge de Android se enmascara a un solo color: sólo cuenta el alfa.
        # Va la retícula sin el fondo de tinta, o el badge sería un cuadrado.
        (
            "fitit-icono-app.svg",
            "badge-96.png",
            96,
            {"override": "#ffffff", "skip_background": True},
        ),
    ]
    for source, target, size, kwargs in jobs:
        image = render(BRAND / source, size, **kwargs)
        image.save(PUBLIC / target)
        print(f"{target}  {size}x{size}  <-  brand/{source}")


if __name__ == "__main__":
    main()
