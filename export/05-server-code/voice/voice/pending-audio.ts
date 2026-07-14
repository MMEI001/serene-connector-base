// Mini IndexedDB-helper om audio-blobs te bewaren bij een mislukte transcriptie,
// zodat de gebruiker kan retryen zonder opnieuw te praten.

const DB_NAME = "hoofdrust-voice";
const STORE = "pending_audio";
const VERSION = 1;

export type PendingAudio = {
  id: string;
  user_id: string | null;
  blob: Blob;
  mime_type: string;
  created_at: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingAudio(
  entry: Omit<PendingAudio, "id" | "created_at"> & { id?: string },
): Promise<PendingAudio> {
  const db = await openDb();
  const record: PendingAudio = {
    id: entry.id ?? crypto.randomUUID(),
    user_id: entry.user_id,
    blob: entry.blob,
    mime_type: entry.mime_type,
    created_at: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function deletePendingAudio(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
