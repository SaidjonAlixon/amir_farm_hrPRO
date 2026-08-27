import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Login/parol: bo‘sh joy, tab, NBSP va zero-width belgilarni olib tashlash */
export function compactCredential(value: string): string {
  return String(value ?? "").replace(/[\s\u00a0\u200b\uFEFF]+/g, "");
}
