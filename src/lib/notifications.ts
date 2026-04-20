import type { EscrowActivity, NotificationItem } from "@/types";

const NOTIFICATIONS_KEY = "escrowx-notifications-v1";
const SEEN_ACTIVITY_KEY = "escrowx-seen-activity-v1";

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Notifications are only available in the browser");
  }
}

export function loadNotifications(): NotificationItem[] {
  ensureBrowser();
  const parsed = safeJsonParse<NotificationItem[]>(window.localStorage.getItem(NOTIFICATIONS_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((n) => n && typeof n.id === "string")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function saveNotifications(items: NotificationItem[]) {
  ensureBrowser();
  window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, 200)));
}

export function markAllNotificationsRead() {
  const current = loadNotifications();
  const next = current.map((n) => ({ ...n, read: true }));
  saveNotifications(next);
  return next;
}

export function clearNotifications() {
  ensureBrowser();
  window.localStorage.removeItem(NOTIFICATIONS_KEY);
  window.localStorage.removeItem(SEEN_ACTIVITY_KEY);
}

function loadSeenActivity(): Record<string, true> {
  ensureBrowser();
  const parsed = safeJsonParse<Record<string, true>>(window.localStorage.getItem(SEEN_ACTIVITY_KEY));
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

function saveSeenActivity(seen: Record<string, true>) {
  ensureBrowser();
  window.localStorage.setItem(SEEN_ACTIVITY_KEY, JSON.stringify(seen));
}

function activityKey(a: EscrowActivity): string {
  return `${a.txHash}:${a.type}:${a.escrowId.toString()}`;
}

export function addNotificationsFromActivities(activities: EscrowActivity[]) {
  ensureBrowser();
  if (!activities.length) return loadNotifications();

  const seen = loadSeenActivity();
  const existing = loadNotifications();
  const existingIds = new Set(existing.map((n) => n.id));

  const next = [...existing];
  let newCount = 0;

  for (const a of activities) {
    const key = activityKey(a);
    if (seen[key]) continue;

    // Avoid duplicates if a previous run wrote it but "seen" didn't persist (rare).
    if (existingIds.has(key)) {
      seen[key] = true;
      continue;
    }

    const title =
      a.type === "CREATED"
        ? `New escrow created (#${a.escrowId.toString()})`
        : a.type === "RELEASED"
          ? `Payment released (#${a.escrowId.toString()})`
          : `Escrow refunded (#${a.escrowId.toString()})`;

    const message =
      a.type === "CREATED"
        ? `Buyer ${a.actor} created an escrow for ${a.counterparty}.`
        : a.type === "RELEASED"
          ? `Funds released to ${a.counterparty}.`
          : `Funds refunded to buyer.`;

    const item: NotificationItem = {
      id: key,
      title,
      message,
      escrowId: a.escrowId.toString(),
      txHash: a.txHash,
      createdAt: a.timestamp * 1000,
      read: false,
    };

    next.push(item);
    seen[key] = true;
    newCount += 1;
  }

  if (newCount > 0) {
    saveNotifications(next);
    saveSeenActivity(seen);
  }

  return next.sort((a, b) => b.createdAt - a.createdAt);
}

export function getUnreadCount(items?: NotificationItem[]) {
  const list = items ?? loadNotifications();
  return list.filter((n) => !n.read).length;
}

