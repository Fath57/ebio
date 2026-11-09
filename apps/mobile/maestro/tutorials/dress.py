#!/usr/bin/env python3
"""Dresses a voiced tutorial montage for publishing (vertical 1080×1920).

    python3 dress.py take-montage-voix.mp4 narration/supplier-orders.txt supplier "Traiter une commande"

- the capture sits in a phone frame, on an eBio background, logo on top;
- each step title of the narration file (« MM:SS [Titre] | phrase ») shows
  above the phone, numbered, from its mark to the next one;
- an opening card (logo, title) and a closing card (logo, site) frame it,
  the voice shifted by the opening card.

Nothing generated: the capture stays the app as it is. Output: take-final.mp4.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[4]
FONTS = ROOT / 'apps/mobile/node_modules/@expo-google-fonts'
BOLD = FONTS / 'plus-jakarta-sans/PlusJakartaSans_700Bold.ttf'
MEDIUM = FONTS / 'plus-jakarta-sans/PlusJakartaSans_500Medium.ttf'
SERIF = FONTS / 'dm-serif-display/DMSerifDisplay_400Regular.ttf'
LOGOS = {
    'client': ROOT / 'apps/mobile/assets/logo-transparent.png',
    'supplier': ROOT / 'apps/mobile/assets/logo-transparent-supplier.png',
    'courier': ROOT / 'apps/mobile/assets/logo-transparent-courier.png',
}
APP_NAMES = {'client': 'eBio', 'supplier': 'eBio Fournisseur', 'courier': 'eBio Livreur'}
CLOSING_LINES = {
    'client': ['Trouvez des produits bio', 'près de chez vous'],
    'supplier': ['Vendez vos produits bio', 'avec eBio'],
    'courier': ['Livrez avec eBio,', 'gagnez à chaque course'],
}

# Charter tokens (design-principles.md).
GREEN_50 = (232, 245, 236)
GREEN_100 = (197, 230, 207)
GREEN_400 = (42, 157, 78)
GREEN_600 = (30, 122, 55)
NEUTRAL_50 = (247, 246, 242)
NEUTRAL_600 = (90, 88, 82)
NEUTRAL_800 = (42, 41, 36)
NEUTRAL_900 = (20, 20, 16)

WIDTH, HEIGHT = 1080, 1920
SCREEN_H = 1420
BEZEL = 18
SCREEN_RADIUS = 54
PHONE_TOP = 400
FPS = 30
INTRO_SECONDS = 2.5
OUTRO_SECONDS = 3.0
FADE = 0.4

STEP_LINE = re.compile(r'^\s*(\d+):(\d+)\s*\[([^\]]+)\]')


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def background() -> Image.Image:
    """Soft vertical green wash with two quiet circles: brand, not busy."""
    image = Image.new('RGB', (WIDTH, HEIGHT), NEUTRAL_50)
    pixels = image.load()
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        color = tuple(round(GREEN_50[i] * (1 - ratio) + NEUTRAL_50[i] * ratio) for i in range(3))
        for x in range(WIDTH):
            pixels[x, y] = color
    decor = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(decor)
    draw.ellipse((-260, 1180, 520, 1960), fill=(*GREEN_100, 110))
    draw.ellipse((760, -180, 1320, 380), fill=(*GREEN_100, 90))
    image.paste(decor, (0, 0), decor)
    return image


def paste_logo(canvas: Image.Image, variant: str, height: int, top: int) -> None:
    logo = Image.open(LOGOS[variant]).convert('RGBA')
    logo = logo.crop(logo.getbbox())
    width = round(logo.width * height / logo.height)
    logo = logo.resize((width, height), Image.LANCZOS)
    canvas.paste(logo, ((WIDTH - width) // 2, top), logo)


def phone_geometry(screen_w: int) -> tuple[int, int, int, int]:
    phone_w, phone_h = screen_w + 2 * BEZEL, SCREEN_H + 2 * BEZEL
    return (WIDTH - phone_w) // 2, PHONE_TOP, phone_w, phone_h


def frame_layers(folder: Path, variant: str, screen_w: int) -> tuple[Path, Path, Path]:
    """Background with logo and phone body; the screen's rounded mask."""
    left, top, phone_w, phone_h = phone_geometry(screen_w)
    base = background().convert('RGBA')
    paste_logo(base, variant, 96, 70)

    shadow = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (left + 10, top + 30, left + phone_w + 10, top + phone_h + 30), radius=SCREEN_RADIUS + BEZEL, fill=(0, 0, 0, 90),
    )
    base = Image.alpha_composite(base, shadow.filter(ImageFilter.GaussianBlur(28)))
    body = ImageDraw.Draw(base)
    body.rounded_rectangle((left, top, left + phone_w, top + phone_h), radius=SCREEN_RADIUS + BEZEL, fill=(*NEUTRAL_900, 255))
    base_path = folder / 'base.png'
    base.convert('RGB').save(base_path)

    mask = Image.new('L', (screen_w, SCREEN_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, screen_w - 1, SCREEN_H - 1), radius=SCREEN_RADIUS, fill=255)
    mask_path = folder / 'mask.png'
    mask.save(mask_path)
    return base_path, mask_path, folder


