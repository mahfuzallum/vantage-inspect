"use client";

import { useEffect, useRef } from "react";

type Target = "body" | "head";

function executeMarkup(host: HTMLElement, code: string) {
  const scripts = Array.from((() => {
    const template = document.createElement("template");
    template.innerHTML = code;
    return template.content;
  })().querySelectorAll("script"));

  if (!scripts.length && code.trim()) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.textContent = code;
    script.dataset.monetizationOwned = "true";
    host.appendChild(script);
    return [script];
  }

  const template = document.createElement("template");
  template.innerHTML = code;
  const fragment = template.content;
  for (const script of scripts) script.remove();
  host.appendChild(fragment.cloneNode(true));

  const owned: HTMLScriptElement[] = [];
  for (const oldScript of scripts) {
    const script = document.createElement("script");
    for (const attr of Array.from(oldScript.attributes)) script.setAttribute(attr.name, attr.value);
    script.dataset.monetizationOwned = "true";
    if (oldScript.src) script.src = oldScript.src;
    else script.textContent = oldScript.textContent;
    host.appendChild(script);
    owned.push(script);
  }
  return owned;
}

export function MonetizationCode({ code, className, target = "body" }: { code: string; className?: string; target?: Target }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code.trim()) return;

    if (target === "head") {
      const host = document.head;
      const marker = document.createElement("meta");
      marker.name = "monetization-runtime";
      marker.dataset.monetizationOwned = "true";
      host.appendChild(marker);
      const scripts = executeMarkup(host, code);
      return () => {
        for (const script of scripts) script.remove();
        marker.remove();
      };
    }

    if (ref.current) executeMarkup(ref.current, code);
    return () => ref.current?.replaceChildren();
  }, [code, target]);

  if (!code.trim()) return null;
  if (target === "head") return null;
  return <div ref={ref} className={className} data-monetization-code />;
}
