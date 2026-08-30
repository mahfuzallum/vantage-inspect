"use client";

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
} from "react";

import type {
  HTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

import { cn } from "@/lib/utils/cn";

type SlotProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
};

/**
 * Minimal asChild implementation.
 *
 * The parent props are merged onto the single child element.
 *
 * Unlike React.Children.only(), this implementation does not throw during
 * prerendering when children are missing or when an invalid child is passed.
 */
export const Slot = forwardRef<
  HTMLElement,
  SlotProps
>(function Slot(
  {
    children,
    className,
    ...props
  },
  ref,
) {
  /**
   * Remove empty/null children first.
   *
   * This prevents fragments, conditional rendering, or whitespace-like
   * empty children from causing a Children.only() runtime exception.
   */
  const validChildren = Children.toArray(
    children,
  ).filter(
    (child) =>
      isValidElement(child),
  );

  /**
   * asChild requires exactly one real element.
   *
   * Return null instead of throwing during prerendering.
   */
  if (
    validChildren.length !== 1
  ) {
    return null;
  }

  const child =
    validChildren[0] as ReactElement<
      HTMLAttributes<HTMLElement> & {
        ref?: Ref<HTMLElement>;
      }
    >;

  const childProps =
    child.props;

  return cloneElement(
    child,
    {
      ...props,
      ...childProps,
      ref,
      className: cn(
        className,
        childProps.className,
      ),
    },
  );
});

Slot.displayName = "Slot";