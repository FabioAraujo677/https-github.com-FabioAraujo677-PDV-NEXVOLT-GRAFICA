export interface DailyBusinessHours {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface BusinessHours {
  monday: DailyBusinessHours;
  tuesday: DailyBusinessHours;
  wednesday: DailyBusinessHours;
  thursday: DailyBusinessHours;
  friday: DailyBusinessHours;
  saturday: DailyBusinessHours;
  sunday: DailyBusinessHours;
}

export type DailyAutoBackupMode = "auto_save_and_download" | "local_only" | "notify_only";

export interface DailyAutoBackupMeta {
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string
  fileName: string;
  sizeBytes: number;
  mode: DailyAutoBackupMode | "manual";
  salesCount: number;
  clientsCount: number;
  productsCount: number;
  expensesCount: number;
  downloaded: boolean;
}

export interface DailyLocalBackupSnapshot extends DailyAutoBackupMeta {
  id: string;
  jsonContent: string;
}

export interface CompanyProfile {
  tradingName: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cnpjCpf: string;
  logo: string | null;
  pixKey?: string;
  goalsReminderEnabled?: boolean;
  goalsReminderTime?: string;
  openingTime?: string; // HH:MM format
  closingTime?: string; // HH:MM format
  autoCloseRegisterEnabled?: boolean;
  autoBackupDownloadEnabled?: boolean;
  dailyAutoBackupEnabled?: boolean;
  dailyAutoBackupMode?: DailyAutoBackupMode;
  dailyAutoBackupTime?: string; // HH:MM format
  dailyAutoBackupUseClosingTime?: boolean;
  businessHours?: BusinessHours;
  cashClosingReminderEnabled?: boolean;
  cashClosingReminderTime?: string; // HH:MM format
  cashClosingReminderMessage?: string;
}

export interface ProductSaleItem {
  id: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  unitCost?: number;
}

export interface CostItem {
  id: string;
  description: string;
  value: number;
}

export interface SalePayment {
  id: string;
  amount: number;
  date: string; // ISO string
  method: 'dinheiro' | 'cartão' | 'pix';
  recordedBy?: string; // nome do operador que recebeu
  recordedRole?: 'atendente' | 'administrador';
}

export interface SaleAuditEntry {
  action: 'criacao' | 'edicao' | 'venda_rapida' | 'venda_balcao' | 'pagamento' | 'entrega_material' | 'exclusao';
  timestamp: string;
  userId?: string;
  userName?: string;
  userRole?: 'atendente' | 'administrador';
  details?: string;
}

export interface DeletionAuditRecord {
  id: string;
  deletedAt: string; // ISO string
  itemType: "venda" | "orcamento" | "despesa" | "cliente" | "produto";
  itemId: string;
  itemTitle: string;
  clientName?: string;
  clientPhone?: string;
  totalValue?: number;
  paidValue?: number;
  paymentMethod?: string;
  productsSummary?: string;
  details?: string;
  deletedByUserId: string;
  deletedByName: string;
  deletedByUsername: string;
  deletedByRole: "administrador" | "atendente";
  reason?: string;
}

export interface Sale {
  id: string;
  clientName: string;
  clientPhone: string;
  items: ProductSaleItem[];
  useMotoboy: boolean;
  motoboyCost: number;
  deliveryAddress?: string;
  discount: number;
  downPayment: number; // "sinal"
  operationCost: number; // "gasto dessa venda"
  costItems?: CostItem[]; // detalhamento de gastos mais preciso
  totalValue: number; // final total calculated automatically
  balanceDue: number; // remaining value to be paid (totalValue - downPayment)
  netProfit: number; // totalValue - operationCost
  clientImage: string | null; // base64 representation of pasted/uploaded image
  date: string;
  isBudget?: boolean;
  paymentMethod?: 'dinheiro' | 'cartão' | 'pix';
  orderDate?: string; // data do pedido
  deliveryDate?: string; // data de entrega
  deliveryReason?: string; // motivo de reagendamento / observação da entrega
  payments?: SalePayment[]; // precise payment history logs for cash flow
  materialEntregue?: boolean; // indica se o material já foi entregue/retirado pelo cliente
  sellerId?: string; // ID de quem efetuou o lançamento
  sellerName?: string; // Nome do operador (atendente ou admin)
  sellerRole?: 'atendente' | 'administrador'; // Papel de quem vendeu
  deliveredBy?: string; // Nome de quem entregou o material
  deliveredAt?: string; // Data/hora da entrega
  deliveredRole?: 'atendente' | 'administrador'; // Papel de quem entregou
  auditLog?: SaleAuditEntry[]; // Histórico detalhado de ações e alterações
  orderNumber?: number; // Número sequencial universal formatado (ex: 1, 2, ..., 668)
}

/**
 * Retorna o número sequencial numérico de uma venda ou orçamento.
 * Se a venda já tiver orderNumber definido, utiliza-o.
 * Caso contrário, calcula pela ordem cronológica de criação.
 */
export function getSaleSequenceNumber(sale: Sale, allSales?: Sale[]): number {
  if (sale.orderNumber && typeof sale.orderNumber === "number" && sale.orderNumber > 0) {
    return sale.orderNumber;
  }
  const anySale = sale as any;
  if (anySale.order_number) {
    const parsed = parseInt(String(anySale.order_number), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Tenta extrair número num ID curto caso seja numérico
  const rawId = String(sale.id || "");
  const numMatches = rawId.match(/^V?-?(\d{1,6})$/i);
  if (numMatches && numMatches[1]) {
    const extracted = parseInt(numMatches[1], 10);
    if (!isNaN(extracted) && extracted > 0) return extracted;
  }

  if (!allSales || allSales.length === 0) {
    return 1;
  }

  // Ordena cronologicamente por data de criação / data da venda
  const sorted = [...allSales].sort((a, b) => {
    const timeA = new Date(a.date || a.orderDate || (a as any).created_at || 0).getTime() || 0;
    const timeB = new Date(b.date || b.orderDate || (b as any).created_at || 0).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id).localeCompare(String(b.id));
  });

  const idx = sorted.findIndex(s => s.id === sale.id);
  return idx >= 0 ? idx + 1 : 1;
}

/**
 * Retorna o número da nota formatado com 5 dígitos (ex: #00001, #00034, #00668)
 */
export function formatSaleReceiptNumber(sale: Sale, allSales?: Sale[]): string {
  const num = getSaleSequenceNumber(sale, allSales);
  return `#${String(num).padStart(5, "0")}`;
}

/**
 * Verifica se um termo de busca bate com o número sequencial da venda (ex: "34", "00034", "#00034")
 */
export function matchSaleReceiptNumber(sale: Sale, searchTerm: string, allSales?: Sale[]): boolean {
  if (!searchTerm || !searchTerm.trim()) return false;
  const cleanTerm = searchTerm.trim().replace(/^#/, "");
  if (!cleanTerm) return false;

  const seqNum = getSaleSequenceNumber(sale, allSales);
  const formatted5 = String(seqNum).padStart(5, "0"); // "00034"
  const formattedWithHash = `#${formatted5}`; // "#00034"
  const rawStr = String(seqNum); // "34"

  if (formattedWithHash.toLowerCase() === searchTerm.trim().toLowerCase()) return true;
  if (formatted5 === cleanTerm) return true;
  if (rawStr === cleanTerm) return true;
  if (formatted5.includes(cleanTerm)) return true;

  return false;
}

export interface DashboardStats {
  totalSalesValue: number;
  totalRevenuePaid: number;
  totalPending: number;
  totalDiscount: number;
  totalMotoboy: number;
  totalOperationCost: number;
  totalNetProfit: number;
}

export interface Expense {
  id: string;
  description: string;
  value: number;
  date: string; // ISO string or YYYY-MM-DD
  category: string;
  paymentMethod?: 'dinheiro' | 'cartão' | 'pix';
  comprovanteUrl?: string;
  receiptImage?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  owner_id?: string;
  role?: "motoboy" | "atendente" | "administrador" | "master" | string;
  cargo?: string;
  created_at?: string;
  data_expiracao?: string;
  status_assinatura?: string;
  status?: string;
  status_sistema?: string;
  is_admin?: boolean;
  permissions?: string[];
}

export interface CatalogProduct {
  id: string;
  description: string;
  costPrice: number;
  salePrice: number;
  profit: number; // salePrice - costPrice
  minStock: number;
  currentStock: number;
  status?: string;
  is_draft?: boolean;
}

export const getSaleOrderDate = (sale: Sale): string => {
  if (sale.orderDate) return sale.orderDate;
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments[0].date;
  }
  return sale.date;
};

export const getSaleOperationCost = (sale: Sale): number => {
  if (sale.isBudget) return 0;
  if (sale.costItems && sale.costItems.length > 0) {
    return sale.costItems.reduce((sum, item) => sum + item.value, 0);
  }
  return sale.operationCost || 0;
};

export interface CustomReminder {
  id: string;
  title: string;
  type: "date" | "weekly";
  date?: string; // YYYY-MM-DD
  dayOfWeek?: number; // 0-6
  time: string; // HH:MM
  isAllDay?: boolean;
  completed?: boolean;
  notified?: boolean;
}

export interface CashRegisterSession {
  id: string;
  status: "aberto" | "fechado";
  valorAbertura: number;
  valorFechamentoEsperado?: number;
  valorFechamentoReal?: number;
  dataAbertura: string;
  dataFechamento?: string;
  operador: string;
  observacoes?: string;
  historicoVendas?: any[];
}

export interface CashRegisterState {
  currentSession: CashRegisterSession | null;
  history: CashRegisterSession[];
}

export interface SupportFeedback {
  id: string;
  user_id: string;
  user_name: string;
  audio_url: string;
  message?: string;
  resposta_admin?: string;
  respondido_em?: string;
  created_at: string;
}

export interface SupportConfig {
  id: string;
  horario_inicio: string;
  horario_fim: string;
  mensagem_fechado: string;
  admin_avatar?: string;
  admin_name?: string;
  welcome_message?: string;
}

export function isQuickSaleClient(clientName?: string): boolean {
  if (!clientName) return true;
  const name = clientName.trim().toLowerCase();
  return (
    name === "" ||
    name === "venda rápida" ||
    name === "venda rapida" ||
    name === "balcão" ||
    name === "balcao" ||
    name === "consumidor" ||
    name === "cliente não identificado" ||
    name === "cliente nao identificado"
  );
}

export function isPendingRetiradaOrBaixa(sale: Sale): boolean {
  if (!sale || sale.isBudget) return false;
  if (isQuickSaleClient(sale.clientName)) return false;

  const balanceDue = sale.balanceDue || 0;

  // 1. If balance is due (> 0), it MUST be in Retiradas to receive payment ("dar baixa")
  if (balanceDue > 0.001) {
    return true;
  }

  // 2. If balance is 0 or paid, it remains pending until material is delivered
  return !sale.materialEntregue;
}




