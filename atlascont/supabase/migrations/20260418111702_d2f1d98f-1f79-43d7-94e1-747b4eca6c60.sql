CREATE OR REPLACE FUNCTION public.is_business_day(d date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXTRACT(DOW FROM d) NOT IN (0,6) AND NOT public.is_br_holiday(d);
$$;

CREATE OR REPLACE FUNCTION public.next_business_day_from(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.next_business_day(d);
$$;