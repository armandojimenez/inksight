/** Maximum characters allowed in a single chat message.
 *  Source of truth: src/common/constants/chat.constants.ts (server) — keep in sync. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Character count at which the counter becomes visible (percentage of max). */
export const CHAR_COUNTER_VISIBLE_THRESHOLD = 0.5;

/** Character count at which the counter turns warning color (percentage of max). */
export const CHAR_COUNTER_WARNING_THRESHOLD = 0.9;

/** Messages longer than this (in characters) are collapsed with "Show more". */
export const MESSAGE_COLLAPSE_THRESHOLD = 500;
