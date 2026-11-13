import React, { useState, useEffect, useRef } from "react";
import {
  Building2,
  Phone,
  MapPin,
  Search,
  Upload,
  CheckCircle,
  FileText,
  X,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Download,
  Database,
  AlertTriangle,
  ServerCrash,
  Bell,
  Clock,
  Plus,
  Trash2,
  Calendar,
  Check,
  Edit2,
  Users,
  UserPlus,
  KeyRound,
  Mail,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  Wallet,
  UserCheck,
  Sunset,
  BellRing,
  Moon,
  FileCheck,
  ShoppingCart,
  Receipt,
  Package
} from "lucide-react";
import { CompanyProfile, User, CustomReminder, CashRegisterState, CashRegisterSession, BusinessHours, DailyAutoBackupMode, DailyAutoBackupMeta, DailyLocalBackupSnapshot } from "../types";
import { dbExportAllData, dbImportAllData, dbGetCompanyProfile, dbSaveCompanyProfile, isSupabaseConfigured, getAdminDomain, normalizeUserString, notifyRealtimeSync, getSupabase, supabase } from "../supabase";
import { setIndexedDbItem } from "../utils/indexedDb";
import { extractSettingsFromBusinessHours } from "../utils/companySettingsSerializer";
import {
  getDailyAutoBackupMeta,
  getDailyBackupHistory,
  getEffectiveDailyBackupTime,
  getTodayLocalDateStr,
  runDailyAutoBackup,
  downloadLocalDailyBackupSnapshot,
} from "../utils/dailyBackup";

const WEEKDAYS = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

const defaultBusinessHours: BusinessHours = {
  monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
  saturday: { isOpen: true, openTime: "06:00", closeTime: "14:00" },
  sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
};

interface CompanySettingsProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => void;
  soundEnabled?: boolean;
  onToggleSound?: (enabled: boolean) => void;
  currentUser: User | null;
  onRefreshData?: (userRecord?: User, isBackground?: boolean, forceAll?: boolean) => Promise<void>;
  cashRegister?: CashRegisterState;
  onOpenRegister?: (valorAbertura: number, operador: string) => void;
  onCloseRegister?: (valorFechamentoReal: number, observacoes?: string) => void;
  onNavigateToAtendentes?: () => void;
  onGoToStandby?: () => void;
  addToast?: (message: string, type?: "success" | "info" | "warning" | "error" | "goal" | "reminder") => void;
}

