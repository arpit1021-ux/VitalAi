import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import ChatSession from '../models/ChatSession.js';
import Profile from '../models/Profile.js';

const router = Router();

router.use(authenticate);

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
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, content } = req.body;

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

    // Add user message
    session.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });

    // Get RAG context
    const ragResults = await searchKnowledgeBase(content);
    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    // Build conversation context (last 10 messages)
    const recentMessages = session.messages.slice(-10);
    const conversationContext = recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

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

    const systemPrompt = `You are VitalAI, a health companion AI assistant. You help users understand food labels, medications, supplements, and general health information.

User's Health Profile:
${profileContext}

Recent Conversation:
${conversationContext}

Provide helpful, evidence-based responses. Always remind users to consult healthcare professionals for personal medical decisions.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage: content,
      context: contextChunks,
    });

    // Add assistant message
    session.messages.push({
      role: 'assistant',
      content: claudeResponse,
      timestamp: new Date(),
    });

    // Update title if it's the first exchange
    if (session.messages.length === 2 && session.title === 'New Chat') {
      session.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    }

    await session.save();

    res.json({
      response: claudeResponse,
      sessionId: session._id,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await ChatSession.findByIdAndDelete(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
