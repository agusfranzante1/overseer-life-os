import type { HealthSnapshot, HealthBaseline } from '@/lib/store/healthStore'

export type EnergyBand = 'low' | 'medium' | 'optimal'

export interface EnergyContext {
  /** Current local hour as fractional 0..24 (default: now) */
  nowHour?: number
  /** Today's steps so far (default: snapshot.steps) */
  stepsSoFar?: number
  /** Wake-up time in HH:MM format (e.g. "07:00") */
  wakeTime?: string
  /** Subjective stress 0..100 (higher = worse) */
  stress?: number
  /** Subjective workload 0..100 (higher = more tired) */
  workload?: number
}

export interface EnergyResult {
  score: number          // 0-100 — current remaining energy at this moment of the day
  band: EnergyBand
  color: string
  label: string
  components: {
    sleepRecovery?: number    // 0-100 contribution from last night's sleep
    hrv?: number              // 0-100 contribution from HRV trend
    rhr?: number              // 0-100 contribution from resting HR trend
    timeDecay?: number        // 0..1 multiplier from hours awake
    activityDecay?: number    // 0..1 multiplier from steps already done
    stressPenalty?: number    // 0..1 multiplier (1 = no penalty)
    workloadPenalty?: number  // 0..1 multiplier
  }
  reason: string
  breakdown: string[]    // human-readable bullets of what hurt/helped
}