export function CompanySettings({ 
  company, 
  onSaveCompany, 
  soundEnabled = true, 
  onToggleSound, 
  currentUser, 
  onRefreshData,
  cashRegister,
  onOpenRegister,
  onCloseRegister,
  onNavigateToAtendentes,
  onGoToStandby,
  addToast
}: CompanySettingsProps) {
  const [tradingName, setTradingName] = useState(company.tradingName);
  const [phone, setPhone] = useState(company.phone);
  const [cep, setCep] = useState(company.cep);
  const [address, setAddress] = useState(company.address);
  const [number, setNumber] = useState(company.number);
  const [neighborhood, setNeighborhood] = useState(company.neighborhood);
  const [city, setCity] = useState(company.city);
  const [state, setState] = useState(company.state);
  const [cnpjCpf, setCnpjCpf] = useState(company.cnpjCpf);
  const [logo, setLogo] = useState<string | null>(company.logo);
  const [pixKey, setPixKey] = useState(company.pixKey || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [openingTime, setOpeningTime] = useState(company.openingTime || "08:00");
  const [closingTime, setClosingTime] = useState(company.closingTime || "18:00");
  const [autoCloseRegisterEnabled, setAutoCloseRegisterEnabled] = useState(company.autoCloseRegisterEnabled ?? false);
  const [autoBackupDownloadEnabled, setAutoBackupDownloadEnabled] = useState(company.autoBackupDownloadEnabled ?? true);
  const [dailyAutoBackupEnabled, setDailyAutoBackupEnabled] = useState<boolean>(company.dailyAutoBackupEnabled ?? false);
  const [dailyAutoBackupMode, setDailyAutoBackupMode] = useState<DailyAutoBackupMode>(
    company.dailyAutoBackupMode || "auto_save_and_download"
  );
  const [dailyAutoBackupTime, setDailyAutoBackupTime] = useState<string>(
    company.dailyAutoBackupTime || company.closingTime || "18:00"
  );
  const [dailyAutoBackupUseClosingTime, setDailyAutoBackupUseClosingTime] = useState<boolean>(
    company.dailyAutoBackupUseClosingTime ?? true
  );
  const [dailyBackupMeta, setDailyBackupMeta] = useState<DailyAutoBackupMeta | null>(() => getDailyAutoBackupMeta());
  const [dailyBackupHistory, setDailyBackupHistory] = useState<DailyLocalBackupSnapshot[]>([]);
  const [runningDailyBackupNow, setRunningDailyBackupNow] = useState(false);
  const [savingDailyBackupConfig, setSavingDailyBackupConfig] = useState(false);
  const [cashClosingReminderEnabled, setCashClosingReminderEnabled] = useState<boolean>(company.cashClosingReminderEnabled ?? false);
  const [cashClosingReminderTime, setCashClosingReminderTime] = useState<string>(company.cashClosingReminderTime || "");
  const [cashClosingReminderMessage, setCashClosingReminderMessage] = useState<string>(
    company.cashClosingReminderMessage || "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?"
  );
  
  const [businessHours, setBusinessHours] = useState<BusinessHours>(() => {
    return company.businessHours || defaultBusinessHours;
  });

  const lastLoadedUserRef = useRef<string | null>(null);

  const [openingOperatorName, setOpeningOperatorName] = useState(currentUser?.name || "");
  const [openingFloatValue, setOpeningFloatValue] = useState("");

  useEffect(() => {
    if (currentUser?.name && !openingOperatorName) {
      setOpeningOperatorName(currentUser.name);
    }
  }, [currentUser, openingOperatorName]);

  // Sub-tabs State
  const [activeSubTab, setActiveSubTab] = useState<"empresa" | "atendentes">("empresa");

  // Attendants Registration State variables
  const [attendants, setAttendants] = useState<User[]>([]);
  const [attendantName, setAttendantName] = useState("");
  const [attendantUsername, setAttendantUsername] = useState("");
  const [attendantEmail, setAttendantEmail] = useState("");
  const [attendantPassword, setAttendantPassword] = useState("");
  const [showAttendantPassword, setShowAttendantPassword] = useState(false);
  const [attendantAdminBypassPassword, setAttendantAdminBypassPassword] = useState("");
  const [showAttendantAdminBypassPassword, setShowAttendantAdminBypassPassword] = useState(false);
  const [attendantEditingId, setAttendantEditingId] = useState<string | null>(null);
  const [attendantError, setAttendantError] = useState<string | null>(null);
  const [attendantSuccess, setAttendantSuccess] = useState<string | null>(null);
  const [newAttendantCredentials, setNewAttendantCredentials] = useState<{ name: string; username: string; password?: string; adminBypassPassword?: string } | null>(null);
  const [loadingAttendants, setLoadingAttendants] = useState(false);

  // Load attendants
  const loadAttendantsList = async () => {
    if (!currentUser?.id) return;
    setLoadingAttendants(true);
    setAttendantError(null);
    let allUsers: User[] = [];
    
    try {
      const saved = localStorage.getItem("NUCLEO_USERS");
      if (saved) {
        allUsers = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse local users", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const { dbGetUsers } = await import("../supabase");
        const dbUsers = await dbGetUsers(currentUser.id);
        if (dbUsers) {
          dbUsers.forEach(dbU => {
            if (!allUsers.some(u => u.id === dbU.id)) {
              allUsers.push(dbU);
            }
          });
        }
      } catch (err) {
        console.warn("Could not load users database", err);
      }
    }

    const ownerId = currentUser.owner_id || currentUser.id;
    const filtered = allUsers.filter(u => u.owner_id === ownerId && u.id !== ownerId);
    setAttendants(filtered);
    setLoadingAttendants(false);
  };

  useEffect(() => {
    if (activeSubTab === "atendentes") {
      loadAttendantsList();
    }
  }, [activeSubTab, currentUser?.id]);

  // Goals Reminder states (synced with CompanyProfile)
  const [goalsReminderEnabled, setGoalsReminderEnabled] = useState(company.goalsReminderEnabled ?? false);
  const [goalsReminderTime, setGoalsReminderTime] = useState(company.goalsReminderTime || "09:00");

  // General custom reminders list
  const [reminders, setReminders] = useState<CustomReminder[]>(() => {
    const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    return saved ? JSON.parse(saved) : [];
  });

  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderType, setNewReminderType] = useState<"date" | "weekly">("date");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [newReminderDayOfWeek, setNewReminderDayOfWeek] = useState<number>(1);
  const [newReminderTime, setNewReminderTime] = useState("09:00");
  const [newReminderIsAllDay, setNewReminderIsAllDay] = useState(false);

  useEffect(() => {
    const currentLocal = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
    const serialized = JSON.stringify(reminders);
    if (currentLocal !== serialized) {
      localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", serialized);
      window.dispatchEvent(new Event("storage"));
    }
  }, [reminders]);

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("NUCLEO_CUSTOM_REMINDERS");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (JSON.stringify(parsed) !== JSON.stringify(reminders)) {
            setReminders(parsed);
          }
        } catch (e) {
          console.error("Error parsing storage reminders:", e);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [reminders]);

  const handleAddReminder = () => {
    if (!newReminderTitle.trim()) {
      alert("Por favor, preencha o assunto do seu lembrete.");
      return;
    }
    
    let selectedDate = newReminderDate;
    if (newReminderType === "date" && !selectedDate) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      selectedDate = `${year}-${month}-${day}`;
    }

    const newRem: CustomReminder = {
      id: Math.random().toString(36).substring(2, 9),
      title: newReminderTitle.trim(),
      type: newReminderType,
      date: newReminderType === "date" ? selectedDate : undefined,
      dayOfWeek: newReminderType === "weekly" ? newReminderDayOfWeek : undefined,
      time: newReminderIsAllDay ? "00:00" : newReminderTime,
      isAllDay: newReminderIsAllDay,
      completed: false,
      notified: false
    };

    setReminders((prev) => [...prev, newRem]);
    setNewReminderTitle("");
    setNewReminderIsAllDay(false);
  };

  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);

  const handleStartEdit = (rem: CustomReminder) => {
    setEditingReminderId(rem.id);
    setNewReminderTitle(rem.title);
    setNewReminderType(rem.type);
    setNewReminderDate(rem.date || "");
    setNewReminderDayOfWeek(rem.dayOfWeek || 1);
    setNewReminderTime(rem.time || "09:00");
    setNewReminderIsAllDay(rem.isAllDay ?? false);
  };

  const handleSaveEdit = () => {
    if (!newReminderTitle.trim()) {
      alert("Por favor, preencha o assunto do seu lembrete.");
      return;
    }

    setReminders((prev) =>
      prev.map((r) =>
        r.id === editingReminderId
          ? {
              ...r,
              title: newReminderTitle.trim(),
              type: newReminderType,
              date: newReminderType === "date" ? newReminderDate : undefined,
              dayOfWeek: newReminderType === "weekly" ? newReminderDayOfWeek : undefined,
              time: newReminderIsAllDay ? "00:00" : newReminderTime,
              isAllDay: newReminderIsAllDay,
              notified: false,
            }
          : r
      )
    );

    handleCancelEdit();
  };

  const handleCancelEdit = () => {
    setEditingReminderId(null);
    setNewReminderTitle("");
    setNewReminderType("date");
    setNewReminderDate("");
    setNewReminderDayOfWeek(1);
    setNewReminderTime("09:00");
    setNewReminderIsAllDay(false);
  };

  const handleToggleReminderCompleted = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const handleDeleteReminder = (id: string) => {
    if (editingReminderId === id) {
      handleCancelEdit();
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  interface BackupPreviewData {
    fileName: string;
    fileSize: string;
    exportedAt: string | null;
    companyName: string;
    companyLogo: string | null;
    phone?: string;
    cnpjCpf?: string;
    city?: string;
    state?: string;
    address?: string;
    salesCount: number;
    productsCount: number;
    clientsCount: number;
    expensesCount: number;
    subUsersCount: number;
    billsCount: number;
    remindersCount: number;
    rawParsedData: any;
    restoredCompanyProfile: CompanyProfile;
  }

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreviewData | null>(null);
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [restoreCountdown, setRestoreCountdown] = useState<number>(5);
  const [restoreProgress, setRestoreProgress] = useState<number>(0);
  const [restoreStepText, setRestoreStepText] = useState<string>("");
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  interface BackupCloudItem {
    id: string;
    titulo: string;
    descricao?: string | null;
    valor?: number;
    created_at: string;
    empresa_id?: string;
    user_id?: string;
  }

  const [cloudBackups, setCloudBackups] = useState<BackupCloudItem[]>([]);
  const [loadingCloudBackups, setLoadingCloudBackups] = useState<boolean>(false);
  const fetchCloudBackups = async () => {
    setLoadingCloudBackups(true);
    try {
      const ownerId = currentUser?.owner_id || currentUser?.id;
      if (!ownerId) {
        setLoadingCloudBackups(false);
        return;
      }
      
      try {
        const res = await fetch(`/api/backups?userId=${encodeURIComponent(ownerId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.backups)) {
            setCloudBackups(json.backups);
            setLoadingCloudBackups(false);
            return;
          }
        }
      } catch (apiErr) {
        console.warn("Fallback API backups:", apiErr);
      }

      const supabase = getSupabase();
      if (!supabase) return;

      const { data } = await supabase
        .from("meus_dados")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });

      if (data) {
        setCloudBackups(data);
      }
    } catch (err) {
      console.warn("Aviso ao carregar backups:", err);
    } finally {
      setLoadingCloudBackups(false);
    }
  };

  const loadLocalDailyBackups = async () => {
    setDailyBackupMeta(getDailyAutoBackupMeta());
    const hist = await getDailyBackupHistory();
    setDailyBackupHistory(hist);
  };

  useEffect(() => {
    fetchCloudBackups();
    loadLocalDailyBackups();
    const handleBackupEvent = () => fetchCloudBackups();
    const handleDailyBackupEvent = () => loadLocalDailyBackups();
    window.addEventListener("cloud_backups_updated" as any, handleBackupEvent);
    window.addEventListener("backup_sync" as any, handleBackupEvent);
    window.addEventListener("backup_restored_sync" as any, handleBackupEvent);
    window.addEventListener("daily_backup_updated" as any, handleDailyBackupEvent);

    return () => {
      window.removeEventListener("cloud_backups_updated" as any, handleBackupEvent);
      window.removeEventListener("backup_sync" as any, handleBackupEvent);
      window.removeEventListener("backup_restored_sync" as any, handleBackupEvent);
      window.removeEventListener("daily_backup_updated" as any, handleDailyBackupEvent);
    };
  }, []);

  const handleExportBackup = async () => {
    if (!currentUser) {
      alert("Você precisa estar logado para realizar um backup.");
      return;
    }
    setExporting(true);
    setBackupSuccessMsg(null);
    setBackupError(null);
    try {
      const ownerId = currentUser.owner_id || currentUser.id;
      const data = await dbExportAllData(ownerId);
      if (!data) {
        setBackupError("Erro ao ler dados para backup do servidor.");
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const sanitizedName = (tradingName || "empresa").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = sanitizedName && sanitizedName !== "empresa" 
        ? `backup_sistema_${sanitizedName}_${dateStr}.json` 
        : `backup_sistema_${dateStr}.json`;

      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      const jsonString = JSON.stringify(data);
      const supabase = getSupabase();
      let activeUserId = currentUser?.owner_id || currentUser?.id;
      if (!activeUserId) throw new Error("ID do usuário não identificado para restauração.");

      if (supabase) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) activeUserId = authData.user.id;
        } catch (e) {}
      }

      try {
        await fetch("/api/backups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: fileName,
            descricao: jsonString,
            valor: jsonString.length,
            userId: activeUserId
          })
        });
      } catch (e) {}

      setBackupSuccessMsg("Cópia de segurança consolidada exportada com sucesso em arquivo único .json!");
      if (addToast) addToast("Backup completo baixado com sucesso em arquivo único .json! 💾", "success");
      setTimeout(() => setBackupSuccessMsg(null), 6000);
      fetchCloudBackups();
    } catch (err: any) {
      console.error(err);
      setBackupError("Falha ao exportar backup: " + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError(null);
    setBackupSuccessMsg(null);
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    setBackupFile(file);
    e.target.value = ""; // Clear to allow re-selection

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        setBackupError("Arquivo corrompido ou formato JSON inválido. Certifique-se de que o arquivo é um .json válido.");
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        setBackupError("O arquivo selecionado não contém uma estrutura de dados válida.");
        return;
      }

      const source = (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) ? parsed.data : 
                     (parsed.backup && typeof parsed.backup === "object" && !Array.isArray(parsed.backup)) ? parsed.backup : parsed;

      // Strict validation of backup schema integrity
      const hasRecognizedData = 
        source.sales || source.vendas || source.pedidos ||
        source.produtos || source.products ||
        source.clientes || source.clients ||
        source.expenses || source.despesas ||
        source.company_profile || source.empresa ||
        source.localStorageDump ||
        Array.isArray(source);

      if (!hasRecognizedData) {
        setBackupError("Arquivo inválido! O arquivo selecionado não foi reconhecido como um backup válido do sistema. Estrutura de dados ausente.");
        return;
      }

      // Extract Dump if present
      const dump = source.localStorageDump || parsed.localStorageDump || null;
      let compCandidate = source.company_profile || source.empresa || parsed.company_profile || parsed.empresa || null;
      if (!compCandidate && dump && dump["NUCLEO_COMPANY_PROFILE"]) {
        try {
          compCandidate = JSON.parse(dump["NUCLEO_COMPANY_PROFILE"]);
        } catch (e) {}
      }

      let logoCandidate: string | null = source.company_logo || parsed.company_logo || compCandidate?.logo || null;
      if (!logoCandidate && dump && dump["NUCLEO_COMPANY_LOGO"]) {
        logoCandidate = dump["NUCLEO_COMPANY_LOGO"];
      }

      const compProfile: CompanyProfile = {
        tradingName: compCandidate?.tradingName || compCandidate?.trading_name || compCandidate?.nome || "Empresa Restaurada",
        phone: compCandidate?.phone || compCandidate?.telefone || "",
        cep: compCandidate?.cep || "",
        address: compCandidate?.address || compCandidate?.endereco || "",
        number: compCandidate?.number || compCandidate?.numero || "",
        neighborhood: compCandidate?.neighborhood || compCandidate?.bairro || "",
        city: compCandidate?.city || compCandidate?.cidade || "",
        state: compCandidate?.state || compCandidate?.estado || compCandidate?.uf || "",
        cnpjCpf: compCandidate?.cnpjCpf || compCandidate?.cnpj_cpf || "",
        logo: logoCandidate,
        pixKey: compCandidate?.pixKey || compCandidate?.pix_key || "",
        businessHours: compCandidate?.businessHours || compCandidate?.business_hours || undefined,
        goalsReminderEnabled: compCandidate?.goalsReminderEnabled,
        goalsReminderTime: compCandidate?.goalsReminderTime,
        openingTime: compCandidate?.openingTime,
        closingTime: compCandidate?.closingTime,
        autoCloseRegisterEnabled: compCandidate?.autoCloseRegisterEnabled,
        autoBackupDownloadEnabled: compCandidate?.autoBackupDownloadEnabled,
        cashClosingReminderEnabled: compCandidate?.cashClosingReminderEnabled,
        cashClosingReminderTime: compCandidate?.cashClosingReminderTime,
        cashClosingReminderMessage: compCandidate?.cashClosingReminderMessage
      };

      const salesArr = Array.isArray(source) ? source : (source.sales || source.vendas || source.pedidos || parsed.sales || parsed.vendas || parsed.pedidos || []);
      const prodArr = source.produtos || source.products || parsed.produtos || parsed.products || [];
      const clientArr = source.clientes || source.clients || parsed.clientes || parsed.clients || [];
      const expArr = source.expenses || source.despesas || source.gastos || parsed.expenses || parsed.despesas || [];
      const subUsersArr = source.sub_usuarios || source.users || source.sub_users || parsed.sub_usuarios || parsed.users || [];
      const billsArr = source.gastos_mensais || source.faturas || parsed.gastos_mensais || [];
      const remsArr = source.custom_reminders || source.reminders || parsed.custom_reminders || [];

      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(file.size / 1024).toFixed(1)} KB`;

      setBackupPreview({
        fileName: file.name,
        fileSize: sizeStr,
        exportedAt: source.exported_at || parsed.exported_at || null,
        companyName: compProfile.tradingName,
        companyLogo: logoCandidate,
        phone: compProfile.phone,
        cnpjCpf: compProfile.cnpjCpf,
        city: compProfile.city,
        state: compProfile.state,
        address: compProfile.address,
        salesCount: salesArr.length,
        productsCount: prodArr.length,
        clientsCount: clientArr.length,
        expensesCount: expArr.length,
        subUsersCount: subUsersArr.length,
        billsCount: billsArr.length,
        remindersCount: remsArr.length,
        rawParsedData: parsed,
        restoredCompanyProfile: compProfile
      });
    } catch (err: any) {
      console.error(err);
      setBackupError("Falha ao analisar o arquivo de backup: " + (err.message || err));
    }
  };

  const handleConfirmRestore = async () => {
    if (!backupPreview) return;
    setIsConfirmingRestore(true);
    setBackupError(null);
    setBackupSuccessMsg(null);

    const totalRecords = (backupPreview.salesCount || 0) + 
                         (backupPreview.expensesCount || 0) + 
                         (backupPreview.productsCount || 0) + 
                         (backupPreview.clientsCount || 0) + 
                         (backupPreview.billsCount || 0);

    // Initial countdown estimation in seconds (e.g. 5 to 7 seconds)
    const initialSeconds = Math.min(8, Math.max(5, Math.ceil(totalRecords / 120)));
    setRestoreCountdown(initialSeconds);
    setRestoreProgress(10);
    setRestoreStepText("Preparando perfil da empresa e logotipo...");

    let currentSec = initialSeconds;
    const timerInterval = setInterval(() => {
      currentSec = Math.max(1, currentSec - 1);
      setRestoreCountdown(currentSec);
      setRestoreProgress((prev) => Math.min(92, prev + Math.floor(75 / initialSeconds)));
    }, 1000);

    try {
      const parsed = backupPreview.rawParsedData;
      const source = (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) ? parsed.data : 
                     (parsed.backup && typeof parsed.backup === "object" && !Array.isArray(parsed.backup)) ? parsed.backup : parsed;

      setRestoreProgress(25);
      setRestoreStepText("Carregando logotipo e dados cadastrais...");

      // 1. Unpack full LocalStorage Dump
      const dumpCandidate = source.localStorageDump || parsed.localStorageDump || source;
      if (dumpCandidate && typeof dumpCandidate === "object" && !Array.isArray(dumpCandidate)) {
        Object.keys(dumpCandidate).forEach((k) => {
          if (k.startsWith("NUCLEO_") || k.startsWith("COMPANY_") || k.startsWith("nexvolt_")) {
            try {
              const val = typeof dumpCandidate[k] === "string" ? dumpCandidate[k] : JSON.stringify(dumpCandidate[k]);
              localStorage.setItem(k, val);
            } catch (e) {}
          }
        });
      }

      // 2. Extract Data Collections
      const sales: any[] = Array.isArray(source) ? source : (source.sales || source.vendas || source.pedidos || parsed.sales || parsed.vendas || parsed.pedidos || []);
      const produtos: any[] = source.produtos || source.products || parsed.produtos || parsed.products || [];
      const expenses: any[] = source.expenses || source.despesas || source.gastos || parsed.expenses || parsed.despesas || [];
      const gastos_mensais: any[] = source.gastos_mensais || source.faturas || parsed.gastos_mensais || [];
      const clientes: any[] = source.clientes || source.clients || parsed.clientes || parsed.clients || [];
      const sub_usuarios: any[] = source.sub_usuarios || source.users || source.sub_users || parsed.sub_usuarios || parsed.users || [];
      const vendas_rapidas_itens: any[] = source.vendas_rapidas_itens || source.quick_sales || parsed.vendas_rapidas_itens || [];
      const goals = source.goals || source.metas || parsed.goals || null;
      const cash_register_state = source.cash_register_state || source.cashRegister || source.cash_register || parsed.cash_register || null;
      const custom_reminders = source.custom_reminders || source.reminders || parsed.custom_reminders || [];

      // 3. Save to localStorage
      if (sales.length > 0) localStorage.setItem("NUCLEO_SALES", JSON.stringify(sales));
      if (expenses.length > 0) localStorage.setItem("NUCLEO_EXPENSES", JSON.stringify(expenses));
      if (produtos.length > 0) localStorage.setItem("NUCLEO_PRODUCTS", JSON.stringify(produtos));
      if (gastos_mensais.length > 0) {
        localStorage.setItem("NUCLEO_MONTHLY_BILLS", JSON.stringify(gastos_mensais));
        localStorage.setItem("NUCLEO_RECURRING_EXPENSES", JSON.stringify(gastos_mensais));
      }
      if (clientes.length > 0) localStorage.setItem("NUCLEO_CLIENTS", JSON.stringify(clientes));
      if (sub_usuarios.length > 0) localStorage.setItem("NUCLEO_USERS", JSON.stringify(sub_usuarios));
      if (vendas_rapidas_itens.length > 0) localStorage.setItem("NUCLEO_QUICK_SALES", JSON.stringify(vendas_rapidas_itens));
      if (goals) localStorage.setItem("NUCLEO_GOALS", JSON.stringify(goals));
      if (cash_register_state) localStorage.setItem("NUCLEO_CASH_REGISTER", JSON.stringify(cash_register_state));
      if (custom_reminders.length > 0) localStorage.setItem("NUCLEO_CUSTOM_REMINDERS", JSON.stringify(custom_reminders));

      // 4. Update Company Profile & Logo
      const restoredComp = backupPreview.restoredCompanyProfile;
      localStorage.setItem("NUCLEO_COMPANY_PROFILE", JSON.stringify(restoredComp));
      if (restoredComp.tradingName) {
        localStorage.setItem("NUCLEO_COMPANY_TRADING_NAME", restoredComp.tradingName);
      }
      if (restoredComp.logo) {
        try {
          await setIndexedDbItem("NUCLEO_COMPANY_LOGO", restoredComp.logo);
        } catch (e) {}
        try {
          localStorage.setItem("NUCLEO_COMPANY_LOGO", restoredComp.logo);
        } catch (e) {}
      }

      // Update local form state in CompanySettings
      setTradingName(restoredComp.tradingName);
      setPhone(restoredComp.phone);
      setCep(restoredComp.cep);
      setAddress(restoredComp.address);
      setNumber(restoredComp.number);
      setNeighborhood(restoredComp.neighborhood);
      setCity(restoredComp.city);
      setState(restoredComp.state);
      setCnpjCpf(restoredComp.cnpjCpf);
      setLogo(restoredComp.logo || null);
      setPixKey(restoredComp.pixKey || "");
      if (restoredComp.businessHours) setBusinessHours(restoredComp.businessHours);

      // 5. Instantly update App.tsx and Top-Left Header without refresh!
      onSaveCompany(restoredComp);

      setRestoreProgress(60);
      setRestoreStepText(`Sincronizando ${sales.length} vendas e despesas em alta velocidade...`);

      // 6. Push to Supabase via server API and dbImportAllData
      const ownerId = currentUser ? (currentUser.owner_id || currentUser.id) : "";
      if (ownerId && isSupabaseConfigured()) {
        try {
          await dbImportAllData(ownerId, {
            ...parsed,
            sales,
            vendas: sales,
            pedidos: sales,
            produtos,
            expenses,
            gastos_mensais,
            clientes,
            sub_usuarios,
            vendas_rapidas_itens,
            company_profile: restoredComp,
            company_logo: restoredComp.logo,
            empresa: restoredComp,
            goals,
            cash_register: cash_register_state,
            localStorageDump: dumpCandidate
          });
        } catch (e) {
          console.warn("dbImportAllData error notice:", e);
        }
      }

      setRestoreProgress(90);
      setRestoreStepText("Atualizando telas e interface em tempo real...");

      // 7. Refresh all system data across all tabs immediately
      if (onRefreshData) {
        await onRefreshData(currentUser || undefined, false, true);
      }

      // 8. Dispatch custom events so all views, modals, and terminals update
      window.dispatchEvent(new CustomEvent("backup_restored_sync", { detail: parsed }));
      window.dispatchEvent(new CustomEvent("cloud_backups_updated"));
      window.dispatchEvent(new CustomEvent("products_updated"));
      window.dispatchEvent(new CustomEvent("sales_updated"));
      window.dispatchEvent(new CustomEvent("expenses_updated"));
      window.dispatchEvent(new CustomEvent("clients_updated"));
      window.dispatchEvent(new Event("storage"));

      // 9. Reload attendants list if on that sub-tab
      loadAttendantsList();
      fetchCloudBackups();

      clearInterval(timerInterval);
      setRestoreProgress(100);
      setRestoreCountdown(0);
      setRestoreStepText("✅ Restauração finalizada com sucesso!");

      await new Promise(res => setTimeout(res, 500));

      setBackupSuccessMsg(`✅ Backup restaurado com sucesso! Logotipo da empresa e dados (${sales.length} vendas, ${produtos.length} produtos, ${clientes.length} clientes, ${sub_usuarios.length} sub-usuários) ativos de imediato.`);
      setBackupPreview(null);
    } catch (err: any) {
      clearInterval(timerInterval);
      console.error("Erro na restauração:", err);
      setBackupError("Falha ao restaurar backup: " + (err.message || err));
    } finally {
      setIsConfirmingRestore(false);
    }
  };

  const handleExportLocalStorageBackup = () => {
    try {
      const backup: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("NUCLEO_")) {
          const val = localStorage.getItem(key);
          if (val !== null) backup[key] = val;
        }
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup_sistema_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  const [showSqlScriptModal, setShowSqlScriptModal] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  const supabaseSqlScript = `-- SCRIPT SQL PARA ESTRUTURA DO NUCLEO POS NO SUPABASE

CREATE TABLE IF NOT EXISTS company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  trading_name TEXT,
  phone TEXT,
  cep TEXT,
  address TEXT,
  number TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  cnpj_cpf TEXT,
  logo TEXT,
  pix_key TEXT,
  business_hours JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caixa_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'FECHADO',
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  valor_fechamento NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessoes_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  operador TEXT,
  data TEXT,
  hora_abertura TEXT,
  hora_fechamento TEXT,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  valor_fechamento_calculado NUMERIC(12,2) DEFAULT 0,
  valor_fechamento_real NUMERIC(12,2) DEFAULT 0,
  diferenca NUMERIC(12,2) DEFAULT 0,
  total_vendas NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'ABERTO',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meus_dados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

  const handleCopySqlScript = () => {
    try {
      navigator.clipboard.writeText(supabaseSqlScript);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 3000);
    } catch (e) {}
  };

  const handleRestoreCloudItem = (item: BackupCloudItem) => {
    setBackupError(null);
    setBackupSuccessMsg(null);
    try {
      const rawText = item.descricao;
      if (!rawText) {
        alert("Este backup em nuvem não possui conteúdo de dados válido.");
        return;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        alert("JSON do backup em nuvem corrompido.");
        return;
      }

      const source = (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) ? parsed.data : 
                     (parsed.backup && typeof parsed.backup === "object" && !Array.isArray(parsed.backup)) ? parsed.backup : parsed;

      const dump = source.localStorageDump || parsed.localStorageDump || null;
      let compCandidate = source.company_profile || source.empresa || parsed.company_profile || parsed.empresa || null;
      if (!compCandidate && dump && dump["NUCLEO_COMPANY_PROFILE"]) {
        try {
          compCandidate = JSON.parse(dump["NUCLEO_COMPANY_PROFILE"]);
        } catch (e) {}
      }

      let logoCandidate: string | null = source.company_logo || parsed.company_logo || compCandidate?.logo || null;
      if (!logoCandidate && dump && dump["NUCLEO_COMPANY_LOGO"]) {
        logoCandidate = dump["NUCLEO_COMPANY_LOGO"];
      }

      const compProfile: CompanyProfile = {
        tradingName: compCandidate?.tradingName || compCandidate?.trading_name || compCandidate?.nome || "Empresa Restaurada",
        phone: compCandidate?.phone || compCandidate?.telefone || "",
        cep: compCandidate?.cep || "",
        address: compCandidate?.address || compCandidate?.endereco || "",
        number: compCandidate?.number || compCandidate?.numero || "",
        neighborhood: compCandidate?.neighborhood || compCandidate?.bairro || "",
        city: compCandidate?.city || compCandidate?.cidade || "",
        state: compCandidate?.state || compCandidate?.estado || compCandidate?.uf || "",
        cnpjCpf: compCandidate?.cnpjCpf || compCandidate?.cnpj_cpf || "",
        logo: logoCandidate,
        pixKey: compCandidate?.pixKey || compCandidate?.pix_key || "",
        businessHours: compCandidate?.businessHours || compCandidate?.business_hours || undefined
      };

      const salesArr = Array.isArray(source) ? source : (source.sales || source.vendas || source.pedidos || parsed.sales || parsed.vendas || parsed.pedidos || []);
      const prodArr = source.produtos || source.products || parsed.produtos || parsed.products || [];
      const clientArr = source.clientes || source.clients || parsed.clientes || parsed.clients || [];
      const expArr = source.expenses || source.despesas || source.gastos || parsed.expenses || parsed.despesas || [];
      const subUsersArr = source.sub_usuarios || source.users || source.sub_users || parsed.sub_usuarios || parsed.users || [];
      const billsArr = source.gastos_mensais || source.faturas || parsed.gastos_mensais || [];
      const remsArr = source.custom_reminders || source.reminders || parsed.custom_reminders || [];

      const sizeInBytes = item.valor || rawText.length;
      const sizeStr = sizeInBytes > 1024 * 1024
        ? `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(sizeInBytes / 1024).toFixed(1)} KB`;

      setBackupPreview({
        fileName: item.titulo || "backup_nuvem.json",
        fileSize: sizeStr,
        exportedAt: item.created_at || null,
        companyName: compProfile.tradingName,
        companyLogo: logoCandidate,
        phone: compProfile.phone,
        cnpjCpf: compProfile.cnpjCpf,
        city: compProfile.city,
        state: compProfile.state,
        address: compProfile.address,
        salesCount: salesArr.length,
        productsCount: prodArr.length,
        clientsCount: clientArr.length,
        expensesCount: expArr.length,
        subUsersCount: subUsersArr.length,
        billsCount: billsArr.length,
        remindersCount: remsArr.length,
        rawParsedData: parsed,
        restoredCompanyProfile: compProfile
      });
    } catch (err: any) {
      alert("Falha ao analisar backup da nuvem: " + (err.message || err));
    }
  };

  const handleDownloadCloudItem = (item: BackupCloudItem) => {
    try {
      if (!item.descricao) {
        alert("Conteúdo indisponível para download.");
        return;
      }
      const blob = new Blob([item.descricao], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.titulo || "nexvolt_backup.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao baixar arquivo da nuvem.");
    }
  };

  const handleDeleteCloudItem = async (itemId: string) => {
    if (!confirm("Tem certeza que deseja apagar este arquivo de backup salvo na nuvem?")) return;
    try {
      try {
        await fetch(`/api/backups/${itemId}`, { method: "DELETE" });
      } catch (e) {}

      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("meus_dados").delete().eq("id", itemId);
      }

      setBackupSuccessMsg("Arquivo de backup removido da nuvem.");
      setTimeout(() => setBackupSuccessMsg(null), 4000);
      fetchCloudBackups();
    } catch (err: any) {
      alert("Erro ao excluir backup da nuvem: " + (err.message || err));
    }
  };

  const [loadingCep, setLoadingCep] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfileFromSupabase = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || currentUser?.id;
      if (!userId) return;

      setLoadingProfile(true);
      try {
        const { data, error } = await supabase
          .from("company_profile")
          .select("*")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Erro ao carregar do Supabase:", error);
        }

        if (data) {
          const { cleanBusinessHours, extractedSettings } = extractSettingsFromBusinessHours(data.business_hours);
          setTradingName(data.trading_name || "");
          setPhone(data.phone || "");
          setCep(data.cep || "");
          setAddress(data.address || "");
          setNumber(data.number || "");
          setNeighborhood(data.neighborhood || "");
          setCity(data.city || "");
          setState(data.state || "");
          setCnpjCpf(data.cnpj_cpf || "");
          setLogo(data.logo || data.logo_url || null);
          setPixKey(data.pix_key || "");
          if (cleanBusinessHours) setBusinessHours(cleanBusinessHours);
          if (extractedSettings.dailyAutoBackupEnabled !== undefined) {
            setDailyAutoBackupEnabled(extractedSettings.dailyAutoBackupEnabled);
          }
          if (extractedSettings.dailyAutoBackupMode) {
            setDailyAutoBackupMode(extractedSettings.dailyAutoBackupMode);
          }
          if (extractedSettings.dailyAutoBackupTime) {
            setDailyAutoBackupTime(extractedSettings.dailyAutoBackupTime);
          }
          if (extractedSettings.dailyAutoBackupUseClosingTime !== undefined) {
            setDailyAutoBackupUseClosingTime(extractedSettings.dailyAutoBackupUseClosingTime);
          }
          if (extractedSettings.cashClosingReminderEnabled !== undefined) {
            setCashClosingReminderEnabled(extractedSettings.cashClosingReminderEnabled);
          }
          if (extractedSettings.cashClosingReminderTime !== undefined) {
            setCashClosingReminderTime(extractedSettings.cashClosingReminderTime);
          }
          if (extractedSettings.cashClosingReminderMessage !== undefined) {
            setCashClosingReminderMessage(extractedSettings.cashClosingReminderMessage);
          }

          onSaveCompany({
            ...company,
            tradingName: data.trading_name || "",
            phone: data.phone || "",
            cep: data.cep || "",
            address: data.address || "",
            number: data.number || "",
            neighborhood: data.neighborhood || "",
            city: data.city || "",
            state: data.state || "",
            cnpjCpf: data.cnpj_cpf || "",
            logo: data.logo || data.logo_url || null,
            pixKey: data.pix_key || "",
            ...extractedSettings,
            businessHours: cleanBusinessHours || defaultBusinessHours
          });
        }
      } catch (err: any) {
        console.error("Erro ao carregar perfil do Supabase:", err);
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfileFromSupabase();
  }, [currentUser?.id]);

  useEffect(() => {
    if (loadingProfile) return;
    if (!currentUser) return;
    
    if (lastLoadedUserRef.current !== currentUser.id) {
      lastLoadedUserRef.current = currentUser.id;
      let initialProfile = (company && company.tradingName) ? company : null;
      if (!initialProfile) {
        try {
          const s = localStorage.getItem("NUCLEO_COMPANY_PROFILE");
          if (s) {
            const p = JSON.parse(s);
            if (p && p.tradingName) initialProfile = p;
          }
        } catch (e) {}
      }

      if (initialProfile && initialProfile.tradingName) {
        setTradingName(initialProfile.tradingName || "");
        setPhone(initialProfile.phone || "");
        setCep(initialProfile.cep || "");
        setAddress(initialProfile.address || "");
        setNumber(initialProfile.number || "");
        setNeighborhood(initialProfile.neighborhood || "");
        setCity(initialProfile.city || "");
        setState(initialProfile.state || "");
        setCnpjCpf(initialProfile.cnpjCpf || "");
        setLogo(initialProfile.logo || null);
        setPixKey(initialProfile.pixKey || "");
        setGoalsReminderEnabled(initialProfile.goalsReminderEnabled ?? false);
        setGoalsReminderTime(initialProfile.goalsReminderTime || "09:00");
        setOpeningTime(initialProfile.openingTime || "08:00");
        setClosingTime(initialProfile.closingTime || "18:00");
        setAutoCloseRegisterEnabled(initialProfile.autoCloseRegisterEnabled ?? false);
        setAutoBackupDownloadEnabled(initialProfile.autoBackupDownloadEnabled ?? true);
        setDailyAutoBackupEnabled(initialProfile.dailyAutoBackupEnabled ?? false);
        setDailyAutoBackupMode(initialProfile.dailyAutoBackupMode || "auto_save_and_download");
        setDailyAutoBackupTime(initialProfile.dailyAutoBackupTime || initialProfile.closingTime || "18:00");
        setDailyAutoBackupUseClosingTime(initialProfile.dailyAutoBackupUseClosingTime ?? true);
        setCashClosingReminderEnabled(initialProfile.cashClosingReminderEnabled ?? false);
        setCashClosingReminderTime(initialProfile.cashClosingReminderTime || "");
        setCashClosingReminderMessage(initialProfile.cashClosingReminderMessage || "Excelente dia de trabalho! O horário de encerramento do expediente foi atingido. Deseja realizar o fechamento do caixa e salvar seus relatórios antes de fechar o programa?");
        if (initialProfile.businessHours) {
          setBusinessHours(initialProfile.businessHours);
        } else {
          setBusinessHours(defaultBusinessHours);
        }
      }
    }
  }, [company, currentUser?.id, loadingProfile]);

  const applyBusinessHoursPreset = (presetType: string) => {
    let newHours: BusinessHours;
    if (presetType === "preset1") {
      newHours = {
        monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "06:00", closeTime: "14:00" },
        sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
      };
    } else if (presetType === "preset2") {
      newHours = {
        monday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "08:00", closeTime: "12:00" },
        sunday: { isOpen: false, openTime: "08:00", closeTime: "18:00" },
      };
    } else if (presetType === "preset3") {
      newHours = {
        monday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        tuesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        wednesday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        thursday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        friday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        saturday: { isOpen: true, openTime: "09:00", closeTime: "18:00" },
        sunday: { isOpen: false, openTime: "09:00", closeTime: "18:00" },
      };
    } else {
      newHours = {
        monday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        tuesday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        wednesday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        thursday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        friday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        saturday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
        sunday: { isOpen: true, openTime: "08:00", closeTime: "22:00" },
      };
    }
    setBusinessHours(newHours);
  };

  const handleDayToggle = (dayKey: keyof BusinessHours) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], isOpen: !prev[dayKey].isOpen },
    }));
  };

  const handleTimeChange = (dayKey: keyof BusinessHours, field: "openTime" | "closeTime", value: string) => {
    setBusinessHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value },
    }));
  };

  const handleCepChange = (val: string) => {
    const cleanStr = val.replace(/\D/g, "");
    if (cleanStr.length <= 8) {
      let formatted = cleanStr;
      if (cleanStr.length > 5) {
        formatted = `${cleanStr.slice(0, 5)}-${cleanStr.slice(5)}`;
      }
      setCep(formatted);
      if (cleanStr.length === 8) fetchAddressByCep(cleanStr);
    }
  };

  const fetchAddressByCep = async (cleanCep: string) => {
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data && !data.erro) {
        setAddress(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setState(data.uf || "");
      } else {
        alert("CEP não encontrado.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCep(false);
    }
  };

  const triggerCepSearch = () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) fetchAddressByCep(cleanCep);
  };

  const handlePhoneChange = (val: string) => {
    const numbersOnly = val.replace(/\D/g, "");
    if (numbersOnly.length <= 11) {
      let formatted = numbersOnly;
      if (numbersOnly.length > 2) formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2)}`;
      if (numbersOnly.length > 7) formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2, 7)}-${numbersOnly.slice(7)}`;
      setPhone(formatted);
    }
  };

  const processLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Selecione um arquivo de imagem válido.");
      return;
    }
    setUploadingLogo(true);
    try {
      const { compressImage, compressImageToBase64 } = await import("../utils/imageCompressor");
      const compressedFile = await compressImage(file, 400, 400, 0.75);
      
      // Criar hash/versão baseada em tempo para evitar cache stale
      const logoVersion = Date.now().toString();
      
      let publicUrl: string | null = null;
      const { isSupabaseConfigured, dbUploadLogo } = await import("../supabase");
      if (isSupabaseConfigured()) {
        try {
          const uploadPromise = dbUploadLogo(compressedFile);
          const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error("Timeout upload logo")), 8000)
          );
          publicUrl = await Promise.race([uploadPromise, timeoutPromise]) as string | null;
        } catch (uploadErr) {
          console.warn("Supabase logo upload timeout or error, using base64 fallback:", uploadErr);
        }
      }

      const finalLogo = publicUrl || await compressImageToBase64(file, 400, 400, 0.75);
      
      setLogo(finalLogo);

      // Salvar no IndexedDB com timestamp para gerenciamento de cache
      const { setIndexedDbItem } = await import("../utils/indexedDb");
      await setIndexedDbItem("NUCLEO_COMPANY_LOGO", {
        data: finalLogo,
        updatedAt: logoVersion
      });

      // Salvar também no LocalStorage como backup imediato
      localStorage.setItem("NUCLEO_COMPANY_LOGO_VERSION", logoVersion);

    } catch (err: any) {
      console.error("Erro ao processar imagem:", err);
      alert("Erro ao processar imagem: " + (err.message || err));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!tradingName.trim()) {
      alert("Por favor, preencha o Nome Fantasia da empresa.");
      return;
    }

    setSavingProfile(true);
    const updated: CompanyProfile = {
      tradingName: tradingName.trim(),
      phone: phone.trim(),
      cep: cep.trim(),
      address: address.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim(),
      cnpjCpf: cnpjCpf.trim(),
      logo: logo,
      pixKey: pixKey.trim(),
      goalsReminderEnabled: goalsReminderEnabled,
      goalsReminderTime: goalsReminderTime,
      openingTime: openingTime,
      closingTime: closingTime,
      autoCloseRegisterEnabled: autoCloseRegisterEnabled,
      autoBackupDownloadEnabled: autoBackupDownloadEnabled,
      dailyAutoBackupEnabled: dailyAutoBackupEnabled,
      dailyAutoBackupMode: dailyAutoBackupMode,
      dailyAutoBackupTime: dailyAutoBackupTime,
      dailyAutoBackupUseClosingTime: dailyAutoBackupUseClosingTime,
      businessHours: businessHours,
      cashClosingReminderEnabled: cashClosingReminderEnabled,
      cashClosingReminderTime: cashClosingReminderTime,
      cashClosingReminderMessage: cashClosingReminderMessage,
    };

    try {
      const supabaseClient = getSupabase();
      if (!supabaseClient) {
        throw new Error("Cliente Supabase não inicializado.");
      }

      const userId = currentUser?.owner_id || currentUser?.id;
      if (!userId) {
        throw new Error("Nenhum ID de usuário identificado.");
      }

      // Ensure user exists in public.users for FK consistency
      try {
        await supabaseClient.from("users").upsert({
          id: userId,
          name: currentUser?.name || tradingName.trim(),
          username: currentUser?.username || "admin",
          email: currentUser?.email || `${userId}@sistema.local`,
          password: currentUser?.password || ""
        }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) {}

      // Refresh global state
      onSaveCompany(updated);
      
      // Persistence to Supabase
      await dbSaveCompanyProfile(userId, updated);
      
      // Sync and toast
      if (onRefreshData) {
        await onRefreshData(currentUser || undefined, true);
      }

      setSavingProfile(false);
      alert('Dados da empresa sincronizados com sucesso!');
      
      // REDIRECT: Go straight to "Tela de Descanso" (Standby Screen) after saving
      if (onGoToStandby) {
        onGoToStandby();
      }
    } catch (error: any) {
      console.error('Erro ao salvar dados da empresa:', error?.message || error);
      setSavingProfile(false);
      alert('Erro ao salvar dados: ' + (error?.message || 'Falha na conexão.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTestCashClosingReminder = () => {
    window.dispatchEvent(new CustomEvent("TEST_CASH_CLOSING_REMINDER"));
    setStatusMessage("Notificação agradável de teste disparada na tela! ✨");
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleSaveDailyBackupConfig = async (overrides?: Partial<CompanyProfile>) => {
    setSavingDailyBackupConfig(true);
    setBackupError(null);
    try {
      const updatedProfile: CompanyProfile = {
        ...company,
        tradingName: tradingName.trim() || company.tradingName,
        phone: phone.trim(),
        cep: cep.trim(),
        address: address.trim(),
        number: number.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim(),
        cnpjCpf: cnpjCpf.trim(),
        logo: logo,
        pixKey: pixKey.trim(),
        goalsReminderEnabled,
        goalsReminderTime,
        openingTime,
        closingTime,
        autoCloseRegisterEnabled,
        autoBackupDownloadEnabled,
        dailyAutoBackupEnabled,
        dailyAutoBackupMode,
        dailyAutoBackupTime,
        dailyAutoBackupUseClosingTime,
        businessHours,
        cashClosingReminderEnabled,
        cashClosingReminderTime,
        cashClosingReminderMessage,
        ...overrides,
      };
      onSaveCompany(updatedProfile);
      setBackupSuccessMsg("✅ Configuração de Backup Automático Diário salva e sincronizada!");
      setTimeout(() => setBackupSuccessMsg(null), 4500);
    } catch (err: any) {
      setBackupError("Erro ao salvar configuração de backup: " + (err?.message || err));
    } finally {
      setSavingDailyBackupConfig(false);
    }
  };

  const handleRunDailyBackupNow = async () => {
    if (!currentUser) {
      alert("Você precisa estar logado para gerar o backup.");
      return;
    }
    setRunningDailyBackupNow(true);
    setBackupError(null);
    setBackupSuccessMsg(null);
    try {
      const ownerId = currentUser.owner_id || currentUser.id;
      const shouldDownload = dailyAutoBackupMode !== "local_only";
      const snap = await runDailyAutoBackup({
        ownerId,
        companyName: tradingName || company.tradingName || "empresa",
        mode: dailyAutoBackupMode,
        triggerDownload: shouldDownload,
        syncToCloud: true,
      });
      if (!snap) {
        setBackupError("Não foi possível gerar o snapshot diário.");
        return;
      }
      await loadLocalDailyBackups();
      fetchCloudBackups();
      setBackupSuccessMsg(
        shouldDownload
          ? `Backup diário "${snap.fileName}" salvo localmente e baixado com sucesso!`
          : `Backup diário "${snap.fileName}" salvo localmente no navegador (IndexedDB)!`
      );
      if (addToast) {
        addToast(
          shouldDownload
            ? `💾 Backup Diário gerado e baixado: ${snap.fileName}`
            : `💾 Backup Diário salvo localmente no navegador!`,
          "success"
        );
      }
      setTimeout(() => setBackupSuccessMsg(null), 6000);
    } catch (err: any) {
      setBackupError("Falha ao executar backup diário: " + (err?.message || err));
    } finally {
      setRunningDailyBackupNow(false);
    }
  };

  const handleTestDailyBackupNotification = () => {
    window.dispatchEvent(new CustomEvent("TEST_DAILY_AUTO_BACKUP"));
    setBackupSuccessMsg("Notificação de Backup Automático Diário disparada para visualização!");
    setTimeout(() => setBackupSuccessMsg(null), 4000);
  };

  return (
    <div className="bg-brand-card border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 relative w-full max-w-none">
      {/* 📋 HEADER DE TÍTULO */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-brand-magenta" />
            Configurações e Gestão da Empresa
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Organize o perfil da empresa, horários de expediente, abertura de caixa, equipe, backups e lembretes em um só lugar.
          </p>
        </div>

        {statusMessage && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-fade-in shrink-0">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* 🏢 SEÇÃO 1: DADOS CADASTRAIS E PERFIL DA EMPRESA */}
      <div className="space-y-4 bg-slate-950/40 border border-slate-850 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-brand-magenta/10 border border-brand-magenta/30 text-brand-magenta">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">1. Dados Cadastrais & Perfil da Empresa</h3>
            <p className="text-[11px] text-slate-400">Informações principais e logotipo usados nos relatórios e documentos.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Inputs em Grid Compacto de 4 Linhas */}
          <div className="xl:col-span-8">
            <div className="grid grid-cols-12 gap-2.5 sm:gap-3">
              {/* Linha 1: Nome Fantasia (7 colunas) + CNPJ/CPF (5 colunas) */}
              <div className="col-span-12 sm:col-span-7 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  Nome Fantasia <span className="text-brand-magenta">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ar e Clima Assistência Técnica"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="col-span-12 sm:col-span-5 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  CNPJ ou CPF <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: 00.000.000/0001-00"
                  value={cnpjCpf}
                  onChange={(e) => setCnpjCpf(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              {/* Linha 2: Telefone (4 colunas) + CEP (3 colunas) + Chave PIX (5 colunas) */}
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Telefone de Contato
                </label>
                <input
                  type="text"
                  placeholder="Ex: (11) 98888-7777"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="col-span-12 sm:col-span-3 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  CEP <span className="text-slate-500 font-normal">(Busca)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="01311-200"
                    value={cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 pl-3 pr-8 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={triggerCepSearch}
                    disabled={loadingCep}
                    title="Buscar endereço por CEP"
                    className="absolute right-1 top-1 bottom-1 px-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded flex items-center justify-center cursor-pointer transition-colors"
                  >
                    {loadingCep ? <RefreshCw className="h-3 w-3 animate-spin text-brand-cyan" /> : <Search className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <div className="col-span-12 sm:col-span-5 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Chave PIX da Empresa
                </label>
                <input
                  type="text"
                  placeholder="Ex: CNPJ, E-mail, Celular ou Chave"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              {/* Linha 3: Logradouro / Rua (7 colunas) + Número (2 colunas) + Bairro (3 colunas) */}
              <div className="col-span-12 sm:col-span-7 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Logradouro / Rua
                </label>
                <input
                  type="text"
                  placeholder="Rua, Avenida, etc."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="col-span-12 sm:col-span-2 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Número
                </label>
                <input
                  type="text"
                  placeholder="Nº ou S/N"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="col-span-12 sm:col-span-3 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Bairro
                </label>
                <input
                  type="text"
                  placeholder="Bairro"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              {/* Linha 4: Cidade (9 colunas) + UF / Estado (3 colunas) */}
              <div className="col-span-12 sm:col-span-9 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Cidade
                </label>
                <input
                  type="text"
                  placeholder="Cidade"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all"
                />
              </div>

              <div className="col-span-12 sm:col-span-3 space-y-1">
                <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  UF / Estado
                </label>
                <input
                  type="text"
                  placeholder="UF (Ex: SP)"
                  value={state}
                  maxLength={4}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg h-9 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-magenta transition-all uppercase"
                />
              </div>
            </div>
          </div>

          {/* Logo uploader em caixa slim integrada */}
          <div className="xl:col-span-4 flex flex-col justify-between h-full space-y-1">
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block">
              Logotipo da Empresa
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files && processLogoFile(e.target.files[0])}
              className="hidden"
            />

            <div
              onClick={() => !uploadingLogo && fileInputRef.current?.click()}
              className="border border-dashed border-slate-700/80 hover:border-brand-magenta/60 bg-slate-950/60 rounded-xl p-3 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[175px] max-h-[195px] flex-1"
            >
              {uploadingLogo ? (
                <div className="space-y-2 py-3">
                  <RefreshCw className="h-6 w-6 mx-auto text-brand-magenta animate-spin" />
                  <p className="text-xs font-semibold text-slate-300">Otimizando e Enviando...</p>
                </div>
              ) : logo ? (
                <div className="space-y-2 w-full flex flex-col items-center justify-center">
                  <div className="max-w-[170px] max-h-24 mx-auto flex items-center justify-center">
                    <img src={logo} alt="Logo" className="max-h-20 max-w-full object-contain filter drop-shadow-md" />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLogo(null); }}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <X className="h-3 w-3" /> Remover Logotipo
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 py-2 text-slate-500">
                  <Upload className="h-6 w-6 mx-auto text-slate-500 group-hover:text-brand-magenta transition-colors" />
                  <p className="text-xs font-medium text-slate-300">Clique para Enviar Logotipo</p>
                  <p className="text-[10px] text-slate-500">PNG com fundo transparente recomendado</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 💾 Botão de Salvar da Seção 1 (Direto e Imediato) */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <p className="text-[11px] text-slate-400">
            {statusMessage ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> {statusMessage}
              </span>
            ) : (
              <span>Os dados cadastrais e o logotipo ficam gravados no sistema e na nuvem.</span>
            )}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={savingProfile}
            className="w-full sm:w-auto flex items-center justify-center gap-2 py-2 px-5 rounded-lg font-bold text-white bg-gradient-to-r from-brand-magenta to-brand-magenta/80 shadow-md shadow-brand-magenta/20 cursor-pointer hover:brightness-110 active:scale-95 transition-all text-xs shrink-0 disabled:opacity-50"
          >
            {savingProfile ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{savingProfile ? "Gravando Dados..." : "Salvar Dados da Empresa"}</span>
          </button>
        </div>
      </div>

      {/* ⏰ SEÇÃO 2: HORÁRIOS DE FUNCIONAMENTO & EXPEDIENTE */}
      <div className="space-y-6 bg-slate-950/40 border border-slate-850 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">2. Horários de Funcionamento & Expediente</h3>
            <p className="text-xs text-slate-400">Configure os horários de atendimento da sua empresa por dia da semana e o lembrete de encerramento.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Presets */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">Preenchimento Rápido (Selecione um Padrão):</span>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => applyBusinessHoursPreset("preset1")}
                className="py-2 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-all cursor-pointer"
              >
                Seg a Sex: 09h às 18h / Sáb: 06h às 14h
              </button>
              <button
                type="button"
                onClick={() => applyBusinessHoursPreset("preset2")}
                className="py-2 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-all cursor-pointer"
              >
                Seg a Sex: 08h às 18h / Sáb: 08h às 12h
              </button>
              <button
                type="button"
                onClick={() => applyBusinessHoursPreset("preset3")}
                className="py-2 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-all cursor-pointer"
              >
                Seg a Sáb: 09h às 18h / Dom: Fechado
              </button>
              <button
                type="button"
                onClick={() => applyBusinessHoursPreset("preset4")}
                className="py-2 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-all cursor-pointer"
              >
                Todos os dias: 08h às 22h
              </button>
            </div>
          </div>

          {/* Detailed Days */}
          <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-900">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">Personalização Detalhada por Dia:</span>
            {WEEKDAYS.map((day) => {
              const hoursForDay = businessHours[day.key] || { isOpen: false, openTime: "09:00", closeTime: "18:00" };
              return (
                <div key={day.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-900">
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <input
                      type="checkbox"
                      id={`day-${day.key}`}
                      checked={hoursForDay.isOpen}
                      onChange={() => handleDayToggle(day.key)}
                      className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-brand-magenta cursor-pointer"
                    />
                    <label htmlFor={`day-${day.key}`} className="text-xs font-semibold text-slate-200 cursor-pointer select-none">
                      {day.label}
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    {hoursForDay.isOpen ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Aberto</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/20">Fechado</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Início:</span>
                      <input
                        type="time"
                        value={hoursForDay.openTime}
                        disabled={!hoursForDay.isOpen}
                        onChange={(e) => handleTimeChange(day.key, "openTime", e.target.value)}
                        className="bg-slate-900 border border-slate-800 disabled:opacity-40 rounded-lg py-1 px-2.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Término:</span>
                      <input
                        type="time"
                        value={hoursForDay.closeTime}
                        disabled={!hoursForDay.isOpen}
                        onChange={(e) => handleTimeChange(day.key, "closeTime", e.target.value)}
                        className="bg-slate-900 border border-slate-800 disabled:opacity-40 rounded-lg py-1 px-2.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lembrete Agradável de Fechamento */}
          <div className="p-5 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/20 rounded-xl border border-amber-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-850">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                  <Sunset className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    Lembrete Agradável de Fechamento de Caixa
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Avisa os operadores quando o expediente terminar para conferir e fechar o caixa.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestCashClosingReminder}
                className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <BellRing className="h-4 w-4" />
                <span>Testar Notificação</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-850">
              <div className="space-y-0.5 pr-4">
                <span className="text-xs font-semibold text-slate-200 block">Ativar Lembrete de Fechamento de Caixa</span>
                <p className="text-[11px] text-slate-400">Exibe uma mensagem carinhosa quando o horário limite for atingido.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={cashClosingReminderEnabled}
                  onChange={(e) => setCashClosingReminderEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-900 border border-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-orange-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>

            {cashClosingReminderEnabled && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">Mensagem Agradável Exibida na Notificação</label>
                <textarea
                  rows={2}
                  value={cashClosingReminderMessage}
                  onChange={(e) => setCashClosingReminderMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 💵 SEÇÃO 3: CONTROLE E ABERTURA DO CAIXA */}
      <div className="space-y-6 bg-slate-950/40 border border-slate-850 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-magenta/10 border border-brand-magenta/30 text-brand-magenta">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">3. Controle e Abertura do Caixa (Equipe)</h3>
              <p className="text-xs text-slate-400">Gerencie o status atual do caixa compartilhado para todos os operadores.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
            Caixa Compartilhado
          </span>
        </div>

        {cashRegister?.currentSession ? (
          <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                Caixa Ativo e Aberto 🔓
              </span>
              <p className="text-xs text-slate-300">
                Operador: <strong className="text-white uppercase">{cashRegister.currentSession.operador}</strong>
              </p>
              <p className="text-xs text-slate-300">
                Troco Inicial: <strong className="text-brand-cyan font-mono">R$ {Number(cashRegister.currentSession.valorAbertura || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onCloseRegister) {
                  const confirmClose = window.confirm("Deseja fechar o caixa atual?");
                  if (confirmClose) {
                    const valor = prompt("Digite o valor físico encontrado em caixa:", "0.00");
                    if (valor !== null) {
                      const numericValue = parseFloat(valor) || 0;
                      const obs = prompt("Observações de encerramento:", "") || "";
                      onCloseRegister(numericValue, obs);
                    }
                  }
                }
              }}
              className="py-2.5 px-5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl shadow-lg cursor-pointer transition-all"
            >
              Encerrar Caixa 🔒
            </button>
          </div>
        ) : (
          <div className="p-5 bg-slate-950 rounded-xl border border-slate-850 space-y-4">
            <p className="text-xs text-slate-300">O caixa está atualmente <strong className="text-rose-400">FECHADO</strong>. Insira os dados para iniciar o expediente.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Responsável pela Abertura</label>
                <input
                  type="text"
                  placeholder="Nome do operador"
                  value={openingOperatorName}
                  onChange={(e) => setOpeningOperatorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Fundo de Troco Inicial (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={openingFloatValue}
                  onChange={(e) => setOpeningFloatValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-brand-cyan font-mono"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const val = Math.max(0, parseFloat(openingFloatValue) || 0);
                const op = openingOperatorName.trim() || currentUser?.name || "Operador Principal";
                if (onOpenRegister) {
                  onOpenRegister(val, op);
                  setOpeningFloatValue("");
                }
              }}
              className="py-2.5 px-6 bg-gradient-to-r from-brand-magenta to-pink-600 hover:brightness-110 text-white font-extrabold text-xs uppercase rounded-xl cursor-pointer shadow-md"
            >
              Confirmar Abertura do Caixa 🚀
            </button>
          </div>
        )}
      </div>

      {/* 👥 SEÇÃO 4: EQUIPE & ATENDENTES */}
      <div className="space-y-4 bg-slate-950/40 border border-slate-850 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                4. Atendentes Cadastrados & Auditoria de Exclusões
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Admin</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Gerencie operadores, visualize relatórios de produção e auditoria detalhada de itens apagados.
              </p>
            </div>
          </div>
          {onNavigateToAtendentes && (
            <button
              type="button"
              onClick={onNavigateToAtendentes}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 border border-cyan-400/30 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap transition-all"
            >
              <UserCheck className="h-4 w-4" />
              <span>Ver Relatório de Atendentes</span>
            </button>
          )}
        </div>
      </div>

      {/* 🔔 SEÇÃO 5: NOTIFICAÇÕES, ALERTAS & LEMBRETES */}
      <div className="space-y-6 bg-slate-950/40 border border-slate-850 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider">5. Preferências de Notificação & Lembretes</h3>
            <p className="text-xs text-slate-400">Ative sons de alerta, metas diárias e gerencie seus lembretes personalizados.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sounds & Goals */}
          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-white block">Sons de Alerta e Caixa</span>
                <span className="text-[11px] text-slate-400 block">Toque de sino para novas vendas e metas.</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleSound?.(!soundEnabled)}
                className={`py-2 px-4 rounded-xl border font-bold text-xs uppercase transition-all flex items-center gap-2 cursor-pointer ${
                  soundEnabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <span>{soundEnabled ? "Ativado" : "Desativado"}</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-white block">Lembrete Diário de Metas</span>
                  <span className="text-[11px] text-slate-400 block">Exibe um alerta sobre o andamento da meta diária.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalsReminderEnabled(!goalsReminderEnabled)}
                  className={`py-2 px-4 rounded-xl border font-bold text-xs uppercase transition-all flex items-center gap-2 cursor-pointer ${
                    goalsReminderEnabled ? "bg-brand-cyan/20 border-brand-cyan/40 text-brand-cyan" : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  <span>{goalsReminderEnabled ? "Ativado" : "Desativado"}</span>
                </button>
              </div>

              {goalsReminderEnabled && (
                <div className="pt-3 border-t border-slate-900 flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300">Horário preferencial:</span>
                  <input
                    type="time"
                    value={goalsReminderTime}
                    onChange={(e) => setGoalsReminderTime(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5 text-xs text-brand-cyan font-mono font-bold focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Custom Reminders */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col space-y-4">
            <div className="border-b border-slate-900 pb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">📅 Lembretes Personalizados</span>
              <span className="text-[10px] font-mono font-semibold bg-brand-magenta/15 text-brand-magenta px-2 py-0.5 rounded border border-brand-magenta/20">
                {reminders.filter(r => !r.completed).length} Ativos
              </span>
            </div>

            <div className="space-y-3 bg-slate-900/60 p-3 rounded-xl border border-slate-850">
              <input
                type="text"
                placeholder="Assunto do lembrete (Ex: Manutenção preventiva)"
                value={newReminderTitle}
                onChange={(e) => setNewReminderTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <input
                  type="date"
                  value={newReminderDate}
                  onChange={(e) => setNewReminderDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-300 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddReminder}
                  className="py-2 px-4 bg-brand-magenta hover:bg-brand-magenta/90 text-white text-xs font-bold uppercase rounded-lg shadow cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
              {reminders.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-900 rounded-lg">
                  Nenhum lembrete cadastrado.
                </div>
              ) : (
                reminders.map((rem) => (
                  <div key={rem.id} className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleReminderCompleted(rem.id)}
                        className={`w-4 h-4 rounded flex items-center justify-center border cursor-pointer ${
                          rem.completed ? "bg-brand-cyan border-brand-cyan text-slate-950" : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        {rem.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <span className={`text-xs font-semibold text-slate-200 ${rem.completed ? "line-through text-slate-500" : ""}`}>
                        {rem.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteReminder(rem.id)}
                      className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 🛡️ SEÇÃO 6: CONTROLE DE BACKUP DO SISTEMA (CENTRAL DE SEGURANÇA) */}
      <div className="space-y-6 bg-slate-950/70 border border-slate-850 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-850 pb-5">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-cyan/20 via-slate-900 to-brand-magenta/20 border border-brand-cyan/40 text-brand-cyan shadow-lg shadow-cyan-950/50">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                CONTROLE DE BACKUP DO SISTEMA (CENTRAL DE SEGURANÇA)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Proteja suas informações de vendas, clientes, despesas, faturas fixas e dados cadastrais exportando ou restaurando cópias consolidadas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSqlScriptModal(true)}
              className="py-2 px-3.5 rounded-xl border border-brand-cyan/40 hover:bg-brand-cyan/10 text-brand-cyan text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Script SQL Nuvem</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (onRefreshData) await onRefreshData(currentUser || undefined, false, true);
                fetchCloudBackups();
                setBackupSuccessMsg("Sincronização com o Supabase concluída!");
                setTimeout(() => setBackupSuccessMsg(null), 4000);
              }}
              className="py-2 px-3.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        <input
          ref={backupFileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFileChange}
          className="hidden"
        />

        {backupSuccessMsg && (
          <div className="bg-emerald-950/70 border border-emerald-500/40 rounded-xl p-3.5 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-md">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{backupSuccessMsg}</span>
          </div>
        )}

        {backupError && (
          <div className="bg-red-950/70 border border-red-500/40 rounded-xl p-3.5 text-red-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-md">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{backupError}</span>
          </div>
        )}

        {/* 🕒 0. BACKUP AUTOMÁTICO DIÁRIO (FIM DE EXPEDIENTE) */}
        {(() => {
          const todayStr = getTodayLocalDateStr();
          const doneToday = dailyBackupMeta?.date === todayStr;
          const effectiveScheduleTime = getEffectiveDailyBackupTime({
            closingTime,
            businessHours,
            dailyAutoBackupTime,
            dailyAutoBackupUseClosingTime,
          });

          return (
            <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 border-2 border-emerald-500/30 p-5 sm:p-7 space-y-5 shadow-2xl">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-black text-white uppercase tracking-wider">
                        Backup Automático Diário
                      </h4>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                          dailyAutoBackupEnabled
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {dailyAutoBackupEnabled ? `Ativo • ${effectiveScheduleTime}` : "Desativado"}
                      </span>
                      {doneToday && (
                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Realizado Hoje ({new Date(dailyBackupMeta!.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Ao final do dia, o sistema gera e salva o arquivo de backup localmente no navegador ou dispara uma notificação destacada para garantir a exportação do histórico.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center gap-3 cursor-pointer select-none shrink-0 bg-slate-950/90 px-4 py-2.5 rounded-xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-200">
                    {dailyAutoBackupEnabled ? "Ativado" : "Ativar Backup Diário"}
                  </span>
                  <input
                    type="checkbox"
                    checked={dailyAutoBackupEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setDailyAutoBackupEnabled(next);
                      handleSaveDailyBackupConfig({ dailyAutoBackupEnabled: next });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 border border-slate-700 rounded-full relative peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-teal-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>

              {/* Comportamento ao Final do Dia */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Ação ao Final do Dia
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setDailyAutoBackupMode("auto_save_and_download")}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                      dailyAutoBackupMode === "auto_save_and_download"
                        ? "bg-emerald-500/15 border-emerald-400/60 shadow-lg shadow-emerald-950/40"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                        <Download className="h-3.5 w-3.5 text-emerald-400" />
                        Salvar Local + Baixar .json
                      </span>
                      {dailyAutoBackupMode === "auto_save_and_download" && (
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Gera o arquivo completo, grava cópia local no navegador e inicia o download automático do .json.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDailyAutoBackupMode("local_only")}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                      dailyAutoBackupMode === "local_only"
                        ? "bg-cyan-500/15 border-cyan-400/60 shadow-lg shadow-cyan-950/40"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-brand-cyan" />
                        Salvar Local + Notificar
                      </span>
                      {dailyAutoBackupMode === "local_only" && (
                        <CheckCircle className="h-4 w-4 text-brand-cyan shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Salva a cópia diária localmente no navegador e notifica com botão rápido para baixar quando quiser.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDailyAutoBackupMode("notify_only")}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                      dailyAutoBackupMode === "notify_only"
                        ? "bg-amber-500/15 border-amber-400/60 shadow-lg shadow-amber-950/40"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                        <BellRing className="h-3.5 w-3.5 text-amber-400" />
                        Notificação de Exportação
                      </span>
                      {dailyAutoBackupMode === "notify_only" && (
                        <CheckCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Dispara um alerta interativo no fim do expediente para o usuário exportar e baixar o arquivo .json.
                    </p>
                  </button>
                </div>
              </div>

              {/* Horário e Controles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center bg-slate-950/80 border border-slate-850 rounded-2xl p-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={dailyAutoBackupUseClosingTime}
                      onChange={(e) => setDailyAutoBackupUseClosingTime(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      Usar horário de fechamento do expediente ({getEffectiveDailyBackupTime({ closingTime, businessHours, dailyAutoBackupUseClosingTime: true })})
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Horário programado:</span>
                    <input
                      type="time"
                      value={dailyAutoBackupUseClosingTime ? effectiveScheduleTime : dailyAutoBackupTime}
                      disabled={dailyAutoBackupUseClosingTime}
                      onChange={(e) => setDailyAutoBackupTime(e.target.value)}
                      className="bg-slate-900 border border-slate-800 disabled:opacity-50 rounded-lg py-1.5 px-3 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center lg:justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleTestDailyBackupNotification}
                    className="py-2 px-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    <span>Testar Notificação</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRunDailyBackupNow}
                    disabled={runningDailyBackupNow}
                    className="py-2 px-3.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-brand-cyan text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {runningDailyBackupNow ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span>Executar Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveDailyBackupConfig()}
                    disabled={savingDailyBackupConfig}
                    className="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {savingDailyBackupConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    <span>Salvar Preferência</span>
                  </button>
                </div>
              </div>

              {/* Histórico Local (IndexedDB) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                    Cópias Automáticas Salvas Localmente ({dailyBackupHistory.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Retenção local dos últimos 7 dias no navegador
                  </span>
                </div>

                {dailyBackupHistory.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 font-mono bg-slate-950/60 border border-dashed border-slate-850 rounded-xl">
                    Nenhuma cópia diária salva localmente ainda. Ative acima ou clique em "Executar Agora".
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[180px] overflow-y-auto pr-1">
                    {dailyBackupHistory.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate font-mono">
                            {snap.fileName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {new Date(snap.timestamp).toLocaleString("pt-BR")} • {(snap.sizeBytes / 1024).toFixed(1)} KB • {snap.salesCount} vendas
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await downloadLocalDailyBackupSnapshot(snap.id);
                            if (ok && addToast) {
                              addToast(`Arquivo "${snap.fileName}" baixado com sucesso!`, "success");
                            }
                          }}
                          className="py-1.5 px-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                          title="Baixar arquivo JSON salvo localmente"
                        >
                          <Download className="h-3 w-3" />
                          <span>Baixar</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 1. SEÇÃO PRINCIPAL: ARQUIVO ÚNICO CONSOLIDADO (.JSON) */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-slate-800 hover:border-brand-magenta/40 transition-all p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-850 pb-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-magenta/15 border border-brand-magenta/30 text-brand-magenta text-[11px] font-black uppercase tracking-widest">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                <span>ARQUIVO ÚNICO CONSOLIDADO (.JSON)</span>
              </div>
              <h4 className="text-xl font-black text-white tracking-wide">
                Central de Backup e Restauração do Sistema
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Baixe um arquivo único contendo toda a base de dados do sistema ou selecione um arquivo <strong className="text-white font-mono">.json</strong> previamente salvo para restaurar instantaneamente clientes, produtos, todo o histórico de vendas, despesas, caixa e logotipo.
              </p>
            </div>

            {/* Badges / summary of what is included */}
            <div className="flex flex-wrap gap-2 lg:max-w-md">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                🏢 Dados da Empresa & Logo
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                🛒 Histórico de Vendas & Pedidos (Completo)
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                👥 Clientes
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                📦 Produtos & Estoque
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                💸 Despesas & Faturas Fixas
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                💼 Status do Caixa & Sessões
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                👤 Equipe & Atendentes
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                🎯 Metas & Lembretes
              </span>
            </div>
          </div>

          {/* TWO PROMINENT BUTTONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Button 1: BAIXAR BACKUP DO SISTEMA */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900/90 to-slate-950 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-wider">
                  <Download className="h-4 w-4" />
                  <span>Exportação Consolidada</span>
                </div>
                <h5 className="text-base font-extrabold text-white">
                  Exportar Backup Completo
                </h5>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Gera e baixa um arquivo único contendo todos os clientes, produtos, histórico total de vendas/pedidos, despesas, caixa e logotipo em Base64.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportBackup}
                disabled={exporting}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-brand-cyan hover:brightness-110 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-widest shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 transition-all"
              >
                {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 stroke-[2.5]" />}
                <span>BAIXAR BACKUP DO SISTEMA</span>
              </button>
            </div>

            {/* Button 2: CARREGAR / RESTAURAR BACKUP */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-pink-950/40 via-slate-900/90 to-slate-950 border border-brand-magenta/30 hover:border-brand-magenta transition-all shadow-lg flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-brand-magenta font-black text-xs uppercase tracking-wider">
                  <Upload className="h-4 w-4" />
                  <span>Restauração Segura</span>
                </div>
                <h5 className="text-base font-extrabold text-white">
                  Restaurar do Arquivo (.json)
                </h5>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Selecione o arquivo de backup para validar a integridade dos dados e restaurar com tela de confirmação no banco Supabase e no navegador.
                </p>
              </div>

              <button
                type="button"
                onClick={() => backupFileInputRef.current?.click()}
                disabled={importing || isConfirmingRestore}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-brand-magenta hover:brightness-110 active:scale-95 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-magenta/30 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 transition-all"
              >
                {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 stroke-[2.5]" />}
                <span>CARREGAR / RESTAURAR BACKUP</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. HISTÓRICO DE BACKUPS SALVOS NA NUVEM (SUPABASE) */}
        <div className="bg-slate-950/80 border border-slate-850 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-400">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  Histórico de Cópias Salvas na Nuvem
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {cloudBackups.length}
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  Cópias consolidadas armazenadas na nuvem para download ou restauração rápida entre estações de trabalho.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Nuvem Ativa
              </span>
              {loadingCloudBackups && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-cyan" />
              )}
            </div>
          </div>

          <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {cloudBackups.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-850 rounded-xl bg-slate-950">
                Nenhum arquivo de backup encontrado na nuvem. Ao clicar em "BAIXAR BACKUP DO SISTEMA", uma cópia também é sincronizada automaticamente na nuvem.
              </div>
            ) : (
              cloudBackups.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-400 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate font-mono">
                        {item.titulo}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {new Date(item.created_at).toLocaleString("pt-BR")}
                        {item.valor ? ` • ${(item.valor / 1024).toFixed(1)} KB` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestoreCloudItem(item)}
                      className="py-1 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-extrabold uppercase transition-all cursor-pointer"
                    >
                      RESTAURAR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCloudItem(item)}
                      title="Baixar Arquivo JSON"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-cyan hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCloudItem(item.id)}
                      title="Excluir Cópia da Nuvem"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 💾 FOOTER SAVE BUTTON */}
      <div className="pt-6 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={savingProfile}
          className="flex items-center gap-2 py-3 px-8 rounded-xl font-bold text-white bg-gradient-to-r from-brand-magenta to-brand-magenta/80 shadow-lg shadow-brand-magenta/20 cursor-pointer hover:brightness-110 active:scale-95 transition-all text-sm font-sans disabled:opacity-50"
        >
          {savingProfile ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span>{savingProfile ? "Salvando..." : "Salvar Registro de Empresa"}</span>
        </button>
      </div>

      {/* 📋 MODAL DE CONFIRMAÇÃO DE RESTAURAÇÃO DE BACKUP */}
      {backupPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-magenta/20 to-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Confirmar Restauração de Backup
                  </h3>
                  <p className="text-xs text-slate-400">
                    Revise os dados e o logotipo identificados antes de aplicar a restauração no sistema.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupPreview(null)}
                disabled={isConfirmingRestore}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* File Details Chip */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <FileCheck className="h-4 w-4 text-emerald-400" />
                <span>Arquivo: <strong className="text-white font-mono">{backupPreview.fileName}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                <span>Tamanho: <strong className="text-brand-cyan">{backupPreview.fileSize}</strong></span>
                {backupPreview.exportedAt && (
                  <span>Exportado em: <strong className="text-slate-300">{new Date(backupPreview.exportedAt).toLocaleDateString("pt-BR")}</strong></span>
                )}
              </div>
            </div>

            {/* Identified Company Profile & Logo Card */}
            <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-magenta" />
                  Perfil da Empresa Identificado
                </span>
                {backupPreview.companyLogo ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Logotipo Pronto
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    Sem Logotipo
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 pt-1">
                <div className="w-16 h-16 flex items-center justify-center shrink-0">
                  {backupPreview.companyLogo ? (
                    <img
                      src={backupPreview.companyLogo}
                      alt="Logo Empresa"
                      className="max-h-full max-w-full object-contain filter drop-shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center">
                      <Building2 className="h-7 w-7 text-slate-600" />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-white">
                    {backupPreview.companyName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    {backupPreview.cnpjCpf && <span>CNPJ/CPF: <strong className="text-slate-200">{backupPreview.cnpjCpf}</strong></span>}
                    {backupPreview.phone && <span>Tel: <strong className="text-slate-200">{backupPreview.phone}</strong></span>}
                    {(backupPreview.city || backupPreview.state) && (
                      <span>Cidade: <strong className="text-slate-200">{backupPreview.city} {backupPreview.state ? `- ${backupPreview.state}` : ""}</strong></span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Identified Data Grid */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Resumo dos Dados que Serão Restaurados
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                    <Package className="h-4 w-4" />
                    <span>Produtos</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.productsCount}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-pink-400 text-xs font-semibold">
                    <ShoppingCart className="h-4 w-4" />
                    <span>Vendas & Pedidos</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.salesCount}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <Users className="h-4 w-4" />
                    <span>Clientes</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.clientsCount}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <Receipt className="h-4 w-4" />
                    <span>Despesas</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.expensesCount}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold">
                    <UserCheck className="h-4 w-4" />
                    <span>Sub-usuários</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.subUsersCount}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
                    <Calendar className="h-4 w-4" />
                    <span>Contas / Lembretes</span>
                  </div>
                  <p className="text-lg font-bold text-white mt-1 font-mono">
                    {backupPreview.billsCount + backupPreview.remindersCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Informative Synchronicity Alert */}
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-white">Atualização Imediata em Tempo Real:</span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Ao confirmar, os dados e o logotipo serão salvos tanto no banco de dados Supabase quanto no navegador. O logotipo e todos os registros reaparecerão instantaneamente no topo esquerdo e em todas as abas, sem necessidade de reiniciar o navegador.
                </p>
              </div>
            </div>

            {/* Live Countdown & Progress Indicator Panel */}
            {isConfirmingRestore && (
              <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-brand-cyan/50 rounded-xl space-y-3 shadow-xl shadow-cyan-950/40 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-brand-cyan/15 rounded-lg border border-brand-cyan/30 text-brand-cyan animate-pulse">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider block">
                        Restauração em Andamento
                      </span>
                      <span className="text-[11px] text-brand-cyan font-medium">
                        {restoreStepText || "Sincronizando banco de dados e registros..."}
                      </span>
                    </div>
                  </div>

                  {/* Reloginho / Cronômetro Decrescente */}
                  <div className="flex items-center gap-2.5 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-brand-cyan/60 shadow-inner">
                    <Clock className="h-4 w-4 text-brand-cyan animate-spin" style={{ animationDuration: "3s" }} />
                    <div className="text-right">
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">
                        Tempo Estimado
                      </div>
                      <div className="text-base font-black font-mono text-emerald-400 leading-tight">
                        00:0{restoreCountdown}s
                      </div>
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso com Porcentagem */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>Progresso da Restauração</span>
                    <span className="text-brand-cyan font-bold">{restoreProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                    <div 
                      className="h-full bg-gradient-to-r from-brand-cyan via-teal-400 to-emerald-400 rounded-full transition-all duration-300 shadow-md shadow-cyan-500/50"
                      style={{ width: `${restoreProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBackupPreview(null)}
                disabled={isConfirmingRestore}
                className="py-2.5 px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs uppercase cursor-pointer transition-all disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isConfirmingRestore}
                className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:brightness-110 text-white font-extrabold text-xs uppercase shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isConfirmingRestore ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-brand-cyan" />
                    <span>Restaurando... (00:0{restoreCountdown}s)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Confirmar e Restaurar Dados</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📄 MODAL SCRIPT SQL NUVEM */}
      {showSqlScriptModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-cyan/15 border border-brand-cyan/30 text-brand-cyan">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Script SQL Nuvem (Estrutura Supabase)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Estrutura de tabelas para importação e restauração completa de dados no PostgreSQL/Supabase.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlScriptModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>SQL DDL - PostgreSQL / Supabase</span>
                <button
                  type="button"
                  onClick={handleCopySqlScript}
                  className="px-3 py-1 bg-brand-cyan/20 border border-brand-cyan/40 hover:bg-brand-cyan/30 text-brand-cyan rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{sqlCopied ? "Copiado!" : "Copiar Script SQL"}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 text-xs font-mono overflow-x-auto max-h-[320px] select-all leading-relaxed">
{supabaseSqlScript}
              </pre>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Este script é executado automaticamente pelo aplicativo no Supabase para garantir que todas as tabelas (`company_profile`, `caixa_status`, `sessoes_caixa`, `meus_dados`, etc.) existam.
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSqlScriptModal(false)}
                className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase cursor-pointer transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
