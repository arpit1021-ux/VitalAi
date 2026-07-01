import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../services/upload.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude, queryClaudeWithImage } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';

async function getRagContextSafely(query: string, timeoutMs = 8000): Promise<{ context: string; sources: string[]; ragSources: { source: string; topic?: string }[] }> {
  const startTime = Date.now();
  try {
    const ragPromise = searchKnowledgeBase(query);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RAG timeout after ${Date.now() - startTime}ms`)), timeoutMs)
    );
    const ragResults = await Promise.race([ragPromise, timeoutPromise]);
    console.log(`[RAG] Succeeded in ${Date.now() - startTime}ms`);
    const ragSources = ragResults.map((r) => ({ source: r.metadata.source, topic: r.metadata.topic }));
    return {
      context: ragResults.map((r) => `[Source: ${r.metadata.source}] ${r.text}`).join('\n\n'),
      sources: ragResults.map((r) => r.metadata.source),
      ragSources,
    };
  } catch (error) {
    console.warn(`[RAG] Failed after ${Date.now() - startTime}ms:`, error);
    return { context: '', sources: [], ragSources: [] };
  }
}

async function uploadImageSafely(file: Express.Multer.File | undefined): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    return await uploadToCloudinary(file);
  } catch (error) {
    console.warn('Image upload to Cloudinary failed, continuing without image:', error);
    return undefined;
  }
}

const router = Router();

router.use(authenticate);

router.post('/food', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
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

    const hasImage = req.file && req.file.buffer;

    const searchQuery = hasImage
      ? `food nutrition health safety ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''} ${profile.conditions?.join(' ') || ''}`
      : `food ingredients safety ${extractedText} ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''}`;

    const { context: ragContext, sources, ragSources } = await getRagContextSafely(searchQuery);

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
      : `You are analyzing a food ingredient list provided as text. Evaluate each ingredient for safety based on the user's health profile.

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

    let userMessage: string;

    if (hasImage) {
      userMessage = `Health Profile:\n${profileContext}\n\nAnalyze this image thoroughly. Identify all food items visible — whether it's a packaged product with a label, raw vegetables and fruits, a cooked meal, or anything else. For each item, explain what it is, its nutritional value, and how it fits the user's health profile. Be as detailed and specific as Gemini would be.`;
    } else {
      userMessage = `Health Profile:\n${profileContext}\n\nExtracted Food Label Text:\n${extractedText}\n\nPlease analyze this food label considering the user's health profile, allergies, and dietary needs.`;
    }

    let claudeResponse: string;

    if (hasImage) {
      console.log(`[Food Scan] Using vision mode. Image size: ${req.file!.buffer.length} bytes, MIME: ${req.file!.mimetype}`);
      try {
        claudeResponse = await queryClaudeWithImage({
          systemPrompt,
          userMessage,
          context: ragContext,
          imageBuffer: req.file!.buffer,
          mimeType: req.file!.mimetype,
        });
      } catch (visionError) {
        console.error('[Food Scan] Vision API failed, falling back to text-only:', visionError);
        claudeResponse = await queryClaude({
          systemPrompt: systemPrompt.replace('You have been provided with an image of the food product. Carefully examine the image to read the ingredient list, nutritional information, and any other relevant details from the product label.', 'The user uploaded an image but text extraction failed. Please provide general analysis based on the health profile.'),
          userMessage: `Health Profile:\n${profileContext}\n\nThe user attempted to scan a food product but the image could not be processed. Please provide general dietary advice based on their health profile.`,
          context: ragContext,
        });
      }
    } else {
      claudeResponse = await queryClaude({
        systemPrompt,
        userMessage,
        context: ragContext,
      });
    }

    const parsed = parseClaudeJson<{ verdict: string; summary: string }>(
      claudeResponse,
      { verdict: 'unknown', summary: claudeResponse }
    );

    const imageUrl = await uploadImageSafely(req.file);

    const finalExtractedText = hasImage
      ? (parsed as any).extracted_ingredients || extractedText
      : extractedText;

    await ScanHistory.create({
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
    console.error('[Food Scan Error]', error?.message || error);
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

router.post('/medicine', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
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

    const { context: ragContext, sources, ragSources } = await getRagContextSafely(
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

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{ general_advice: string }>(
      claudeResponse,
      { general_advice: claudeResponse }
    );

    const imageUrl = await uploadImageSafely(req.file);

    await ScanHistory.create({
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

router.post('/supplement', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { extractedText, profileId } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
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

    const { context: ragContext, sources, ragSources } = await getRagContextSafely(
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

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{ usage_protocol: string }>(
      claudeResponse,
      { usage_protocol: claudeResponse }
    );

    const imageUrl = await uploadImageSafely(req.file);

    await ScanHistory.create({
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

router.get('/history/:profileId', async (req: Request, res: Response) => {
  try {
    const { type, search, sort, page = '1', limit = '20' } = req.query;

    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const filter: Record<string, any> = { profileId: req.params.profileId };

    if (type && ['food', 'medicine', 'supplement'].includes(type as string)) {
      filter.type = type;
    }

    if (search && typeof search === 'string') {
      filter.$or = [
        { extractedText: { $regex: search, $options: 'i' } },
        { 'aiVerdict.summary': { $regex: search, $options: 'i' } },
        { 'aiVerdict.general_advice': { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortObj: Record<string, 1 | -1> = sort === 'date-asc'
      ? { createdAt: 1 }
      : { createdAt: -1 };

    const total = await ScanHistory.countDocuments(filter);
    const scans = await ScanHistory.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    res.json({
      scans,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

router.delete('/history/all/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
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

router.delete('/history/:id', async (req: Request, res: Response) => {
  try {
    const scan = await ScanHistory.findById(req.params.id);
    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: scan.profileId,
      userId: (req as any).jwtUser!.id,
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
