-- DOPAMINA 3D | MIGRAÇÃO DE SEGURANÇA E DADOS INTERNOS
-- Faça backup antes de executar. Execute uma única vez no SQL Editor.

-- 0) Garante o campo de estoque usado pelo portal.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0);

-- 1) Desativação controlada de contas.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Custos deixam de ficar na tabela de catálogo acessível a usuários autenticados.
CREATE TABLE IF NOT EXISTS public.product_internal_data (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_internal_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manages product internal data" ON public.product_internal_data;
CREATE POLICY "admin manages product internal data" ON public.product_internal_data
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Migra custos antigos, quando a coluna existir.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='cost_price') THEN
   EXECUTE 'INSERT INTO public.product_internal_data(product_id,cost_price) SELECT id,cost_price FROM public.products ON CONFLICT(product_id) DO UPDATE SET cost_price=EXCLUDED.cost_price';
   EXECUTE 'ALTER TABLE public.products DROP COLUMN cost_price';
 END IF;
END $$;

-- 3) O papel de usuário só é considerado válido enquanto a conta estiver ativa.
CREATE OR REPLACE FUNCTION public.current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() AND is_active=true $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT coalesce(public.current_role()='admin',false) $$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT coalesce(public.current_role() IN ('admin','collaborator'),false) $$;

-- 4) Impede que usuário comum altere papel ou estado do próprio perfil.
DROP POLICY IF EXISTS "admin manages profiles" ON public.profiles;
CREATE POLICY "admin manages profiles" ON public.profiles FOR ALL TO authenticated
 USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "profile self or staff read" ON public.profiles;
CREATE POLICY "profile self or staff read" ON public.profiles FOR SELECT TO authenticated
 USING (id=auth.uid() OR public.is_staff());

-- 5) Limita criação de pedidos a contas ativas com papel reseller.
DROP POLICY IF EXISTS "reseller creates own order" ON public.orders;
CREATE POLICY "reseller creates own order" ON public.orders FOR INSERT TO authenticated
 WITH CHECK (reseller_id=auth.uid() AND public.current_role()='reseller');

-- 6) Remova qualquer política ampla antiga de leitura pública de produtos, se houver.
-- O catálogo público pode continuar lendo apenas se uma política anon específica for criada
-- para os campos públicos via view/RPC. Não conceda SELECT anon em products com dados internos.
REVOKE ALL ON public.product_internal_data FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_internal_data TO authenticated;

-- IMPORTANTE: revise as policies de storage e as policies existentes no Supabase.
-- As contas desativadas devem ser também banidas no Auth pelo fluxo administrativo (Edge Function).
