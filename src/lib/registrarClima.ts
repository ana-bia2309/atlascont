import { supabase } from "@/integrations/supabase/client";

export async function registrarClimaOS(osId: string): Promise<void> {
  try {
    console.log("[registrarClima] Iniciando para OS:", osId);
    // Brasília coordenadas
    const lat = -15.7801;
    const lon = -47.9292;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=America/Sao_Paulo`;

    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    const temp = data.current?.temperature_2m;
    const code = data.current?.weathercode;

    const condicao = interpretarClima(code);
    console.log("[registrarClima] Temp:", temp, "Condição:", condicao);

    await (supabase as any)
      .from("ordens_servico")
      .update({
        clima_temperatura: temp,
        clima_condicao: condicao,
        clima_registrado_em: new Date().toISOString(),
      })
      .eq("id", osId);

  } catch (e) {
    console.warn("[registrarClima] Erro:", e);
  }
}

function interpretarClima(code: number): string {
  if (code === 0) return "☀️ Céu limpo";
  if (code <= 3) return "⛅ Parcialmente nublado";
  if (code <= 9) return "🌫️ Nebuloso";
  if (code <= 19) return "🌦️ Garoa";
  if (code <= 29) return "⛈️ Tempestade";
  if (code <= 39) return "🌨️ Neve";
  if (code <= 49) return "🌫️ Névoa";
  if (code <= 59) return "🌧️ Chuva fraca";
  if (code <= 69) return "🌧️ Chuva moderada";
  if (code <= 79) return "❄️ Neve";
  if (code <= 84) return "🌦️ Aguaceiro";
  if (code <= 94) return "⛈️ Tempestade com raios";
  return "🌩️ Tempestade severa";
}