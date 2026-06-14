import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, Trash2, MessageSquare, Bot, User, Loader2 } from 'lucide-react';
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
  'What foods should I avoid with my allergies?',
  'Recommend a workout plan for my fitness goal',
  'Help me plan meals for the week',
  'What supplements should I consider?',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export default function VitalBot() {
  const { activeProfile } = useProfileStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    },
  });

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (content: string) => chat.sendMessage(sessionId!, content),
    onSuccess: (res) => {
      const reply = res.data.message || res.data;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.content, sources: reply.sources },
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

  const sessions = sessionsData?.sessions || sessionsData || [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="hidden md:block w-64 flex-shrink-0">
        <Card className="h-full">
          <CardContent className="p-4">
            <Button onClick={() => createSession()} className="w-full mb-4" size="sm">
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
                            <CitationsBar sources={msg.sources} />
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
                placeholder="Ask about your health..."
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
