import { BusinessHours, CompanyProfile } from "../types";

const WEEKDAY_KEYS: (keyof BusinessHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

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
    extractedSettings.dailyAutoBackupEnabled =
      sys.dailyAutoBackupEnabled ?? rawBusinessHours.dailyAutoBackupEnabled;
  }
  if (sys.dailyAutoBackupMode || rawBusinessHours.dailyAutoBackupMode) {
    extractedSettings.dailyAutoBackupMode =
      sys.dailyAutoBackupMode || rawBusinessHours.dailyAutoBackupMode;
  }
  if (sys.dailyAutoBackupTime || rawBusinessHours.dailyAutoBackupTime) {
    extractedSettings.dailyAutoBackupTime =
      sys.dailyAutoBackupTime || rawBusinessHours.dailyAutoBackupTime;
  }
  if (
    typeof (sys.dailyAutoBackupUseClosingTime ?? rawBusinessHours.dailyAutoBackupUseClosingTime) ===
    "boolean"
  ) {
    extractedSettings.dailyAutoBackupUseClosingTime =
      sys.dailyAutoBackupUseClosingTime ?? rawBusinessHours.dailyAutoBackupUseClosingTime;
  }
  if (
    typeof (sys.autoBackupDownloadEnabled ?? rawBusinessHours.autoBackupDownloadEnabled) === "boolean"
  ) {
    extractedSettings.autoBackupDownloadEnabled =
      sys.autoBackupDownloadEnabled ?? rawBusinessHours.autoBackupDownloadEnabled;
  }
  if (
    typeof (sys.cashClosingReminderEnabled ?? rawBusinessHours.cashClosingReminderEnabled) ===
    "boolean"
  ) {
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
    extractedSettings.goalsReminderEnabled =
      sys.goalsReminderEnabled ?? rawBusinessHours.goalsReminderEnabled;
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
