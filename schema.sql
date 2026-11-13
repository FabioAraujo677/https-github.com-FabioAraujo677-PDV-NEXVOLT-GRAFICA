-- ==============================================================================
-- SCHEMA COMPLETO ATUALIZADO DO SISTEMA (SUPABASE / POSTGRESQL)
-- Compatível com execução direta no Supabase SQL Editor (idempotente)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. USUÁRIOS, PERFIS E ATENDENTES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Administrador',
  nome TEXT,
  username TEXT,
  email TEXT,
  password TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  role TEXT DEFAULT 'administrador',
  cargo TEXT DEFAULT 'administrador',
  is_admin BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'ativo',
  status_sistema TEXT DEFAULT 'ativo',
  status_assinatura TEXT DEFAULT 'ativo',
  plano TEXT DEFAULT 'trial',
  trial_end TIMESTAMPTZ,
  data_expiracao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'administrador';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cargo TEXT DEFAULT 'administrador';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_sistema TEXT DEFAULT 'ativo';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_assinatura TEXT DEFAULT 'ativo';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'trial';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS data_expiracao TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_owner_id ON public.users(owner_id);

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  nome TEXT,
  email TEXT,
  password TEXT,
  owner_id TEXT,
  role TEXT DEFAULT 'gerente',
  status TEXT DEFAULT 'ativo',
  status_sistema TEXT DEFAULT 'ativo',
  status_assinatura TEXT DEFAULT 'trial',
  plano TEXT DEFAULT 'trial',
  trial_end TIMESTAMPTZ,
  data_expiracao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sub_usuarios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_principal_id TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  email TEXT,
  senha_hash TEXT NOT NULL,
  cargo_funcao TEXT DEFAULT 'atendente',
  permissoes JSONB DEFAULT '["ver_vendas","registrar_caixa","cadastrar_produtos","ver_relatorios"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_usuarios_principal ON public.sub_usuarios(usuario_principal_id);

CREATE TABLE IF NOT EXISTS public.atendentes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_principal_id TEXT,
  empresa_id TEXT,
  nome_completo TEXT,
  nome TEXT,
  login TEXT UNIQUE,
  username TEXT,
  email TEXT,
  senha_hash TEXT,
  senha TEXT,
  password TEXT,
  cargo_funcao TEXT DEFAULT 'atendente',
  cargo TEXT DEFAULT 'atendente',
  permissoes JSONB DEFAULT '["ver_vendas","registrar_caixa","cadastrar_produtos","ver_relatorios"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_principal_id TEXT,
  nome_completo TEXT,
  nome TEXT,
  login TEXT UNIQUE,
  email TEXT,
  senha_hash TEXT,
  senha TEXT,
  cargo_funcao TEXT DEFAULT 'atendente',
  permissoes JSONB DEFAULT '["ver_vendas","registrar_caixa","cadastrar_produtos","ver_relatorios"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assinaturas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  email TEXT,
  status TEXT DEFAULT 'trial',
  plano TEXT DEFAULT 'trial',
  trial_end TIMESTAMPTZ,
  payment_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_user_id ON public.assinaturas(user_id);