const BAND_COLORS: Record<EnergyBand, string> = {
  low: '#ef4444',
  medium: '#f59e0b',
  optimal: '#10b981',
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function bandOf(score: number): EnergyBand {
  if (score < 40) return 'low'
  if (score < 70) return 'medium'
  return 'optimal'
}

function labelOf(band: EnergyBand): string {
  return band === 'low' ? 'Baja' : band === 'medium' ? 'Media' : 'Óptima'
}

function parseWakeHour(wakeTime?: string): number {
  if (!wakeTime) return 7  // default 7am
  const m = wakeTime.match(/^(\d{1,2}):?(\d{2})?$/)
  if (!m) return 7
  return parseInt(m[1]) + (parseInt(m[2] ?? '0') / 60)
}

/**
 * Sleep quality scoring — non-linear:
 *   <5h     →  10  (severely under)
 *   5-6h    →  30
 *   6-7h    →  60
 *   7-8h    →  90
 *   8-9h    → 100  (optimal)
 *   9-10h   →  85  (slight over-sleeping)
 *   >10h    →  70  (often correlated with poor quality)
 */
function sleepQualityScore(hours: number, goalH: number): number {
  if (hours <= 0) return 0
  // If user has a personal goal, scale around it
  const ratio = hours / goalH
  if (ratio < 0.625) return 10   // <5h on 8h goal
  if (ratio < 0.75)  return 30   // <6h
  if (ratio < 0.875) return 60   // <7h
  if (ratio < 1.0)   return 85   // <8h
  if (ratio <= 1.125) return 100 // 8-9h
  if (ratio <= 1.25)  return 85  // 9-10h
  return 70                       // >10h
}

/**
 * Computes a context-aware Energy score representing how much energy you have RIGHT NOW.
 *
 * Inputs:
 *   - Recovery (from last night's sleep + HRV + RHR vs baseline)
 *   - Time decay (energy decreases as the day progresses)
 *   - Activity decay (steps already burned)
 *   - Subjective penalties (stress, workload)
 *
 * This is more realistic than a static "morning recovery" score because it tracks
 * how much you have LEFT in the tank, not how much you started with.
 */
export function computeEnergyScore(
  snapshot: HealthSnapshot | undefined,
  baseline: HealthBaseline,
  context: EnergyContext = {}
): EnergyResult | null {
  if (!snapshot && context.stress === undefined && context.workload === undefined) return null

  const sleepGoal = baseline.sleepGoalMinutes || 480
  const sleepGoalH = sleepGoal / 60
  const components: EnergyResult['components'] = {}
  const breakdown: string[] = []
  const reasons: string[] = []

  // ── Base recovery score (0..100) ──────────────────────────────────────────

  let recoveryScore: number | null = null
  let totalWeight = 0
  let weightedSum = 0

  // Sleep component
  if (snapshot?.sleepMinutes && snapshot.sleepMinutes > 0) {
    const hours = snapshot.sleepMinutes / 60
    const sScore = sleepQualityScore(hours, sleepGoalH)
    components.sleepRecovery = sScore
    weightedSum += sScore * 0.5  // 50% weight when sleep is present
    totalWeight += 0.5

    if (hours >= 7 && hours <= 9) reasons.push(`buen sueño (${hours.toFixed(1)}h)`)
    else if (hours < 6) { reasons.push(`sueño corto (${hours.toFixed(1)}h)`); breakdown.push(`💤 Dormiste sólo ${hours.toFixed(1)}h — recuperación incompleta`) }
    else if (hours > 9.5) { reasons.push(`exceso de sueño (${hours.toFixed(1)}h)`); breakdown.push(`💤 ${hours.toFixed(1)}h es mucho — puede indicar sueño de baja calidad`) }
    else breakdown.push(`💤 Sueño OK (${hours.toFixed(1)}h)`)
  }

  // HRV component (vs baseline)
  if (snapshot?.hrv && baseline.hrv) {
    const ratio = snapshot.hrv / baseline.hrv
    const capped = clamp(ratio, 0.6, 1.4)
    const hScore = ((capped - 0.6) / 0.8) * 100
    components.hrv = hScore
    weightedSum += hScore * 0.3
    totalWeight += 0.3
    if (capped >= 1.05) { reasons.push('HRV alta'); breakdown.push(`❤ HRV elevada (${snapshot.hrv} vs baseline ${Math.round(baseline.hrv)})`) }
    else if (capped <= 0.85) { reasons.push('HRV baja'); breakdown.push(`❤ HRV baja (${snapshot.hrv} vs baseline ${Math.round(baseline.hrv)})`) }
  }

  // RHR component (lower = better, vs baseline)
  if (snapshot?.restingHR && baseline.restingHR) {
    const delta = (baseline.restingHR - snapshot.restingHR) / baseline.restingHR
    const capped = clamp(delta, -0.2, 0.2)
    const rScore = ((capped + 0.2) / 0.4) * 100
    components.rhr = rScore
    weightedSum += rScore * 0.2
    totalWeight += 0.2
    if (delta >= 0.05) { reasons.push('FC reposo baja'); breakdown.push(`❤ FC reposo baja (${snapshot.restingHR} vs baseline ${Math.round(baseline.restingHR)})`) }
    else if (delta <= -0.05) { reasons.push('FC reposo elevada'); breakdown.push(`❤ FC reposo alta (${snapshot.restingHR})`) }
  }

  // Normalize weighted score
  if (totalWeight > 0) {
    recoveryScore = weightedSum / totalWeight
  } else if (snapshot?.sleepMinutes && snapshot.sleepMinutes > 0) {
    // Only sleep available
    recoveryScore = components.sleepRecovery ?? null
  }

  if (recoveryScore === null) return null

  // ── Context modifiers ─────────────────────────────────────────────────────

  const nowHour = context.nowHour ?? (() => {
    const d = new Date()
    return d.getHours() + d.getMinutes() / 60
  })()
  const wakeH = parseWakeHour(context.wakeTime)

  // 1. Time decay — every hour awake costs energy
  // Awake budget: 16h normal day. Decay starts gentle, steeper after 10h awake.
  const hoursAwake = Math.max(0, nowHour - wakeH)
  // Simple model: lose 1.5% per hour from hour 0 to 10, then 3% per hour after
  const decayPct = Math.min(50, hoursAwake <= 10
    ? hoursAwake * 1.5
    : 10 * 1.5 + (hoursAwake - 10) * 3.0)
  const timeDecay = (100 - decayPct) / 100
  components.timeDecay = timeDecay
  if (hoursAwake >= 1) {
    const h = Math.floor(hoursAwake)
    const m = Math.round((hoursAwake - h) * 60)
    breakdown.push(`🕐 Llevás ${h}h ${m}min despierto (-${Math.round(decayPct)}%)`)
  }

  // 2. Activity decay — high step counts deplete energy
  // 0..5k: no decay. 5k..10k: -5%. 10k..15k: -10%. >15k: -15% capped.
  const steps = context.stepsSoFar ?? snapshot?.steps ?? 0
  let activityDecayPct = 0
  if (steps > 15000) activityDecayPct = 15
  else if (steps > 10000) activityDecayPct = 10 + (steps - 10000) / 1000
  else if (steps > 5000) activityDecayPct = (steps - 5000) / 1000
  activityDecayPct = Math.min(20, activityDecayPct)
  const activityDecay = (100 - activityDecayPct) / 100
  components.activityDecay = activityDecay
  if (steps > 5000) {
    breakdown.push(`👣 ${steps.toLocaleString('es-AR')} pasos hoy (-${Math.round(activityDecayPct)}%)`)
  }

  // 3. Stress penalty (0..100, higher = worse, max -25%)
  let stressPenalty = 1.0
  if (typeof context.stress === 'number' && context.stress > 0) {
    const penaltyPct = (context.stress / 100) * 25
    stressPenalty = (100 - penaltyPct) / 100
    if (context.stress >= 60) breakdown.push(`😰 Estrés alto (-${Math.round(penaltyPct)}%)`)
    else if (context.stress >= 40) breakdown.push(`😰 Estrés moderado (-${Math.round(penaltyPct)}%)`)
  }
  components.stressPenalty = stressPenalty

  // 4. Workload penalty (0..100, higher = more drained, max -15%)
  let workloadPenalty = 1.0
  if (typeof context.workload === 'number' && context.workload > 0) {
    const penaltyPct = (context.workload / 100) * 15
    workloadPenalty = (100 - penaltyPct) / 100
    if (context.workload >= 70) breakdown.push(`⚙️ Carga alta hoy (-${Math.round(penaltyPct)}%)`)
  }
  components.workloadPenalty = workloadPenalty

  // ── Final score ──────────────────────────────────────────────────────────

  const rawScore = recoveryScore * timeDecay * activityDecay * stressPenalty * workloadPenalty
  const score = Math.round(clamp(rawScore, 0, 100))
  const band = bandOf(score)

  // Reason summary
  const summary = reasons.length > 0 ? reasons.join(' · ') : 'Sin contexto adicional'

  return {
    score,
    band,
    color: BAND_COLORS[band],
    label: labelOf(band),
    components,
    reason: summary,
    breakdown,
  }
}

export { BAND_COLORS }
