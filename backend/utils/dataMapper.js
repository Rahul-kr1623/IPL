export const mapRawDataToInsights = (rawApiData) => {
  const currentOver = parseFloat(rawApiData?.overs || 0);
  const currentScore = parseInt(rawApiData?.score || 0);
  const firstInningsScore = parseInt(rawApiData?.team1Score || 0);
  const currentWinProb = parseInt(
    rawApiData?.winProbT2 ??
    rawApiData?.winProb ??
    50
  );

  // Use backend timeline if available
  const winProbData =
    rawApiData?.winProbabilityTimeline?.length > 0
      ? rawApiData.winProbabilityTimeline.map((item) => ({
        over: Number(item.over),
        prob: Number(
          item.team2Prob ??
          item.prob ??
          currentWinProb
        ),
      }))
      : [
        { over: 0, prob: 50 },
        { over: Math.max(currentOver - 15, 0), prob: 48 },
        { over: Math.max(currentOver - 10, 0), prob: 52 },
        { over: Math.max(currentOver - 5, 0), prob: 58 },
        { over: currentOver || 1, prob: currentWinProb },
      ];

  // Use backend innings timeline if available
  const momentumData =
    rawApiData?.inningsTimeline?.length > 0
      ? rawApiData.inningsTimeline
        .map((item) => ({
          over: Number(item.over),
          team1: Number(item.team1Score || 0),
          team2: Number(item.team2Score || 0),
        }))
        .sort((a, b) => a.over - b.over)
      : (() => {
        const points = [
          {
            over: 1,
            team1: Math.round(firstInningsScore * 0.08),
            team2: 0,
          },
          {
            over: 5,
            team1: Math.round(firstInningsScore * 0.28),
            team2: 0,
          },
          {
            over: 10,
            team1: Math.round(firstInningsScore * 0.52),
            team2: 0,
          },
          {
            over: 15,
            team1: Math.round(firstInningsScore * 0.78),
            team2: 0,
          },
          {
            over: 20,
            team1: firstInningsScore,
            team2: currentScore,
          },
          {
            over: currentOver || 1,
            team1: firstInningsScore,
            team2: currentScore,
          },
        ];

        return points
          .filter((item) => item.over <= Math.max(currentOver, 20))
          .sort((a, b) => a.over - b.over);
      })();

  return {
    winProbData,
    momentumData,
  };
};
