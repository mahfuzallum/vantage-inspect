import {
  BookOpen,
  Cpu,
  Film,
  Gamepad2,
  Globe2,
  Microscope,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Subject slug -> icon. Kept in config rather than inside the card so a new
 * subject only needs one line here, and anything unmapped falls back cleanly
 * instead of rendering a hole in the grid.
 */
const ICONS: Record<string, LucideIcon> = {
  technology: Cpu,
  education: BookOpen,
  gaming: Gamepad2,
  documentary: Film,
  science: Microscope,
  travel: Globe2,
  creative: Palette,
  entertainment: Sparkles,
};

export const categoryIcon = (slug: string): LucideIcon => ICONS[slug] ?? Sparkles;
