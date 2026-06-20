import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../services/upload.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';

async function getRagContextSafely(query: string, timeoutMs = 4000): Promise<{ context: string; sources: string[] }> {
  try {
    const ragPromise = searchKnowledgeBase(query);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RAG timeout')), timeoutMs)
    );
    const ragResults = await Promise.race([ragPromise, timeoutPromise]);
    return {
      context: ragResults.map((r) => `[Source: ${r.metadata.source}] ${r.text}`).join('\n\n'),
      sources: ragResults.map((r) => r.metadata.source),
    };
  } catch (error) {
    console.warn('RAG retrieval failed, continuing without context:', error);
    return { context: '', sources: [] };
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

    const { context: ragContext, sources } = await getRagContextSafely(
      `food ingredients safety ${extractedText} ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''}`
    );

    const systemPrompt = `You are analyzing a food label for a user. Based on the extracted text and their health profile, provide a detailed analysis.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "verdict": "safe" | "caution" | "avoid",
  "summary": "brief summary of the analysis",
  "flagged_ingredients": [{"name": "ingredient", "reason": "why flagged"}],
  "positive_nutrients": [{"name": "nutrient", "benefit": "why good"}],
  "recommendation": "overall recommendation",
  "sources_used": ["list of sources referenced"]
}`;

    const userMessage = `Health Profile:\n${profileContext}\n\nExtracted Food Label Text:\n${extractedText}\n\nPlease analyze this food label considering the user's health profile, allergies, and dietary needs.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{ verdict: string; summary: string }>(
      claudeResponse,
      { verdict: 'unknown', summary: claudeResponse }
    );

    const imageUrl = await uploadImageSafely(req.file);

    await ScanHistory.create({
      profileId,
      type: 'food',
      imageUrl,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed: sources,
      ragUsed: sources.length > 0,
      ragSourceCount: sources.length,
    });

    res.json({ verdict: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Food scan analysis failed. Please retry.' });
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

    const { context: ragContext, sources } = await getRagContextSafely(
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

    res.json({ verdict: parsed });
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

    const { context: ragContext, sources } = await getRagContextSafely(
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

    res.json({ verdict: parsed });
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
