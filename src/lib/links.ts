import { MANUAL_FILE } from './paths.ts';

export const MANUAL_URL = import.meta.env.BASE_URL + MANUAL_FILE;

export const PROMO_VIDEO_ID = 'hrjcGZ32UHI';

/** Opens a page in a new tab, cut off from this one. */
export const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
