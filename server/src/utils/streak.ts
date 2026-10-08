/**
 * Streak arithmetic over `YYYY-MM-DD` calendar days.
 *
 * Every date in the database is a plain calendar day anchored at midnight UTC,
 * so every step through those days has to be UTC too. The four copies of this
 * loop that existed before all used `setDate`/`getDate`, which are *local*
 * time: correct in UTC and in zones without daylight saving, and silently off
 * by a day across a DST transition — which shows up as a streak that resets
 * itself twice a year. Having one implementation is half the point; the other
 * half is that a fix here cannot now be applied to three places out of four.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today as `YYYY-MM-DD`, in UTC, matching how logs are keyed. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Turns a `YYYY-MM-DD` key into the instant of that day's UTC midnight. */
export function dayStart(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** The calendar day `offset` days from `key`, negative for earlier days. */
export function shiftDay(key: string, offset: number): string {
  return new Date(dayStart(key).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days between two calendar keys; positive when `from` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(from).getTime() - dayStart(to).getTime()) / DAY_MS);
}

/**
 * Counts consecutive qualifying days ending today.
 *
 * `days` must be newest-first, which is how every caller queries it. A gap
 * ends the streak: a day that qualified a week ago does not extend one that
 * broke yesterday.
 */
export function currentStreak(days: string[], today: string = todayKey()): number {
  let streak = 0;
  let expected = today;

  for (const day of days) {
    if (day !== expected) break;
    streak += 1;
    expected = shiftDay(expected, -1);
  }

  return streak;
}

/** The longest run of consecutive days in a newest-first list. */
export function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;

  let longest = 1;
  let run = 1;

  for (let index = 1; index < days.length; index += 1) {
    if (daysBetween(days[index - 1], days[index]) === 1) {
      run += 1;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }

  return Math.max(longest, run);
}

/** Monday of the week containing a calendar day, as `YYYY-MM-DD`. */
export function weekStart(key: string): string {
  const date = dayStart(key);
  const weekday = date.getUTCDay();
  // getUTCDay puts Sunday at 0; the week here starts on Monday.
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return shiftDay(key, offset);
}
