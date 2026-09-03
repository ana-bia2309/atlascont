import { useEffect, useState } from "react";

// Fixo em Brasília por enquanto. Quando a empresa tiver cidade cadastrada,
// trocar CIDADE_QUERY por algo como `${empresa.cidade},${empresa.uf},BR`.
const CIDADE_QUERY = "Brasilia,BR";
const CIDADE_LABEL = "Brasília";

// Chave do plano free da OpenWeatherMap, lida de variável de ambiente
// (nunca commitada no código -- ver VITE_OPENWEATHER_API_KEY no .env local
// e nas variáveis de ambiente do deploy).
const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

type WeatherData = { temp: number; description: string; icon: string };

export default function DashboardWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!OPENWEATHER_API_KEY) { setError(true); return; }
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${CIDADE_QUERY}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`
        );
        if (!res.ok) throw new Error("weather fetch failed");
        const data = await res.json();
        if (!cancelled) {
          setWeather({
            temp: Math.round(data.main.temp),
            description: data.weather?.[0]?.description || "",
            icon: data.weather?.[0]?.icon || "01d",
          });
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    fetchWeather();
    // Atualiza a cada 15 minutos -- clima não muda rápido o suficiente pra justificar mais que isso
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error || !weather) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
        alt={weather.description}
        className="h-6 w-6 -my-1"
      />
      <span className="font-medium text-foreground">{weather.temp}°C</span>
      <span className="hidden sm:inline">· {CIDADE_LABEL}</span>
    </div>
  );
}
