import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { assertIsImage, upload, uploadToCloudinary } from '../services/upload.js';
import { getRagContext } from '../services/retrieval.js';
import { generateText, generateTextFromImage } from '../services/llm.js';
import { parseValidatedJson } from '../utils/parseJsonResponse.js';
import { assessUntrusted, clampUntrusted } from '../services/promptSafety.js';
import {
  foodVerdictSchema,
  medicineVerdictSchema,
  supplementVerdictSchema,
} from '../schemas/aiOutputs.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import { objectId, searchTerm, validate } from '../middleware/validate.js';
import { z } from 'zod';

/**
 * Storing the photo is a convenience; the analysis is the product. A storage
 * failure must never discard a verdict the user already waited for.
 */
async function uploadImageSafely(file: Express.Multer.File | undefined): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    return await uploadToCloudinary(file);
  } catch (error) {
    logger.warn('Image upload failed; saving analysis without the photo', {
      reason: (error as Error).message,
    });
    return undefined;
  }
}

const TEXT_ONLY_SYSTEM_PROMPT = `You are analyzing a food ingredient list provided as text. Evaluate each ingredient for safety based on the user's health profile.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "verdict": "safe" | "caution" | "avoid",
  "summary": "brief summary of the analysis",
  "product_name": null,
  "extracted_ingredients": null,
  "extracted_nutrition": null,
  "identified_items": null,
  "flagged_ingredients": [{"name": "ingredient", "reason": "why flagged", "severity": "low|medium|high"}],
  "positive_nutrients": [{"name": "nutrient", "benefit": "why good"}],
  "allergen_warnings": ["any allergens detected or relevant to user"],
  "recommendation": "overall recommendation",
  "confidence": "high|medium|low",
  "sources_used": ["list of sources referenced"]
}`;

const scanBodySchema = z.object({
  profileId: objectId,
  // OCR output. Bounded so a malformed client cannot post an unbounded prompt,
  // and because everything here is fed to a model that charges per token.
  extractedText: z.string().max(20_000).optional().default(''),
});

