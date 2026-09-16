import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Heart, Clock, TrendingUp, Send, Leaf, Utensils, Sparkles, ChefHat, ChevronDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { community, savedRecipes } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { Field, fieldAria } from '@/components/ui/field';
import { useToast } from '@/lib/toast';
import { rise, stagger, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { CanvasPanel } from '@/components/shared/CanvasPanel';

interface Post {
  _id: string;
  type: string;
  title: string;
  content: string;
  condition?: string;
  dietaryTags?: string[];
  likes: number;
  commentCount: number;
  isLiked: boolean;
  author: { name: string; avatar: string };
  status?: string;
  moderationNote?: string;
  createdAt: string;
}

interface SavedRecipe {
  _id: string;
  name: string;
  description?: string;
  ingredients?: string[];
  instructions?: string[];
  healthBenefits?: string;
  prepTime?: string;
  serves?: string;
}

/**
 * Every post is screened by the moderation model before it publishes, which is
 * the slow ("explained") band: the wait has to be named or it reads as a hang.
 */
const MODERATION_LABEL = 'Checking your post against the community guidelines…';

type PostType = 'nuskha' | 'recipe' | 'motivation';

/**
 * The three kinds of post, told apart by icon and word rather than by colour:
 * green, amber and red mean a verdict everywhere else in the product, and a
 * post type is not a finding about anyone's health.
 */
const typeConfig: Record<PostType, { icon: typeof Leaf; label: string; prompt: string }> = {
  nuskha: { icon: Leaf, label: 'Nuskha', prompt: 'The remedy, and how you make it' },
  recipe: { icon: Utensils, label: 'Recipe', prompt: 'What goes in, and what you do with it' },
  motivation: { icon: Sparkles, label: 'Something that helped', prompt: 'What changed, and what it took' },
};

const typeEntries = Object.entries(typeConfig) as [PostType, (typeof typeConfig)[PostType]][];

export default function CommunityPage() {
  const { activeProfile } = useProfileStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sort, setSort] = useState('recent');
  const [createForm, setCreateForm] = useState({
    type: 'nuskha' as PostType,
    title: '',
    content: '',
    condition: '',
    dietaryTags: [] as string[],
  });
  const [createFailure, setCreateFailure] = useState<unknown>(null);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const toast = useToast();

  const savedRecipesQuery = useQuery<{ recipes?: SavedRecipe[] }>({
    queryKey: ['savedRecipes', activeProfile?._id],
    queryFn: () => savedRecipes.getAll(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile && showRecipePicker,
  });

  const feedQuery = useQuery<{ posts?: Post[] }>({
    queryKey: ['communityFeed', sort],
    queryFn: () => community.getFeed({ sort }).then((r) => r.data),
  });

  const { mutate: createPost, isPending: creating } = useMutation({
    mutationFn: () =>
      community.createPost({
        profileId: activeProfile!._id,
        ...createForm,
      }),
    onMutate: () => {
      setCreateFailure(null);
    },
    onSuccess: (res) => {
      setShowCreateModal(false);
      setCreateForm({ type: 'nuskha', title: '', content: '', condition: '', dietaryTags: [] });
      setCreateFailure(null);
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      // The modal is already closed by this point, so a held post has to be
      // reported somewhere that outlives it — otherwise the post simply
      // vanishes from the feed with no explanation.
      if (res.data.post.status === 'pending_review') {
        toast.notify(
          'Your post is waiting on review',
          'A moderator checks posts like this one before they publish. It appears in the feed once it clears.',
        );
      } else {
        toast.notify('Your post is live', 'It is at the top of the recent feed.');
      }
    },
    onError: (err) => {
      setCreateFailure(err);
    },
  });

  const { mutate: toggleLike } = useMutation({
    mutationFn: (id: string) => community.toggleLike(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] }),
    onError: (err) => {
      toast.reportFailure(err, 'Your like was not saved. Tap the heart again to retry.');
    },
  });

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-8">
      {/* A dark block at the top: the feed below is a run of white cards, and
          without something to push against they read as gaps in the page. */}
      <CanvasPanel as="header" glow="right">
        <div className="max-w-reading">
          <h1 className="font-display text-display text-canvas-ink text-balance sm:text-display-lg">Community</h1>
          <p className="mt-3 text-body-lg text-canvas-muted">
            Remedies that worked, food worth cooking, and the small things that got someone through the week.
          </p>
          <Button variant="onDark" onClick={() => setShowCreateModal(true)} className="mt-6">
            <Plus className="h-4 w-4" aria-hidden="true" /> Share something
          </Button>
        </div>
      </CanvasPanel>

      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <Tabs value={sort} onValueChange={setSort}>
          <TabsList className="h-auto bg-sunk p-1">
            <TabsTrigger value="recent" className="min-h-[44px] gap-1.5 rounded px-4">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Recent
            </TabsTrigger>
            <TabsTrigger value="trending" className="min-h-[44px] gap-1.5 rounded px-4">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Trending
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <SectionBoundary
        query={feedQuery}
        band="inline"
        skeleton={
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5 pt-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="mb-2 h-4 w-48" />
                  <Skeleton className="mb-1 h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        }
        isEmpty={(d) => (d.posts ?? []).length === 0}
        empty={
          <EmptyState
            icon={Users}
            title="Nothing here yet"
            description="Be the first to put something up — a remedy from home, a recipe that works, or what got you through a hard week."
            actionLabel="Write the first post"
            onAction={() => setShowCreateModal(true)}
          />
        }
      >
        {(d) => (
          <motion.ul variants={stagger()} initial="hidden" animate="visible" className="space-y-4">
            <AnimatePresence>
              {(d.posts ?? []).map((post) => {
                const config = typeConfig[post.type as PostType] || typeConfig.nuskha;
                const Icon = config.icon;
                return (
                  <motion.li key={post._id} variants={rise} transition={transition(durations.enter)}>
                    <Card>
                      <CardContent className="p-5 pt-5 sm:p-6">
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sunk text-lg"
                          >
                            {post.author.avatar}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-heading text-ink">{post.author.name}</p>
                            <p className="text-caption text-ink-muted">{timeAgo(post.createdAt)}</p>
                          </div>
                          <Badge variant="outline" className="flex-shrink-0">
                            <Icon className="h-3 w-3" aria-hidden="true" /> {config.label}
                          </Badge>
                        </div>

                        <h2 className="text-heading text-ink break-words">{post.title}</h2>
                        <p className="mt-2 max-w-reading whitespace-pre-line text-body-lg text-ink break-words">
                          {post.content}
                        </p>

                        {(post.condition || (post.dietaryTags && post.dietaryTags.length > 0)) && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {post.condition && <Badge variant="neutral">For {post.condition}</Badge>}
                            {(post.dietaryTags ?? []).map((tag, j) => (
                              <Badge key={j} variant="neutral">{tag}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex items-center gap-4 border-t border-line pt-2">
                          <button
                            type="button"
                            onClick={() => toggleLike(post._id)}
                            aria-pressed={post.isLiked}
                            aria-label={
                              post.isLiked
                                ? `Unlike ${post.title}, ${post.likes} likes`
                                : `Like ${post.title}, ${post.likes} likes`
                            }
                            className={cn(
                              '-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-body transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                              post.isLiked ? 'text-ink' : 'text-ink-muted hover:text-ink',
                            )}
                          >
                            <Heart
                              className={cn('h-4 w-4', post.isLiked && 'fill-current')}
                              aria-hidden="true"
                            />
                            <span className="font-mono tabular-nums">{post.likes}</span>
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </SectionBoundary>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share something</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 block text-label text-ink">What kind of post is this</legend>
              <div className="flex flex-wrap gap-2">
                {typeEntries.map(([key, config]) => {
                  const Icon = config.icon;
                  const active = createForm.type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCreateForm((p) => ({ ...p, type: key }))}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 px-3.5 text-body transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                        active
                          ? 'border-primary bg-primary-soft text-primary-ink'
                          : 'border-ink/15 bg-surface text-ink-muted hover:border-ink/30',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {config.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {createForm.type === 'recipe' && (
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRecipePicker(!showRecipePicker)}
                  aria-expanded={showRecipePicker}
                  aria-controls="saved-recipe-picker"
                >
                  <ChefHat className="h-3.5 w-3.5" aria-hidden="true" />
                  {showRecipePicker ? 'Hide your saved recipes' : 'Use one you saved'}
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform duration-micro', showRecipePicker && 'rotate-180')}
                    aria-hidden="true"
                  />
                </Button>

                {showRecipePicker && (
                  <div
                    id="saved-recipe-picker"
                    className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-sunk p-2"
                  >
                    <SectionBoundary
                      query={savedRecipesQuery}
                      band="inline"
                      skeleton={
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-full rounded" />
                          ))}
                        </div>
                      }
                      isEmpty={(d) => (d.recipes ?? []).length === 0}
                      empty={
                        <p className="py-3 text-center text-caption text-ink-muted">
                          Nothing saved yet. Save a recipe from the pantry or dinner ideas first.
                        </p>
                      }
                    >
                      {(d) => (
                        <ul className="space-y-2">
                          {(d.recipes ?? []).map((recipe) => (
                            <li key={recipe._id}>
                              <button
                                type="button"
                                onClick={() => {
                                  const content = [
                                    recipe.description,
                                    '',
                                    'Ingredients:',
                                    ...(recipe.ingredients || []).map((ing: string) => `- ${ing}`),
                                    '',
                                    'Instructions:',
                                    ...(recipe.instructions || []).map((step: string, i: number) => `${i + 1}. ${step}`),
                                    '',
                                    recipe.healthBenefits ? `Health benefits: ${recipe.healthBenefits}` : '',
                                  ].filter(Boolean).join('\n');
                                  setCreateForm((p) => ({
                                    ...p,
                                    title: recipe.name,
                                    content,
                                  }));
                                  setCreateFailure(null);
                                  setShowRecipePicker(false);
                                }}
                                className="w-full min-h-[44px] rounded border-2 border-ink/10 bg-surface p-2.5 text-left transition-colors duration-micro ease-entrance hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                                <span className="block text-body text-ink break-words">{recipe.name}</span>
                                {recipe.prepTime && (
                                  <span className="mt-0.5 flex items-center gap-1 text-caption text-ink-muted">
                                    <Clock className="h-3 w-3" aria-hidden="true" />
                                    <span className="font-mono tabular-nums">{recipe.prepTime}</span>
                                    {recipe.serves ? ` · serves ${recipe.serves}` : ''}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </SectionBoundary>
                  </div>
                )}
              </div>
            )}

            <Field htmlFor="post-title" label="Title" required>
              <Input
                {...fieldAria('post-title', {})}
                value={createForm.title}
                onChange={(e) => {
                  setCreateForm((p) => ({ ...p, title: e.target.value }));
                  setCreateFailure(null);
                }}
                placeholder="What would you call this?"
              />
            </Field>

            <Field htmlFor="post-content" label="What you want to say" hint={typeConfig[createForm.type].prompt} required>
              <Textarea
                {...fieldAria('post-content', { hint: typeConfig[createForm.type].prompt })}
                value={createForm.content}
                onChange={(e) => {
                  setCreateForm((p) => ({ ...p, content: e.target.value }));
                  setCreateFailure(null);
                }}
                placeholder={
                  createForm.type === 'nuskha'
                    ? 'The remedy, how you make it, and when you use it…'
                    : createForm.type === 'recipe'
                    ? 'What goes in it, and how you put it together…'
                    : 'What helped, and what it took…'
                }
                className="min-h-[8rem]"
              />
            </Field>

            {createForm.type === 'nuskha' && (
              <Field htmlFor="post-condition" label="What it helps with" hint="A cold, a cough, digestion — whatever it's for.">
                <Input
                  {...fieldAria('post-condition', { hint: "A cold, a cough, digestion — whatever it's for." })}
                  value={createForm.condition}
                  onChange={(e) => setCreateForm((p) => ({ ...p, condition: e.target.value }))}
                  placeholder="Cough"
                />
              </Field>
            )}

            <SectionBoundary
              query={{
                // The submit control is gated on a mutation rather than a
                // query, so it is adapted to the boundary's shape: a failure
                // renders next to the control and its retry re-posts.
                data: creating ? undefined : true,
                isPending: creating,
                isFetching: creating,
                error: createFailure,
                refetch: () => createPost(),
              }}
              band="explained"
              loadingLabel={MODERATION_LABEL}
            >
              {() => (
                <Button
                  onClick={() => createPost()}
                  disabled={!createForm.title || !createForm.content || creating}
                  size="lg"
                  className="w-full"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Put it up
                </Button>
              )}
            </SectionBoundary>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
