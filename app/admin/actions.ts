"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieOptions } from "@/lib/cookies";
import {
  ADMIN_COOKIE,
  createAdminValue,
  isAdminCodeValid,
  logCodeAttempt,
} from "@/lib/session";

export type AdminState = { error: string | null };

export async function adminEnterAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const code = String(formData.get("code") ?? "");
  if (!code.trim()) return { error: "הקלד את קוד הרכז" };

  await new Promise((r) => setTimeout(r, 400));

  await logCodeAttempt("רכז", code, process.env.ADMIN_ACCESS_CODE);

  if (!isAdminCodeValid(code)) {
    return { error: "הקוד שגוי." };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, await createAdminValue(), await sessionCookieOptions());

  redirect("/event");
}

export async function adminSignOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/");
}
