-- Add branch column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch TEXT;

-- Add branch column to deposits table
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS branch TEXT;

-- Update record_deposit function to include branch
CREATE OR REPLACE FUNCTION public.record_deposit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deposit_amount > 0 AND NEW.deposit_method IS NOT NULL THEN
    INSERT INTO public.deposits (order_id, order_number, customer_name, amount, method, version_id, branch)
    VALUES (NEW.id, NEW.order_number, NEW.customer_name, NEW.deposit_amount, NEW.deposit_method, NEW.version_id, NEW.branch);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