const historyQuerySchema = z.object({
  type: z.enum(['food', 'medicine', 'supplement']).optional(),
  search: searchTerm.optional(),
  // These are the values the history screen's sort control emits. It
  // previously sent 'newest'/'oldest' while this route compared against
  // 'date-asc'/'date-desc', so 'Oldest first' silently did nothing.
  sort: z.enum(['newest', 'oldest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const router = Router();

router.use(authenticate);

router.post('/food', upload.single('image'), validate({ body: scanBodySchema }), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body as z.infer<typeof scanBodySchema>;

    const profile = await Profile.findOne({ _id: profileId, userId: req.jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Medications: ${profile.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || 'None'}
    `;

    const labelSafety = assessUntrusted(extractedText ?? '');
    if (labelSafety.suspicious) {
      // Worth knowing about: a label whose text tries to steer the analysis is
      // either a crafted image or a genuine adversarial product.
      logger.warn('Scanned label matched injection heuristics', {
        profileId: String(profile._id),
        signals: labelSafety.signals,
      });
    }

    const hasImage = Boolean(req.file?.buffer.length);
    if (hasImage) assertIsImage(req.file!);

    const searchQuery = hasImage
      ? `food nutrition health safety ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''} ${profile.conditions?.join(' ') || ''}`
      : `food ingredients safety ${extractedText} ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''}`;

    const { context: ragContext, sources, ragSources } = await getRagContext(searchQuery);

    const systemPrompt = hasImage
      ? `You are an expert food analyst and nutritionist. You can see an image provided by the user. Your job is to identify everything in the image and provide a thorough health analysis.

CAPABILITIES — handle ALL of these image types:
- Packaged food with labels: Read ingredient lists, nutrition facts, allergen warnings, product name, brand, expiry dates
- Raw food items (vegetables, fruits, grains, spices, herbs): Identify each item by name, estimate quantities, provide nutritional breakdown
- Cooked dishes / meals: Identify the dish, estimate ingredients used, assess healthiness
- Mixed images (e.g., a kitchen counter with various items): Identify each visible food item separately
- Barcodes / QR codes: Note them but focus on visual identification of the food itself

For each item you identify, provide:
1. Exact name of the item
2. Estimated quantity visible
3. Key nutritional values (calories, protein, carbs, fiber, vitamins, minerals)
4. Health benefits specific to the user's profile
5. Any concerns based on their conditions, allergies, or medications

Be specific and confident. If you see carrots, say "carrots" not "orange vegetable". If you see a Maggi packet, say "Maggi 2-Minute Noodles" not "instant noodles".

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "verdict": "safe" | "caution" | "avoid",
  "summary": "2-3 sentence summary of what you identified and overall health assessment",
  "product_name": "name of the product OR list of identified items (e.g., 'Carrots, Beetroot, Bell Peppers')",
  "extracted_ingredients": "full ingredient list if label visible, OR comma-separated list of identified raw food items with estimated quantities",
  "extracted_nutrition": "nutritional information from label if visible, OR estimated nutritional breakdown of identified items",
  "identified_items": [{"name": "item name", "quantity": "estimated quantity", "calories": "estimated calories", "key_nutrients": "main nutrients", "benefit": "health benefit for this user", "concern": "any concern or null"}],
  "flagged_ingredients": [{"name": "ingredient", "reason": "why flagged", "severity": "low|medium|high"}],
  "positive_nutrients": [{"name": "nutrient", "benefit": "why good for this user specifically"}],
  "allergen_warnings": ["any allergens detected or relevant to user's profile"],
  "recommendation": "actionable recommendation — what to eat, what to avoid, how to prepare for best nutrition",
  "confidence": "high|medium|low",
  "sources_used": ["list of sources referenced"]
}`
      : TEXT_ONLY_SYSTEM_PROMPT;

    let userMessage: string;

    if (hasImage) {
      userMessage =
        'Analyse the attached image against the profile in <health_profile>. Identify every food item visible — a packaged product, raw ingredients, or a cooked meal — and for each give its nutritional value and how it fits this profile.';
    } else {
      userMessage =
        'Analyse the label in <label_text> against the profile in <health_profile>.';
    }

    let modelResponse: string;

    if (hasImage) {
      logger.info('Food scan using vision', {
        profileId: String(profile._id),
        bytes: req.file!.buffer.length,
        mimeType: req.file!.mimetype,
      });

      const vision = await generateTextFromImage({

        userId: req.jwtUser!.id,

        operation: 'scan.food_vision',
        systemPrompt,
        userMessage,
        context: ragContext,
        imageBuffer: req.file!.buffer,
        mimeType: req.file!.mimetype,
        // Scoping the vision cache to the profile keeps one user's analysis
        // from ever being served to another.
        cacheScope: String(profile._id),
      });

      if (vision.usedVision) {
        modelResponse = vision.text;
      } else {
        // The configured provider has no vision path. Rather than sending a
        // vision prompt to a text-only model, ask for a profile-based answer
        // and mark the confidence down.
        modelResponse = await generateText({
          userId: req.jwtUser!.id,
          operation: 'scan.food_text_fallback',
          systemPrompt: TEXT_ONLY_SYSTEM_PROMPT,
          userMessage: `Health Profile:\n${profileContext}\n\nThe photo could not be analysed. Give general guidance for this profile and set confidence to "low".`,
          context: ragContext,
        });
      }
    } else {
      modelResponse = await generateText({
        userId: req.jwtUser!.id,
        operation: 'scan.food_text',
        maxOutputTokens: 2048,
        untrusted: [
          { label: 'health_profile', content: profileContext },
          { label: 'label_text', content: clampUntrusted(extractedText ?? '', 8000) },
        ],
        systemPrompt,
        userMessage,
        context: ragContext,
      });
    }

    const parsed = parseValidatedJson(modelResponse, foodVerdictSchema, {
      operation: 'scan.food',
    });

    if (!parsed) {
      // Storing an unvalidated blob under aiVerdict would put a malformed —
      // possibly injected — value into a record the user reads as a health
      // judgement. Fail visibly instead.
      throw new AppError({
        status: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: 'The analysis came back in a form we could not read.',
        action: 'Try the scan again. If it keeps failing, take a clearer photo of the label.',
      });
    }

    const imageUrl = await uploadImageSafely(req.file);

    const finalExtractedText = hasImage
      ? (parsed as any).extracted_ingredients || extractedText
      : extractedText;

    await ScanHistory.create({
      userId: req.jwtUser!.id,
      profileId,
      type: 'food',
      imageUrl,
      extractedText: finalExtractedText,
      aiVerdict: parsed,
      sourcesUsed: sources,
      ragUsed: sources.length > 0,
      ragSourceCount: sources.length,
    });

    res.json({ verdict: parsed, ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error: any) {
    logger.error('Food scan failed', error);
    let userMessage = 'Food scan analysis failed. Please retry.';
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
      userMessage = 'AI service is temporarily busy. Please try again in a few moments.';
    } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (errMsg.includes('400') || errMsg.includes('INVALID_ARGUMENT')) {
      userMessage = 'The image could not be processed. Please try a clearer photo.';
    }
    res.status(500).json({ error: userMessage });
  }
});

router.post('/medicine', upload.single('image'), validate({ body: scanBodySchema }), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body as z.infer<typeof scanBodySchema>;

    const profile = await Profile.findOne({ _id: profileId, userId: req.jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Current Medications: ${profile.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || 'None'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
    `;

    const { context: ragContext, sources, ragSources } = await getRagContext(
      `drug interactions medicine ${extractedText} ${profile.medications?.map(m => m.name).join(' ') || ''}`
    );

    const systemPrompt = `You are analyzing medication information. Check for drug interactions, contraindications based on the user's current medications and health conditions.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "interactions": [{"drug": "drug name", "severity": "mild|moderate|severe", "description": "interaction details"}],
  "contraindications": [{"condition": "condition", "description": "why contraindicated"}],
  "general_advice": "general advice about this medication",
  "sources_used": ["list of sources referenced"]
}`;

    const userMessage = `Health Profile:\n${profileContext}\n\nExtracted Medicine Text:\n${extractedText}\n\nPlease analyze this medication considering the user's current medications and health conditions.`;

    const modelResponse = await generateText({

      userId: req.jwtUser!.id,

      operation: 'scan.medicine',
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseValidatedJson(modelResponse, medicineVerdictSchema, {
      operation: 'scan.medicine',
    });

    if (!parsed) {
      throw new AppError({
        status: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: 'The interaction check came back in a form we could not read.',
        action: 'Try again. If it keeps failing, ask a pharmacist about this medication.',
      });
    }

    const imageUrl = await uploadImageSafely(req.file);

    await ScanHistory.create({
      userId: req.jwtUser!.id,
      profileId,
      type: 'medicine',
      imageUrl,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed: sources,
      ragUsed: sources.length > 0,
      ragSourceCount: sources.length,
    });

    res.json({ verdict: parsed, ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error) {
    res.status(500).json({ error: 'Medicine scan analysis failed. Please retry.' });
  }
});

router.post('/supplement', upload.single('image'), validate({ body: scanBodySchema }), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body as z.infer<typeof scanBodySchema>;

    const profile = await Profile.findOne({ _id: profileId, userId: req.jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
      Diet Type: ${profile.dietType || 'Not specified'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Medications: ${profile.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || 'None'}
    `;

    const { context: ragContext, sources, ragSources } = await getRagContext(
      `supplement ingredients safety ${extractedText} ${profile.fitnessGoal || ''}`
    );

    const systemPrompt = `You are analyzing a dietary supplement. Evaluate its ingredients for safety, goal alignment, and any banned substances.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "goal_alignment_score": number (1-10),
  "ingredient_breakdown": [{"name": "ingredient", "dosage": "amount", "benefit": "benefit", "concern": "concern or null"}],
  "banned_substance_flags": [{"substance": "name", "reason": "why flagged"}],
  "usage_protocol": "recommended usage based on profile",
  "sources_used": ["list of sources referenced"]
}`;

    const userMessage = `Health Profile:\n${profileContext}\n\nExtracted Supplement Text:\n${extractedText}\n\nPlease analyze this supplement considering the user's fitness goals, health conditions, and dietary needs.`;

    const modelResponse = await generateText({

      userId: req.jwtUser!.id,

      operation: 'scan.supplement',
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseValidatedJson(modelResponse, supplementVerdictSchema, {
      operation: 'scan.supplement',
    });

    if (!parsed) {
      throw new AppError({
        status: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: 'The supplement analysis came back in a form we could not read.',
        action: 'Try the scan again with a clearer photo of the ingredients panel.',
      });
    }

    const imageUrl = await uploadImageSafely(req.file);

    await ScanHistory.create({
      userId: req.jwtUser!.id,
      profileId,
      type: 'supplement',
      imageUrl,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed: sources,
      ragUsed: sources.length > 0,
      ragSourceCount: sources.length,
    });

    res.json({ verdict: parsed, ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error) {
    res.status(500).json({ error: 'Supplement scan analysis failed. Please retry.' });
  }
});

router.get(
  '/history/:profileId',
  validate({ params: z.object({ profileId: objectId }), query: historyQuerySchema }),
  async (req: Request, res: Response) => {
  try {
    const { type, search, sort, page, limit } = req.query as unknown as z.infer<typeof historyQuerySchema>;

    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const filter: Record<string, any> = { profileId: req.params.profileId };

    if (type) filter.type = type;

    // $text uses the index declared on the model. The previous $regex scanned
    // the whole collection and accepted user-supplied regex metacharacters.
    if (search) filter.$text = { $search: search };

    const skip = (page - 1) * limit;

    const sortObj: Record<string, 1 | -1> = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const total = await ScanHistory.countDocuments(filter);
    const scans = await ScanHistory.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    res.json({
      scans,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

router.delete('/history/all/:profileId', validate({ params: z.object({ profileId: objectId }) }), async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const result = await ScanHistory.deleteMany({ profileId: req.params.profileId });

    res.json({ message: 'All scans deleted successfully', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear scan history' });
  }
});

router.delete('/history/:id', validate({ params: z.object({ id: objectId }) }), async (req: Request, res: Response) => {
  try {
    const scan = await ScanHistory.findById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: scan.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to delete this scan' });
      return;
    }

    await ScanHistory.findByIdAndDelete(req.params.id);

    res.json({ message: 'Scan deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scan' });
  }
});

export default router;
