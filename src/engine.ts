import fs from 'fs';
import path from 'path';

export interface FactorScore {
  factorId: string; label: string; likelihood: number; impact: number;
  weight: number; source: string; evidence: string; contribution: number;
}
export interface Mitigation {
  id: string; text: string; factorIds: string[]; deltaLikelihood: number;
  deltaImpact: number; effort: number; riskReduction: number; efficiency: number;
  isCritical?: boolean;
}
export interface Assessment {
  riskIndex: number; band: string; confidence: number; confidenceBand: string;
  factors: FactorScore[]; lenses: { id: string; match: number }[];
  assumptions: string[]; missingInfo: string[]; mitigations: Mitigation[];
  disclaimer: string;
}

export const UniversalFactors = [
  { id: 'goal_clarity', label: 'Goal clarity', question: 'Is success precisely defined?', defaultWeight: 0.06 },
  { id: 'time_feasibility', label: 'Time feasibility', question: 'Is the deadline realistic?', defaultWeight: 0.10 },
  { id: 'resource_adequacy', label: 'Resource adequacy', question: 'Are money/tools sufficient?', defaultWeight: 0.08 },
  { id: 'capability_fit', label: 'Capability fit', question: 'Are skills adequate?', defaultWeight: 0.08 },
  { id: 'dependency_exposure', label: 'Dependency exposure', question: 'How much rests on others?', defaultWeight: 0.06 },
  { id: 'information_gaps', label: 'Information gaps', question: 'Unverified assumptions?', defaultWeight: 0.10 },
  { id: 'consistency', label: 'Consistency demand', question: 'Sustained discipline required?', defaultWeight: 0.09 },
  { id: 'energy_health', label: 'Energy & health', question: 'Capacity to sustain the plan?', defaultWeight: 0.07 },
  { id: 'support_opposition', label: 'Support & opposition', question: 'Who helps or blocks?', defaultWeight: 0.05 },
  { id: 'downside_severity', label: 'Downside severity', question: 'How bad if it fails?', defaultWeight: 0.08 },
  { id: 'concentration_risk', label: 'Concentration risk', question: 'Single point of failure?', defaultWeight: 0.05 },
  { id: 'external_volatility', label: 'External volatility', question: 'Exposure outside control?', defaultWeight: 0.05 },
  { id: 'opportunity_cost', label: 'Opportunity cost', question: 'What are you giving up?', defaultWeight: 0.08 },
  { id: 'feedback_visibility', label: 'Feedback visibility', question: 'Will you know early if it fails?', defaultWeight: 0.05 }
];

export function clamp(n: number, lo = 0, hi = 10) { return Math.min(hi, Math.max(lo, n)); }
export function getBand(score: number) {
  if (score < 2) return 'Low'; if (score < 4) return 'Moderate';
  if (score < 6) return 'Elevated'; if (score < 8) return 'High'; return 'Severe';
}

export function loadLenses() {
  const dir = path.join(process.cwd(), 'lenses');
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function matchLenses(planText: string, lenses: any[]) {
  const t = planText.toLowerCase();
  return lenses.map(lens => {
    const kw = lens.trigger.keywords.filter((k: string) => t.includes(k.toLowerCase())).length;
    const ph = (lens.trigger.phrases || []).filter((p: string) => t.includes(p.toLowerCase())).length;
    const match = Math.min(1.0, (kw * 0.25) + (ph * 0.35));
    return { lens, match };
  }).filter(m => m.match >= 0.25).sort((a, b) => b.match - a.match).slice(0, 4);
}

export function mergeLenses(matched: any[]) {
  if (matched.length === 0) {
    const w: Record<string, number> = {};
    UniversalFactors.forEach(f => w[f.id] = f.defaultWeight);
    return { factors: UniversalFactors, weights: w, mitigations: [] };
  }
  const factorMap = new Map();
  UniversalFactors.forEach(f => factorMap.set(f.id, f));
  matched.forEach(m => m.lens.extraFactors?.forEach((ef: any) => { if (!factorMap.has(ef.id)) factorMap.set(ef.id, { ...ef, defaultWeight: 0.04 }); }));

  const totalMatch = matched.reduce((s, m) => s + m.match, 0);
  const raw: Record<string, number> = {};
  factorMap.forEach((_, k) => raw[k] = 0);

  matched.forEach(m => {
    const share = m.match / totalMatch;
    UniversalFactors.forEach(f => {
      const w = m.lens.weightOverrides?.[f.id] ?? f.defaultWeight;
      raw[f.id] += share * w;
    });
    m.lens.extraFactors?.forEach((ef: any) => {
      raw[ef.id] += share * 0.04;
    });
  });

  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const weights: Record<string, number> = {};
  Object.keys(raw).forEach(k => weights[k] = raw[k] / sum);

  const mitigations = new Map();
  matched.forEach(m => m.lens.mitigations?.forEach((mit: any) => mitigations.set(mit.id, { ...mit, domain: m.lens.domain })));

  return { factors: Array.from(factorMap.values()), weights, mitigations: Array.from(mitigations.values()) };
}

export function calculateConfidence(scores: FactorScore[], matched: any[]) {
  const credit: Record<string, number> = { stated: 1.0, assumed: 0.55, missing: 0.15 };
  const dataConf = scores.reduce((s, f) => s + f.weight * credit[f.source], 0);
  const lensConf = matched.length > 0 ? Math.max(...matched.map(m => m.match)) : 0.5;
  return Math.min(1, dataConf * (0.6 + 0.4 * lensConf));
}

export function rankMitigations(mitigations: any[], scores: FactorScore[]) {
  const byId = new Map(scores.map(s => [s.factorId, s]));
  return mitigations.map(m => {
    let red = 0;
    let isCritical = false;
    m.factorIds.forEach((fid: string) => {
      const s = byId.get(fid);
      if (!s) return;
      
      const rawRisk = (s.likelihood * s.impact) / 10;
      if (rawRisk >= 7.0) isCritical = true; // Flag if it addresses a critical risk
      
      const nL = clamp(s.likelihood + (m.deltaLikelihood || 0));
      const nI = clamp(s.impact + (m.deltaImpact || 0));
      red += (s.weight * s.likelihood * s.impact / 10) - (s.weight * nL * nI / 10);
    });
    
    return { ...m, isCritical, riskReduction: Math.round(red * 100) / 100, efficiency: m.effort > 0 ? red / m.effort : 0 };
  }).sort((a, b) => {
    // 1. Absolute Priority: Health/Medical advice always comes first
    const aIsHealth = a.domain === 'health' || a.domain === 'medical';
    const bIsHealth = b.domain === 'health' || b.domain === 'medical';
    if (aIsHealth && !bIsHealth) return -1;
    if (!aIsHealth && bIsHealth) return 1;

    // 2. Next Priority: Critical blockers
    if (a.isCritical && !b.isCritical) return -1;
    if (!a.isCritical && b.isCritical) return 1;

    // 3. Finally: Sort by efficiency
    return b.efficiency - a.efficiency;
  });
}

