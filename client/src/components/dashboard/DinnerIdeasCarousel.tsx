import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, ArrowRight, RotateCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardExtended } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, isCancellation } from '@/lib/errors';
import { step, transition, durations } from '@/lib/motion';

interface Recipe {
  name: string;
  description: string;
  emoji: string;
  prepTime: string;
}

interface DinnerIdeasCarouselProps {
  profileId: string;
}

/**
 * A white card that sits on the dark hero panel. It is deliberately the
 * brightest object on the screen — `shadow-lift` rather than `shadow-card`,
 * because on canvas a card needs to look lifted off the panel, not printed
 * onto it.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl bg-surface shadow-lift p-5 sm:p-6">{children}</section>;
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <ChefHat className="h-4 w-4 text-accent" aria-hidden="true" />
      <h3 className="text-label text-ink-faint">Dinner ideas</h3>
    </div>
  );
}

function EmptyState() {
  return (
    <Shell>
      <Heading />
      <p className="mt-3 font-display text-title text-ink">Nothing here yet.</p>
      <p className="mt-2 text-body text-ink-muted">
        Sign in and we&apos;ll suggest dinners that suit how you eat.
      </p>
    </Shell>
  );
}

function SkeletonLoader() {
  return (
    <Shell>
      <Skeleton className="h-4 w-28 rounded" />
      <Skeleton className="h-10 w-10 rounded-md mt-4" />
      <Skeleton className="h-7 w-44 rounded mt-3" />
      <Skeleton className="h-4 w-full rounded mt-3" />
      <Skeleton className="h-4 w-24 rounded mt-2" />
      <Skeleton className="h-12 w-full rounded-md mt-5" />
    </Shell>
  );
}

export default function DinnerIdeasCarousel({ profileId }: DinnerIdeasCarouselProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const hasFetchedRef = useRef(false);

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['recipes', profileId],
    queryFn: () => dashboardExtended.getRecipes(profileId).then((r) => r.data),
    enabled: !!profileId,
  });

  useEffect(() => {
    if (data?.recipes?.length) {
      setAllRecipes(data.recipes);
      hasFetchedRef.current = false;
    }
  }, [data]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !profileId) return;
    setLoadMoreFailed(false);
    setIsFetchingMore(true);
    try {
      const excludeNames = allRecipes.map((r) => r.name);
      const res = await dashboardExtended.getMoreRecipes(profileId, excludeNames);
      const newRecipes = res.data?.recipes || [];
      if (newRecipes.length > 0) {
        setAllRecipes((prev) => [...prev, ...newRecipes]);
      }
    } catch {
      // Silently swallowing this left the carousel simply not advancing, with
      // no indication that anything had gone wrong. The existing ideas stay on
      // screen; only the attempt to fetch more is reported.
      setLoadMoreFailed(true);
    } finally {
      setIsFetchingMore(false);
    }
  }, [profileId, allRecipes, isFetchingMore]);

  useEffect(() => {
    if (allRecipes.length > 0 && currentIndex >= allRecipes.length - 3 && !isFetchingMore && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchMore();
    }
  }, [currentIndex, allRecipes.length, isFetchingMore, fetchMore]);

  const recipes = allRecipes.length > 0 ? allRecipes : [];

  if (isLoading) {
    return <SkeletonLoader />;
  }

  // Without this the carousel showed an empty state when the request had in
  // fact failed — an outage rendered as an empty result, which is the one
  // thing an empty state must never mean.
  if (error && !isCancellation(error) && recipes.length === 0) {
    return (
      <Shell>
        <Heading />
        <div className="mt-4">
          <ErrorState error={describeError(error)} onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </Shell>
    );
  }

  if (recipes.length === 0) {
    return <EmptyState />;
  }

  const currentRecipe = recipes[currentIndex % recipes.length];
  const remaining = Math.max(recipes.length - currentIndex - 1, 0);

  const handleSkip = () => {
    setDirection(1);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleCookThis = () => {
    navigate('/recipe-detail', {
      state: {
        name: currentRecipe.name,
        description: currentRecipe.description,
        emoji: currentRecipe.emoji,
        prepTime: currentRecipe.prepTime,
      },
    });
  };

  const visibleDots = Math.min(recipes.length, 7);
  const dotStart = Math.max(0, currentIndex - Math.floor(visibleDots / 2));
  const dotEnd = Math.min(recipes.length, dotStart + visibleDots);

  return (
    <Shell>
      <Heading />

      <div className="relative overflow-hidden min-h-[212px] mt-4" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            variants={step(direction)}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition(durations.enter)}
          >
            {/* The recipe's own emoji is content the model chose for this dish,
                not an icon standing in for a control. */}
            <span
              className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-soft text-2xl leading-none"
              role="img"
              aria-label={currentRecipe.name}
            >
              {currentRecipe.emoji}
            </span>
            <p className="font-display text-title text-ink mt-3 break-words">{currentRecipe.name}</p>
            <p className="text-body text-ink-muted mt-2 max-w-reading break-words">{currentRecipe.description}</p>
            <p className="mt-3 inline-flex items-center rounded-full bg-sunk px-3 py-1 text-label text-ink-muted">
              <span className="tabular">{currentRecipe.prepTime}</span>&nbsp;to make
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Stacked, never side by side. This card lives in a narrow rail at every
          width, and two labelled buttons on one row truncated the primary
          action to "Let's c…" — a button whose own label is cut off. */}
      <div className="mt-5 flex flex-col gap-2">
        <Button size="md" onClick={handleCookThis} className="w-full">
          Let&apos;s cook this
          <ArrowRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        </Button>
        <Button
          size="md"
          variant="secondary"
          onClick={handleSkip}
          aria-label="Show me a different dinner idea"
          className="w-full"
        >
          <RotateCw className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Something else
        </Button>
      </div>

      <div className="flex gap-1.5 mt-5" role="group" aria-label="Dinner ideas">
        {recipes.slice(dotStart, dotEnd).map((recipe: Recipe, i: number) => {
          const actualIndex = dotStart + i;
          const isCurrent = actualIndex === currentIndex;
          return (
            <button
              key={actualIndex}
              type="button"
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => {
                setDirection(actualIndex > currentIndex ? 1 : -1);
                setCurrentIndex(actualIndex);
              }}
              // The dot is 2px tall but the target around it is not: the
              // padding gives a thumb something to land on.
              className="py-2 -my-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={recipe.name}
            >
              <span
                className={`block h-2 rounded-full transition-all duration-micro ease-entrance ${
                  isCurrent ? 'w-6 bg-primary' : 'w-2 bg-line-strong/60'
                }`}
              />
            </button>
          );
        })}
      </div>

      {remaining > 0 && (
        <p className="text-caption text-ink-faint mt-3">
          <span className="tabular">{remaining}</span> more to look at.
        </p>
      )}
      {isFetchingMore && (
        <p className="text-caption text-ink-faint mt-1" role="status">
          Looking for more…
        </p>
      )}
      {loadMoreFailed && !isFetchingMore && (
        <p role="status" className="text-caption text-ink-muted mt-1">
          Couldn&apos;t find more just now.{' '}
          <button
            type="button"
            onClick={() => fetchMore()}
            className="underline underline-offset-2 hover:text-ink rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Try again
          </button>
        </p>
      )}
    </Shell>
  );
}
