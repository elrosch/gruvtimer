#!/usr/bin/env python3
# Draws the gruvtimer icon (an isometric 3x3 cube in gruvbox colours) and writes
#   - public/favicon.svg                        (web)
#   - android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png
#
#   python3 scripts/make-icons.py               (needs Pillow)
#
# The cube is plain polygons, so the SVG and the PNGs come from the same geometry.

import math
import os

from PIL import Image, ImageDraw

BG = '#1d2021'  # gruvbox bg0_h, same as the app's theme-color
GAP = '#1d2021'  # the lines between stickers

# Each face is solved except for a few stickers, so it reads as a cube mid-solve.
Y, R, G, B, O, W = '#fabd2f', '#fb4934', '#b8bb26', '#83a598', '#fe8019', '#ebdbb2'
FACES = {
    'top': [[Y, Y, Y], [Y, Y, R], [Y, Y, Y]],
    'left': [[R, R, G], [R, R, R], [B, R, R]],
    'right': [[G, G, G], [O, G, G], [G, W, G]],
}
# Side faces are drawn darker so the cube looks lit from above.
SHADE = {'top': 1.0, 'left': 0.9, 'right': 0.78}

SIZE = 108  # adaptive icon canvas in dp; the launcher shows the inner 66 dp circle
RADIUS = 28  # cube hexagon radius, keeps the cube inside the safe zone
INSET = 0.07  # sticker gap as a fraction of one sticker


def shade(hex_colour, factor):
    r, g, b = (int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(round(c * factor) for c in (r, g, b))


def cube(cx, cy, radius):
    """Returns [(colour, polygon)] for the face backgrounds and stickers."""
    a = radius * math.cos(math.radians(30))
    c = (cx, cy)
    ul, ur = (cx - a, cy - radius / 2), (cx + a, cy - radius / 2)
    bottom = (cx, cy + radius)
    top = (cx, cy - radius)
    faces = {  # origin, edge u, edge v
        'top': (c, ul, ur),
        'left': (c, ul, bottom),
        'right': (c, ur, bottom),
    }
    shapes = [
        (GAP, [top, ur, (cx + a, cy + radius / 2), bottom, (cx - a, cy + radius / 2), ul]),
    ]
    for name, (o, pu, pv) in faces.items():
        u = (pu[0] - o[0], pu[1] - o[1])
        v = (pv[0] - o[0], pv[1] - o[1])

        def at(s, t):
            return (o[0] + s * u[0] + t * v[0], o[1] + s * u[1] + t * v[1])

        for i in range(3):
            for j in range(3):
                s0, s1 = (i + INSET) / 3, (i + 1 - INSET) / 3
                t0, t1 = (j + INSET) / 3, (j + 1 - INSET) / 3
                colour = shade(FACES[name][i][j], SHADE[name])
                shapes.append((colour, [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)]))
    return shapes


def svg(path):
    # The favicon has its own rounded background, so the cube can fill more of it.
    parts = [f'<rect width="{SIZE}" height="{SIZE}" rx="24" fill="{BG}"/>']
    for colour, poly in cube(SIZE / 2, SIZE / 2 + 1, 46):
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in poly)
        parts.append(f'<polygon points="{points}" fill="{colour}"/>')
    with open(path, 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">\n')
        f.write('\n'.join(parts) + '\n</svg>\n')


def png(px, background, radius):
    """Renders the icon at px x px, 4x supersampled for smooth edges."""
    ss = 4
    scale = px * ss / SIZE
    img = Image.new('RGBA', (px * ss, px * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    full = (0, 0, px * ss - 1, px * ss - 1)
    if background == 'square':
        draw.rounded_rectangle(full, radius=px * ss * 0.18, fill=BG)
    elif background == 'circle':
        draw.ellipse(full, fill=BG)
    for colour, poly in cube(SIZE / 2, SIZE / 2 + 1, radius):
        draw.polygon([(x * scale, y * scale) for x, y in poly], fill=colour)
    return img.resize((px, px), Image.LANCZOS)


def main():
    root = os.path.join(os.path.dirname(__file__), '..')
    os.makedirs(os.path.join(root, 'public'), exist_ok=True)
    svg(os.path.join(root, 'public/favicon.svg'))

    res = os.path.join(root, 'android/app/src/main/res')
    for density, factor in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        folder = os.path.join(res, f'mipmap-{density}')
        legacy = round(48 * factor)  # pre-Android 8 launchers: the whole icon, 48 dp
        png(legacy, 'square', 44).save(os.path.join(folder, 'ic_launcher.png'))
        png(legacy, 'circle', 40).save(os.path.join(folder, 'ic_launcher_round.png'))
        png(round(SIZE * factor), None, RADIUS).save(os.path.join(folder, 'ic_launcher_foreground.png'))


if __name__ == '__main__':
    main()
