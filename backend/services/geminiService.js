import { GoogleGenAI } from '@google/genai';

export const getMatchIntel = async (scoreData) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `Based on this score ${JSON.stringify(scoreData)}, give a 2-line strategic expert analysis for the Match Intel Report. Also provide reports, predictions and comments on the basis of recent form and performance of teams and players. Keep the tone punchy, expert, and fit for a futuristic cyberpunk sports broadcast.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error.message);
    return "AI Protocol Offline: Unable to generate strategic intel at this moment. Momentum remains critical.";
  }
};
