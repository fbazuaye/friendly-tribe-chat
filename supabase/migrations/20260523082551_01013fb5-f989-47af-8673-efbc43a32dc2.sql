
CREATE OR REPLACE FUNCTION public.grant_welcome_tokens(_user_id uuid, _org_id uuid, _amount integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wallet public.organization_wallets;
  _existing public.user_token_allocations;
  _already_granted boolean;
  _balance_before integer;
  _balance_after integer;
BEGIN
  -- Only the user themselves can trigger this grant (from join flow)
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Idempotency: skip if a prior welcome grant already exists for this user+org
  SELECT EXISTS (
    SELECT 1 FROM public.token_transactions
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND transaction_type = 'allocation'
      AND COALESCE(metadata->>'reason', '') = 'welcome_grant'
  ) INTO _already_granted;

  IF _already_granted THEN
    RETURN 0;
  END IF;

  -- Lock wallet row to prevent race conditions
  SELECT * INTO _wallet FROM public.organization_wallets
  WHERE organization_id = _org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Check available capacity
  IF (_wallet.total_tokens - _wallet.tokens_allocated) < _amount THEN
    RETURN 0;
  END IF;

  -- Upsert user allocation
  SELECT * INTO _existing FROM public.user_token_allocations
  WHERE user_id = _user_id AND organization_id = _org_id
  FOR UPDATE;

  IF FOUND THEN
    _balance_before := _existing.current_balance;
    _balance_after := _existing.current_balance + _amount;
    UPDATE public.user_token_allocations
    SET current_balance = _balance_after,
        updated_at = now()
    WHERE id = _existing.id;
  ELSE
    _balance_before := 0;
    _balance_after := _amount;
    INSERT INTO public.user_token_allocations
      (user_id, organization_id, current_balance, monthly_quota, allocated_by)
    VALUES (_user_id, _org_id, _amount, 0, _user_id);
  END IF;

  -- Reserve from wallet
  UPDATE public.organization_wallets
  SET tokens_allocated = tokens_allocated + _amount,
      updated_at = now()
  WHERE id = _wallet.id;

  -- Audit transaction
  INSERT INTO public.token_transactions
    (user_id, organization_id, transaction_type, amount,
     balance_before, balance_after, metadata)
  VALUES
    (_user_id, _org_id, 'allocation', _amount,
     _balance_before, _balance_after,
     jsonb_build_object('reason', 'welcome_grant'));

  RETURN _amount;
END;
$$;
