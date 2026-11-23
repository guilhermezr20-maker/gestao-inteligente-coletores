-- ============================================================================
-- SISTEMA WEB – GESTÃO INTELIGENTE DE COLETORES
-- Script SQL completo para PostgreSQL / Supabase (Tabelas, Índices, RLS e Funções)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Perfis de Usuários
CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'operador')) DEFAULT 'operador',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Empresas Clientes
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Unidades
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  codigo TEXT,
  cidade TEXT,
  estado TEXT,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unidades_empresa ON public.unidades(empresa_id);

-- 4. Ações / Campanhas
CREATE TABLE IF NOT EXISTS public.acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  mes_referencia INT NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia INT NOT NULL CHECK (ano_referencia BETWEEN 2020 AND 2100),
  status TEXT NOT NULL CHECK (status IN ('aberta', 'concluida')) DEFAULT 'aberta',
  created_by UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acoes_unidade_periodo ON public.acoes(unidade_id, ano_referencia, mes_referencia);

-- 5. Colaboradores (CPF único, protegido e indexado globalmente)
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf_normalizado CHAR(11) NOT NULL UNIQUE,
  cpf_hash CHAR(64) NOT NULL UNIQUE,
  cpf_mascarado TEXT NOT NULL,
  nome TEXT NOT NULL,
  setor TEXT NOT NULL,
  funcao TEXT NOT NULL,
  ultima_empresa_id UUID REFERENCES public.empresas(id),
  ultima_unidade_id UUID REFERENCES public.unidades(id),
  ultima_acao_id UUID REFERENCES public.acoes(id),
  ultima_entrega_id UUID,
  ultima_entrega_data DATE,
  proximo_elegivel_data DATE,
  ultimo_exame_data DATE,
  possui_coletor_pendente BOOLEAN NOT NULL DEFAULT FALSE,
  total_coletores_recebidos INT NOT NULL DEFAULT 0,
  total_coletores_utilizados INT NOT NULL DEFAULT 0,
  total_exames_realizados INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_cpf ON public.colaboradores(cpf_normalizado);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome ON public.colaboradores USING gin (to_tsvector('portuguese', nome));

-- Histórico de Alterações Cadastrais e Movimentações
CREATE TABLE IF NOT EXISTS public.colaboradores_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  acao_id UUID REFERENCES public.acoes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  data_evento DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colab_hist_colab ON public.colaboradores_historico(colaborador_id, created_at DESC);

-- 6. Importações de Planilhas
CREATE TABLE IF NOT EXISTS public.importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('colaboradores', 'resultados_exames')),
  file_hash CHAR(64) NOT NULL,
  nome_arquivo TEXT NOT NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id),
  acao_id UUID NOT NULL REFERENCES public.acoes(id),
  mes_referencia INT NOT NULL,
  ano_referencia INT NOT NULL,
  total_linhas INT NOT NULL DEFAULT 0,
  novos_colaboradores INT NOT NULL DEFAULT 0,
  atualizados INT NOT NULL DEFAULT 0,
  erros_count INT NOT NULL DEFAULT 0,
  coletores_evitados INT NOT NULL DEFAULT 0,
  responsavel_id UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (acao_id, tipo, file_hash)
);

-- 7. Entregas Individuais de Coletores
CREATE TABLE IF NOT EXISTS public.entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id),
  acao_id UUID NOT NULL REFERENCES public.acoes(id),
  data_entrega DATE NOT NULL DEFAULT CURRENT_DATE,
  data_hora_entrega TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proximo_elegivel_data DATE NOT NULL,
  situacao TEXT NOT NULL CHECK (situacao IN ('pendente_exame', 'utilizado')) DEFAULT 'pendente_exame',
  responsavel_id UUID NOT NULL REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entregas_colaborador_data ON public.entregas(colaborador_id, data_entrega DESC);
CREATE INDEX IF NOT EXISTS idx_entregas_unidade_data ON public.entregas(unidade_id, data_entrega DESC);

-- 8. Exames Realizados
CREATE TABLE IF NOT EXISTS public.exames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  entrega_id UUID REFERENCES public.entregas(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id),
  acao_id UUID NOT NULL REFERENCES public.acoes(id),
  importacao_id UUID REFERENCES public.importacoes(id),
  data_exame DATE NOT NULL,
  realizou_exame TEXT NOT NULL CHECK (realizou_exame IN ('SIM', 'NAO')),
  inconsistencia BOOLEAN NOT NULL DEFAULT FALSE,
  observacao TEXT,
  responsavel_id UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entrega_id)
);

CREATE INDEX IF NOT EXISTS idx_exames_colaborador ON public.exames(colaborador_id, data_exame DESC);

