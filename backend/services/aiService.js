import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

export const generateMatchIntel = async (matchData) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `
      You are an elite, highly analytical cricket expert providing insights for the Official IPL 2026 Portal.
      Current Match Status: ${matchData.team1?.name} vs ${matchData.team2?.name}.
      Score: ${matchData.score}/${matchData.wickets} in ${matchData.overs} overs.
      Chasing Team Score: ${matchData.team2Score}/${matchData.team2Wickets} in ${matchData.team2Overs} overs.
      Current Striker is ${matchData.striker?.name} at ${matchData.striker?.runs} runs in ${matchData.striker?.balls} balls.
      Data feed scenario: ${matchData.result}.
      
      Generate exactly 2 sentences of high-octane "Match Intel". Predict the momentum shift and call out a key strategic adaptation. Keep it aggressive, concise, and focused on structural gameplay without preamble.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    
    // Fallback cleanup if the LLM adds markdown quotes
    const text = response.text || '';
    return text.replace(/"/g, '').trim();

  } catch (error) {
    console.error("❌ Gemini AI Generation Failed:", error.message);
    return "Momentum shifting dynamically. Batsmen looking to aggressively rotate strike and counter incoming spin pressure.";
  }
};
