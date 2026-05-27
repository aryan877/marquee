import type { ComponentType, SVGProps } from 'react';
import {
  siX, siInstagram, siFacebook, siTiktok, siYoutube,
  siBluesky, siThreads, siPinterest, siGoogle,
  siMastodon, siDiscord, siTelegram,
} from 'simple-icons';
import { LIVE_SOCIAL_PLATFORMS, type SocialPlatformZ } from '@marquee/shared/schemas';

type IconSpec = { title: string; hex: string; path: string };

function fromSimple(spec: IconSpec) {
  const Icon = (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-label={spec.title} role="img" {...p}>
      <path d={spec.path} />
    </svg>
  );
  Icon.displayName = `Icon_${spec.title}`;
  return Icon;
}

const LINKEDIN: IconSpec = {
  title: 'LinkedIn',
  hex: '0A66C2',
  path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z',
};
const GOOGLE_BUSINESS: IconSpec = { ...siGoogle, title: 'Google Business' };

const ICONS: Record<SocialPlatformZ, IconSpec> = {
  TWITTER:         siX as IconSpec,
  INSTAGRAM:       siInstagram as IconSpec,
  LINKEDIN:        LINKEDIN,
  FACEBOOK:        siFacebook as IconSpec,
  TIKTOK:          siTiktok as IconSpec,
  YOUTUBE:         siYoutube as IconSpec,
  BLUESKY:         siBluesky as IconSpec,
  THREADS:         siThreads as IconSpec,
  PINTEREST:       siPinterest as IconSpec,
  GOOGLE_BUSINESS: GOOGLE_BUSINESS,
  MASTODON:        siMastodon as IconSpec,
  DISCORD:         siDiscord as IconSpec,
  TELEGRAM:        siTelegram as IconSpec,
};

export const PLATFORM_META: Record<SocialPlatformZ, {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint: string;
  chip: string;
  status: 'live' | 'approval' | 'soon';
}> = {
  TWITTER:         { label: 'X / Twitter',     Icon: fromSimple(ICONS.TWITTER),         tint: 'text-[var(--color-ink)]', chip: 'bg-[var(--color-paper-2)]', status: 'live' },
  INSTAGRAM:       { label: 'Instagram',       Icon: fromSimple(ICONS.INSTAGRAM),       tint: `text-[#${ICONS.INSTAGRAM.hex}]`, chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  LINKEDIN:        { label: 'LinkedIn',        Icon: fromSimple(ICONS.LINKEDIN),        tint: `text-[#${ICONS.LINKEDIN.hex}]`,  chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  FACEBOOK:        { label: 'Facebook',        Icon: fromSimple(ICONS.FACEBOOK),        tint: `text-[#${ICONS.FACEBOOK.hex}]`,  chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  TIKTOK:          { label: 'TikTok',          Icon: fromSimple(ICONS.TIKTOK),          tint: 'text-[var(--color-ink)]',        chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  YOUTUBE:         { label: 'YouTube',         Icon: fromSimple(ICONS.YOUTUBE),         tint: `text-[#${ICONS.YOUTUBE.hex}]`,   chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  BLUESKY:         { label: 'Bluesky',         Icon: fromSimple(ICONS.BLUESKY),         tint: `text-[#${ICONS.BLUESKY.hex}]`,   chip: 'bg-[var(--color-paper-2)]', status: 'live' },
  THREADS:         { label: 'Threads',         Icon: fromSimple(ICONS.THREADS),         tint: 'text-[var(--color-ink)]',        chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  PINTEREST:       { label: 'Pinterest',       Icon: fromSimple(ICONS.PINTEREST),       tint: `text-[#${ICONS.PINTEREST.hex}]`, chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  GOOGLE_BUSINESS: { label: 'Google Business', Icon: fromSimple(ICONS.GOOGLE_BUSINESS), tint: `text-[#${ICONS.GOOGLE_BUSINESS.hex}]`, chip: 'bg-[var(--color-paper-2)]', status: 'approval' },
  MASTODON:        { label: 'Mastodon',        Icon: fromSimple(ICONS.MASTODON),        tint: `text-[#${ICONS.MASTODON.hex}]`,  chip: 'bg-[var(--color-paper-2)]', status: 'live' },
  DISCORD:         { label: 'Discord',         Icon: fromSimple(ICONS.DISCORD),         tint: `text-[#${ICONS.DISCORD.hex}]`,   chip: 'bg-[var(--color-paper-2)]', status: 'live' },
  TELEGRAM:        { label: 'Telegram',        Icon: fromSimple(ICONS.TELEGRAM),        tint: `text-[#${ICONS.TELEGRAM.hex}]`,  chip: 'bg-[var(--color-paper-2)]', status: 'live' },
};

export const isLiveSocialPlatform = (platform: SocialPlatformZ) =>
  LIVE_SOCIAL_PLATFORMS.includes(platform as (typeof LIVE_SOCIAL_PLATFORMS)[number]);
