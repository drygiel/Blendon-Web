/// <reference types="vite/client" />

// vite-imagetools imports; see src/lib/images.ts.
declare module '*as=meta:src;width' {
  const widths: import('./lib/images.ts').ImageWidth[];
  export default widths;
}
