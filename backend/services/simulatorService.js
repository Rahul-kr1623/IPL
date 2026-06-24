import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIMULATION_FILE = path.join(__dirname, '../data/live_simulation.json');

// Internal state to track simulation progress
let currentStateIndex = 0;
let simulationData = null;

// Load the JSON data
const loadSimulationData = () => {
  try {
    if (!fs.existsSync(SIMULATION_FILE)) {
      console.warn(`[Simulator] Simulation file not found at ${SIMULATION_FILE}`);
      return null;
    }
    const rawData = fs.readFileSync(SIMULATION_FILE, 'utf8');
    simulationData = JSON.parse(rawData);
    return simulationData;
  } catch (error) {
    console.error(`[Simulator] Error loading simulation data:`, error.message);
    return null;
  }
};

/**
 * Simulates a scrape cycle by returning the next state from the JSON array.
 * Once it reaches the end, it pauses there until restarted.
 */
export const simulateAllSlots = async () => {
  if (!simulationData) {
    loadSimulationData();
  }

  if (!simulationData || !simulationData.states || simulationData.states.length === 0) {
    console.log('[Simulator] No simulation states available.');
    return { slot1: null, slot2: null };
  }

  const states = simulationData.states;
  const currentState = states[currentStateIndex];

  console.log(`[Simulator] Pushing state ${currentStateIndex + 1} of ${states.length}`);

  // Advance index if not at the end
  if (currentStateIndex < states.length - 1) {
    currentStateIndex++;
  } else {
    // We reached the end. We just keep returning the last state.
    // If you want to loop, you can reset: currentStateIndex = 0;
    console.log('[Simulator] End of simulation reached. Holding final state.');
  }

  // Format matches output of scraperService.scrapeAllSlots
  return {
    slot1: currentState.slot1 || null,
    slot2: currentState.slot2 || null
  };
};

/**
 * Optionally, you can add an endpoint or function to restart the simulation.
 */
export const resetSimulation = () => {
  currentStateIndex = 0;
  loadSimulationData(); // Reload file in case user modified it
  console.log('[Simulator] Simulation reset to beginning.');
};
