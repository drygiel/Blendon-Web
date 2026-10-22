/// <reference types="vite/client" />

// The icon sheet and its source keys; see scripts/icon-sprite.ts and src/lib/sprite-sheet.ts.
declare module 'virtual:icon-sprite' {
  const sheet: { url: string; width: number; height: number; parts: Record<string, [number, number, number, number]> };
  export default sheet;
}
declare module '*.png?sprite' {
  const name: string;
  export default name;
}

// vite-imagetools imports; see src/lib/images.ts.
declare module '*as=meta:src;width' {
  const widths: import('./lib/images.ts').ImageWidth[];
  export default widths;
}
