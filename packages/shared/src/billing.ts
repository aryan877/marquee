type PlanId = 'FREE' | 'FOUNDER';

interface PlanConfig {
  id: PlanId;
  label: string;
  blurb: string;
  postsPerPeriod: number;
  priceUsd: number;
  priorityLane: 'standard' | 'priority';
  features: readonly string[];
  dodoProductIdEnv?: string;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  FREE: {
    id: 'FREE',
    label: 'Free',
    blurb: 'Marquee is free during launch — full features.',
    postsPerPeriod: 30,
    priceUsd: 0,
    priorityLane: 'standard',
    features: [
      'Up to 30 posts / 30 days',
      'Posters + videos + carousels',
      'One brand profile',
      'Manual approval before posting',
    ],
  },
  FOUNDER: {
    id: 'FOUNDER',
    label: 'Founder Pass',
    blurb: 'Full autopilot. Skip the line.',
    postsPerPeriod: 300,
    priceUsd: 50,
    priorityLane: 'priority',
    features: [
      'Up to 300 posts / month',
      'Unlimited brand profiles',
      'Daily autopilot scheduling',
      'Priority generation queue',
      'Direct DM support',
    ],
    dodoProductIdEnv: 'DODO_PRODUCT_ID_FOUNDER',
  },
} as const;

export function getPlan(id: string | null | undefined): PlanConfig {
  const upper = (id ?? 'FREE').toUpperCase() as PlanId;
  return PLANS[upper] ?? PLANS.FREE;
}

export function postBudgetFor(plan: PlanId): number {
  return PLANS[plan].postsPerPeriod;
}
