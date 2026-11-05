import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { localToday } from '../lib/dates';
import { parseIcs } from '../lib/ics';
import { useStore } from '../state/context';
import { FEED_REFRESH_MS, feedName, normalizeFeedUrl } from '../state/feeds';
import { createId } from '../state/ids';
import type { CalendarFeed } from '../state/types';
import { useSync } from './context';
import { FeedsContext, localFeedStatus, type FeedStatus, type FeedStatusStore, type FeedsValue } from './feedContext';

/** How often to look for calendar links that are due for a refresh while the app stays open. */
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Keeps calendar links up to date: each one is refreshed when the app opens, when you come back to
 * it, and every few hours, while you're signed in.
 */
export function FeedProvider({ statusStore = localFeedStatus, children }: { statusStore?: FeedStatusStore; children: ReactNode }) {
  const { data, dispatch } = useStore();
  const { fetchFeed } = useSync();
  const [status, setStatus] = useState<Record<string, FeedStatus>>(() => statusStore.load());
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());

  const feedsRef = useRef(data.feeds ?? []);
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    feedsRef.current = data.feeds ?? [];
    statusRef.current = status;
  });
  const inFlight = useRef(new Set<string>());

  const record = useCallback(
    (feedId: string, next: FeedStatus) => {
      setStatus((current) => {
        const updated = { ...current, [feedId]: next };
        statusStore.save(updated);
        return updated;
      });
    },
    [statusStore],
  );

  const refreshFeed = useCallback(
    async (feed: CalendarFeed) => {
      if (!fetchFeed || inFlight.current.has(feed.id)) return;
      inFlight.current.add(feed.id);
      setRefreshing(new Set(inFlight.current));
      try {
        const entries = parseIcs(await fetchFeed(feed.url));
        dispatch({ type: 'feed/apply', id: feed.id, entries, today: localToday(), at: new Date().toISOString() });
        record(feed.id, { at: Date.now() });
      } catch (e) {
        record(feed.id, { at: Date.now(), error: e instanceof Error ? e.message : "Couldn't refresh this calendar." });
      } finally {
        inFlight.current.delete(feed.id);
        setRefreshing(new Set(inFlight.current));
      }
    },
    [fetchFeed, dispatch, record],
  );

  const refreshDue = useCallback(() => {
    const now = Date.now();
    for (const feed of feedsRef.current) {
      const last = statusRef.current[feed.id]?.at ?? 0;
      if (now - last >= FEED_REFRESH_MS) void refreshFeed(feed);
    }
  }, [refreshFeed]);

  // Refresh links that are due on opening, when links change (such as from another device), when
  // coming back to the app, and now and then while it stays open.
  const feedIds = (data.feeds ?? []).map((f) => f.id).join(' ');
  useEffect(() => {
    if (!fetchFeed) return;
    const soon = window.setTimeout(refreshDue, 0);
    const timer = window.setInterval(refreshDue, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshDue();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(soon);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchFeed, refreshDue, feedIds]);

  const value = useMemo<FeedsValue>(
    () => ({
      available: fetchFeed !== null,
      status,
      refreshing,
      async add(input, estimateMinutes) {
        if (!fetchFeed) return 'Sign in to add calendar links.';
        const url = normalizeFeedUrl(input);
        if (!url) return 'Paste an https or webcal calendar link.';
        if (feedsRef.current.some((f) => f.url === url)) return "You've already added that calendar.";
        let text: string;
        try {
          text = await fetchFeed(url);
        } catch (e) {
          return e instanceof Error ? e.message : "Couldn't reach that calendar link.";
        }
        const entries = parseIcs(text);
        const feed: CalendarFeed = { id: createId(), url, name: feedName(url), estimateMinutes, addedAt: new Date().toISOString() };
        dispatch({ type: 'feed/add', feed });
        dispatch({ type: 'feed/apply', id: feed.id, entries, today: localToday(), at: new Date().toISOString() });
        record(feed.id, { at: Date.now() });
        return null;
      },
      refresh(feedId) {
        const feed = feedsRef.current.find((f) => f.id === feedId);
        if (feed) void refreshFeed(feed);
      },
    }),
    [fetchFeed, status, refreshing, dispatch, record, refreshFeed],
  );

  return <FeedsContext.Provider value={value}>{children}</FeedsContext.Provider>;
}
