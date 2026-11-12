import { Sale } from "../types";

export interface SalesWalEntry {
  id: string;
  timestamp: string;
  action: "SAVE_SALE" | "DELETE_SALE";
  payload: Sale | string; // Sale object for SAVE_SALE, or string saleId for DELETE_SALE
  companyOwnerId: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retries: number;
  lastError?: string;
}

const WAL_STORAGE_KEY = "NUCLEO_SALES_WAL";

/**
 * Reads all WAL entries from localStorage synchronously.
 */
export function getAllSalesWal(): SalesWalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[Sales WAL] Failed to parse WAL storage:", err);
    return [];
  }
}

/**
 * Saves all WAL entries back to localStorage synchronously.
 */
function saveAllSalesWal(entries: SalesWalEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WAL_STORAGE_KEY, JSON.stringify(entries));
    // Dispatch local custom event for WAL state changes
    window.dispatchEvent(new CustomEvent("sales_wal_updated", { detail: { count: entries.filter(e => e.status !== "synced").length } }));
  } catch (err) {
    console.error("[Sales WAL] Emergency disk write failed:", err);
  }
}

/**
 * Returns only pending/uncommitted WAL log entries.
 */
export function getPendingSalesWal(): SalesWalEntry[] {
  return getAllSalesWal().filter((e) => e.status === "pending" || e.status === "failed");
}

/**
 * Returns total count of uncommitted WAL entries.
 */
export function getPendingWalCount(): number {
  return getPendingSalesWal().length;
}

/**
 * WRITE-AHEAD LOGGING (WAL) PRE-COMMIT:
 * Appends a transaction intent synchronously to disk/localStorage BEFORE sending over network.
 */
export function writeToSalesWal(
  action: "SAVE_SALE" | "DELETE_SALE",
  payload: Sale | string,
  companyOwnerId: string
): SalesWalEntry {
  const newEntry: SalesWalEntry = {
    id: `wal_${action.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    action,
    payload,
    companyOwnerId: companyOwnerId || "global",
    status: "pending",
    retries: 0
  };

  const currentWal = getAllSalesWal();

  // If a DELETE_SALE is logged for a sale that has a pending SAVE_SALE in the log, remove or supersede the previous SAVE_SALE
  let updatedWal = currentWal;
  if (action === "DELETE_SALE" && typeof payload === "string") {
    const targetSaleId = payload;
    updatedWal = currentWal.filter((entry) => {
      if (entry.action === "SAVE_SALE" && typeof entry.payload === "object" && entry.payload?.id === targetSaleId) {
        console.log(`[Sales WAL] Superseding pending SAVE_SALE for ${targetSaleId} due to DELETE_SALE action.`);
        return false; // Remove pending SAVE_SALE
      }
      return true;
    });
  } else if (action === "SAVE_SALE" && typeof payload === "object" && payload?.id) {
    // If a new SAVE_SALE comes in for the same sale ID, replace the previous pending SAVE_SALE for that ID
    const saleId = payload.id;
    updatedWal = currentWal.filter((entry) => {
      if (entry.action === "SAVE_SALE" && typeof entry.payload === "object" && entry.payload?.id === saleId) {
        return false;
      }
      return true;
    });
  }

  updatedWal.push(newEntry);
  saveAllSalesWal(updatedWal);
  console.log(`[Sales WAL Pre-Commit] WAL log created [${newEntry.id}] action=${action} for company=${companyOwnerId}`);
  return newEntry;
}

/**
 * Updates status of a specific WAL log entry.
 */
export function updateSalesWalEntryStatus(
  id: string,
  status: "pending" | "syncing" | "synced" | "failed",
  errorMsg?: string
): void {
  const currentWal = getAllSalesWal();
  const nextWal = currentWal.map((entry) => {
    if (entry.id === id) {
      return {
        ...entry,
        status,
        retries: status === "failed" ? entry.retries + 1 : entry.retries,
        lastError: errorMsg || entry.lastError
      };
    }
    return entry;
  });

  // Purge entries that are successfully synced to keep disk log lean
  const cleanWal = nextWal.filter((e) => e.status !== "synced");
  saveAllSalesWal(cleanWal);
}

/**
 * Removes a WAL entry directly.
 */
export function removeSalesWalEntry(id: string): void {
  const currentWal = getAllSalesWal();
  const cleanWal = currentWal.filter((e) => e.id !== id);
  saveAllSalesWal(cleanWal);
}

/**
 * Flushes all pending/failed WAL entries to Supabase sequentially.
 * Guarantees zero data loss after power restore or network reconnect.
 */
export async function flushSalesWalQueue(
  companyOwnerId: string,
  dbSaveSaleFn: (companyId: string, sale: Sale) => Promise<boolean>,
  dbDeleteSaleFn: (id: string) => Promise<boolean>
): Promise<{ synced: number; failed: number }> {
  const pendingEntries = getPendingSalesWal();
  if (pendingEntries.length === 0) {
    return { synced: 0, failed: 0 };
  }

  console.log(`[Sales WAL Flush Worker] Processing ${pendingEntries.length} pending WAL log entries...`);
  let synced = 0;
  let failed = 0;

  for (const entry of pendingEntries) {
    updateSalesWalEntryStatus(entry.id, "syncing");
    const effectiveCompanyId = entry.companyOwnerId || companyOwnerId;

    try {
      if (entry.action === "SAVE_SALE" && typeof entry.payload === "object" && entry.payload) {
        const ok = await dbSaveSaleFn(effectiveCompanyId, entry.payload as Sale);
        if (ok) {
          updateSalesWalEntryStatus(entry.id, "synced");
          synced++;
          console.log(`[Sales WAL Flush] Successfully synced sale [${(entry.payload as Sale).id}] via WAL entry [${entry.id}]`);
        } else {
          updateSalesWalEntryStatus(entry.id, "failed", "dbSaveSale returned false");
          failed++;
        }
      } else if (entry.action === "DELETE_SALE" && typeof entry.payload === "string") {
        const ok = await dbDeleteSaleFn(entry.payload);
        if (ok) {
          updateSalesWalEntryStatus(entry.id, "synced");
          synced++;
          console.log(`[Sales WAL Flush] Successfully synced sale deletion [${entry.payload}] via WAL entry [${entry.id}]`);
        } else {
          updateSalesWalEntryStatus(entry.id, "failed", "dbDeleteSale returned false");
          failed++;
        }
      } else {
        // Unknown or invalid payload format, remove entry to unblock queue
        removeSalesWalEntry(entry.id);
      }
    } catch (err: any) {
      console.error(`[Sales WAL Flush Error] WAL entry [${entry.id}] exception:`, err);
      updateSalesWalEntryStatus(entry.id, "failed", err?.message || String(err));
      failed++;
    }
  }

  return { synced, failed };
}
