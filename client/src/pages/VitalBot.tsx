import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, MessageSquare, Loader2, Globe, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useProfileStore } from '@/stores/profileStore';
import { chat, newIdempotencyKey } from '@/lib/api';
import { describeError, isCancellation } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionIntro, hasSeenIntro } from '@/components/shared/SectionIntro';
import { transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

const quickStarters = [
  'Is this breakfast a good idea for me?',
  'Can I take ibuprofen with my medicines?',
  'What should I be eating more of?',
  'Something for bloating I can do at home',
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

/**
 * Light-theme typography for an answer.
 *
 * The old `prose prose-invert` pair did nothing at all — the typography plugin
 * is not installed, so every reply rendered as unstyled browser defaults, with
 * a markdown `#` heading arriving at 2em in Times. These are the house styles
 * instead: Karla throughout, one heading size because an answer is not a
 * document, and paragraphs at reading size.
 */
const markdownComponents: Components = {
  p: ({ children }) => <p className="mt-4 first:mt-0 text-body-lg text-ink break-words">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 first:mt-0 list-disc space-y-1.5 pl-5 marker:text-ink-faint">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 first:mt-0 list-decimal space-y-1.5 pl-5 marker:text-ink-faint">{children}</ol>
  ),
  li: ({ children }) => <li className="text-body-lg text-ink break-words">{children}</li>,
  // Every markdown heading level lands on the same, modest size: a reply is a
  // few paragraphs, and an h1 inside one would outrank the page itself.
  h1: ({ children }) => <h3 className="mt-6 first:mt-0 text-heading text-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-6 first:mt-0 text-heading text-ink">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-6 first:mt-0 text-heading text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 first:mt-0 text-label text-ink">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-4 hover:text-primary-hover break-words"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-line pl-4 text-body-lg text-ink-muted">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-sunk px-1 py-0.5 font-mono text-figure text-ink">{children}</code>
  ),
  pre: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <pre className="rounded-md bg-sunk p-3 font-mono text-figure text-ink [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    </div>
  ),
  hr: () => <hr className="my-6 border-line" />,
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-body text-ink">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line-strong px-2 py-1.5 text-left text-label">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>,
};

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

  // A question carried in from a scan skips the welcome: the person already
  // asked something, and an introduction in front of their own question is a
  // door held shut.
  const [showIntro, setShowIntro] = useState(() => !contextParam && !hasSeenIntro('vitalbot'));
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
  const who = activeProfile?.name;

  if (showIntro) {
    return (
      <SectionIntro
        id="vitalbot"
        title="Ask, in your own words"
        body="Ask about a food, a medicine, or something you half-remember reading somewhere. VitalBot already knows who you're asking for, so you never have to explain that twice — and it tells you where each answer came from, and when a question belongs with your doctor."
        actionLabel="Ask something"
        onStart={() => setShowIntro(false)}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[30rem] gap-6 lg:gap-8">
      {/* A rail, not a card: the transcript is the screen, and a second bordered
          box beside it only narrows the column people are reading. */}
      <div className="hidden w-52 flex-shrink-0 flex-col border-r border-line pr-4 md:flex lg:w-60">
        <Button onClick={handleNewChat} variant="secondary" size="sm" className="w-full">
          <Plus className="h-4 w-4" aria-hidden="true" /> New chat
        </Button>

        <p className="mt-6 text-label text-ink-muted">Earlier</p>

        <ScrollArea className="mt-2 min-h-0 flex-1">
          {sessionsQuery.error && !isCancellation(sessionsQuery.error) ? (
            <ErrorState
              error={describeError(sessionsQuery.error)}
              onRetry={() => sessionsQuery.refetch()}
              retrying={sessionsQuery.isFetching}
            />
          ) : sessions.length === 0 && !sessionsQuery.isPending ? (
            <p className="text-caption text-ink-muted">Nothing here yet. What you ask will be kept here.</p>
          ) : (
            <ul className="space-y-0.5 pr-2">
              {sessions.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionId(s._id);
                      setFailedAttempt(null);
                    }}
                    aria-current={sessionId === s._id ? 'true' : undefined}
                    className={cn(
                      'flex w-full min-h-[44px] items-center gap-2 rounded px-2 text-left text-body transition-colors duration-micro ease-entrance',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                      sessionId === s._id ? 'bg-sunk text-ink' : 'text-ink-muted hover:bg-sunk hover:text-ink',
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{s.title || 'New conversation'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div className="min-w-0">
            <h1 className="font-display text-title text-ink">VitalBot</h1>
            <p className="text-caption text-ink-muted truncate">
              {who ? `Answering for ${who}` : 'Answering for you'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {/* The rail is hidden on a phone, and with it the only way to start
                a fresh conversation. */}
            <Button onClick={handleNewChat} variant="ghost" size="sm" className="md:hidden">
              <Plus className="h-4 w-4" aria-hidden="true" /> New
            </Button>

            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                aria-expanded={showLanguageMenu}
                aria-haspopup="menu"
                aria-label={`Answer language: ${currentLang.label}`}
                className="flex min-h-[44px] items-center gap-1.5 rounded px-2 text-label text-ink-muted transition-colors duration-micro ease-entrance hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                {currentLang.label}
              </button>

              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={transition(durations.micro)}
                    className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-overlay"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        role="menuitemradio"
                        aria-checked={language === lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setShowLanguageMenu(false);
                        }}
                        className={cn(
                          'flex w-full min-h-[44px] items-center justify-between gap-2 rounded px-3 text-body transition-colors duration-micro ease-entrance',
                          language === lang.code ? 'bg-sunk text-ink' : 'text-ink-muted hover:bg-sunk hover:text-ink',
                        )}
                      >
                        <span>{lang.label}</span>
                        {language === lang.code && <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto py-6">
          <div className="mx-auto max-w-reading space-y-8">
            {transcriptFailure ? (
              <ErrorState
                error={describeError(transcriptFailure)}
                onRetry={() => transcriptQuery.refetch()}
                retrying={transcriptQuery.isFetching}
              />
            ) : messages.length === 0 && !ask.isPending ? (
              <div className="py-6">
                <h2 className="font-display text-title text-ink text-balance">What's on your mind?</h2>
                <p className="mt-3 text-body-lg text-ink-muted">
                  {who
                    ? `Ask anything about food, medicines or how ${who} is feeling. Their profile is already in the room.`
                    : 'Ask anything about food, medicines or how you are feeling.'}
                </p>
                <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quickStarters.map((starter) => (
                    <li key={starter}>
                      <Button
                        variant="secondary"
                        className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                        onClick={() => send(starter)}
                      >
                        {starter}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg, i) =>
                  msg.role === 'user' ? (
                    <motion.div
                      key={`${i}-user`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition(durations.enter)}
                      className="flex justify-end"
                    >
                      <div className="max-w-[85%] rounded-md bg-sunk px-4 py-3">
                        <p className="text-body text-ink whitespace-pre-wrap break-words">
                          <span className="sr-only">You asked: </span>
                          {msg.content}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.article
                      key={`${i}-assistant`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition(durations.enter)}
                      aria-label="Answer from VitalBot"
                    >
                      <p className="text-label text-ink-muted">VitalBot</p>
                      <div className="mt-2">
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <CitationsBar sources={msg.sources} ragSources={msg.ragSources} />
                      )}
                    </motion.article>
                  ),
                )}
              </AnimatePresence>
            )}

            {ask.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition(durations.enter)}
                role="status"
                aria-live="polite"
                className="flex items-center gap-2"
              >
                <span className="sr-only">VitalBot is writing an answer</span>
                <div className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-caption text-ink-muted">Thinking it through…</span>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* The failure sits directly above the composer, next to the question it
            belongs to, so retrying does not mean scrolling to find it. */}
        {failedAttempt && ask.error && (
          <div className="mx-auto w-full max-w-reading pb-3">
            <ErrorState error={describeError(ask.error)} onRetry={() => ask.mutate(failedAttempt)} retrying={ask.isPending} />
          </div>
        )}

        <div className="mx-auto w-full max-w-reading border-t border-line pt-4">
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
              placeholder={
                language === 'english' ? 'Ask about a food, a medicine, a symptom…' : `Ask in ${currentLang.label}…`
              }
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded border border-line-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              rows={1}
            />
            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || ask.isPending}
              aria-label="Send question"
              size="icon"
              className="flex-shrink-0"
            >
              {ask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="mt-4">
            <DisclaimerBanner />
          </div>
        </div>
      </div>
    </div>
  );
}
