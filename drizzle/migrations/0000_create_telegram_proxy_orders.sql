CREATE TABLE public.telegram_bot_sessions (
  telegram_chat_id BIGINT PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('exclusive', 'turbo')),
  state TEXT NOT NULL DEFAULT 'awaiting_details' CHECK (state IN ('awaiting_details')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.telegram_bot_sessions TO service_role;
ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_order_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('exclusive', 'turbo')),
  request_details TEXT NOT NULL CHECK (char_length(request_details) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  source_update_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.telegram_order_requests TO service_role;
ALTER TABLE public.telegram_order_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX telegram_order_requests_status_created_idx ON public.telegram_order_requests (status, created_at DESC);