-- ==============================================================================
-- 2. EMPRESA E CONFIGURAÇÕES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.company_profile (
  id TEXT,
  user_id TEXT PRIMARY KEY,
  name TEXT,
  nome TEXT,
  nome_fantasia TEXT,
  trading_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  telefone TEXT,
  cep TEXT,
  address TEXT,
  logradouro TEXT,
  number TEXT,
  numero TEXT,
  neighborhood TEXT,
  bairro TEXT,
  city TEXT,
  cidade TEXT,
  state TEXT,
  uf TEXT,
  cnpj_cpf TEXT,
  cnpj TEXT,
  logo TEXT,
  logo_url TEXT,
  pix_key TEXT,
  business_hours JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.empresa_config (
  id TEXT,
  user_id TEXT PRIMARY KEY,
  nome TEXT,
  trading_name TEXT,
  logo TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.empresa_config ADD COLUMN IF NOT EXISTS id TEXT;

-- ==============================================================================
-- 3. CONTROLE DE CAIXA (ABERTURA, SESSÕES E HISTÓRICO)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.caixa_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT CURRENT_DATE::text,
  status TEXT NOT NULL DEFAULT 'FECHADO' CHECK (status IN ('ABERTO', 'FECHADO', 'aberto', 'fechado')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  valor_fechamento NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS date TEXT DEFAULT CURRENT_DATE::text;
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS valor_abertura NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS valor_fechamento NUMERIC(12,2);
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.caixa_status ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_caixa_status_user_id ON public.caixa_status(user_id);
CREATE INDEX IF NOT EXISTS idx_caixa_status_opened_at ON public.caixa_status(opened_at DESC);

CREATE TABLE IF NOT EXISTS public.sessoes_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT,
  user_id TEXT,
  aberto_por_usuario_id TEXT,
  operador TEXT DEFAULT 'Operador',
  usuario TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  situacao TEXT,
  aberto BOOLEAN DEFAULT true,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  valor_inicial NUMERIC(12,2) DEFAULT 0,
  fundo_troco NUMERIC(12,2) DEFAULT 0,
  data_abertura TIMESTAMPTZ DEFAULT NOW(),
  data_fechamento TIMESTAMPTZ,
  fechado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS empresa_id TEXT;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS aberto_por_usuario_id TEXT;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS operador TEXT DEFAULT 'Operador';
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS usuario TEXT;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS situacao TEXT;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS aberto BOOLEAN DEFAULT true;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS valor_abertura NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS valor_inicial NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS fundo_troco NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS data_abertura TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS data_fechamento TIMESTAMPTZ;
ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS fechado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessoes_caixa_empresa ON public.sessoes_caixa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_caixa_status ON public.sessoes_caixa(status);
CREATE INDEX IF NOT EXISTS idx_sessoes_caixa_abertura ON public.sessoes_caixa(data_abertura DESC);

CREATE TABLE IF NOT EXISTS public.historico_caixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT,
  empresa_id TEXT,
  data_fechamento TIMESTAMPTZ DEFAULT NOW(),
  total_vendas NUMERIC(12,2) DEFAULT 0,
  total_despesas NUMERIC(12,2) DEFAULT 0,
  saldo_final NUMERIC(12,2) DEFAULT 0,
  dados_completos_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.historico_caixas ADD COLUMN IF NOT EXISTS usuario_id TEXT;
ALTER TABLE public.historico_caixas ADD COLUMN IF NOT EXISTS empresa_id TEXT;
ALTER TABLE public.historico_caixas ADD COLUMN IF NOT EXISTS dados_completos_json JSONB;

CREATE INDEX IF NOT EXISTS idx_historico_caixas_empresa ON public.historico_caixas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_historico_caixas_fechamento ON public.historico_caixas(data_fechamento DESC);

CREATE TABLE IF NOT EXISTS public.fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  company_id TEXT,
  data TEXT NOT NULL,
  data_abertura TIMESTAMPTZ,
  data_fechamento TIMESTAMPTZ,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  operador TEXT,
  status TEXT DEFAULT 'aberto',
  session_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, data)
);

CREATE TABLE IF NOT EXISTS public.fluxo_caixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  company_id TEXT,
  data TEXT NOT NULL,
  data_abertura TIMESTAMPTZ,
  data_fechamento TIMESTAMPTZ,
  valor_abertura NUMERIC(12,2) DEFAULT 0,
  operador TEXT,
  status TEXT DEFAULT 'aberto',
  session_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, data)
);

-- ==============================================================================
-- 4. VENDAS, ORÇAMENTOS, TRANSAÇÕES E CLIENTES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  use_motoboy BOOLEAN DEFAULT false,
  motoboy_cost NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  down_payment NUMERIC(12,2) DEFAULT 0,
  operation_cost NUMERIC(12,2) DEFAULT 0,
  cost_items JSONB DEFAULT '[]'::jsonb,
  total_value NUMERIC(12,2) DEFAULT 0,
  balance_due NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  client_image TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_budget BOOLEAN DEFAULT false,
  payment_method TEXT DEFAULT 'dinheiro',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'dinheiro';

CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_is_budget ON public.sales(is_budget);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date DESC);

CREATE TABLE IF NOT EXISTS public.vendas (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  total NUMERIC(12,2) DEFAULT 0,
  valor_motoboy NUMERIC(12,2) DEFAULT 0,
  endereco_entrega TEXT,
  data_criacao TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT,
  sessao_caixa_id UUID,
  atendente_id TEXT,
  cliente_nome TEXT DEFAULT 'Consumidor Final',
  cliente_documento TEXT,
  tipo TEXT DEFAULT 'venda',
  forma_pagamento TEXT DEFAULT 'dinheiro',
  valor_total NUMERIC(12,2) DEFAULT 0,
  desconto NUMERIC(12,2) DEFAULT 0,
  valor_liquido NUMERIC(12,2) DEFAULT 0,
  percentual_comissao NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.itens_transacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transacao_id UUID REFERENCES public.transacoes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(12,3) DEFAULT 1,
  preco_unitario NUMERIC(12,2) DEFAULT 0,
  custo_unitario NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  nome TEXT,
  phone TEXT,
  telefone TEXT,
  email TEXT,
  cpf_cnpj TEXT,
  cep TEXT,
  address TEXT,
  endereco TEXT,
  number TEXT,
  numero TEXT,
  neighborhood TEXT,
  bairro TEXT,
  city TEXT,
  cidade TEXT,
  state TEXT,
  estado TEXT,
  notes TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);

-- ==============================================================================
-- 5. DESPESAS, CONTAS MENSAIS E METAS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL DEFAULT 'Geral',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date DESC);

