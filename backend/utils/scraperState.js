/**
 * scraperState.js
 * Shared mutable state for the live scraper cycle.
 * Exported as a single object so every module reads/writes the same reference.
 *
 * Never import this into frontend code — backend-only.
 */

const state = {
  matchFinishedAt:       null,   // Date.now() when FINISHED was confirmed, null otherwise
  consecutiveFails:      0,      // How many scrape cycles returned no data in a row
  finishedConfirmations: 0,      // # of consecutive FINISHED readings (need NEED_CONFIRM before freezing)
  lastKnownMatchKey:     null,   // e.g. "CSK_MI" — used to detect new match during freeze
  lastLiveScore:         null,   // Last seen score string (guards against score-drop false positives)
};

export const FREEZE_MS    = 20 * 60 * 1000; // 20 min freeze after FINISHED
export const NEED_CONFIRM = 2;               // Consecutive FINISHED reads before locking DB
export const MAX_FAILS    = 12;              // Auto-mark finished after N consecutive null scrapes

export default state;