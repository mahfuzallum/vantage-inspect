"use client";

import Link, { type LinkProps } from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

const STORAGE_PREFIX = "video-smart-link-state-v4:";

type Settings = {
  smartLinkEnabled: boolean;
  smartLinkUrl: string;
  smartLinkTriggerCount: number;
  smartLinkTriggerMode: "fixed" | "random_2_3";
};

type State = {
  count: number;
  target: number;
};

let settingsPromise: Promise<Settings | null> | null = null;

function loadSettings(): Promise<Settings | null> {
  if (!settingsPromise) {
    settingsPromise = fetch("/api/monetization", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as Settings;
      })
      .catch(() => null);
  }

  return settingsPromise;
}

function getStorageKey(href: LinkProps["href"]): string {
  const value =
    typeof href === "string"
      ? href
      : JSON.stringify(href);

  return `${STORAGE_PREFIX}${value}`;
}

function chooseTarget(settings: Settings): number {
  if (
    settings.smartLinkTriggerMode ===
    "random_2_3"
  ) {
    return Math.random() < 0.5 ? 2 : 3;
  }

  return Math.max(
    1,
    Math.min(
      20,
      Math.floor(
        settings.smartLinkTriggerCount || 2,
      ),
    ),
  );
}

function readState(
  storageKey: string,
  settings: Settings,
): State {
  try {
    const raw =
      window.sessionStorage.getItem(
        storageKey,
      );

    if (raw) {
      const parsed =
        JSON.parse(raw) as Partial<State>;

      if (
        Number.isInteger(parsed.count) &&
        Number(parsed.count) >= 0 &&
        Number.isInteger(parsed.target) &&
        Number(parsed.target) >= 1 &&
        Number(parsed.target) <= 20
      ) {
        return {
          count: Number(parsed.count),
          target: Number(parsed.target),
        };
      }
    }
  } catch {
    // Ignore storage errors.
  }

  return {
    count: 0,
    target: chooseTarget(settings),
  };
}

function saveState(
  storageKey: string,
  state: State,
): void {
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage errors.
  }
}

function clearState(
  storageKey: string,
): void {
  try {
    window.sessionStorage.removeItem(
      storageKey,
    );
  } catch {
    // Ignore storage errors.
  }
}

function isValidSmartLinkUrl(
  value: string,
): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

type SmartLinkAnchorProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "onClick"
> & {
  href: LinkProps["href"];
  children?: ReactNode;
};

export function SmartLinkAnchor({
  href,
  children,
  ...props
}: SmartLinkAnchorProps) {
  const [settings, setSettings] =
    useState<Settings | null>(null);

  const mounted = useRef(true);

  const storageKey =
    getStorageKey(href);

  useEffect(() => {
    mounted.current = true;

    void loadSettings().then((data) => {
      if (mounted.current) {
        setSettings(data);
      }
    });

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const warmSettings = () => {
      void loadSettings().then((data) => {
        if (mounted.current) {
          setSettings(data);
        }
      });
    };

    window.addEventListener(
      "pointerover",
      warmSettings,
      {
        once: true,
        passive: true,
      },
    );

    return () => {
      window.removeEventListener(
        "pointerover",
        warmSettings,
      );
    };
  }, []);

  async function handleClick(
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    /*
     * Open a blank tab immediately while the
     * browser still considers this a trusted
     * user gesture.
     *
     * The real Smart Link URL is assigned
     * after settings are available.
     */
    const popup = (() => {
      try {
        return window.open(
          "about:blank",
          "_blank",
        );
      } catch {
        return null;
      }
    })();

    const currentSettings =
      settings ?? (await loadSettings());

    /*
     * Smart Link disabled or invalid.
     *
     * Close the temporary tab and allow the
     * normal video navigation.
     */
    if (
      !currentSettings?.smartLinkEnabled ||
      !isValidSmartLinkUrl(
        currentSettings.smartLinkUrl,
      )
    ) {
      if (popup) {
        try {
          popup.close();
        } catch {
          // Ignore.
        }
      }

      return;
    }

    const state = readState(
      storageKey,
      currentSettings,
    );

    const nextCount =
      state.count + 1;

    /*
     * Smart Link phase.
     *
     * Example target = 3:
     *
     * Click 1 -> Smart Link
     * Click 2 -> Smart Link
     * Click 3 -> Smart Link
     * Click 4 -> Video
     */
    if (nextCount <= state.target) {
      event.preventDefault();

      saveState(storageKey, {
        count: nextCount,
        target: state.target,
      });

      if (popup) {
        try {
          popup.location.href =
            currentSettings.smartLinkUrl;
        } catch {
          // Ignore.
        }
      } else {
        /*
         * Popup was blocked.
         *
         * Fall back to direct Smart Link
         * navigation so the click still
         * performs the intended action.
         */
        window.location.href =
          currentSettings.smartLinkUrl;
      }

      return;
    }

    /*
     * Video phase.
     *
     * This click is allowed to navigate
     * normally to the requested video.
     *
     * Reset the state so a future cycle
     * starts again from Click 1.
     */
    if (popup) {
      try {
        popup.close();
      } catch {
        // Ignore.
      }
    }

    clearState(storageKey);

    /*
     * No preventDefault().
     *
     * Next.js handles the normal Link
     * navigation to the video page.
     */
  }

  return (
    <Link
      href={href}
      {...props}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}