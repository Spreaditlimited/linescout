import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def clamp(value, min_value, max_value):
    return max(min_value, min(max_value, value))


def load_font(size):
    candidates = [
        "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/System/Library/Fonts/Supplemental/HelveticaNeue.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 6:
        print("Usage: overlay_linescout_logo.py <input> <output> <width> <height> <logo_path>")
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    target_width = int(sys.argv[3])
    target_height = int(sys.argv[4])
    logo_path = Path(sys.argv[5])
    footer_text = "www.linescout.sureimports.com"

    base = Image.open(input_path).convert("RGBA")
    if base.size != (target_width, target_height):
        base = base.resize((target_width, target_height), Image.LANCZOS)

    logo = Image.open(logo_path).convert("RGBA")

    if target_width >= 1200:
        logo_width = clamp(int(target_width * 0.24), 200, 340)
    else:
        logo_width = clamp(int(target_width * 0.22), 160, 300)

    logo_ratio = logo_width / logo.width
    logo_height = int(logo.height * logo_ratio)
    logo = logo.resize((logo_width, logo_height), Image.LANCZOS)

    margin_x = int(target_width * 0.06)
    margin_y = int(target_height * 0.06)

    base.alpha_composite(logo, (margin_x, margin_y))

    draw = ImageDraw.Draw(base, "RGBA")
    font_size = clamp(int(target_width * 0.03), 20, 36)
    font = load_font(font_size)

    text_bbox = draw.textbbox((0, 0), footer_text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]

    padding_x = int(font_size * 0.6)
    padding_y = int(font_size * 0.4)

    rect_width = text_width + padding_x * 2
    rect_height = text_height + padding_y * 2

    rect_x = int((target_width - rect_width) / 2)
    rect_y = target_height - rect_height - int(target_height * 0.05)

    rect_color = (255, 255, 255, 210)
    text_color = (45, 52, 97, 255)

    draw.rounded_rectangle(
        [rect_x, rect_y, rect_x + rect_width, rect_y + rect_height],
        radius=int(rect_height * 0.45),
        fill=rect_color,
    )

    text_x = rect_x + padding_x
    text_y = rect_y + padding_y
    draw.text((text_x, text_y), footer_text, font=font, fill=text_color)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(output_path, format="PNG")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
