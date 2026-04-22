/**
 * Persist chat composer drafts across page refreshes.
 *
 *   - Text + selected elements go to localStorage (tiny, synchronous).
 *   - File attachments go to IndexedDB (Blob-capable).
 *
 * Each chat has its own entry keyed by chat id.
 */

import type { ChatElementSelection } from "../store/chatStore";

const TEXT_STORAGE_PREFIX = "lilo:composer-draft:";
const IDB_NAME = "lilo-composer-drafts";
const IDB_STORE = "files";
const IDB_VERSION = 1;

export interface PersistedComposerDraft {
  text: string;
  selectedElements: ChatElementSelection[];
}

// ---------- Text + elements (localStorage) ----------

export const saveComposerDraft = (
  chatId: string,
  draft: PersistedComposerDraft,
): void => {
  if (typeof window === "undefined") return;
  try {
    const isEmpty = !draft.text && draft.selectedElements.length === 0;
    if (isEmpty) {
      window.localStorage.removeItem(TEXT_STORAGE_PREFIX + chatId);
      return;
    }
    window.localStorage.setItem(
      TEXT_STORAGE_PREFIX + chatId,
      JSON.stringify(draft),
    );
  } catch {
    /* ignore quota / serialization errors */
  }
};

export const loadComposerDraft = (chatId: string): PersistedComposerDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEXT_STORAGE_PREFIX + chatId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedComposerDraft;
    if (typeof parsed.text !== "string") return null;
    if (!Array.isArray(parsed.selectedElements)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearComposerDraft = (chatId: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TEXT_STORAGE_PREFIX + chatId);
  } catch {
    /* ignore */
  }
};

// ---------- Files (IndexedDB) ----------

const openDb = (): Promise<IDBDatabase | null> => {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    const tx = db.transaction(IDB_STORE, mode);
    const store = tx.objectStore(IDB_STORE);
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    tx.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
};

export const saveComposerFiles = async (
  chatId: string,
  files: File[],
): Promise<void> => {
  if (files.length === 0) {
    await withStore("readwrite", (store) => store.delete(chatId));
    return;
  }
  // Persist lightweight metadata alongside the File objects so we can
  // rehydrate with the original name / type / lastModified.
  const entries = files.map((file) => ({
    blob: file,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
  }));
  await withStore("readwrite", (store) => store.put(entries, chatId));
};

export const loadComposerFiles = async (chatId: string): Promise<File[]> => {
  const result = await withStore<unknown>("readonly", (store) => store.get(chatId));
  if (!Array.isArray(result)) return [];
  const files: File[] = [];
  for (const entry of result) {
    if (
      entry &&
      typeof entry === "object" &&
      "blob" in entry &&
      entry.blob instanceof Blob
    ) {
      const meta = entry as {
        blob: Blob;
        name?: string;
        type?: string;
        lastModified?: number;
      };
      files.push(
        new File([meta.blob], meta.name ?? "attachment", {
          type: meta.type ?? meta.blob.type,
          lastModified: meta.lastModified ?? Date.now(),
        }),
      );
    }
  }
  return files;
};

export const clearComposerFiles = async (chatId: string): Promise<void> => {
  await withStore("readwrite", (store) => store.delete(chatId));
};

export const clearAllComposerPersistence = async (
  chatId: string,
): Promise<void> => {
  clearComposerDraft(chatId);
  await clearComposerFiles(chatId);
};
