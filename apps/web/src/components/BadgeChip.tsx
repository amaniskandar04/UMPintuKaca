import type { AuthorBadgeDto } from "@pintukaca/shared";
import type { ComponentType } from "react";
import {
  IconCheck,
  IconEdit,
  IconFlag,
  IconPlus,
  IconSearch,
  IconShield,
  IconSpark,
  IconStar
} from "./icons";

type BadgeIconProps = {
  size?: number;
  className?: string;
};

const ICONS: Record<string, ComponentType<BadgeIconProps>> = {
  star: IconStar,
  plus: IconPlus,
  edit: IconEdit,
  check: IconCheck,
  search: IconSearch,
  spark: IconSpark,
  shield: IconShield,
  flag: IconFlag
};

export function BadgeIcon({ icon, size = 12, className }: { icon: string; size?: number; className?: string }) {
  const Icon = ICONS[icon] ?? IconStar;
  return <Icon size={size} className={className} />;
}

export function BadgeChip({ badge }: { badge: AuthorBadgeDto }) {
  return (
    <span className="chip gap-1">
      <BadgeIcon icon={badge.icon} size={12} />
      {badge.label}
    </span>
  );
}