def step_caption(folder: Path, index: int, number: int, title: str) -> Path:
    """« ① Accepter la commande » above the phone."""
    layer = Image.new('RGBA', (WIDTH, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    title_font = font(BOLD, 46)
    number_font = font(BOLD, 34)
    text_w = draw.textlength(title, font=title_font)
    badge = 64
    total = badge + 22 + text_w
    x = (WIDTH - total) / 2
    draw.ellipse((x, 28, x + badge, 28 + badge), fill=GREEN_400)
    draw.text((x + badge / 2, 28 + badge / 2), str(number), font=number_font, fill=(255, 255, 255), anchor='mm')
    draw.text((x + badge + 22, 60), title, font=title_font, fill=NEUTRAL_800, anchor='lm')
    path = folder / f'step-{index}.png'
    layer.save(path)
    return path


def card(folder: Path, name: str, variant: str, lines: list[tuple[str, Path, int, tuple]]) -> Path:
    image = background().convert('RGBA')
    paste_logo(image, variant, 200, 640)
    draw = ImageDraw.Draw(image)
    y = 930
    for text, font_path, size, color in lines:
        draw.text((WIDTH / 2, y), text, font=font(font_path, size), fill=color, anchor='mt')
        y += round(size * 1.5)
    path = folder / f'{name}.png'
    image.convert('RGB').save(path)
    return path


def read_steps(narration: Path, total: float) -> list[tuple[float, float, str]]:
    marks = []
    for line in narration.read_text().splitlines():
        match = STEP_LINE.match(line)
        if match:
            marks.append((int(match.group(1)) * 60 + int(match.group(2)), match.group(3).strip()))
    return [(start, marks[i + 1][0] if i + 1 < len(marks) else total, title) for i, (start, title) in enumerate(marks)]


def probe(video: Path, entry: str) -> str:
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', entry, '-of', 'csv=p=0', str(video)],
        check=True, capture_output=True, text=True,
    )
    return out.stdout.strip().split('\n')[0]


def main() -> None:
    video, narration, variant, title = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    width, height = (int(v) for v in probe(video, 'stream=width,height').split(','))
    duration = float(subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)],
        check=True, capture_output=True, text=True,
    ).stdout.strip())
    screen_w = round(width * SCREEN_H / height / 2) * 2
    left, top, _, _ = phone_geometry(screen_w)

    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        base, mask, _ = frame_layers(folder, variant, screen_w)
        steps = read_steps(narration, duration)
        captions = [step_caption(folder, i, i + 1, step[2]) for i, step in enumerate(steps)]
        intro = card(folder, 'intro', variant, [
            (title, SERIF, 76, NEUTRAL_800),
            (f'Tutoriel · {APP_NAMES[variant]}', MEDIUM, 36, NEUTRAL_600),
        ])
        outro = card(folder, 'outro', variant, [
            *((line, SERIF, 64, NEUTRAL_800) for line in CLOSING_LINES[variant]),
            ('e-bio.org', BOLD, 40, GREEN_600),
        ])

        inputs = ['-loop', '1', '-framerate', str(FPS), '-t', f'{duration:.3f}', '-i', str(base),
                  '-i', str(video), '-loop', '1', '-t', f'{duration:.3f}', '-i', str(mask)]
        graph = [
            f'[1:v]scale={screen_w}:{SCREEN_H},format=rgba[screen]',
            '[2:v]format=gray[mask]',
            '[screen][mask]alphamerge[rounded]',
            f'[0:v][rounded]overlay={left + BEZEL}:{top + BEZEL}:shortest=1[v0]',
        ]
        last = 'v0'
        for index, ((start, end, _), caption) in enumerate(zip(steps, captions)):
            # Looped stills are bounded: unbounded, they never let the graph end.
            inputs += ['-loop', '1', '-t', f'{duration:.3f}', '-i', str(caption)]
            graph.append(
                f"[{last}][{index + 3}:v]overlay=0:236:shortest=1:enable='between(t,{start:.2f},{end:.2f})'[c{index}]",
            )
            last = f'c{index}'

        card_in = len(captions) + 3
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(INTRO_SECONDS), '-i', str(intro),
                   '-loop', '1', '-framerate', str(FPS), '-t', str(OUTRO_SECONDS), '-i', str(outro)]
        graph += [
            f'[{last}]fps={FPS},format=yuv420p,setsar=1,fade=t=in:st=0:d={FADE}[main]',
            f'[{card_in}:v]fps={FPS},format=yuv420p,setsar=1,fade=t=out:st={INTRO_SECONDS - FADE}:d={FADE}[intro]',
            f'[{card_in + 1}:v]fps={FPS},format=yuv420p,setsar=1,fade=t=in:st=0:d={FADE}[outro]',
            '[intro][main][outro]concat=n=3:v=1:a=0[video]',
            # The voice starts after the opening card and runs into the closing one.
            # Padded to the exact length: -shortest over an endless apad made
            # ffmpeg 6 fill its sync queue and fail with « No space left ».
            f'[1:a]adelay={round(INTRO_SECONDS * 1000)}:all=1,'
            f'apad=whole_dur={INTRO_SECONDS + duration + OUTRO_SECONDS:.3f}[voice]',
        ]
        output = video.with_name(video.stem.replace('-montage-voix', '') + '-final.mp4')
        subprocess.run([
            'ffmpeg', '-v', 'warning', '-y', *inputs, '-filter_complex', ';'.join(graph),
            '-map', '[video]', '-map', '[voice]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(output),
        ], check=True)
    print(f'Vidéo habillée : {output}')


if __name__ == '__main__':
    main()
