import { z } from 'zod';

/**
 * Shapes the model is asked to return.
 *
 * Model output is untrusted input. It is parsed and validated before anything
 * is persisted or shown, for three reasons: a malformed response should degrade
 * visibly rather than store `undefined` into a health record; a prompt
 * injection that succeeds in changing the *prose* still cannot invent a field
 * or a verdict value outside this enum; and a provider change that alters the
 * output format fails loudly here instead of silently downstream.
 */

const severity = z.enum(['low', 'medium', 'high']).catch('medium');
const confidence = z.enum(['high', 'medium', 'low']).catch('low');

/** Free text from the model, bounded so a runaway generation cannot be stored whole. */
const text = (max = 2000) => z.string().max(max).catch('');

export const foodVerdictSchema = z.object({
  // The verdict drives a badge the user acts on, so an unrecognised value
  // becomes 'caution' rather than being coerced to 'safe'.
  verdict: z.enum(['safe', 'caution', 'avoid']).catch('caution'),
  summary: text(1500),
  product_name: text(300).nullable().optional(),
  extracted_ingredients: text(4000).nullable().optional(),
  extracted_nutrition: text(2000).nullable().optional(),
  identified_items: z
    .array(
      z.object({
        name: text(200),
        quantity: text(100).optional(),
        calories: text(60).optional(),
        key_nutrients: text(400).optional(),
        benefit: text(600).optional(),
        concern: text(600).nullable().optional(),
      }),
    )
    .max(40)
    .nullable()
    .optional(),
  flagged_ingredients: z
    .array(z.object({ name: text(200), reason: text(600), severity }))
    .max(40)
    .default([]),
  positive_nutrients: z
    .array(z.object({ name: text(200), benefit: text(600) }))
    .max(40)
    .default([]),
  allergen_warnings: z.array(text(200)).max(40).default([]),
  recommendation: text(1500),
  confidence,
  sources_used: z.array(text(300)).max(20).default([]),
});

export const medicineVerdictSchema = z.object({
  interactions: z
    .array(
      z.object({
        drug: text(200),
        severity: z.enum(['mild', 'moderate', 'severe']).catch('moderate'),
        description: text(1200),
      }),
    )
    .max(40)
    .default([]),
  contraindications: z
    .array(z.object({ condition: text(200), description: text(1200) }))
    .max(40)
    .default([]),
  general_advice: text(2000),
  sources_used: z.array(text(300)).max(20).default([]),
});

export const supplementVerdictSchema = z.object({
  goal_alignment_score: z.coerce.number().min(1).max(10).catch(5),
  ingredient_breakdown: z
    .array(
      z.object({
        name: text(200),
        dosage: text(120).optional(),
        benefit: text(600).optional(),
        concern: text(600).nullable().optional(),
      }),
    )
    .max(60)
    .default([]),
  banned_substance_flags: z
    .array(z.object({ substance: text(200), reason: text(600) }))
    .max(40)
    .default([]),
  usage_protocol: text(2000),
  sources_used: z.array(text(300)).max(20).default([]),
});

export const recipeListSchema = z.object({
  recipes: z
    .array(
      z.object({
        name: text(200),
        description: text(600).default(''),
        emoji: z.string().max(8).optional(),
        prepTime: text(60).optional(),
      }),
    )
    .max(12)
    .default([]),
});

export const moderationSchema = z.object({
  approved: z.boolean().catch(false),
  note: text(600).optional(),
});

export type FoodVerdict = z.infer<typeof foodVerdictSchema>;
export type MedicineVerdict = z.infer<typeof medicineVerdictSchema>;
export type SupplementVerdict = z.infer<typeof supplementVerdictSchema>;
