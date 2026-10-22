import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_ICON, packSprite, readPicture, SPRITE_DIRS } from '../../scripts/icon-sprite.ts';

const root = join(import.meta.dirname, '..', '..');

describe('icon sprite', () => {
  it('holds every source picture, big square icons shrunk, apart from the others', async () => {
    const sheet = await packSprite(root, SPRITE_DIRS);
    const files = SPRITE_DIRS.flatMap((d) =>
      readdirSync(join(root, d), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.png'))
        .map((f) => `${d}/${f.replaceAll('\\', '/')}`),
    );
    expect(Object.keys(sheet.parts).sort()).toEqual(files.sort());

    const pixels = await sharp(sheet.png).raw().toBuffer({ resolveWithObject: true });
    expect([pixels.info.width, pixels.info.height, pixels.info.channels]).toEqual([sheet.width, sheet.height, 4]);
    for (const file of files) {
      const [x, y, w, h] = sheet.parts[file];
      const { width = 0, height = 0 } = await sharp(join(root, file)).metadata();
      const shrunk = width === height && width > MAX_ICON;
      expect([w, h], file).toEqual(shrunk ? [MAX_ICON, MAX_ICON] : [width, height]);
      const own = await readPicture(join(root, file));
      const cut = await sharp(pixels.data, { raw: { width: sheet.width, height: sheet.height, channels: 4 } })
        .extract({ left: x, top: y, width: w, height: h })
        .raw()
        .toBuffer();
      expect(cut.equals(own.data), file).toBe(true);
    }

    // Pictures that differ keep a gap, so scaled drawing never filters in a neighbour.
    const places = [...new Set(Object.values(sheet.parts).map((p) => p.join()))].map((p) => p.split(',').map(Number));
    for (const [i, [ax, ay, aw, ah]] of places.entries())
      for (const [bx, by, bw, bh] of places.slice(i + 1)) {
        const apart = ax + aw + 2 <= bx || bx + bw + 2 <= ax || ay + ah + 2 <= by || by + bh + 2 <= ay;
        expect(apart, `${[ax, ay, aw, ah].join()} and ${[bx, by, bw, bh].join()}`).toBe(true);
      }
  });
});