-- 9. Auditoria
CREATE TABLE IF NOT EXISTS public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  descricao TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  usuario_id UUID REFERENCES public.perfis_usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- FUNÇÕES TRANSACIONAIS E REGRA DOS 120 DIAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_elegibilidade_120_dias(
  p_colaborador_id UUID,
  p_data_referencia DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  elegivel BOOLEAN,
  situacao TEXT,
  ultima_entrega DATE,
  proxima_data_elegivel DATE,
  dias_restantes INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_colab public.colaboradores%ROWTYPE;
BEGIN
  SELECT * INTO v_colab FROM public.colaboradores WHERE id = p_colaborador_id;

  IF NOT FOUND OR v_colab.ultima_entrega_data IS NULL THEN
    RETURN QUERY SELECT TRUE, 'SEM_HISTORICO_ENTREGA', NULL::DATE, p_data_referencia, 0;
    RETURN;
  END IF;

  IF p_data_referencia >= (v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE THEN
    RETURN QUERY SELECT
      TRUE,
      'ELEGIVEL_NOVA_ENTREGA',
      v_colab.ultima_entrega_data,
      (v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE,
      0;
    RETURN;
  END IF;

  IF v_colab.possui_coletor_pendente THEN
    RETURN QUERY SELECT
      FALSE,
      'POSSUI_COLETOR',
      v_colab.ultima_entrega_data,
      (v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE,
      ((v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE - p_data_referencia)::INT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    FALSE,
    'EXAME_REALIZADO',
    v_colab.ultima_entrega_data,
    (v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE,
    ((v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE - p_data_referencia)::INT;
END;
$$;

-- Função transacional segura contra entregas simultâneas (SELECT ... FOR UPDATE)
CREATE OR REPLACE FUNCTION public.registrar_entrega_segura(
  p_colaborador_id UUID,
  p_empresa_id UUID,
  p_unidade_id UUID,
  p_acao_id UUID,
  p_responsavel_id UUID,
  p_data_entrega DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_colab public.colaboradores%ROWTYPE;
  v_proxima_data DATE;
  v_entrega_id UUID;
BEGIN
  -- Bloqueio pessimista na linha do colaborador para evitar entregas concorrentes
  SELECT * INTO v_colab
  FROM public.colaboradores
  WHERE id = p_colaborador_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  IF v_colab.ultima_entrega_data IS NOT NULL
     AND p_data_entrega < (v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE THEN
    RAISE EXCEPTION 'Colaborador bloqueado pela regra de 120 dias. Próxima data elegível: %',
      TO_CHAR((v_colab.ultima_entrega_data + INTERVAL '120 days')::DATE, 'DD/MM/YYYY');
  END IF;

  v_proxima_data := (p_data_entrega + INTERVAL '120 days')::DATE;

  INSERT INTO public.entregas (
    colaborador_id, empresa_id, unidade_id, acao_id,
    data_entrega, proximo_elegivel_data, situacao, responsavel_id
  )
  VALUES (
    p_colaborador_id, p_empresa_id, p_unidade_id, p_acao_id,
    p_data_entrega, v_proxima_data, 'pendente_exame', p_responsavel_id
  )
  RETURNING id INTO v_entrega_id;

  UPDATE public.colaboradores
  SET
    ultima_empresa_id = p_empresa_id,
    ultima_unidade_id = p_unidade_id,
    ultima_acao_id = p_acao_id,
    ultima_entrega_id = v_entrega_id,
    ultima_entrega_data = p_data_entrega,
    proximo_elegivel_data = v_proxima_data,
    possui_coletor_pendente = TRUE,
    total_coletores_recebidos = total_coletores_recebidos + 1,
    updated_at = NOW()
  WHERE id = p_colaborador_id;

  INSERT INTO public.auditoria (tipo, entidade, entidade_id, descricao, usuario_id)
  VALUES ('ENTREGA', 'entregas', v_entrega_id::TEXT, 'Entrega de coletor registrada com validação de 120 dias.', p_responsavel_id);

  RETURN v_entrega_id;
END;
$$;

-- Row Level Security (RLS)
ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ativos leem proprio perfil ou admin le todos"
  ON public.perfis_usuarios FOR SELECT
  USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM public.perfis_usuarios p WHERE p.id = auth.uid() AND p.perfil = 'admin' AND p.ativo = TRUE)
  );

CREATE POLICY "Apenas usuarios ativos autenticados acessam tabelas operacionais"
  ON public.colaboradores FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.perfis_usuarios p WHERE p.id = auth.uid() AND p.ativo = TRUE)
  );