CREATE TABLE IF NOT EXISTS public.gastos_mensais (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  value NUMERIC(12,2) DEFAULT 0,
  category TEXT,
  due_date TEXT,
  "dueDate" TEXT,
  observation TEXT,
  nome TEXT,
  descricao TEXT,
  valor NUMERIC(12,2) DEFAULT 0,
  categoria TEXT,
  vencimento TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_mensais_user_id ON public.gastos_mensais(user_id);

CREATE TABLE IF NOT EXISTS public.goals (
  user_id TEXT PRIMARY KEY,
  goal_value NUMERIC(12,2) DEFAULT 0,
  goal_type TEXT DEFAULT 'daily',
  notified_goal_value NUMERIC(12,2) DEFAULT -1,
  notified_goal_date TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. PRODUTOS E VENDAS RÁPIDAS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.produtos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT,
  name TEXT,
  cost_price NUMERIC(12,2) DEFAULT 0,
  "costPrice" NUMERIC(12,2) DEFAULT 0,
  sale_price NUMERIC(12,2) DEFAULT 0,
  "salePrice" NUMERIC(12,2) DEFAULT 0,
  profit NUMERIC(12,2) DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  "minStock" INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  "currentStock" INTEGER DEFAULT 0,
  nome TEXT,
  descricao TEXT,
  preco_custo NUMERIC(12,2) DEFAULT 0,
  preco_venda NUMERIC(12,2) DEFAULT 0,
  valor_custo NUMERIC(12,2) DEFAULT 0,
  valor_venda NUMERIC(12,2) DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 0,
  estoque_atual INTEGER DEFAULT 0,
  lucro NUMERIC(12,2) DEFAULT 0,
  unidade TEXT DEFAULT 'un',
  categoria TEXT DEFAULT 'Geral',
  status TEXT DEFAULT 'ativo',
  is_draft BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'un';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'Geral';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_produtos_user_id ON public.produtos(user_id);

CREATE TABLE IF NOT EXISTS public.quick_sales (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  gradient TEXT DEFAULT 'from-purple-600 via-fuchsia-600 to-pink-500',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_sales_user_id ON public.quick_sales(user_id);

CREATE TABLE IF NOT EXISTS public.vendas_rapidas_itens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT,
  descricao TEXT,
  price NUMERIC(12,2) DEFAULT 0,
  preco NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  custo NUMERIC(12,2) DEFAULT 0,
  gradient TEXT DEFAULT 'from-purple-600 via-fuchsia-600 to-pink-500',
  cor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_rapidas_itens_user_id ON public.vendas_rapidas_itens(user_id);

-- ==============================================================================
-- 7. BACKUPS, CONFIGURAÇÕES GLOBAIS E SUPORTE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.meus_dados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meus_dados_user_id ON public.meus_dados(user_id);

CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  id TEXT PRIMARY KEY DEFAULT 'global_structure',
  versao TEXT DEFAULT 'ativa',
  status TEXT DEFAULT 'ativa',
  versao_timestamp BIGINT,
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  dados_estrutura JSONB
);

CREATE TABLE IF NOT EXISTS public.configuracoes_suporte (
  id TEXT PRIMARY KEY DEFAULT 'default',
  horario_inicio TEXT DEFAULT '09:00',
  horario_fim TEXT DEFAULT '19:00',
  mensagem_fechado TEXT
);

CREATE TABLE IF NOT EXISTS public.support_feedbacks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  audio_url TEXT,
  message TEXT,
  resposta_admin TEXT,
  respondido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) - LIBERAÇÃO PARA SINCRONIZAÇÃO MULTI-TERMINAL
-- ==============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'profiles', 'sub_usuarios', 'atendentes', 'usuarios', 'assinaturas',
    'company_profile', 'empresa_config', 'caixa_status', 'sessoes_caixa',
    'historico_caixas', 'fluxo_caixa', 'fluxo_caixas', 'sales', 'vendas',
    'transacoes', 'itens_transacao', 'clientes', 'expenses', 'gastos_mensais',
    'goals', 'produtos', 'quick_sales', 'vendas_rapidas_itens', 'meus_dados',
    'configuracoes_sistema', 'configuracoes_suporte', 'support_feedbacks'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access on %I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow all access on %I" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- 9. REALTIME PUBLICATION
-- ==============================================================================

DO $$
DECLARE
  tbl TEXT;
  rt_tables TEXT[] := ARRAY[
    'users', 'profiles', 'company_profile', 'empresa_config', 'caixa_status',
    'sessoes_caixa', 'historico_caixas', 'fluxo_caixa', 'sales', 'expenses',
    'gastos_mensais', 'goals', 'produtos', 'clientes', 'assinaturas',
    'configuracoes_sistema', 'meus_dados'
  ];
BEGIN
  FOREACH tbl IN ARRAY rt_tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ==============================================================================
-- 10. STORAGE BUCKETS (COMPROVANTES E LOGOS)
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access Comprovantes" ON storage.objects;
CREATE POLICY "Public Access Comprovantes" ON storage.objects
  FOR ALL USING (bucket_id IN ('comprovantes', 'logos'))
  WITH CHECK (bucket_id IN ('comprovantes', 'logos'));
