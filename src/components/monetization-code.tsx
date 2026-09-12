"use client";

import { useEffect, useRef } from "react";

type Target = "body" | "head";

function executeMarkup(host: HTMLElement, code: string) {
  const template = document.createElement("template");
  template.innerHTML = code;

  const scripts = Array.from(template.content.querySelectorAll("script"));

  // If the code contains no script tag, execute it as inline JavaScript.
  if (!scripts.length && code.trim()) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.textContent = code;
    script.dataset.monetizationOwned = "true";
    host.appendChild(script);
    return [script];
  }

  // Add non-script markup first.
  const fragment = template.content.cloneNode(true) as DocumentFragment;

  for (const script of Array.from(fragment.querySelectorAll("script"))) {
    script.remove();
  }

  host.appendChild(fragment);

  // Re-create script elements so browsers execute them.
  const owned: HTMLScriptElement[] = [];

  for (const oldScript of scripts) {
    const script = document.createElement("script");

    for (const attr of Array.from(oldScript.attributes)) {
      script.setAttribute(attr.name, attr.value);
    }

    script.dataset.monetizationOwned = "true";

    if (oldScript.src) {
      script.src = oldScript.src;
    } else {
      script.textContent = oldScript.textContent;
    }

    host.appendChild(script);
    owned.push(script);
  }

  return owned;
}

export function MonetizationCode({
  code,
  className,
  target = "body",
}: {
  code: string;
  className?: string;
  target?: Target;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code.trim()) return;

    if (target === "head") {
      const host = document.head;
      const scripts = executeMarkup(host, code);

      return () => {
        for (const script of scripts) {
          script.remove();
        }
      };
    }

    const host = ref.current;

    if (!host) return;

    executeMarkup(host, code);

    return () => {
      host.replaceChildren();
    };
  }, [code, target]);

  if (!code.trim()) return null;

  if (target === "head") {
    return null;
  }

  return (
    <div
      ref={ref}
      className={className}
      data-monetization-code
    />
  );
}