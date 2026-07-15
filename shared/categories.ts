export const CATEGORIES = [
  { slug: "gold", label: "Gold" },
  { slug: "diamond-gold", label: "Diamond with Gold" },
  { slug: "stone-studded", label: "Stone-studded" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map(c => c.slug) as [
  CategorySlug,
  ...CategorySlug[],
];

export function categoryLabel(slug: string): string {
  return CATEGORIES.find(c => c.slug === slug)?.label ?? slug;
}

export const TIMELINES = [
  "Within 1 week",
  "1-2 weeks",
  "2-4 weeks",
  "1-2 months",
  "Flexible",
] as const;
