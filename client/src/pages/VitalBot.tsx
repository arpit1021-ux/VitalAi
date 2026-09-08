import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, MessageSquare, Bot, User, Loader2, Globe, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useProfileStore } from '@/stores/profileStore';
import { chat, newIdempotencyKey } from '@/lib/api';
import { describeError, isCancellation } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { ErrorState } from '@/components/shared/ErrorState';

const quickStarters = [
  'Is this breakfast healthy for me?',
  'Can I take ibuprofen with my current meds?',
  'Best foods for my condition',
  'Home remedy for bloating',
];

// No flags: five of these are Indian languages and one flag cannot stand for
// any of them, let alone all five. The endonym is the identifier people scan for.
const languages = [
  { code: 'english', label: 'English' },
  { code: 'hindi', label: 'हिन्दी' },
  { code: 'tamil', label: 'தமிழ்' },
  { code: 'bengali', label: 'বাংলা' },
  { code: 'telugu', label: 'తెలుగు' },
  { code: 'marathi', label: 'मराठी' },
  { code: 'kannada', label: 'ಕನ್ನಡ' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  ragSources?: { source: string; topic?: string }[] | null;
}

interface ChatSessionSummary {
  _id: string;
  title?: string;
}

/** One pending question, kept so a failed send can be retried without retyping. */
interface Attempt {
  content: string;
  /** Reused across retries so a send that actually reached the model is not billed twice. */
  retryKey: string;
}

/**
 * The transcript lives in the query cache rather than component state.
 *
 * Held in `useState` it was destroyed on every unmount: switching to the
 * dashboard and back lost the conversation even though the server still had
 * it. `null` is the key for a conversation typed before a session exists.
 */
function transcriptKey(sessionId: string | null) {
  return ['chatTranscript', sessionId] as const;
}

export default function VitalBot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contextParam = searchParams.get('context');
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState(contextParam ?? '');
  const [language, setLanguage] = useState('english');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState<Attempt | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const hasUsedContext = useRef(false);

  const sessionsQuery = useQuery<ChatSessionSummary[]>({
    queryKey: ['chatSessions', activeProfile?._id],
    queryFn: () =>
      chat.getSessions(activeProfile!._id).then((r) => {
        const body = r.data as { sessions?: ChatSessionSummary[] } | ChatSessionSummary[];
        return Array.isArray(body) ? body : (body.sessions ?? []);
      }),
    enabled: !!activeProfile,
  });

  const transcriptQuery = useQuery<Message[]>({
    queryKey: transcriptKey(sessionId),
    queryFn: () =>
      chat.getSession(sessionId!).then((r) => {
        const body = r.data as { session?: { messages?: Message[] } };
        return body.session?.messages ?? [];
      }),
    enabled: !!sessionId,
    // Sends write into this cache entry directly; a background refetch landing
    // afterwards would replace a just-answered transcript with a stale one.
    staleTime: Infinity,
  });

  const messages = transcriptQuery.data ?? [];

  const appendMessage = useCallback(
    (id: string | null, message: Message) => {
      queryClient.setQueryData<Message[]>(transcriptKey(id), (current) => [...(current ?? []), message]);
    },
    [queryClient],
  );

  /**
   * Sends one question, creating the session first if there is not one yet.
   *
   * Previously the composer was disabled until a session existed, and a session
   * was only created by "New Chat" — so arriving at /chat directly left the
   * input dead with nothing on screen explaining why.
   */
  const ask = useMutation({
    mutationFn: async (attempt: Attempt) => {
      let id = sessionId;

      if (!id) {
        const created = await chat.createSession(activeProfile!._id);
        const body = created.data as { session?: { _id: string }; _id?: string };
        id = body.session?._id ?? body._id ?? null;
        if (!id) throw new Error('The server did not return a conversation id.');

        // Move the question typed before the session existed onto its key.
        const drafted = queryClient.getQueryData<Message[]>(transcriptKey(null)) ?? [];
        queryClient.setQueryData<Message[]>(transcriptKey(id), drafted);
        queryClient.setQueryData<Message[]>(transcriptKey(null), []);
        setSessionId(id);
      }

      const res = await chat.sendMessage(id, attempt.content, language, attempt.retryKey);
      return { id, reply: res.data as { response: string; sources?: string[]; ragSources?: Message['ragSources'] } };
    },
    onSuccess: ({ id, reply }) => {
      appendMessage(id, {
        role: 'assistant',
        content: reply.response,
        sources: reply.sources,
        ragSources: reply.ragSources,
      });
      setFailedAttempt(null);
      // The server titles a conversation from its first question.
      queryClient.invalidateQueries({ queryKey: ['chatSessions', activeProfile?._id] });
    },
    onError: (_error, attempt) => {
      // Deliberately not appended to the transcript. A failure rendered as an
      // assistant message makes an outage look like an answer, and leaves a
      // sentence in the conversation history that VitalBot never said.
      setFailedAttempt(attempt);
    },
  });

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || ask.isPending || !activeProfile) return;
      setInput('');
      setFailedAttempt(null);
      appendMessage(sessionId, { role: 'user', content: trimmed });
      ask.mutate({ content: trimmed, retryKey: newIdempotencyKey() });
    },
    [ask, activeProfile, sessionId, appendMessage],
  );

  // A question carried in from a scan ("ask about this result") is sent once.
  useEffect(() => {
    if (contextParam && !hasUsedContext.current && activeProfile) {
      hasUsedContext.current = true;
      send(contextParam);
      setSearchParams({}, { replace: true });
    }
  }, [contextParam, activeProfile, send, setSearchParams]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, ask.isPending]);

  const handleNewChat = () => {
    setSessionId(null);
    setFailedAttempt(null);
    setInput('');
    queryClient.setQueryData<Message[]>(transcriptKey(null), []);
  };

  const sessions = sessionsQuery.data ?? [];
  const currentLang = languages.find((l) => l.code === language) ?? languages[0];
  const transcriptFailure =
    transcriptQuery.error && !isCancellation(transcriptQuery.error) ? transcriptQuery.error : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 pb-16 lg:pb-0">
      <div className="hidden md:block w-64 flex-shrink-0">
        <Card className="h-full">
          <CardContent className="p-4">
            <Button onClick={handleNewChat} className="w-full mb-4" size="sm">
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> New chat
            </Button>
            <ScrollArea className="h-[calc(100%-3rem)]">
              {sessionsQuery.error && !isCancellation(sessionsQuery.error) ? (
                <ErrorState
                  error={describeError(sessionsQuery.error)}
                  onRetry={() => sessionsQuery.refetch()}
                  retrying={sessionsQuery.isFetching}
                />
              ) : sessions.length === 0 && !sessionsQuery.isPending ? (
                <p className="text-xs text-text-muted px-1">
                  Your past conversations will appear here.
                </p>
              ) : (
                <div className="space-y-1">
                  {sessions.map((s) => (
                    <button
                      key={s._id}
                      onClick={() => {
                        setSessionId(s._id);
                        setFailedAttempt(null);
                      }}
                      aria-current={sessionId === s._id ? 'true' : undefined}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                        sessionId === s._id ? 'bg-primary/10 text-primary' : 'hover:bg-surface text-text-muted'
                      }`}
                    >
                      <MessageSquare className="h-3 w-3 inline mr-2" aria-hidden="true" />
                      {s.title || 'New conversation'}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-secondary" aria-hidden="true" />
              <span className="text-sm font-medium text-text-primary">VitalBot</span>
            </div>
            <div className="relative" ref={langMenuRef}>
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                aria-expanded={showLanguageMenu}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-text-muted hover:bg-surface transition-colors"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                {currentLang.label}
              </button>
              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl p-1 z-50 w-40"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        role="menuitemradio"
                        aria-checked={language === lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setShowLanguageMenu(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          language === lang.code
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-muted hover:bg-surface hover:text-text-primary'
                        }`}
                      >
                        <span>{lang.label}</span>
                        {language === lang.code && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {transcriptFailure ? (
              <ErrorState
                error={describeError(transcriptFailure)}
                onRetry={() => transcriptQuery.refetch()}
                retrying={transcriptQuery.isFetching}
              />
            ) : messages.length === 0 && !ask.isPending ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-primary/30 mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Ask VitalBot anything</h3>
                <p className="text-sm text-text-muted mb-6 max-w-md">
                  Your AI health assistant, personalized for {activeProfile?.name || 'you'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  {quickStarters.map((starter) => (
                    <Button
                      key={starter}
                      variant="outline"
                      className="text-left justify-start h-auto py-3 text-sm"
                      onClick={() => send(starter)}
                    >
                      {starter}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={`${i}-${msg.role}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === 'user' ? 'bg-primary/20' : 'bg-secondary/20'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <User className="h-4 w-4 text-primary" aria-hidden="true" />
                        ) : (
                          <Bot className="h-4 w-4 text-secondary" aria-hidden="true" />
                        )}
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-primary text-white rounded-tr-sm'
                            : 'bg-surface border border-border rounded-tl-sm'
                        }`}
                      >
                        <div className="text-sm prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <CitationsBar sources={msg.sources} ragSources={msg.ragSources} />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {ask.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface border border-border"
                  role="status"
                  aria-live="polite"
                >
                  <span className="sr-only">VitalBot is answering</span>
                  <div className="flex gap-1" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {failedAttempt && ask.error && (
            <div className="px-4 pt-3">
              <ErrorState
                error={describeError(ask.error)}
                onRetry={() => ask.mutate(failedAttempt)}
                retrying={ask.isPending}
              />
            </div>
          )}

          <div className="p-4 border-t border-border">
            <DisclaimerBanner />
          </div>

          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <label htmlFor="vitalbot-input" className="sr-only">
                Your question
              </label>
              <textarea
                id="vitalbot-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={language === 'english' ? 'Ask about your health…' : `Ask in ${currentLang.label}…`}
                className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl bg-surface border border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-primary/50"
                rows={1}
              />
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || ask.isPending}
                aria-label="Send question"
                className="h-11 w-11 p-0 rounded-xl"
              >
                {ask.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
