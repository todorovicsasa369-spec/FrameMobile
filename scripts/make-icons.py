"""Draws the fX launcher icons and splash screens for the Android app (same design as icon.svg)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RES = Path(__file__).resolve().parent.parent / "android/app/src/main/res"
BG, FG = (9, 9, 11), (250, 250, 250)
FONT = "C:/Windows/Fonts/arialbd.ttf"
DENSITY = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def logo(size, tile_ratio, bg=BG, round_mask=False):
    """White rounded tile with a dark 'fX', centered on a square canvas."""
    img = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tile = size * tile_ratio
    o = (size - tile) / 2
    d.rounded_rectangle([o, o, o + tile, o + tile], radius=tile * 0.225, fill=FG)
    font = ImageFont.truetype(FONT, int(tile * 0.47))
    d.text((size / 2, size / 2), "fX", font=font, fill=BG, anchor="mm")
    if round_mask:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        img.putalpha(mask)
    return img


for name, f in DENSITY.items():
    folder = RES / f"mipmap-{name}"
    logo(round(48 * f), 0.66).save(folder / "ic_launcher.png")
    logo(round(48 * f), 0.62, round_mask=True).save(folder / "ic_launcher_round.png")
    # adaptive foreground: 108dp canvas, launcher masks the outer 18dp, so keep the tile inside 66dp
    logo(round(108 * f), 0.5, bg=None).save(folder / "ic_launcher_foreground.png")

(RES / "values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '    <color name="ic_launcher_background">#09090B</color>\n</resources>\n', encoding="utf-8")

# splash screens: replace Capacitor's default white splash with the dark logo
for splash in RES.glob("drawable*/splash.png"):
    w, h = Image.open(splash).size
    img = Image.new("RGB", (w, h), BG)
    s = int(min(w, h) * 0.28)
    img.paste(logo(s, 1.0), ((w - s) // 2, (h - s) // 2), logo(s, 1.0))
    img.save(splash)

print("icons + splash written")
