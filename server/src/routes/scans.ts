import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../services/upload.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';

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

    const ragResults = await searchKnowledgeBase(
      `food ingredients safety ${extractedText} ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''}`
    );

    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    const systemPrompt = `You are analyzing a food label for a user. Based on the extracted text and their health profile, provide a detailed analysis.

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
      context: contextChunks,
    });

    let parsed;
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'unknown', summary: claudeResponse };
    } catch {
      parsed = { verdict: 'unknown', summary: claudeResponse };
    }

    const sourcesUsed = ragResults.map((r) => r.metadata.source);

    await ScanHistory.create({
      profileId,
      type: 'food',
      imageUrl: req.file ? req.file.originalname : undefined,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed,
    });

    res.json({ verdict: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Food scan analysis failed' });
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

    const ragResults = await searchKnowledgeBase(
      `drug interactions medicine ${extractedText} ${profile.medications?.map(m => m.name).join(' ') || ''}`
    );

    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    const systemPrompt = `You are analyzing medication information. Check for drug interactions, contraindications based on the user's current medications and health conditions.

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
      context: contextChunks,
    });

    let parsed;
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { general_advice: claudeResponse };
    } catch {
      parsed = { general_advice: claudeResponse };
    }

    const sourcesUsed = ragResults.map((r) => r.metadata.source);

    await ScanHistory.create({
      profileId,
      type: 'medicine',
      imageUrl: req.file ? req.file.originalname : undefined,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed,
    });

    res.json({ verdict: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Medicine scan analysis failed' });
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

    const ragResults = await searchKnowledgeBase(
      `supplement ingredients safety ${extractedText} ${profile.fitnessGoal || ''}`
    );

    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    const systemPrompt = `You are analyzing a dietary supplement. Evaluate its ingredients for safety, goal alignment, and any banned substances.

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
      context: contextChunks,
    });

    let parsed;
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { usage_protocol: claudeResponse };
    } catch {
      parsed = { usage_protocol: claudeResponse };
    }

    const sourcesUsed = ragResults.map((r) => r.metadata.source);

    await ScanHistory.create({
      profileId,
      type: 'supplement',
      imageUrl: req.file ? req.file.originalname : undefined,
      extractedText,
      aiVerdict: parsed,
      sourcesUsed,
    });

    res.json({ verdict: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Supplement scan analysis failed' });
  }
});

router.get('/history/:profileId', async (req: Request, res: Response) => {
  try {
    const history = await ScanHistory.find({
      profileId: req.params.profileId,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

export default router;
