import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type ContainerProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** `wide` for grids, `prose` for reading-width text. */
  width?: "default" | "wide" | "prose";
};

const WIDTHS = {
  /*
   * The main site content should use the available desktop width.
   *
   * This is especially important for the home archive grid where
   * eight video cards need to fit across the available space.
   */
  default: "max-w-[110rem]",

  /*
   * Extra-wide surfaces can use even more horizontal space.
   */
  wide: "max-w-[120rem]",

  /*
   * Reading content stays intentionally narrow.
   */
  prose: "max-w-3xl",
} as const;

export function Container({
  as: Component = "div",
  width = "default",
  className,
  ...props
}: ContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}