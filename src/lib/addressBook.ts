export type AddressBookEntry = {
  address: string;
  lastUsedAt: number;
  label?: string;
};

const KEY = "escrowx-address-book-v1";
const MAX_ENTRIES = 20;

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function ensureBrowser() {
  if (typeof window === "undefined") throw new Error("AddressBook is only available in the browser");
}

export function loadAddressBook(): AddressBookEntry[] {
  ensureBrowser();
  const parsed = safeParse<AddressBookEntry[]>(window.localStorage.getItem(KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((e) => e && typeof e.address === "string" && typeof e.lastUsedAt === "number")
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_ENTRIES);
}

export function upsertAddressBookEntry(entry: { address: string; label?: string }) {
  ensureBrowser();
  const current = loadAddressBook();
  const normalized = entry.address.trim();
  const now = Date.now();

  const next: AddressBookEntry[] = [
    { address: normalized, label: entry.label?.trim() || undefined, lastUsedAt: now },
    ...current.filter((e) => e.address.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, MAX_ENTRIES);

  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

