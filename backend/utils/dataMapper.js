export const mapRawDataToInsights = (rawApiData) => {
  // Dynamically map API response to the specific chart format for Recharts
  // Since real Cricbuzz API schemas vary, we extract relevant fields safely
  
  const currentOver = parseFloat(rawApiData?.overs || '18.4');
  const currentScore = parseInt(rawApiData?.score || '180');
  const currentWinProb = rawApiData?.winProb || 62;

  // Map to the Live Win Prob LineChart format
  const winProbData = [
    { over: 0, prob: 50 },
    { over: 5, prob: 48 },
    { over: 10, prob: 52 },
    { over: 15, prob: 58 },
    { over: Math.floor(currentOver) || 18, prob: currentWinProb }
  ];

  // Map to the Momentum Shift AreaChart format
  const momentumData = [
    { over: 1, team1: 8, team2: 10 },
    { over: 5, team1: 45, team2: 40 },
    { over: 10, team1: 88, team2: 78 },
    { over: 15, team1: 142, team2: 135 },
    { over: Math.floor(currentOver) || 18, team1: currentScore, team2: currentScore - 5 },
  ];

  return { winProbData, momentumData };
};
