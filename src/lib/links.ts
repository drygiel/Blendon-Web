import { MANUAL_FILE } from './paths.ts';

/** A file in public/, at the path the site is deployed under. */
export const publicUrl = (path: string) => import.meta.env.BASE_URL + path;

/** The landing, the site's home page. */
export const HOME_URL = publicUrl('');

export const MANUAL_URL = publicUrl(MANUAL_FILE);

/** The Playground on a page of its own. */
export const PLAYGROUND_URL = publicUrl('playground/');

export const PROMO_VIDEO_ID = 'hrjcGZ32UHI';

/** Opens a page in a new tab, cut off from this one. */
export const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
