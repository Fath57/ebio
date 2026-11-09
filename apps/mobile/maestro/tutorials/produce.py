#!/usr/bin/env python3
"""Turns a raw tutorial take into the edited video.

    python3 produce.py take.mp4

Next to the take, record.sh leaves take.mp4.start (wall-clock time the
recording started) and take.mp4.maestro.log (the flow's log). From them:

- every tap Maestro made is marked with a green ring that grows and fades,
  at the exact pixel and moment, so the viewer sees where to touch;
- the login typing — slow on a real phone, Maestro types key by key — is
  sped up, from the tap on the phone field to « Se connecter »;
- the last frame is held a few seconds, room for the closing sentence.

Output: take-montage.mp4. The voice-over is laid afterwards by narrate.sh.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

BRAND_GREEN = (42, 157, 78)  # colors.green[400]
RING_SIZE = 280
RING_FRAMES = 21  # 0.7 s at 30 fps
FPS = 30
TYPING_SPEEDUP = 4
TYPING_FROM = r'\+229'
TYPING_TO = 'Se connecter'
END_HOLD_SECONDS = 3
# Kept of the splash screen; the wait for Maestro to start is cut, up to
# this long before the first tap.
INTRO_SECONDS = 1.5
LEAD_IN_SECONDS = 2.5

TIME = r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
TAP_COMMAND = re.compile(TIME + r'.*Tap on (?:"(.*)"|point .*) RUNNING')
TAP_PIXEL = re.compile(TIME + r'.*Tapping at \((\d+), (\d+)\)')


def seconds_of_day(match: re.Match) -> float:
    hours, minutes, seconds, millis = (int(match.group(i)) for i in range(1, 5))
    return hours * 3600 + minutes * 60 + seconds + millis / 1000


def read_taps(log: Path, start: float) -> list[dict]:
    """Taps as (time in the video, x, y, label), from the Maestro log."""
    taps = []
    label = None
    for line in log.read_text(errors='replace').splitlines():
        command = TAP_COMMAND.search(line)
        if command:
            label = command.group(5) or 'point'
            continue
        pixel = TAP_PIXEL.search(line)
        if pixel:
            taps.append({
                'time': seconds_of_day(pixel) - start,
                'x': int(pixel.group(5)),
                'y': int(pixel.group(6)),
                'label': label,
            })
    return [tap for tap in taps if tap['time'] >= 0]


def make_ring(folder: Path) -> Path:
    """A short clip with alpha: a touch mark that pops, then a ring that grows.

    A thin green ring vanished on the green buttons it marked: the mark is a
    translucent white disc with a green edge, the ring is green lined with
    white over a soft shadow, so it reads on light and green alike.
    """
    for index in range(RING_FRAMES):
        progress = index / (RING_FRAMES - 1)
        frame = Image.new('RGBA', (RING_SIZE, RING_SIZE), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame)
        centre = RING_SIZE / 2
        fade = (1 - progress) ** 1.2

        def circle(radius: float, **style) -> None:
            draw.ellipse((centre - radius, centre - radius, centre + radius, centre + radius), **style)

        radius = 44 + progress * 86
        width = max(5, round(14 - progress * 8))
        circle(radius + 2, outline=(0, 0, 0, round(70 * fade)), width=width + 4)
        circle(radius, outline=(*BRAND_GREEN, round(245 * fade)), width=width)
        circle(radius - width + 2, outline=(255, 255, 255, round(200 * fade)), width=3)

        mark = max(0.0, 1 - progress * 1.4)
        if mark:
            circle(38, fill=(255, 255, 255, round(170 * mark)), outline=(*BRAND_GREEN, round(255 * mark)), width=5)
        frame.save(folder / f'ring-{index:03d}.png')
    clip = folder / 'ring.mov'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', str(folder / 'ring-%03d.png'),
        '-c:v', 'qtrle', '-pix_fmt', 'argb', str(clip),
    ], check=True)
    return clip


def scene_changes(video: Path) -> list[float]:
    """Moments the picture changes noticeably — a tap usually causes one."""
    out = subprocess.run(
        ['ffmpeg', '-v', 'info', '-i', str(video), '-vf', "select='gt(scene,0.02)',showinfo", '-f', 'null', '-'],
        capture_output=True, text=True,
    )
    return [float(m) for m in re.findall(r'pts_time:([0-9.]+)', out.stderr)]


def clock_offset(taps: list[dict], changes: list[float]) -> float:
    """How late the recording really started after the time noted for it.

    screenrecord takes a few seconds to start filming on a phone, and not the
    same each time: the rings landed four seconds after the action. The delay
    is read from the video instead, as the shift that best lines the taps up
    with the picture changes that follow them.
    """
    if not taps or not changes:
        return 0.0
    best, best_score = 0.0, float('inf')
    for step in range(0, 161):
        shift = step * 0.05
        score = 0.0
        for tap in taps:
            moment = tap['time'] - shift
            following = [c - moment for c in changes if -0.1 <= c - moment <= 1.5]
            score += min(following) if following else 1.5
        if score < best_score:
            best, best_score = shift, score
    return best


def duration_of(video: Path) -> float:
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(video)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def main() -> None:
    take = Path(sys.argv[1])
    start_file = Path(f'{take}.start')
    log = Path(f'{take}.maestro.log')
    start_match = re.search(TIME, start_file.read_text())
    if not start_match:
        sys.exit(f'Heure de début illisible dans {start_file}')
    taps = read_taps(log, seconds_of_day(start_match))
    shift = clock_offset(taps, scene_changes(take))
    taps = [{**tap, 'time': tap['time'] - shift} for tap in taps if tap['time'] - shift >= 0]
    print(f'démarrage réel de l\'enregistrement : {shift:.2f} s après l\'heure notée')
    total = duration_of(take)

    typing_from = next((tap['time'] for tap in taps if tap['label'] == TYPING_FROM), None)
    typing_to = next((tap['time'] for tap in taps if tap['label'] == TYPING_TO), None)

    with tempfile.TemporaryDirectory() as tmp:
        ring = make_ring(Path(tmp))
        inputs = ['-i', str(take)]
        # screenrecord films at a variable rate — no frame while the screen is
        # still, gaps of several seconds — and trimming such a stream gave
        # spans of the wrong length. Constant rate first, then everything else.
        graph = [f'[0:v]fps={FPS}[base]']
        last = 'base'
        for index, tap in enumerate(taps):
            inputs += ['-itsoffset', f"{tap['time']:.3f}", '-i', str(ring)]
            out = f'v{index}'
            graph.append(
                f"[{last}][{index + 1}:v]overlay=x={tap['x'] - RING_SIZE // 2}:y={tap['y'] - RING_SIZE // 2}"
                f":eof_action=pass[{out}]",
            )
            last = out
            print(f"anneau à {tap['time']:5.1f} s sur « {tap['label']} » ({tap['x']}, {tap['y']})")

        # Kept spans of the take, each with its speed: the splash, then from
        # just before the first tap; the login typing sped up.
        spans = []
        first_tap = taps[0]['time'] if taps else 0.0
        resume = max(INTRO_SECONDS, first_tap - LEAD_IN_SECONDS)
        if resume > INTRO_SECONDS:
            spans.append((0.0, INTRO_SECONDS, 1))
        if typing_from is not None and typing_to is not None and typing_to > typing_from:
            # From just after the phone field opens to just before the
            # « Se connecter » ring, so that ring plays at normal speed.
            a, b = typing_from + 1.0, typing_to - 0.3
            spans += [(resume, a, 1), (a, b, TYPING_SPEEDUP), (b, total, 1)]
            print(f'saisie accélérée ×{TYPING_SPEEDUP} de {a:.1f} s à {b:.1f} s')
        else:
            spans.append((resume, total, 1))
        if resume > INTRO_SECONDS:
            print(f'attente de démarrage coupée de {INTRO_SECONDS} s à {resume:.1f} s')
        def edited_time(t: float) -> float | None:
            """Where a moment of the take lands in the montage (None if cut)."""
            elapsed = 0.0
            for begin, finish, speed in spans:
                if begin <= t <= finish:
                    return elapsed + (t - begin) / speed
                elapsed += (finish - begin) / speed
            return None

        print('repères dans le montage (pour la voix off) :')
        for tap in taps:
            at = edited_time(tap['time'])
            if at is not None:
                print(f"  {int(at // 60):02d}:{at % 60:04.1f}  {tap['label']}")
        graph.append(f'[{last}]split={len(spans)}' + ''.join(f'[p{i}]' for i in range(len(spans))))
        for i, (begin, finish, speed) in enumerate(spans):
            graph.append(f'[p{i}]trim={begin:.3f}:{finish:.3f},setpts=(PTS-STARTPTS)/{speed}[s{i}]')
        graph.append(''.join(f'[s{i}]' for i in range(len(spans))) + f'concat=n={len(spans)}:v=1:a=0[cut]')
        last = 'cut'
        graph.append(f'[{last}]tpad=stop_mode=clone:stop_duration={END_HOLD_SECONDS}[final]')

        output = take.with_name(f'{take.stem}-montage.mp4')
        subprocess.run([
            'ffmpeg', '-v', 'error', '-y', *inputs,
            '-filter_complex', ';'.join(graph), '-map', '[final]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', str(output),
        ], check=True)
    print(f'Montage : {output} ({duration_of(output):.1f} s)')


if __name__ == '__main__':
    main()
