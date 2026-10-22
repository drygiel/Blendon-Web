// Packs the site's small pictures into one PNG, so a first visit loads a single sheet instead of a hundred
// files. `virtual:icon-sprite` hands out the sheet's URL and each picture's place on it, keyed by its source path
// from the project root ("public/scene/icons/d_MoveTool.png"). `import key from './a.png?sprite'` gives that key.
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import type { Plugin, ViteDevServer } from 'vite';

/** Unity's built-in icons, the plugin's icons (kept by `pnpm sync`) and the Scene view chrome's pictures. */
export const SPRITE_DIRS = ['public/scene/icons', 'public/plugin/icons', 'src/assets/scene'];

/**
 * Square icons above this go on the sheet at this size. A browser shrinks part of a sheet without mipmaps, so the
 * 64 and 256 px art would drop lines at the 12-20 px the site shows icons at; 32 px is 16 px on a 2x screen.
 */
export const MAX_ICON = 32;

const VIRTUAL = 'virtual:icon-sprite';
const RESOLVED = '\0' + VIRTUAL;
// Transparent gap between pictures, so scaled drawing doesn't filter in a neighbour.
const PAD = 2;

export interface Sheet {
  png: Buffer;
  width: number;
  height: number;
  /** Source path -> [x, y, width, height] on the sheet. */
  parts: Record<string, [number, number, number, number]>;
}

interface Picture {
  data: Buffer;
  width: number;
  height: number;
  keys: string[];
  x: number;
  y: number;
}

const even = (v: number) => v + (v & 1);

/** A source file's RGBA pixels as they go on the sheet. */
export async function readPicture(file: string) {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const image = width === height && width > MAX_ICON ? sharp(file).resize(MAX_ICON, MAX_ICON) : sharp(file);
  return image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Shelf layout at `width`: tallest first, every picture on even coordinates. Returns the height it takes. */
function layout(pictures: Picture[], width: number): number {
  let x = 0;
  let y = 0;
  let row = 0;
  for (const p of pictures) {
    if (x > 0 && x + p.width > width) {
      y = even(y + row + PAD);
      x = 0;
      row = 0;
    }
    p.x = x;
    p.y = y;
    x = even(x + p.width + PAD);
    row = Math.max(row, p.height);
  }
  return y + row;
}

/** Reads every PNG under `dirs` (relative to `root`, recursively) and packs them; equal pixels share a place. */
export async function packSprite(root: string, dirs: string[]): Promise<Sheet> {
  const files = dirs
    .flatMap((d) =>
      readdirSync(resolve(root, d), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.png'))
        .map((f) => resolve(root, d, f)),
    )
    .sort();
  const byPixels = new Map<string, Picture>();
  for (const file of files) {
    const { data, info } = await readPicture(file);
    const hash = createHash('sha1').update(`${info.width}x${info.height}`).update(data).digest('hex');
    const key = relative(root, file).replaceAll('\\', '/');
    const known = byPixels.get(hash);
    if (known) known.keys.push(key);
    else byPixels.set(hash, { data, width: info.width, height: info.height, keys: [key], x: 0, y: 0 });
  }
  const pictures = [...byPixels.values()].sort(
    (a, b) => b.height - a.height || b.width - a.width || a.keys[0].localeCompare(b.keys[0]),
  );

  // As wide as the widest picture: a wider sheet packs no tighter and compresses a little worse.
  const width = even(Math.max(...pictures.map((p) => p.width)));
  const height = layout(pictures, width);

  const parts: Sheet['parts'] = {};
  // Rows are copied byte for byte: sharp's composite blends, which rounds half-transparent colours.
  const pixels = Buffer.alloc(width * height * 4);
  for (const p of pictures) {
    for (const k of p.keys) parts[k] = [p.x, p.y, p.width, p.height];
    for (let row = 0; row < p.height; row++)
      p.data.copy(pixels, ((p.y + row) * width + p.x) * 4, row * p.width * 4, (row + 1) * p.width * 4);
  }
  const png = await sharp(pixels, { raw: { width, height, channels: 4 } })
    // Unfiltered rows: on mostly transparent icon art the adaptive filters make the file half again as big.
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return { png, width, height, parts };
}

/** `dirs`: folders (relative to the project root) whose PNGs go on the sheet. */
export function iconSprite(dirs: string[]): Plugin {
  let root = '';
  let base = '/';
  let serve = false;
  let sheet: Promise<Sheet> | null = null;
  const build = () => (sheet ??= packSprite(root, dirs));
  const isSource = (file: string) => {
    const rel = relative(root, file).replaceAll('\\', '/');
    return rel.endsWith('.png') && dirs.some((d) => rel.startsWith(d.replace(/\/?$/, '/')));
  };
  // Dev serves the sheet from memory under a name of its own; the hash in the query busts the cache.
  const devPath = () => base + '__icon-sprite.png';

  return {
    name: 'icon-sprite',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      base = config.base;
      serve = config.command === 'serve';
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    async load(id) {
      // Dev adds its own `import` flag to the query.
      const [file = '', query] = id.split('?');
      if (query !== undefined && new URLSearchParams(query).has('sprite')) {
        if (!isSource(file)) this.error(`${file} is not in the icon sprite's folders (${dirs.join(', ')})`);
        return `export default ${JSON.stringify(relative(root, file).replaceAll('\\', '/'))};`;
      }
      if (id !== RESOLVED) return;
      const s = await build();
      let url: string;
      if (serve) {
        const hash = createHash('sha1').update(s.png).digest('hex').slice(0, 8);
        url = JSON.stringify(`${devPath()}?v=${hash}`);
      } else {
        url = `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name: 'icons.png', source: s.png })}`;
      }
      return `export default { url: ${url}, width: ${s.width}, height: ${s.height}, parts: ${JSON.stringify(s.parts)} };`;
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== devPath()) return next();
        build().then(
          (s) => {
            res.setHeader('Content-Type', 'image/png');
            res.end(s.png);
          },
          (e: unknown) => next(e),
        );
      });
      // A changed, added or removed picture repacks the sheet and reloads the page.
      let pending: ReturnType<typeof setTimeout> | undefined;
      server.watcher.add(dirs.map((d) => join(root, d)));
      server.watcher.on('all', (_event, file) => {
        if (!isSource(file)) return;
        sheet = null;
        clearTimeout(pending);
        pending = setTimeout(() => {
          const mod = server.moduleGraph.getModuleById(RESOLVED);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }, 100);
      });
    },
  };
}
