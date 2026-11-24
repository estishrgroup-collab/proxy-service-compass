CREATE TABLE public.telegram_customers (
  telegram_user_id BIGINT PRIMARY KEY,
  telegram_chat_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_customers TO service_role;
ALTER TABLE public.telegram_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL REFERENCES public.telegram_customers(telegram_user_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'refund', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
  reference_id TEXT UNIQUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_transactions_user_created ON public.wallet_transactions (telegram_user_id, created_at DESC);

GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.proxy_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL REFERENCES public.telegram_customers(telegram_user_id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('exclusive', 'turbo')),
  supplier_proxy_id TEXT NOT NULL,
  supplier_order_id TEXT,
  hours INTEGER CHECK (hours IS NULL OR hours >= 1),
  country TEXT,
  region TEXT,
  city TEXT,
  isp TEXT,
  wholesale_cents INTEGER NOT NULL CHECK (wholesale_cents >= 0),
  retail_cents INTEGER NOT NULL CHECK (retail_cents >= 0),
  profit_cents INTEGER GENERATED ALWAYS AS (retail_cents - wholesale_cents) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'failed', 'refunded')),
  failure_reason TEXT,
  socks_host TEXT,
  socks_port INTEGER,
  socks_username TEXT,
  socks_password TEXT,
  real_ip TEXT,
  source_update_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proxy_orders_user_created ON public.proxy_orders (telegram_user_id, created_at DESC);

GRANT ALL ON public.proxy_orders TO service_role;
ALTER TABLE public.proxy_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.telegram_bot_sessions
  DROP CONSTRAINT IF EXISTS telegram_bot_sessions_state_check;

ALTER TABLE public.telegram_bot_sessions
  ADD COLUMN IF NOT EXISTS country_filter TEXT,
  ADD COLUMN IF NOT EXISTS page INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_proxy_id TEXT,
  ADD COLUMN IF NOT EXISTS selected_proxy_json JSONB;

ALTER TABLE public.telegram_bot_sessions
  ADD CONSTRAINT telegram_bot_sessions_state_check
  CHECK (state IN ('browsing', 'awaiting_filter', 'awaiting_details'));

CREATE OR REPLACE FUNCTION public.credit_telegram_wallet(
  p_user_id BIGINT,
  p_chat_id BIGINT,
  p_amount_cents INTEGER,
  p_type TEXT,
  p_reference_id TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (applied BOOLEAN, balance_cents INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_new_balance INTEGER;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  INSERT INTO public.telegram_customers (telegram_user_id, telegram_chat_id)
  VALUES (p_user_id, p_chat_id)
  ON CONFLICT (telegram_user_id) DO UPDATE
    SET telegram_chat_id = EXCLUDED.telegram_chat_id,
        updated_at = now();

  IF p_reference_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.wallet_transactions
    WHERE reference_id = p_reference_id;

    IF v_existing IS NOT NULL THEN
      SELECT c.balance_cents INTO v_new_balance
      FROM public.telegram_customers c
      WHERE c.telegram_user_id = p_user_id;
      RETURN QUERY SELECT FALSE, v_new_balance;
      RETURN;
    END IF;
  END IF;

  UPDATE public.telegram_customers c
  SET balance_cents = c.balance_cents + p_amount_cents,
      updated_at = now()
  WHERE c.telegram_user_id = p_user_id
  RETURNING c.balance_cents INTO v_new_balance;

  INSERT INTO public.wallet_transactions (
    telegram_user_id, type, amount_cents, balance_after_cents, reference_id, note
  )
  VALUES (
    p_user_id, p_type, p_amount_cents, v_new_balance, p_reference_id, p_note
  );

  RETURN QUERY SELECT TRUE, v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.debit_telegram_wallet(
  p_user_id BIGINT,
  p_amount_cents INTEGER,
  p_reference_id TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, balance_cents INTEGER, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_existing UUID;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Debit amount must be positive';
  END IF;

  IF p_reference_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.wallet_transactions
    WHERE reference_id = p_reference_id;

    IF v_existing IS NOT NULL THEN
      SELECT c.balance_cents INTO v_current_balance
      FROM public.telegram_customers c
      WHERE c.telegram_user_id = p_user_id;
      RETURN QUERY SELECT TRUE, COALESCE(v_current_balance, 0), 'already_debited'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT c.balance_cents INTO v_current_balance
  FROM public.telegram_customers c
  WHERE c.telegram_user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'customer_not_found'::TEXT;
    RETURN;
  END IF;

  IF v_current_balance < p_amount_cents THEN
    RETURN QUERY SELECT FALSE, v_current_balance, 'insufficient_balance'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount_cents;

  UPDATE public.telegram_customers c
  SET balance_cents = v_new_balance,
      updated_at = now()
  WHERE c.telegram_user_id = p_user_id;

  INSERT INTO public.wallet_transactions (
    telegram_user_id, type, amount_cents, balance_after_cents, reference_id, note
  )
  VALUES (
    p_user_id, 'purchase', -p_amount_cents, v_new_balance, p_reference_id, p_note
  );

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_telegram_wallet(BIGINT, BIGINT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_telegram_wallet(BIGINT, BIGINT, INTEGER, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.debit_telegram_wallet(BIGINT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_telegram_wallet(BIGINT, INTEGER, TEXT, TEXT) TO service_role;