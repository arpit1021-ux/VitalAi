import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY || undefined });
const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const VITALAI_DISCLAIMER = `You are VitalAI, an educational health information assistant. You provide evidence-based, general health information only. You never diagnose conditions, prescribe treatments, or claim medical certainty. Always recommend consulting a licensed professional for personal medical decisions. Frame all responses as "research suggests," "studies indicate," "generally recommended" — never as definitive medical advice.`;

interface QueryClaudeParams {
  systemPrompt: string;
  userMessage: string;
  context?: string;
}

function buildMessages(params: QueryClaudeParams) {
  const fullSystemPrompt = `${VITALAI_DISCLAIMER}\n\n${params.systemPrompt}`;
  let fullUserMessage = params.userMessage;
  if (params.context) {
    fullUserMessage = `[RETRIEVED CONTEXT]\n${params.context}\n[END CONTEXT]\n\n${params.userMessage}`;
  }
  return { fullSystemPrompt, fullUserMessage };
}

async function queryClaudeProvider(params: QueryClaudeParams): Promise<string> {
  const { fullSystemPrompt, fullUserMessage } = buildMessages(params);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: fullSystemPrompt,
    messages: [{ role: 'user', content: fullUserMessage }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function queryGeminiProvider(params: QueryClaudeParams): Promise<string> {
  const { fullSystemPrompt, fullUserMessage } = buildMessages(params);

  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: fullUserMessage,
    config: {
      systemInstruction: fullSystemPrompt,
    },
  });

  return result.text ?? '';
}

export async function queryClaude(params: QueryClaudeParams): Promise<string> {
  if (env.LLM_PROVIDER === 'claude') {
    return queryClaudeProvider(params);
  }
  return queryGeminiProvider(params);
}
