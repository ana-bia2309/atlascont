-- Ajusta proxima_execucao das preventivas para o próximo dia útil
-- quando estiver em fim de semana ou feriado nacional brasileiro.

CREATE OR REPLACE FUNCTION public.is_br_holiday(d date)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  y int := EXTRACT(YEAR FROM d)::int;
  a int; b int; c int; dd int; e int; f int; g int; h int; i int; k int; l int; m int;
  e_month int; e_day int;
  easter date;
  fixed_holidays date[];
BEGIN
  fixed_holidays := ARRAY[
    make_date(y,1,1), make_date(y,4,21), make_date(y,5,1), make_date(y,9,7),
    make_date(y,10,12), make_date(y,11,2), make_date(y,11,15), make_date(y,12,25)
  ];
  IF d = ANY(fixed_holidays) THEN RETURN true; END IF;

  a := y % 19;
  b := y / 100;
  c := y % 100;
  dd := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19*a + b - dd - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2*e + 2*i - h - k) % 7;
  m := (a + 11*h + 22*l) / 451;
  e_month := (h + l - 7*m + 114) / 31;
  e_day := ((h + l - 7*m + 114) % 31) + 1;
  easter := make_date(y, e_month, e_day);

  IF d = easter - 47 THEN RETURN true; END IF; -- Carnaval
  IF d = easter - 2  THEN RETURN true; END IF; -- Sexta Santa
  IF d = easter + 60 THEN RETURN true; END IF; -- Corpus Christi

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_business_day(d date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result date := d;
BEGIN
  WHILE EXTRACT(DOW FROM result) IN (0,6) OR public.is_br_holiday(result) LOOP
    result := result + 1;
  END LOOP;
  RETURN result;
END;
$$;

UPDATE public.manutencao_preventiva
SET proxima_execucao = public.next_business_day(proxima_execucao),
    updated_at = now()
WHERE proxima_execucao IS NOT NULL
  AND (EXTRACT(DOW FROM proxima_execucao) IN (0,6) OR public.is_br_holiday(proxima_execucao));