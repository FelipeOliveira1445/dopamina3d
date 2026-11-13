-- Dopamina 3D: campos simples de estoque e custo unitário.
-- Execute uma única vez em Supabase > SQL Editor.
-- Valores iniciais: custo = R$ 0,00 e estoque = 0 para produtos já cadastrados.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) NOT NULL DEFAULT 0
    CHECK (cost_price >= 0),
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0
    CHECK (stock_quantity >= 0);

COMMENT ON COLUMN public.products.cost_price IS
  'Custo unitário informado manualmente pelo administrador; não inclui despesas indiretas.';
COMMENT ON COLUMN public.products.stock_quantity IS
  'Quantidade física disponível, atualizada manualmente pela administração.';
