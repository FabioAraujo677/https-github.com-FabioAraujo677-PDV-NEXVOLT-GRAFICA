import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  RefreshCw, 
  Clock, 
  Search, 
  Infinity as InfinityIcon, 
  Sparkles, 
  UserX, 
  UserCheck, 
  Calendar,
  AlertCircle,
  Headphones,
  MessageSquare,
  Settings,
  Plus,
  Send,
  Lock,
  Unlock,
  Users,
  Check,
  Play,
  Volume2,
  UserPlus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  getSupabase, 
  dbGetSupportConfig, 
  dbSaveSupportConfig, 
  dbGetSupportFeedbacks, 
  dbSubmitAdminResponse 
} from "../supabase";
import { SupportConfig, SupportFeedback } from "../types";

export interface ProfileRecord {
  id: string;
  email?: string;
  name?: string;
  nome?: string;
  username?: string;
  status?: string;
  status_sistema?: string;
  status_assinatura?: string;
  plano?: string;
  plan?: string;
  trial_end?: string;
  data_expiracao?: string;
  created_at?: string;
  role?: string;
  cargo?: string;
  [key: string]: any;
}

export function AdminPanel({ isMasterUser }: { isMasterUser: boolean }) {
  // User Form states
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileRecord | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("admin");
  const [submittingForm, setSubmittingForm] = useState(false);

  // Tab and Search states
  const [activeTab, setActiveTab] = useState<"usuarios" | "suporte_mensagens" | "suporte_config">("usuarios");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "lifetime" | "trial">("all");

  // Data states
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Support states
  const [supportFeedbacks, setSupportFeedbacks] = useState<SupportFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [supportConfig, setSupportConfig] = useState<SupportConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "unanswered">("unanswered");

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    const client = getSupabase();
    if (!client) {
      setError("Cliente Supabase não está configurado.");
      setLoading(false);
      return;
    }

    try {
      // 1. Tabela users (fonte autoritativa de status e autenticação)
      const { data: usersData, error: usersErr } = await client
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      // 2. Tabela profiles (fonte complementar)
      const { data: profilesData } = await client
        .from("profiles")
        .select("*");

      const map = new Map<string, ProfileRecord>();

      if (profilesData && Array.isArray(profilesData)) {
        profilesData.forEach((p: any) => {
          if (p.id) map.set(p.id, p);
        });
      }

      if (usersData && Array.isArray(usersData)) {
        usersData.forEach((u: any) => {
          const existing = map.get(u.id);
          const isMaster = (u.email || existing?.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
          const rawStatus = (u.status || existing?.status || "ativo").toString().trim();
          const rawStatusSistema = (u.status_sistema || u.status || existing?.status_sistema || existing?.status || "ativo").toString().trim();
          const rawStatusAssinatura = (u.status_assinatura || u.status || existing?.status_assinatura || existing?.status || "ativo").toString().trim();

          map.set(u.id, {
            ...existing,
            ...u,
            id: u.id,
            email: u.email || existing?.email || "",
            name: u.name || u.nome || existing?.name || existing?.nome || "",
            username: u.username || existing?.username || "",
            status: isMaster ? "ativo" : rawStatus,
            status_sistema: isMaster ? "ativo" : rawStatusSistema,
            status_assinatura: isMaster ? "ativo" : rawStatusAssinatura,
            plano: isMaster ? "lifetime" : (u.plano || u.plan || existing?.plano || existing?.plan || "trial"),
            plan: isMaster ? "lifetime" : (u.plano || u.plan || existing?.plano || existing?.plan || "trial"),
            trial_end: isMaster ? null : (u.trial_end || u.data_expiracao || existing?.trial_end || existing?.data_expiracao || null),
            data_expiracao: isMaster ? null : (u.data_expiracao || u.trial_end || existing?.data_expiracao || existing?.trial_end || null),
            role: isMaster ? "master" : (u.role || existing?.role || "user")
          });
        });
      }

      // 3. Busca autoritativa direta no Supabase Auth via API se possível (para garantir e-mails reais)
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const authUsers = await res.json();
          if (authUsers && Array.isArray(authUsers)) {
            authUsers.forEach((au: any) => {
              const existing = map.get(au.id);
              const email = au.email || existing?.email || "";
              const isMaster = email.toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
              
              map.set(au.id, {
                ...existing,
                id: au.id,
                email: email,
                name: au.user_metadata?.name || au.user_metadata?.full_name || existing?.name || existing?.nome || "",
                created_at: au.created_at || existing?.created_at,
                status: isMaster ? "ativo" : (existing?.status || "ativo"),
                role: isMaster ? "master" : (existing?.role || "user")
              });
            });
          }
        }
      } catch (authErr) {
        console.warn("Aviso ao buscar usuários do Auth:", authErr);
      }

      const combined = Array.from(map.values());
      if (combined.length > 0) {
        setProfiles(combined);
      } else if (usersErr) {
        const { data: fallbackProfiles } = await client.from("profiles").select("*");
        setProfiles(fallbackProfiles || []);
      } else {
        setProfiles([]);
      }
    } catch (err: any) {
      console.error("Exceção ao consultar users e profiles:", err);
      setError(err?.message || "Erro desconhecido ao carregar perfis.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedbacks = async () => {
    setLoadingFeedbacks(true);
    try {
      const fbs = await dbGetSupportFeedbacks();
      setSupportFeedbacks(fbs);
    } catch (err) {
      console.error("Erro ao carregar mensagens de suporte:", err);
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const loadSupportConfig = async () => {
    try {
      const cfg = await dbGetSupportConfig();
      setSupportConfig(cfg);
    } catch (err) {
      console.error("Erro ao carregar configurações de suporte:", err);
    }
  };

  // Carregamento inicial e canal Realtime do Supabase (monitora users e profiles)
  useEffect(() => {
    fetchProfiles();
    fetchFeedbacks();
    loadSupportConfig();

    const client = getSupabase();
    if (!client) return;

    const channel = client
      .channel(`admin-users-profiles-realtime-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "users"
        },
        (payload: any) => {
          console.log("[AdminPanel Realtime] Evento na tabela 'users':", payload);
          fetchProfiles();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles"
        },
        (payload: any) => {
          console.log("[AdminPanel Realtime] Evento na tabela 'profiles':", payload);
          fetchProfiles();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const handleOpenUserModal = (profile: ProfileRecord | null = null) => {
    if (profile) {
      setEditingProfile(profile);
      setFormName(profile.name || profile.nome || "");
      setFormEmail(profile.email || "");
      setFormPassword("");
      setFormRole(profile.role || "admin");
    } else {
      setEditingProfile(null);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      setFormRole("gerente");
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      alert("Nome e e-mail são obrigatórios.");
      return;
    }

    const client = getSupabase();
    if (!client) return;

    setSubmittingForm(true);
    try {
      const payload: any = {
        name: formName.trim(),
        nome: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        updated_at: new Date().toISOString()
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

      if (editingProfile) {
        // Update
        const { error } = await client.from("users").update(payload).eq("id", editingProfile.id);
        if (error) throw error;
        try { await client.from("profiles").update(payload).eq("id", editingProfile.id); } catch(e) {}
        alert("Usuário atualizado com sucesso!");
      } else {
        // Create (New users default to trial)
        payload.status = "ativo";
        payload.status_sistema = "ativo";
        payload.status_assinatura = "trial";
        payload.plano = "trial";
        const future = new Date();
        future.setDate(future.getDate() + 15);
        payload.trial_end = future.toISOString();
        payload.data_expiracao = future.toISOString();
        payload.created_at = new Date().toISOString();

        // Note: For a real auth user, we'd use supabase.auth.admin.createUser if we had service_role
        // Here we upsert into the public tables which the app uses for login fallback and data scoping.
        const newId = crypto.randomUUID();
        payload.id = newId;
        payload.owner_id = newId;

        const { error } = await client.from("users").insert(payload);
        if (error) throw error;
        try { await client.from("profiles").insert(payload); } catch(e) {}
        alert("Usuário cadastrado com sucesso!");
      }

      setShowUserModal(false);
      fetchProfiles();
    } catch (err: any) {
      alert(`Erro ao salvar usuário: ${err.message}`);
    } finally {
      setSubmittingForm(false);
    }
  };

  // 1. Ação FORÇADA no Supabase: Bloquear / Desbloquear Usuário
  const handleToggleBlock = async (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      alert("O Administrador Master absoluto não pode ser bloqueado.");
      return;
    }

    const client = getSupabase();
    if (!client) {
      alert("Cliente Supabase não está conectado.");
      return;
    }

    const currentStatus = (profile.status || profile.status_sistema || profile.status_assinatura || "").toLowerCase().trim();
    const isCurrentlyBlocked = currentStatus === "bloqueado" || currentStatus === "blocked";
    
    const nextStatus = isCurrentlyBlocked ? "ativo" : "bloqueado";
    const nextStatusSistema = isCurrentlyBlocked ? "ativo" : "bloqueado";
    const nextStatusAssinatura = isCurrentlyBlocked ? "ativo" : "bloqueado";

    setActionLoadingId(profile.id);
    try {
      // 1. Atualização OBRIGATÓRIA na tabela 'public.users' com os campos: status, status_sistema, status_assinatura
      const userUpdatePayload = {
        status: nextStatus,
        status_sistema: nextStatusSistema,
        status_assinatura: nextStatusAssinatura
      };

      const { error: usersError } = await client
        .from("users")
        .update(userUpdatePayload)
        .eq("id", profile.id);

      if (usersError) {
        console.warn("Aviso ao atualizar tabela users por ID:", usersError.message);
        if (profile.email) {
          await client.from("users").update(userUpdatePayload).eq("email", profile.email);
        }
      }

      // 2. Atualização complementar na tabela 'profiles'
      try {
        await client
          .from("profiles")
          .update({
            status: nextStatus,
            status_sistema: nextStatusSistema,
            status_assinatura: nextStatusAssinatura
          })
          .eq("id", profile.id);
      } catch (profErr) {
        console.warn("Aviso ao atualizar profiles:", profErr);
      }

      // 3. Atualizar estado local
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profile.id || (profile.email && p.email === profile.email)
            ? {
                ...p,
                status: nextStatus,
                status_sistema: nextStatusSistema,
                status_assinatura: nextStatusAssinatura
              }
            : p
        )
      );

      const actionText = isCurrentlyBlocked ? "desbloqueado com sucesso" : "bloqueado com sucesso";
      console.log(`[AdminPanel] Usuário ${profile.email || profile.id} ${actionText}.`);
    } catch (err: any) {
      alert(`Falha ao alterar status de bloqueio: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Ação: Ativar Assinatura Manualmente
  const handleActivateSubscription = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    setActionLoadingId(profile.id);
    try {
      const payload = {
        status: "ativo",
        status_sistema: "ativo",
        status_assinatura: "ativo",
        plano: "ativo",
        plan: "ativo"
      };

      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao ativar assinatura: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. Ação: Adicionar +7 Dias de Testes
  const handleAddTrialDays = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    let baseDate = new Date();
    const currentExp = profile.data_expiracao || profile.trial_end;
    if (currentExp) {
      const parsed = new Date(currentExp);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        baseDate = parsed;
      }
    }
    const newExp = new Date(baseDate);
    newExp.setDate(newExp.getDate() + 7);
    const newExpStr = newExp.toISOString();

    setActionLoadingId(profile.id);
    try {
      const payload = {
        data_expiracao: newExpStr,
        trial_end: newExpStr,
        status: "ativo",
        status_sistema: "ativo",
        status_assinatura: "trial"
      };

      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao adicionar dias: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Ação: Alternar Plano (trial / lifetime)
  const handleTogglePlan = async (profile: ProfileRecord) => {
    const client = getSupabase();
    if (!client) return;

    const currentPlan = (profile.plano || profile.plan || "trial").toLowerCase().trim();
    const nextPlan = currentPlan === "lifetime" ? "trial" : "lifetime";

    const payload: any = {
      plano: nextPlan,
      plan: nextPlan
    };

    if (nextPlan === "trial") {
      const future = new Date();
      future.setDate(future.getDate() + 15);
      payload.trial_end = future.toISOString();
      payload.data_expiracao = future.toISOString();
    }

    setActionLoadingId(profile.id);
    try {
      await client.from("users").update(payload).eq("id", profile.id);
      try {
        await client.from("profiles").update(payload).eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...payload } : p))
      );
    } catch (err: any) {
      alert(`Falha ao alternar plano: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 5. Ação: Excluir registro
  const handleDeleteProfile = async (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      alert("O Administrador Master absoluto não pode ser excluído.");
      return;
    }

    const emailIdent = profile.email || profile.id;
    if (!window.confirm(`Tem certeza que deseja EXCLUIR definitivamente o usuário "${emailIdent}"?`)) {
      return;
    }

    const client = getSupabase();
    if (!client) return;

    setActionLoadingId(profile.id);
    try {
      await client.from("users").delete().eq("id", profile.id);
      try {
        await client.from("profiles").delete().eq("id", profile.id);
      } catch (_) {}

      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    } catch (err: any) {
      alert(`Falha ao excluir registro: ${err?.message || "Erro inesperado."}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 6. Ação: Enviar Resposta de Suporte
  const handleSubmitSupportReply = async (feedbackId: string) => {
    const text = replyTexts[feedbackId]?.trim();
    if (!text) {
      alert("Por favor, digite uma resposta para enviar.");
      return;
    }

    setSubmittingReply(prev => ({ ...prev, [feedbackId]: true }));
    try {
      const ok = await dbSubmitAdminResponse(feedbackId, text);
      if (ok) {
        setReplyTexts(prev => ({ ...prev, [feedbackId]: "" }));
        await fetchFeedbacks();
      } else {
        alert("Erro ao salvar resposta no banco de dados.");
      }
    } catch (err: any) {
      alert(`Erro ao responder: ${err.message}`);
    } finally {
      setSubmittingReply(prev => ({ ...prev, [feedbackId]: false }));
    }
  };

  // 7. Ação: Salvar Configurações de Suporte
  const handleSaveSupportConfig = async () => {
    if (!supportConfig) return;
    setSavingConfig(true);
    try {
      const ok = await dbSaveSupportConfig(supportConfig);
      if (ok) {
        alert("Configurações do suporte atualizadas com sucesso! 🎧");
      } else {
        alert("Erro ao salvar configurações no Supabase.");
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Cálculo de dias restantes
  const getRemainingDaysInfo = (profile: ProfileRecord) => {
    const isMaster = (profile.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
    if (isMaster) {
      return {
        label: "Master",
        subLabel: "Acesso total permanente",
        isLifetime: true,
        isExpired: false,
        days: 9999,
        progress: 100
      };
    }

    const plan = (profile.plano || profile.plan || "trial").toLowerCase().trim();
    if (plan === "lifetime") {
      return {
        label: "Vitalício",
        subLabel: "Acesso permanente",
        isLifetime: true,
        isExpired: false,
        days: 9999,
        progress: 100
      };
    }

    const trialEndStr = profile.trial_end || profile.data_expiracao;
    if (trialEndStr) {
      try {
        const endDate = new Date(trialEndStr);
        if (!isNaN(endDate.getTime())) {
          const diffMs = endDate.getTime() - Date.now();
          const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const totalTrial = 15;
          const progress = Math.max(0, Math.min(100, (days / totalTrial) * 100));

          if (days <= 0) {
            return {
              label: "Vencido",
              subLabel: "0 dias restantes",
              isLifetime: false,
              isExpired: true,
              days: 0,
              progress: 0
            };
          }
          return {
            label: `${days} ${days === 1 ? "dia" : "dias"}`,
            subLabel: `Até ${endDate.toLocaleDateString("pt-BR")}`,
            isLifetime: false,
            isExpired: false,
            days,
            progress
          };
        }
      } catch (e) {}
    }

    if (profile.created_at) {
      try {
        const createdDate = new Date(profile.created_at);
        const endDate = new Date(createdDate.getTime() + 15 * 24 * 60 * 60 * 1000);
        const diffMs = endDate.getTime() - Date.now();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const progress = Math.max(0, Math.min(100, (days / 15) * 100));

        if (days <= 0) {
          return {
            label: "Vencido",
            subLabel: "Período trial esgotado",
            isLifetime: false,
            isExpired: true,
            days: 0,
            progress: 0
          };
        }
        return {
          label: `${days} ${days === 1 ? "dia" : "dias"}`,
          subLabel: `15d da criação`,
          isLifetime: false,
          isExpired: false,
          days,
          progress
        };
      } catch (e) {}
    }

    return {
      label: "Não informado",
      subLabel: "Sem data limite",
      isLifetime: false,
      isExpired: false,
      days: 0,
      progress: 0
    };
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const email = (p.email || "").toLowerCase();
      const name = (p.name || p.nome || "").toLowerCase();
      const username = (p.username || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      const term = search.toLowerCase().trim();
      const matchesSearch = !term || email.includes(term) || name.includes(term) || username.includes(term) || id.includes(term);

      const status = (p.status_sistema || p.status || p.status_assinatura || "ativo").toLowerCase().trim();
      const isBlocked = status === "blocked" || status === "bloqueado";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !isBlocked) ||
        (statusFilter === "blocked" && isBlocked);

      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
      const matchesPlan =
        planFilter === "all" ||
        (planFilter === "lifetime" && plan === "lifetime") ||
        (planFilter === "trial" && plan !== "lifetime");

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [profiles, search, statusFilter, planFilter]);

  const stats = useMemo(() => {
    const total = profiles.length;
    let active = 0;
    let blocked = 0;
    let lifetime = 0;
    let trial = 0;

    profiles.forEach((p) => {
      const status = (p.status_sistema || p.status || p.status_assinatura || "ativo").toLowerCase().trim();
      if (status === "blocked" || status === "bloqueado") {
        blocked++;
      } else {
        active++;
      }

      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
      if (plan === "lifetime") {
        lifetime++;
      } else {
        trial++;
      }
    });

    return { total, active, blocked, lifetime, trial };
  }, [profiles]);

  const unansweredFeedbacksCount = useMemo(() => {
    return supportFeedbacks.filter(f => !f.resposta_admin).length;
  }, [supportFeedbacks]);

  return (
    <div className="space-y-6 animate-fade-in pb-12 relative">
      {/* Glow Backdrops */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-500/5 blur-[120px] pointer-events-none rounded-full"></div>
      <div className="absolute top-1/2 right-0 w-80 h-80 bg-brand-cyan/5 blur-[100px] pointer-events-none rounded-full"></div>

      {/* Header do Painel Master Futuristic */}
      <div className="bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-brand-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)] animate-pulse">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              CENTRAL DE COMANDO MASTER
              <span className="text-[10px] uppercase font-black tracking-widest px-3 py-1 rounded-full bg-amber-500 text-slate-950 border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                MASTER ACCESS
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">
              Gestão omnicanal de ecossistema: usuários, faturamento, suporte global e integridade de dados em tempo real via Supabase High-Availability.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            type="button"
            onClick={() => handleOpenUserModal()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
          >
            <UserPlus className="h-4 w-4" />
            <span>NOVO USUÁRIO</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              fetchProfiles();
              fetchFeedbacks();
            }}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 backdrop-blur-sm text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-400" : ""}`} />
            <span>SINCRONIZAR AGORA</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas Futuristic */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all group">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>TOTAL DE USUÁRIOS</span>
            <Users className="h-4 w-4 text-slate-600 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-3xl font-black text-white mt-2 group-hover:scale-110 transition-transform origin-left">{stats.total}</div>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 hover:border-emerald-500/30 transition-all group">
          <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-between">
            <span>SISTEMA ATIVO</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-3xl font-black text-emerald-400 mt-2 group-hover:scale-110 transition-transform origin-left">{stats.active}</div>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 hover:border-red-500/30 transition-all group">
          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center justify-between">
            <span>BLOQUEADOS</span>
            <XCircle className="h-4 w-4 text-red-600 group-hover:text-red-400 transition-colors" />
          </div>
          <div className="text-3xl font-black text-red-400 mt-2 group-hover:scale-110 transition-transform origin-left">{stats.blocked}</div>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 hover:border-amber-500/30 transition-all group">
          <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center justify-between">
            <span>VITALÍCIOS</span>
            <InfinityIcon className="h-4 w-4 text-amber-600 group-hover:text-amber-400 transition-colors" />
          </div>
          <div className="text-3xl font-black text-amber-400 mt-2 group-hover:scale-110 transition-transform origin-left">{stats.lifetime}</div>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 hover:border-brand-cyan/30 transition-all group col-span-2 sm:col-span-1">
          <div className="text-[10px] font-black text-brand-cyan uppercase tracking-widest flex items-center justify-between">
            <span>PERÍODO DE TESTE</span>
            <Clock className="h-4 w-4 text-brand-cyan group-hover:text-cyan-300 transition-colors" />
          </div>
          <div className="text-3xl font-black text-brand-cyan mt-2 group-hover:scale-110 transition-transform origin-left">{stats.trial}</div>
        </div>
      </div>

      {/* Navegação entre Abas Futuristic */}
      <div className="flex border-b border-slate-800/50 gap-4 overflow-x-auto whitespace-nowrap pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("usuarios")}
          className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-3 relative group ${
            activeTab === "usuarios" 
              ? "text-amber-400" 
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Users className={`h-4 w-4 ${activeTab === "usuarios" ? "animate-bounce" : ""}`} />
          <span>GESTÃO DE USUÁRIOS</span>
          {activeTab === "usuarios" && (
            <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full shadow-[0_-4px_15px_rgba(245,158,11,0.5)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("suporte_mensagens");
            fetchFeedbacks();
          }}
          className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-3 relative group ${
            activeTab === "suporte_mensagens" 
              ? "text-amber-400" 
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Headphones className={`h-4 w-4 ${activeTab === "suporte_mensagens" ? "animate-pulse" : ""}`} />
          <span>SUPORTE GLOBAL</span>
          {unansweredFeedbacksCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse shadow-lg shadow-red-600/40">
              {unansweredFeedbacksCount} NEW
            </span>
          )}
          {activeTab === "suporte_mensagens" && (
            <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full shadow-[0_-4px_15px_rgba(245,158,11,0.5)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("suporte_config");
            loadSupportConfig();
          }}
          className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-3 relative group ${
            activeTab === "suporte_config" 
              ? "text-amber-400" 
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Settings className={`h-4 w-4 ${activeTab === "suporte_config" ? "rotate-90" : ""} transition-transform duration-500`} />
          <span>PREFERÊNCIAS</span>
          {activeTab === "suporte_config" && (
            <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full shadow-[0_-4px_15px_rgba(245,158,11,0.5)]" />
          )}
        </button>
      </div>

      {/* ABA 1: GESTÃO DE CONTAS Futuristic */}
      {activeTab === "usuarios" && (
        <div className="space-y-4 animate-in slide-in-from-left-4 duration-500">
          {/* Barra de Filtros e Busca Futuristic */}
          <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-cyan/5 to-transparent opacity-50"></div>
            
            <div className="relative w-full md:w-96 group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within/search:text-brand-cyan transition-colors" />
              <input
                type="text"
                placeholder="Identidade, e-mail ou nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all font-mono shadow-inner"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto relative z-10">
              {/* Filtro de Status */}
              <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-[10px] font-black uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "all" ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  TODOS
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "active" ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  ATIVOS
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("blocked")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "blocked" ? "bg-red-500 text-slate-950 shadow-lg shadow-red-500/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  BLOQUEADOS
                </button>
              </div>

              {/* Filtro de Plano */}
              <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-[10px] font-black uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setPlanFilter("all")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    planFilter === "all" ? "bg-brand-cyan text-slate-950 shadow-lg shadow-brand-cyan/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  GLOBAL
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter("lifetime")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    planFilter === "lifetime" ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  VITALÍCIO
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter("trial")}
                  className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                    planFilter === "trial" ? "bg-purple-500 text-slate-950 shadow-lg shadow-purple-500/20" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  TESTE
                </button>
              </div>
            </div>
          </div>

          {/* Erro de Comunicação */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-950/20 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-center gap-3 backdrop-blur-sm"
            >
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <div className="font-black uppercase tracking-widest">CRITICAL DATABASE ALERT</div>
                <div className="text-red-400/70 mt-0.5 font-mono">{error}</div>
              </div>
            </motion.div>
          )}

          {/* Tabela Futuristic de Usuários */}
          <div className="bg-slate-900/30 backdrop-blur-md rounded-2xl border border-slate-800/60 overflow-hidden shadow-2xl relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-500 uppercase font-black text-[9px] tracking-widest font-mono">
                    <th className="py-4 px-6">ID & IDENTIDADE</th>
                    <th className="py-4 px-3 text-center">OPERAÇÕES</th>
                    <th className="py-4 px-3 text-center">ASSINATURA</th>
                    <th className="py-4 px-3">STATUS DO PLANO</th>
                    <th className="py-4 px-3">MONITOR DE TESTE</th>
                    <th className="py-4 px-6 text-right">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-medium">
                  {loading && profiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="relative">
                            <RefreshCw className="h-10 w-10 animate-spin text-amber-500" />
                            <div className="absolute inset-0 blur-xl bg-amber-500/20 animate-pulse"></div>
                          </div>
                          <span className="text-slate-400 font-mono text-[10px] tracking-widest animate-pulse">LINKING WITH SUPABASE REALTIME CLOUD...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-24 text-center text-slate-500 font-mono text-[10px] tracking-widest">
                        NENHUM USUÁRIO ENCONTRADO PARA OS FILTROS APLICADOS.
                      </td>
                    </tr>
                  ) : (
                    filteredProfiles.map((p) => {
                      const isMaster = (p.email || "").toString().toLowerCase().trim() === "vendas.impactodigital2@gmail.com";
                      const sysStatus = (p.status_sistema || p.status || "ativo").toLowerCase().trim();
                      const isSysBlocked = sysStatus === "blocked" || sysStatus === "bloqueado";
                      const subStatus = (p.status_assinatura || p.status || "ativo").toLowerCase().trim();
                      const isSubBlocked = subStatus === "blocked" || subStatus === "bloqueado";
                      const plan = (p.plano || p.plan || "trial").toLowerCase().trim();
                      const isLifetime = plan === "lifetime";
                      const remaining = getRemainingDaysInfo(p);
                      const isBusy = actionLoadingId === p.id;

                      return (
                        <tr
                          key={p.id}
                          className={`group hover:bg-slate-800/30 transition-all duration-300 ${
                            isSysBlocked ? "bg-red-950/5" : ""
                          }`}
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border-2 transition-all group-hover:scale-110 ${
                                isMaster 
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                  : isSysBlocked
                                  ? "bg-red-950/30 text-red-500 border-red-900/30"
                                  : "bg-slate-900/80 text-slate-400 border-slate-800"
                              }`}>
                                {(p.name || p.nome || p.email || "U").charAt(0).toUpperCase()}
                              </div>
                              <div className="space-y-1">
                                <div className="font-black text-white text-sm tracking-tight flex items-center gap-2">
                                  {p.name || p.nome || "Anonymous Entity"}
                                  {isMaster && (
                                    <Sparkles className="h-3.5 w-3.5 text-amber-400 drop-shadow-glow" />
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                  <span className="text-brand-cyan/70">{p.email || "SEM_EMAIL"}</span>
                                  <span className="text-slate-700">|</span>
                                  <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                    {p.role === "master" ? "ADMIN MASTER" : p.role || "USUÁRIO"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-3 text-center">
                            {isSysBlocked ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                <Lock className="h-3 w-3" />
                                OFFLINE
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                <CheckCircle2 className="h-3 w-3" />
                                ONLINE
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-3 text-center">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                              isSubBlocked ? "bg-red-500/10 text-red-500 border-red-500/20" :
                              subStatus === "trial" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                              "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}>
                              {subStatus}
                            </div>
                          </td>

                          <td className="py-4 px-3">
                            <div className={`flex items-center gap-2 font-black text-[10px] uppercase tracking-widest ${isLifetime ? "text-amber-400" : "text-slate-400"}`}>
                              {isLifetime ? (
                                <>
                                  <InfinityIcon className="h-3.5 w-3.5" />
                                  VITALÍCIO
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3.5 w-3.5" />
                                  TEMPORÁRIO
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-3">
                            <div className="w-32 space-y-2">
                              <div className="flex items-center justify-between text-[10px] font-black">
                                <span className={remaining.isExpired ? "text-red-500" : "text-slate-300"}>
                                  {remaining.label}
                                </span>
                                <span className="text-slate-600 font-mono">{remaining.progress}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${remaining.progress}%` }}
                                  className={`h-full rounded-full ${
                                    remaining.isLifetime ? "bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                                    remaining.isExpired ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                    "bg-gradient-to-r from-brand-cyan to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                                  }`}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <button
                                type="button"
                                onClick={() => handleOpenUserModal(p)}
                                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
                                title="Editar Identidade"
                              >
                                <Settings className="h-4 w-4" />
                              </button>

                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlock(p)}
                                  disabled={isBusy}
                                  className={`p-2 rounded-lg transition-all border cursor-pointer disabled:opacity-50 ${
                                    isSysBlocked
                                      ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                      : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30"
                                  }`}
                                >
                                  {isSysBlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                </button>
                              )}

                              <div className="h-6 w-px bg-slate-800 mx-1"></div>

                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleActivateSubscription(p)}
                                  disabled={isBusy}
                                  className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                                  title="Ativação Full"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}

                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleAddTrialDays(p)}
                                  disabled={isBusy}
                                  className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 transition-all cursor-pointer disabled:opacity-50"
                                  title="+7 Dias Trial"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}

                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePlan(p)}
                                  disabled={isBusy}
                                  className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                                  title="Toggle Lifetime"
                                >
                                  <InfinityIcon className="h-4 w-4" />
                                </button>
                              )}

                              {!isMaster && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProfile(p)}
                                  disabled={isBusy}
                                  className="p-2 rounded-lg bg-red-900/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-900/40 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: SUPORTE GLOBAL Futuristic */}
      {activeTab === "suporte_mensagens" && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-cyan/10 to-transparent opacity-50"></div>
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="p-4 rounded-2xl bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter">CENTRAL DE TRANSMISSÃO GLOBAL</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5 tracking-widest uppercase">Global Interaction Monitoring & Telemetry</p>
              </div>
            </div>

            <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 text-[10px] font-black uppercase tracking-widest relative z-10 mt-4 md:mt-0">
              <button
                type="button"
                onClick={() => setFeedbackFilter("unanswered")}
                className={`px-6 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                  feedbackFilter === "unanswered" ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <AlertCircle className="h-3 w-3" />
                PENDENTES
              </button>
              <button
                type="button"
                onClick={() => setFeedbackFilter("all")}
                className={`px-6 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                  feedbackFilter === "all" ? "bg-slate-800 text-white shadow-lg shadow-slate-950/50" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Clock className="h-3 w-3" />
                HISTÓRICO
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {loadingFeedbacks ? (
              <div className="col-span-full py-32 text-center">
                <div className="relative inline-block">
                  <RefreshCw className="h-12 w-12 animate-spin text-brand-cyan opacity-40 mx-auto" />
                  <div className="absolute inset-0 blur-2xl bg-brand-cyan/20 animate-pulse"></div>
                </div>
                <p className="mt-4 text-[10px] font-mono text-slate-500 tracking-[0.3em] uppercase animate-pulse">Retrieving satellite feeds...</p>
              </div>
            ) : supportFeedbacks.length === 0 ? (
              <div className="col-span-full py-32 text-center border-2 border-dashed border-slate-800/60 rounded-[40px] bg-slate-950/20 backdrop-blur-sm">
                <p className="text-slate-600 font-mono text-[10px] tracking-[0.5em] uppercase">NO SIGNAL DETECTED IN THIS FREQUENCY.</p>
              </div>
            ) : (
              supportFeedbacks
                .filter(f => feedbackFilter === "all" || !f.resposta_admin)
                .map((f) => (
                  <motion.div 
                    layout
                    key={f.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`group relative bg-slate-900/40 backdrop-blur-md rounded-3xl border p-6 space-y-5 shadow-2xl transition-all duration-500 hover:scale-[1.01] hover:border-slate-600 ${
                      f.resposta_admin ? "border-slate-800/40 opacity-75" : "border-amber-500/20 shadow-amber-500/5 ring-1 ring-amber-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/40 pb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-950 flex items-center justify-center font-black text-xl text-brand-cyan border border-slate-800 shadow-inner group-hover:border-brand-cyan/30 transition-colors">
                          {(f.user_name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-black text-sm uppercase tracking-tight flex items-center gap-2">
                            {f.user_name}
                            {!f.resposta_admin && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {new Date(f.created_at).toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </div>
                      {!f.resposta_admin && (
                        <div className="px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black tracking-widest animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                          ACTIVE TICKET
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/60 relative overflow-hidden group/message shadow-inner">
                      <div className="absolute right-4 top-4 opacity-5 group-hover/message:opacity-20 transition-opacity duration-700">
                        <Volume2 className="h-12 w-12 text-brand-cyan" />
                      </div>
                      <p className="text-slate-200 text-sm leading-relaxed relative z-10 font-medium">
                        {f.message ? (
                          <span className="italic">"{f.message}"</span>
                        ) : (
                          <span className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">Incoming Data Stream (Audio Interface)</span>
                        )}
                      </p>
                      {f.audio_url && (
                        <div className="mt-4 pt-4 border-t border-slate-800/40">
                          <audio src={f.audio_url} controls className="w-full h-8 opacity-40 hover:opacity-100 transition-all duration-300 filter invert contrast-125" />
                        </div>
                      )}
                    </div>

                    {f.resposta_admin ? (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                          <CheckCircle2 className="h-4 w-4" /> COMMANDER DIRECTIVE TRANSMITTED
                        </div>
                        <div className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                          <p className="text-slate-400 text-sm leading-relaxed pl-6 italic font-medium">
                            {f.resposta_admin}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                          <Sparkles className="h-4 w-4" /> SECURE REPLY CHANNEL
                        </div>
                        <textarea
                          placeholder="Execute command response..."
                          value={replyTexts[f.id] || ""}
                          onChange={(e) => setReplyTexts(prev => ({ ...prev, [f.id]: e.target.value }))}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/20 transition-all font-mono shadow-inner min-h-[100px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmitSupportReply(f.id)}
                          disabled={submittingReply[f.id] || !replyTexts[f.id]}
                          className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-black uppercase tracking-[0.2em] transition-all cursor-pointer shadow-lg shadow-brand-cyan/20 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-3"
                        >
                          {submittingReply[f.id] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          TRANSMITIR DIRETIVA
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))
            )}
          </div>
        </div>
      )}

      {/* ABA 3: CONFIGURAÇÕES Futuristic */}
      {activeTab === "suporte_config" && supportConfig && (
        <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-700">
          <div className="bg-slate-900/60 backdrop-blur-2xl p-10 rounded-[40px] border border-slate-800 shadow-[0_30px_100px_rgba(0,0,0,0.6)] space-y-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-brand-cyan/10 opacity-30"></div>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full animate-pulse"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-brand-cyan/10 blur-[100px] rounded-full animate-pulse duration-[5000ms]"></div>
            
            <div className="text-center space-y-3 relative z-10">
              <div className="inline-block p-6 rounded-[32px] bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4 shadow-[0_0_30px_rgba(245,158,11,0.1)] transition-transform duration-700 hover:rotate-180">
                <Settings className="h-10 w-10 animate-spin-slow" />
              </div>
              <h3 className="text-3xl font-black text-white uppercase tracking-tight">PROTOCOLOS DE COMANDO</h3>
              <p className="text-[11px] text-slate-500 font-mono tracking-[0.4em] uppercase">Global Interface Logic & Aesthetic Parameters</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">URL do Avatar do Comandante</label>
                </div>
                <div className="flex gap-4">
                  <div className="relative group/input flex-1">
                    <input
                      type="text"
                      value={supportConfig.admin_avatar || ""}
                      onChange={(e) => setSupportConfig({ ...supportConfig, admin_avatar: e.target.value })}
                      placeholder="https://satellite.link/avatar.png"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 font-mono transition-all shadow-inner"
                    />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center shadow-lg group-hover:border-amber-500/30 transition-colors">
                    {supportConfig.admin_avatar ? (
                      <img src={supportConfig.admin_avatar} className="w-full h-full object-cover" />
                    ) : (
                      <ShieldCheck className="h-6 w-6 text-slate-700" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-brand-cyan rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identidade do Comandante</label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={supportConfig.admin_name || ""}
                    onChange={(e) => setSupportConfig({ ...supportConfig, admin_name: e.target.value })}
                    placeholder="Ex: NEXVOLT OVERSEER"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/20 font-mono font-black transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="col-span-full space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transmissão Global de Boas-Vindas</label>
                </div>
                <textarea
                  value={supportConfig.welcome_message || ""}
                  onChange={(e) => setSupportConfig({ ...supportConfig, welcome_message: e.target.value })}
                  placeholder="Sequência de transmissão automatizada ao conectar..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-3xl px-6 py-5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 font-mono transition-all shadow-inner leading-relaxed"
                  rows={4}
                />
              </div>

              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transmission Start</label>
                  </div>
                  <input
                    type="time"
                    value={supportConfig.horario_inicio || "09:00"}
                    onChange={(e) => setSupportConfig({ ...supportConfig, horario_inicio: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transmission End</label>
                  </div>
                  <input
                    type="time"
                    value={supportConfig.horario_fim || "19:00"}
                    onChange={(e) => setSupportConfig({ ...supportConfig, horario_fim: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-rose-500 font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 relative z-10">
              <button
                type="button"
                onClick={handleSaveSupportConfig}
                disabled={savingConfig}
                className="w-full py-5 rounded-[24px] bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 text-slate-950 text-xs font-black uppercase tracking-[0.3em] transition-all cursor-pointer shadow-2xl shadow-amber-600/30 active:scale-[0.98] flex items-center justify-center gap-4 group/btn overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                {savingConfig ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                SINCRONIZAR PARÂMETROS DE COMANDO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER CREATION/EDITING MODAL */}
      <AnimatePresence>
        {showUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUserModal(false)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
              
              <form onSubmit={handleSaveUser} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight">
                        {editingProfile ? "EDITAR IDENTIDADE" : "PROVISIONAR USUÁRIO"}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono tracking-widest">SYSTEM ENTITY REGISTRATION</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowUserModal(false)}
                    className="p-2 text-slate-500 hover:text-white transition-colors"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                      placeholder="Identidade do titular..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">E-mail Corporativo</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                      placeholder="exemplo@sistema.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Senha de Acesso {editingProfile && "(vazio para manter)"}</label>
                    <input
                      type="password"
                      required={!editingProfile}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                      placeholder="Mínimo de 6 caracteres..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Nível de Acesso</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    >
                      <option value="admin">Administrador (Titular)</option>
                      <option value="gerente">Gerente</option>
                      <option value="ormamentistas">Ormamentistas</option>
                      <option value="funcionario de campo">Funcionário de Campo</option>
                      {isMasterUser && <option value="master">Administrador Master</option>}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowUserModal(false)}
                    className="flex-1 py-4 rounded-2xl bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={submittingForm}
                    className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {submittingForm ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : "CONFIRMAR REGISTRO"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminPanel;
