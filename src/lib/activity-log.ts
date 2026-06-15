import { supabase } from "@/integrations/supabase/client";

export type ActionType = "login" | "logout" | "acesso" | "criacao" | "edicao" | "exclusao" | "finalizacao";

interface LogParams {
  actionType: ActionType;
  module: string;
  description: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Desktop";
}

/**
 * Fire-and-forget activity log. Runs in background, never blocks UI.
 */
export async function logActivity(params: LogParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    let userName: string | null = null;
    let companyId: string | null = null;
    if (userId) {
      const { data } = await supabase
        .from("profiles")
        .select("nome, company_id")
        .eq("user_id", userId)
        .maybeSingle();
      userName = (data as any)?.nome ?? session?.user?.email ?? null;
      companyId = (data as any)?.company_id ?? null;
    }

    await supabase.from("activity_logs" as any).insert({
      user_id: userId,
      user_name: userName,
      company_id: companyId,
      action_type: params.actionType,
      module: params.module,
      description: params.description,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      device: getDeviceInfo(),
    });
  } catch {
    // Never throw — logging must not break the app
  }
}

/**
 * Compute a diff between old and new objects, returning only changed keys.
 */
export function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { old_value: Record<string, unknown>; new_value: Record<string, unknown> } | null {
  const old_value: Record<string, unknown> = {};
  const new_value: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      old_value[key] = oldObj[key] ?? null;
      new_value[key] = newObj[key] ?? null;
    }
  }

  return Object.keys(old_value).length > 0 ? { old_value, new_value } : null;
}