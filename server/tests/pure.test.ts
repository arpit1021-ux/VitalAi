import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currentStreak,
  daysBetween,
  longestStreak,
  shiftDay,
  todayKey,
  weekStart,
} from '../src/utils/streak.js';
import { calculateProfileCompletion } from '../src/utils/profileCompletion.js';
import { calculateHealthScore } from '../src/utils/healthScore.js';
import { foodVerdictSchema, supplementVerdictSchema } from '../src/schemas/aiOutputs.js';

/**
 * Unit tests for the logic that needs no database.
 *
 * These exist because every defect covered here was found by reading rather
 * than by a failing test, which is the wrong way round. They run in the same
 * `npm test` as the integration suites and need nothing running.
 */

describe('streak arithmetic', () => {
  it('steps back through calendar days in UTC', () => {
    assert.equal(shiftDay('2026-03-09', -1), '2026-03-08');
    assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
    assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
  });

  it('crosses a DST transition without losing a day', () => {
    // Clocks go back in New York on 2026-11-01. The old loop used setDate and
    // getDate — local-time methods — on a date anchored at midnight UTC, so
    // stepping across that boundary produced the same day twice and the streak
    // stopped counting one short. Run the suite under TZ=America/New_York and
    // this is the case that fails against the old implementation.
    const days = ['2026-11-02', '2026-11-01', '2026-10-31'];
    assert.equal(currentStreak(days, '2026-11-02'), 3);
  });

  it('stops at the first gap', () => {
    assert.equal(currentStreak(['2026-09-26', '2026-09-25', '2026-09-23'], '2026-09-26'), 2);
  });

  it('counts nothing when today is missing', () => {
    assert.equal(currentStreak(['2026-09-25', '2026-09-24'], '2026-09-26'), 0);
    assert.equal(currentStreak([], '2026-09-26'), 0);
  });

  it('finds the longest run in a newest-first list', () => {
    assert.equal(longestStreak(['2026-09-26', '2026-09-20', '2026-09-19', '2026-09-18']), 3);
    assert.equal(longestStreak(['2026-09-26']), 1);
    assert.equal(longestStreak([]), 0);
  });

  it('measures whole days between keys', () => {
    assert.equal(daysBetween('2026-03-09', '2026-03-08'), 1);
    assert.equal(daysBetween('2026-01-01', '2025-12-31'), 1);
  });

  it('anchors a week to its Monday', () => {
    assert.equal(weekStart('2026-09-26'), '2026-09-21'); // Saturday
    assert.equal(weekStart('2026-09-27'), '2026-09-21'); // Sunday belongs to the week before
    assert.equal(weekStart('2026-09-21'), '2026-09-21'); // Monday is its own start
  });

  it('reports today as a plain calendar key', () => {
    assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('profile completion', () => {
  it('does not count an empty array as an answered field', () => {
    const empty = calculateProfileCompletion({ name: 'A', conditions: [], allergies: [], medications: [] });
    assert.deepEqual(empty.missing.includes('conditions'), true);

    const filled = calculateProfileCompletion({ name: 'A', conditions: ['asthma'] });
    assert.deepEqual(filled.completed.includes('conditions'), true);
  });

  it('never reports more than 100 per cent', () => {
    const full = calculateProfileCompletion({
      name: 'A',
      age: 30,
      gender: 'female',
      dietType: 'vegetarian',
      allergies: ['peanuts'],
      conditions: ['asthma'],
      medications: [{ name: 'x', dosage: '1' }],
      fitnessGoal: 'maintenance',
      activityLevel: 'active',
    });
    assert.equal(full.percentage, 100);
  });
});

describe('health score', () => {
  it('clamps a supplement figure the model exaggerated', () => {
    const result = calculateHealthScore({
      todayLog: { waterCount: 8, waterGoal: 8 },
      recentScans: [{ type: 'supplement', aiVerdict: { goal_alignment_score: 9999 } }],
      streak: 3,
      weeklyScans: 1,
    });

    assert.ok(result.score !== null);
    assert.ok(result.factors.supplementQuality <= 20, 'supplement factor is capped at its weight');
    assert.ok(result.score <= 100, 'total cannot exceed 100');
  });

  it('reports no score at all when there is no data', () => {
    const result = calculateHealthScore({ todayLog: null, recentScans: [], streak: 0, weeklyScans: 0 });
    assert.equal(result.score, null);
    assert.equal(result.hasData, false);
  });
});

describe('model output schemas', () => {
  const minimalFood = {
    verdict: 'safe',
    summary: 'ok',
    flagged_ingredients: [],
    positive_nutrients: [],
    allergen_warnings: [],
    recommendation: 'ok',
    confidence: 'high',
    sources_used: [],
  };

  it('never coerces an unknown verdict to safe', () => {
    const parsed = foodVerdictSchema.parse({ ...minimalFood, verdict: 'definitely fine' });
    assert.equal(parsed.verdict, 'caution');
  });

  it('truncates over-long text instead of discarding it', () => {
    const parsed = foodVerdictSchema.parse({ ...minimalFood, summary: 'x'.repeat(5000) });
    assert.equal(parsed.summary.length, 1500);
  });

  it('keeps text that fits untouched', () => {
    const parsed = foodVerdictSchema.parse({ ...minimalFood, summary: 'A short summary.' });
    assert.equal(parsed.summary, 'A short summary.');
  });

  it('rejects a supplement answer that is not an object', () => {
    assert.equal(supplementVerdictSchema.safeParse('not json').success, false);
  });
});
