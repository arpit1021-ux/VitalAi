import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, MessageSquare, Bot, User, Loader2, Globe } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { useProfileStore } from '@/stores/profileStore';
import { chat } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';

const quickStarters = [
  'Is this breakfast healthy for me?',
  'Can I take ibuprofen with my current meds?',
  'Best foods for my condition',
  'Home remedy for bloating',
];

const languages = [
  { code: 'english', label: 'English', flag: '🇬🇧' },
  { code: 'hindi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tamil', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'bengali', label: 'বাংলা', flag: '🇮🇳' },
  { code: 'telugu', label: 'తెలుగు', flag: '🇮🇳' },
  { code: 'marathi', label: 'मराठी', flag: '🇮🇳' },
  { code: 'kannada', label: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  ragSources?: { source: string; topic?: string }[] | null;
}

export default function VitalBot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contextParam = searchParams.get('context');
  const { activeProfile } = useProfileStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(contextParam || '');
  const [language, setLanguage] = useState('english');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasUsedContext = useRef(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contextParam && !hasUsedContext.current && activeProfile) {
      hasUsedContext.current = true;
      createSession();
      setSearchParams({}, { replace: true });
    }
  }, [contextParam, activeProfile]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: sessionsData } = useQuery({
    queryKey: ['chatSessions', activeProfile?._id],
    queryFn: () => chat.getSessions(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { mutate: createSession } = useMutation({
    mutationFn: () => chat.createSession(activeProfile!._id),
    onSuccess: (res) => {
      const newId = res.data.session?._id || res.data._id;
      setSessionId(newId);
      setMessages([]);
      if (contextParam && !hasUsedContext.current) {
        hasUsedContext.current = true;
        setTimeout(() => {
          setMessages([{ role: 'user', content: contextParam }]);
          chat.sendMessage(newId, contextParam, language).then((r) => {
            const reply = r.data;
            setMessages([
              { role: 'user', content: contextParam },
              { role: 'assistant', content: reply.response, sources: reply.sources, ragSources: reply.ragSources },
            ]);
          });
          setInput('');
        }, 100);
      }
    },
  });

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (content: string) => chat.sendMessage(sessionId!, content, language),
    onSuccess: (res) => {
      const reply = res.data;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.response, sources: reply.sources, ragSources: reply.ragSources },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isPending) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    sendMessage(userMsg);
  };

  const handleQuickStart = (prompt: string) => {
    setInput('');
    if (!sessionId) {
      createSession();
    }
    setMessages([{ role: 'user', content: prompt }]);
    if (sessionId) sendMessage(prompt);
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setInput('');
  };

  const sessions = sessionsData?.sessions || sessionsData || [];
  const currentLang = languages.find((l) => l.code === language) || languages[0];

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] gap-4 pb-16 lg:pb-0">
      <div className="hidden md:block w-64 flex-shrink-0">
        <Card className="h-full">
          <CardContent className="p-4">
            <Button onClick={handleNewChat} className="w-full mb-4" size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Chat
            </Button>
            <ScrollArea className="h-[calc(100%-3rem)]">
              <div className="space-y-1">
                {Array.isArray(sessions) && sessions.map((s: any) => (
                  <button
                    key={s._id}
                    onClick={() => {
                      setSessionId(s._id);
                      setMessages(s.messages || []);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      sessionId === s._id ? 'bg-primary/10 text-primary' : 'hover:bg-surface text-text-muted'
                    }`}
                  >
                    <MessageSquare className="h-3 w-3 inline mr-2" />
                    {s.title || 'New conversation'}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-secondary" />
              <span className="text-sm font-medium text-text-primary">VitalBot</span>
            </div>
            <div className="relative" ref={langMenuRef}>
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-text-muted hover:bg-surface transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                {currentLang.flag} {currentLang.label}
              </button>
              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl p-1 z-50 w-40"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setShowLanguageMenu(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          language === lang.code
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-muted hover:bg-surface hover:text-text-primary'
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isPending ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-primary/30 mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Ask VitalBot Anything</h3>
                <p className="text-sm text-text-muted mb-6 max-w-md">
                  Your AI health assistant, personalized for {activeProfile?.name || 'you'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  {quickStarters.map((starter, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="text-left justify-start h-auto py-3 text-sm"
                      onClick={() => handleQuickStart(starter)}
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
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-primary/20' : 'bg-secondary/20'
                      }`}>
                        {msg.role === 'user' ? (
                          <User className="h-4 w-4 text-primary" />
                        ) : (
                          <Bot className="h-4 w-4 text-secondary" />
                        )}
                      </div>
                      <div className={`rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-surface border border-border rounded-tl-sm'
                      }`}>
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
            {isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface border border-border">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <div className="p-4 border-t border-border">
            <DisclaimerBanner />
          </div>

          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={language === 'english' ? 'Ask about your health...' : `Ask in ${currentLang.label}...`}
                className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl bg-surface border border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-primary/50"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isPending || !sessionId}
                className="h-11 w-11 p-0 rounded-xl"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
