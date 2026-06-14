import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

const VITALAI_DISCLAIMER = `You are VitalAI, an educational health information assistant. You provide evidence-based, general health information only. You never diagnose conditions, prescribe treatments, or claim medical certainty. Always recommend consulting a licensed professional for personal medical decisions. Frame all responses as "research suggests," "studies indicate," "generally recommended" — never as definitive medical advice.`;

interface QueryClaudeParams {
  systemPrompt: string;
  userMessage: string;
  context?: string;
}

export async function queryClaude({
  systemPrompt,
  userMessage,
  context,
}: QueryClaudeParams): Promise<string> {
  const fullSystemPrompt = `${VITALAI_DISCLAIMER}\n\n${systemPrompt}`;

  let fullUserMessage = userMessage;
  if (context) {
    fullUserMessage = `[RETRIEVED CONTEXT]\n${context}\n[END CONTEXT]\n\n${userMessage}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 2048,
    system: fullSystemPrompt,
    messages: [{ role: 'user', content: fullUserMessage }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}
