import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import ChatSession from '../models/ChatSession.js';
import Profile from '../models/Profile.js';

const router = Router();

router.use(authenticate);

async function getRagContextSafely(query: string, timeoutMs = 8000): Promise<{ context: string; sources: string[] }> {
  const startTime = Date.now();
  try {
    const ragPromise = searchKnowledgeBase(query);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RAG timeout after ${Date.now() - startTime}ms`)), timeoutMs)
    );
    const ragResults = await Promise.race([ragPromise, timeoutPromise]);
    console.log(`[RAG] Succeeded in ${Date.now() - startTime}ms`);
    return {
      context: ragResults.map((r) => `[Source: ${r.metadata.source}] ${r.text}`).join('\n\n'),
      sources: ragResults.map((r) => r.metadata.source),
    };
  } catch (error) {
    console.warn(`[RAG] Failed after ${Date.now() - startTime}ms:`, error);
    return { context: '', sources: [] };
  }
}

router.post('/session', async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const session = await ChatSession.create({
      profileId,
      title: 'New Chat',
    });

    res.status(201).json({ session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

router.get('/sessions/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const sessions = await ChatSession.find({
      profileId: req.params.profileId,
    })
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: session.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to access this session' });
      return;
    }

    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, content, language } = req.body;

    const session = await ChatSession.findById(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: session.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    session.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });

    const { context: ragContext, sources } = await getRagContextSafely(content);

    const recentMessages = session.messages.slice(-10);
    const conversationContext = recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const familyContext = '';

    const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Medications: ${profile.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

    const languageInstruction = language && language !== 'english'
      ? `\n\nIMPORTANT: The user prefers to communicate in ${language}. Respond entirely in ${language}. Use simple, clear language appropriate for a general audience.`
      : '\n\nIf the user writes in a regional language (Hindi, Tamil, Bengali, etc.), respond in that same language. Detect the language automatically.';

    const systemPrompt = `You are VitalAI, a warm, caring health companion — like a knowledgeable grandmother who cares deeply about your wellbeing. You explain things clearly without medical jargon. You are supportive, patient, and encouraging.

Your personality:
- Warm and caring, like a family elder who wants the best for you
- Use simple, everyday language — avoid medical jargon
- Be encouraging: "That's a great choice!" or "You're doing wonderfully"
- Gently warn when something might be harmful: "Hmm, I'd be careful with that..."
- Use relatable analogies and examples
- If you don't know something, say so honestly

CRITICAL RULES:
- You are NOT a doctor. Never diagnose, prescribe, or replace professional medical advice.
- Always recommend consulting a healthcare professional for personal medical decisions.
- Frame all health advice as "research suggests", "generally recommended", "many people find that..."
- Home remedies should be clearly labelled: "This is a traditional home remedy, not medical advice."
- When discussing family members, refer to them by name from the profile context.

User's Health Profile:
${profileContext}

Recent Conversation:
${conversationContext}${languageInstruction}`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage: content,
      context: ragContext,
    });

    session.messages.push({
      role: 'assistant',
      content: claudeResponse,
      timestamp: new Date(),
      ragUsed: sources.length > 0,
      ragSourceCount: sources.length,
    });

    if (session.messages.length === 2 && session.title === 'New Chat') {
      session.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    }

    await session.save();

    res.json({
      response: claudeResponse,
      sessionId: session._id,
      sources,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message. Please retry.' });
  }
});

router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: session.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to delete this session' });
      return;
    }

    await ChatSession.findByIdAndDelete(req.params.sessionId);
    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
