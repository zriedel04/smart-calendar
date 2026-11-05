import { createContext, useContext } from 'react';

/** How a calendar link's last refresh on this device went. */
export interface FeedStatus {
  /** When it was last fetched, as a timestamp. */
  at: number;
  error?: string;
}

export interface FeedsValue {
  /** False when calendar links can't be used here: no account service, or signed out. */
  available: boolean;
  status: Record<string, FeedStatus>;
  refreshing: ReadonlySet<string>;
  /** Fetches a link and, if it's a calendar, adds it. Resolves to an error message, or null once added. */
  add: (url: string, estimateMinutes: number) => Promise<string | null>;
  refresh: (feedId: string) => void;
  /** Hides or shows a course's entries from a link, right away if the link was fetched on this device. */
  setCourseHidden: (feedId: string, course: string, hidden: boolean) => void;
}

export const FeedsContext = createContext<FeedsValue>({
  available: false,
  status: {},
  refreshing: new Set(),
  add: async () => "Calendar links aren't available here.",
  refresh: () => {},
  setCourseHidden: () => {},
});

export const useFeeds = () => useContext(FeedsContext);

export interface FeedStatusStore {
  load(): Record<string, FeedStatus>;
  save(status: Record<string, FeedStatus>): void;
}

const STATUS_KEY = 'smart-calendar:feed-status';

/** When each link was last refreshed is kept per device, so refreshing doesn't make every device save. */
export const localFeedStatus: FeedStatusStore = {
  load() {
    try {
      const raw = globalThis.localStorage?.getItem(STATUS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, FeedStatus>) : {};
    } catch {
      return {};
    }
  },
  save(status) {
    try {
      globalThis.localStorage?.setItem(STATUS_KEY, JSON.stringify(status));
    } catch {
      // Without storage, links are refreshed again next time the app opens, which is harmless.
    }
  },
};
