import dotenv from 'dotenv';
dotenv.config();

export async function estimateFactors(planText: string, factors: any[]) {
  const factorList = factors.map(f => `- id: ${f.id}\n  question: ${f.question}`).join('\n');
  
  const prompt = `You are an expert risk estimator and strategic advisor. Given a life plan and a list of risk factors, score each factor honestly and write a summary.

For each factor return likelihood (0-10), impact (0-10), source ("stated"|"assumed"|"missing"), evidence (quote or "").
Return ONLY a JSON object with this exact shape:
{
  "summary": "A 2-3 sentence plain English breakdown, like a sports commentator analyzing a match. Highlight the biggest risk and tell them the single most important action to take.",
  "factors": {
    "goal_clarity": { "likelihood": 5, "impact": 5, "source": "assumed", "evidence": "" }
    // ... all other factors
  }
}

CRITICAL RULES:
1. If the plan involves a major life commitment without due diligence, score "Downside severity" as high.
2. If the user has a severe allergy or medical condition, score "Energy & health", "Injury or health risk", and "Downside severity" as very high risk (8-10).
3. You MUST mark facts as "stated" if the user explicitly uses the words. If they say "tomorrow" or "next week", Time Feasibility is STATED. If they say "allergy", "surgery", or "illness", Injury/Health Risk is STATED. If they say "Japan" or "Tinder", Dependency and Communication are STATED. Do NOT use "missing" for things the user explicitly typed.

PLAN:
${planText}

FACTORS:
${factorList}`;

  const res = await fetch(`${process.env.LLM_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  let raw = data.choices[0].message.content || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON from AI:", raw);
    throw new Error("The AI returned an invalid response. Please try again.");
  }
}
