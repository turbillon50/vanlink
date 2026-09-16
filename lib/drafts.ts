export type Draft = {
  id: string;
  amount: string;
  concept: string;
  expiresIn: string;
  createdAt: string;
};
const KEY = "vandefi.link-drafts.v1";
export function normalizeAmount(raw: string): string | null {
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(value) || Number(value) <= 0) return null;
  return value;
}
export function readDrafts(): Draft[] {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is Draft =>
    Boolean(
      d &&
      typeof d.id === "string" &&
      typeof d.amount === "string" &&
      normalizeAmount(d.amount) &&
      typeof d.concept === "string" &&
      typeof d.expiresIn === "string" &&
      typeof d.createdAt === "string",
    ),
  );
}
export function saveDraft(draft: Draft) {
  const current = readDrafts();
  localStorage.setItem(KEY, JSON.stringify([draft, ...current]));
}
