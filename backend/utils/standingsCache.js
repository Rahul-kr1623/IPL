/**
 * standingsCache.js
 * In-memory cache for points table, orange/purple cap, top batsmen/bowlers.
 * Updated by the 12-hour scheduler cycle; read by API routes.
 *
 * Exported as a mutable object — all modules share the same reference.
 * Update by mutating cache.data (never reassigning the export itself).
 */

import {
  COMPLETED_MATCHES,
  POINTS_TABLE,
  PLAYER_STATS,
  getCapLeaders,
} from '../utils/matchDataEngine.js';

const computedCaps = getCapLeaders(PLAYER_STATS);

/**
 * The live cache object.
 * Mutate cache.data to update; never replace cache itself.
 */
const cache = {
  data: {
    pointsTable:      POINTS_TABLE,
    orangeCap:        computedCaps.orangeCap,
    purpleCap:        computedCaps.purpleCap,
    topBatsmen:       computedCaps.topBatsmen,
    topBowlers:       computedCaps.topBowlers,
    lastUpdated:      new Date(),
    source:           'computed',
    matchesAccounted: COMPLETED_MATCHES.length,
  },
};

export default cache;