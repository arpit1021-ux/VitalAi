import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getRagContext } from '../services/retrieval.js';
import { generateText } from '../services/llm.js';
import { assessUntrusted, clampUntrusted } from '../services/promptSafety.js';
import { logger } from '../utils/logger.js';
import ChatSession from '../models/ChatSession.js';
import Profile from '../models/Profile.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, notFound } from '../utils/AppError.js';

const SUPPORTED_LANGUAGES = [
  'english', 'hindi', 'tamil', 'bengali', 'telugu', 'marathi', 'kannada',
] as const;

const messageSchema = z.object({
  sessionId: objectId,
  content: z
    .string({ required_error: 'Type a message first.' })
    .trim()
    .min(1, 'Type a message first.')
    .max(4000, 'Messages are limited to 4000 characters.'),
  // An open string here would be interpolated into the system prompt.
  language: z.enum(SUPPORTED_LANGUAGES).default('english'),
});

const router = Router();

router.use(authenticate);

router.post('/session', validate({ body: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const { profileId } = req.body as { profileId: string };

  const profile = await Profile.findOne({ _id: profileId, userId: req.jwtUser!.id });
  if (!profile) {
    throw notFound('That profile');
  }

  const session = await ChatSession.create({
    userId: req.jwtUser!.id,
    profileId,
    title: 'New Chat',
  });

  res.status(201).json({ session });
}));

router.get('/sessions/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const sessions = await ChatSession.find({
    profileId: req.params.profileId,
  })
    .sort({ updatedAt: -1 })
    .limit(10);

  res.json({ sessions });
}));

router.get('/session/:sessionId', validate({ params: z.object({ sessionId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const session = await ChatSession.findById(req.params.sessionId);
  if (!session) {
    throw notFound('That conversation');
  }

  const profile = await Profile.findOne({
    _id: session.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw forbidden('That conversation belongs to another profile.');
  }

  res.json({ session });
}));

router.post('/message', validate({ body: messageSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, content, language } = req.body as z.infer<typeof messageSchema>;

  const session = await ChatSession.findById(sessionId);
  if (!session) {
    throw notFound('That conversation');
  }

  const profile = await Profile.findOne({
    _id: session.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  // History is captured before the new message is appended, so the current
  // turn is not duplicated as both history and the live user message.
  const history = session.messages.slice(-10).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  session.messages.push({ role: 'user', content, timestamp: new Date() });

  const { context: ragContext, sources, ragSources } = await getRagContext(content);

  // Profile fields are typed by the user, so they are untrusted input even
  // though they belong to the person asking. They used to be interpolated
  // into the system prompt, where anything they contained read as an
  // instruction.
  const profileContext = [
    `Name: ${profile.name}`,
    `Age: ${profile.age ?? 'Not specified'}`,
    `Diet type: ${profile.dietType ?? 'Not specified'}`,
    `Allergies: ${profile.allergies?.join(', ') || 'None'}`,
    `Conditions: ${profile.conditions?.join(', ') || 'None'}`,
    `Medications: ${profile.medications?.map((m) => `${m.name} ${m.dosage}`).join(', ') || 'None'}`,
    `Fitness goal: ${profile.fitnessGoal ?? 'Not specified'}`,
    `Activity level: ${profile.activityLevel ?? 'Not specified'}`,
  ].join('\n');

  const safety = assessUntrusted(content);
  if (safety.suspicious) {
    logger.warn('Chat message matched injection heuristics', {
      profileId: String(profile._id),
      signals: safety.signals,
    });
  }

  // `language` is a validated enum, so this is the only interpolation that
  // reaches the system prompt.
  const languageInstruction =
    language !== 'english'
      ? `The user prefers ${language}. Respond entirely in ${language}, in simple, clear language.`
      : 'If the user writes in a regional language (Hindi, Tamil, Bengali and so on), reply in that same language.';

  const systemPrompt = `You are VitalAI, a warm, caring health companion — like a knowledgeable grandmother who cares deeply about your wellbeing. You explain things clearly without medical jargon. You are supportive, patient, and encouraging.

Your personality:
- Warm and caring, like a family elder who wants the best for you
- Use simple, everyday language — avoid medical jargon
- Be encouraging, and gently warn when something might be harmful
- Use relatable analogies and examples
- If you don't know something, say so honestly

CRITICAL RULES:
- You are NOT a doctor. Never diagnose, prescribe, or replace professional medical advice.
- Always recommend consulting a healthcare professional for personal medical decisions.
- Frame health advice as "research suggests", "generally recommended", "many people find that..."
- Label home remedies clearly: "This is a traditional home remedy, not medical advice."
- Refer to family members by the name given in the profile block.

${languageInstruction}`;

  const modelResponse = await generateText({
    systemPrompt,
    userMessage: 'Reply to the message in <user_message>, taking the profile into account.',
    context: ragContext,
    untrusted: [
      { label: 'health_profile', content: profileContext },
      { label: 'user_message', content: clampUntrusted(content, 4000) },
    ],
    history,
    userId: req.jwtUser!.id,
    operation: 'chat.message',
    maxOutputTokens: 1024,
  });

  session.messages.push({
    role: 'assistant',
    content: modelResponse,
    timestamp: new Date(),
    ragUsed: sources.length > 0,
    ragSourceCount: sources.length,
  });

  if (session.messages.length === 2 && session.title === 'New Chat') {
    session.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
  }

  await session.save();

  res.json({
    response: modelResponse,
    sessionId: session._id,
    sources,
    ragSources: ragSources.length > 0 ? ragSources : null,
  });
}));

router.delete('/session/:sessionId', validate({ params: z.object({ sessionId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const session = await ChatSession.findById(req.params.sessionId);
  if (!session) {
    throw notFound('That conversation');
  }

  const profile = await Profile.findOne({
    _id: session.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw forbidden('That conversation belongs to another profile.');
  }

  await ChatSession.findByIdAndDelete(req.params.sessionId);
  res.json({ message: 'Session deleted' });
}));

export default router;
