import {
  BusinessHours,
  CompanyProfile,
  DailyAutoBackupMeta,
  DailyAutoBackupMode,
  DailyLocalBackupSnapshot,
} from "../types";
import { getIndexedDbItem, setIndexedDbItem } from "./indexedDb";
import { dbExportAllData } from "../supabase";

export const DAILY_BACKUP_META_KEY = "NUCLEO_DAILY_AUTO_BACKUP_META";
export const DAILY_BACKUP_LAST_DATE_KEY = "NUCLEO_LAST_DAILY_BACKUP_DATE";
export const DAILY_BACKUP_DISMISSED_DATE_KEY = "NUCLEO_DAILY_BACKUP_DISMISSED_DATE";
export const DAILY_BACKUP_SNOOZE_UNTIL_KEY = "NUCLEO_SNOOZE_DAILY_BACKUP_UNTIL";
export const DAILY_BACKUP_IDB_LATEST_KEY = "NUCLEO_DAILY_BACKUP_FILE";
export const DAILY_BACKUP_IDB_HISTORY_KEY = "NUCLEO_DAILY_BACKUP_HISTORY";

const WEEKDAY_KEYS: (keyof BusinessHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function getTodayLocalDateStr(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEffectiveDailyBackupTime(company?: Partial<CompanyProfile> | null): string {
  if (!company) return "18:00";
  const useClosing = company.dailyAutoBackupUseClosingTime !== false;
  if (!useClosing && company.dailyAutoBackupTime && /^\d{2}:\d{2}$/.test(company.dailyAutoBackupTime)) {
    return company.dailyAutoBackupTime;
  }

  const now = new Date();
  const todayKey = WEEKDAY_KEYS[now.getDay()];
  const dayConfig = company.businessHours?.[todayKey];
  if (dayConfig && dayConfig.isOpen && dayConfig.closeTime) {
    return dayConfig.closeTime;
  }

  if (company.closingTime && /^\d{2}:\d{2}$/.test(company.closingTime)) {
    return company.closingTime;
  }

  if (company.dailyAutoBackupTime && /^\d{2}:\d{2}$/.test(company.dailyAutoBackupTime)) {
    return company.dailyAutoBackupTime;
  }

  return "18:00";
}

export function getDailyAutoBackupMeta(): DailyAutoBackupMeta | null {
  try {
    const raw = localStorage.getItem(DAILY_BACKUP_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyAutoBackupMeta;
  } catch {
    return null;
  }
}

export async function getDailyBackupHistory(): Promise<DailyLocalBackupSnapshot[]> {
  try {
    const list = await getIndexedDbItem<DailyLocalBackupSnapshot[]>(DAILY_BACKUP_IDB_HISTORY_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function triggerJsonDownload(fileName: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadLocalDailyBackupSnapshot(snapshotId?: string): Promise<boolean> {
  try {
    const history = await getDailyBackupHistory();
    let target: DailyLocalBackupSnapshot | null = null;
    if (snapshotId) {
      target = history.find((item) => item.id === snapshotId) || null;
    } else if (history.length > 0) {
      target = history[0];
    }

    if (!target) {
      const latest = await getIndexedDbItem<DailyLocalBackupSnapshot>(DAILY_BACKUP_IDB_LATEST_KEY);
      if (latest?.jsonContent) {
        target = latest;
      }
    }

    if (!target || !target.jsonContent) return false;

    triggerJsonDownload(target.fileName, target.jsonContent);
    return true;
  } catch (err) {
    console.warn("Erro ao baixar snapshot de backup local:", err);
    return false;
  }
}

export async function runDailyAutoBackup(params: {
  ownerId: string;
  companyName?: string;
  mode: DailyAutoBackupMode | "manual";
  triggerDownload: boolean;
  syncToCloud?: boolean;
}): Promise<DailyLocalBackupSnapshot | null> {
  const { ownerId, companyName = "empresa", mode, triggerDownload, syncToCloud = true } = params;
  if (!ownerId) return null;

  try {
    const data = await dbExportAllData(ownerId);
    if (!data) return null;

    const now = new Date();
    const dateStr = getTodayLocalDateStr(now);
    const sanitizedName = (companyName || "empresa")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const fileName =
      sanitizedName && sanitizedName !== "empresa"
        ? `backup_diario_${sanitizedName}_${dateStr}.json`
        : `backup_diario_${dateStr}.json`;

    const jsonContent = JSON.stringify(data, null, 2);
    const sizeBytes = new Blob([jsonContent]).size;

    const snapshot: DailyLocalBackupSnapshot = {
      id: `daily_${dateStr}_${Date.now()}`,
      date: dateStr,
      timestamp: now.toISOString(),
      fileName,
      sizeBytes,
      mode,
      salesCount: Array.isArray(data.sales) ? data.sales.length : 0,
      clientsCount: Array.isArray(data.clientes) ? data.clientes.length : 0,
      productsCount: Array.isArray(data.produtos) ? data.produtos.length : 0,
      expensesCount: Array.isArray(data.expenses) ? data.expenses.length : 0,
      downloaded: triggerDownload,
      jsonContent,
    };

    // Save latest snapshot in IndexedDB
    await setIndexedDbItem(DAILY_BACKUP_IDB_LATEST_KEY, snapshot);

    // Keep rolling history of last 7 daily local snapshots (1 per day latest + manual runs)
    const existingHistory = await getDailyBackupHistory();
    const filteredHistory = existingHistory.filter(
      (item) => item.date !== dateStr || item.mode !== mode
    );
    const updatedHistory = [snapshot, ...filteredHistory].slice(0, 7);
    await setIndexedDbItem(DAILY_BACKUP_IDB_HISTORY_KEY, updatedHistory);

    // Save lightweight metadata in localStorage
    const meta: DailyAutoBackupMeta = {
      date: snapshot.date,
      timestamp: snapshot.timestamp,
      fileName: snapshot.fileName,
      sizeBytes: snapshot.sizeBytes,
      mode: snapshot.mode,
      salesCount: snapshot.salesCount,
      clientsCount: snapshot.clientsCount,
      productsCount: snapshot.productsCount,
      expensesCount: snapshot.expensesCount,
      downloaded: snapshot.downloaded,
    };
    try {
      localStorage.setItem(DAILY_BACKUP_META_KEY, JSON.stringify(meta));
      localStorage.setItem(DAILY_BACKUP_LAST_DATE_KEY, dateStr);
    } catch {}

    // Trigger file download if configured
    if (triggerDownload) {
      triggerJsonDownload(fileName, jsonContent);
    }

    // Optional background cloud sync to meus_dados (non-blocking)
    if (syncToCloud) {
      try {
        const compactJson = JSON.stringify(data);
        fetch("/api/backups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: fileName,
            descricao: compactJson,
            valor: compactJson.length,
            userId: ownerId,
          }),
        }).catch(() => {});
      } catch {}
    }

    window.dispatchEvent(new CustomEvent("daily_backup_updated", { detail: meta }));
    window.dispatchEvent(new CustomEvent("cloud_backups_updated"));

    return snapshot;
  } catch (err) {
    console.error("Erro ao executar Backup Automático Diário:", err);
    return null;
  }
}

export function extractSettingsFromBusinessHours(rawBusinessHours: any): {
  cleanBusinessHours: BusinessHours | undefined;
  extractedSettings: Partial<CompanyProfile>;
} {
  if (!rawBusinessHours || typeof rawBusinessHours !== "object") {
    return { cleanBusinessHours: undefined, extractedSettings: {} };
  }

  const sys = rawBusinessHours._systemSettings || {};
  const extractedSettings: Partial<CompanyProfile> = {};

  if (typeof (sys.dailyAutoBackupEnabled ?? rawBusinessHours.dailyAutoBackupEnabled) === "boolean") {
    extractedSettings.dailyAutoBackupEnabled = sys.dailyAutoBackupEnabled ?? rawBusinessHours.dailyAutoBackupEnabled;
  }
  if (sys.dailyAutoBackupMode || rawBusinessHours.dailyAutoBackupMode) {
    extractedSettings.dailyAutoBackupMode = sys.dailyAutoBackupMode || rawBusinessHours.dailyAutoBackupMode;
  }
  if (sys.dailyAutoBackupTime || rawBusinessHours.dailyAutoBackupTime) {
    extractedSettings.dailyAutoBackupTime = sys.dailyAutoBackupTime || rawBusinessHours.dailyAutoBackupTime;
  }
  if (typeof (sys.dailyAutoBackupUseClosingTime ?? rawBusinessHours.dailyAutoBackupUseClosingTime) === "boolean") {
    extractedSettings.dailyAutoBackupUseClosingTime =
      sys.dailyAutoBackupUseClosingTime ?? rawBusinessHours.dailyAutoBackupUseClosingTime;
  }
  if (typeof (sys.autoBackupDownloadEnabled ?? rawBusinessHours.autoBackupDownloadEnabled) === "boolean") {
    extractedSettings.autoBackupDownloadEnabled =
      sys.autoBackupDownloadEnabled ?? rawBusinessHours.autoBackupDownloadEnabled;
  }
  if (typeof (sys.cashClosingReminderEnabled ?? rawBusinessHours.cashClosingReminderEnabled) === "boolean") {
    extractedSettings.cashClosingReminderEnabled =
      sys.cashClosingReminderEnabled ?? rawBusinessHours.cashClosingReminderEnabled;
  }
  if (sys.cashClosingReminderTime || rawBusinessHours.cashClosingReminderTime) {
    extractedSettings.cashClosingReminderTime =
      sys.cashClosingReminderTime || rawBusinessHours.cashClosingReminderTime;
  }
  if (sys.cashClosingReminderMessage || rawBusinessHours.cashClosingReminderMessage) {
    extractedSettings.cashClosingReminderMessage =
      sys.cashClosingReminderMessage || rawBusinessHours.cashClosingReminderMessage;
  }
  if (typeof (sys.goalsReminderEnabled ?? rawBusinessHours.goalsReminderEnabled) === "boolean") {
    extractedSettings.goalsReminderEnabled = sys.goalsReminderEnabled ?? rawBusinessHours.goalsReminderEnabled;
  }
  if (sys.goalsReminderTime || rawBusinessHours.goalsReminderTime) {
    extractedSettings.goalsReminderTime = sys.goalsReminderTime || rawBusinessHours.goalsReminderTime;
  }
  if (sys.openingTime || rawBusinessHours.openingTime) {
    extractedSettings.openingTime = sys.openingTime || rawBusinessHours.openingTime;
  }
  if (sys.closingTime || rawBusinessHours.closingTime) {
    extractedSettings.closingTime = sys.closingTime || rawBusinessHours.closingTime;
  }

  const hasDayKeys = WEEKDAY_KEYS.some((k) => rawBusinessHours[k] !== undefined);
  if (!hasDayKeys) {
    return { cleanBusinessHours: undefined, extractedSettings };
  }

  const cleanBusinessHours: Partial<BusinessHours> = {};
  for (const key of WEEKDAY_KEYS) {
    if (rawBusinessHours[key]) {
      cleanBusinessHours[key] = rawBusinessHours[key];
    }
  }

  return {
    cleanBusinessHours: cleanBusinessHours as BusinessHours,
    extractedSettings,
  };
}

export function packBusinessHoursWithSettings(profile: CompanyProfile): Record<string, any> | null {
  const baseHours: Record<string, any> = profile.businessHours
    ? {
        monday: profile.businessHours.monday,
        tuesday: profile.businessHours.tuesday,
        wednesday: profile.businessHours.wednesday,
        thursday: profile.businessHours.thursday,
        friday: profile.businessHours.friday,
        saturday: profile.businessHours.saturday,
        sunday: profile.businessHours.sunday,
      }
    : {};

  baseHours._systemSettings = {
    dailyAutoBackupEnabled: Boolean(profile.dailyAutoBackupEnabled),
    dailyAutoBackupMode: profile.dailyAutoBackupMode || "auto_save_and_download",
    dailyAutoBackupTime: profile.dailyAutoBackupTime || "18:00",
    dailyAutoBackupUseClosingTime: profile.dailyAutoBackupUseClosingTime ?? true,
    autoBackupDownloadEnabled: profile.autoBackupDownloadEnabled ?? true,
    cashClosingReminderEnabled: Boolean(profile.cashClosingReminderEnabled),
    cashClosingReminderTime: profile.cashClosingReminderTime || "",
    cashClosingReminderMessage: profile.cashClosingReminderMessage || "",
    goalsReminderEnabled: Boolean(profile.goalsReminderEnabled),
    goalsReminderTime: profile.goalsReminderTime || "09:00",
    openingTime: profile.openingTime || "08:00",
    closingTime: profile.closingTime || "18:00",
  };

  return baseHours;
}
