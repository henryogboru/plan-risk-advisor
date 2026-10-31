import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { loadLenses, matchLenses, mergeLenses, calculateConfidence, rankMitigations, getBand } from './engine.js';
import { estimateFactors } from './llm.js';
import { saveAssessment } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/api/assess', async (req, res) => {
  try {
    const plan = req.body.plan;
    if (!plan) return res.status(400).json({ error: 'Plan required' });

    const lenses = loadLenses();
    const matched = matchLenses(plan, lenses);
    const merged = mergeLenses(matched);

    const llmResults = await estimateFactors(plan, merged.factors);

    const scores = merged.factors.map(f => {
      const e = llmResults[f.id] || { likelihood: 5, impact: 5, source: 'missing', evidence: '' };
      const L = Math.min(10, Math.max(0, e.likelihood || 5));
      const I = Math.min(10, Math.max(0, e.impact || 5));
      const w = merged.weights[f.id] || 0;
      return {
        factorId: f.id, label: f.label, likelihood: L, impact: I,
        weight: w, source: e.source || 'missing', evidence: e.evidence || '',
        contribution: (w * L * I) / 10
      };
    });

    const riskIndex = Math.round(scores.reduce((s, f) => s + f.contribution, 0) * 100) / 100;
    const band = getBand(riskIndex);
    const confidence = Math.round(calculateConfidence(scores, matched) * 100) / 100;
    const confBand = confidence >= 0.75 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low';
    
    const mitigations = rankMitigations(merged.mitigations, scores);
    const missingInfo = scores.filter(s => s.source === 'missing').map(s => merged.factors.find(f => f.id === s.factorId)?.question || s.factorId);
    
    const id = crypto.randomUUID();
    saveAssessment(id, plan, riskIndex, band, confidence, confBand);

    res.json({
      id, riskIndex, band, confidence, confidenceBand: confBand,
      lenses: matched.map(m => ({ id: m.lens.id, match: Math.round(m.match * 100) / 100 })),
      factors: scores.sort((a, b) => b.contribution - a.contribution),
      missingInfo, mitigations: mitigations.slice(0, 5),
      disclaimer: 'Structured estimate. Not a guarantee or prediction.'
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export the app for Vercel's serverless environment
export default app;

// Keep the listen logic for local testing
if (process.env.NODE_ENV !== 'production') {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`\n🚀 Web App running at http://localhost:${PORT}\n`));
}