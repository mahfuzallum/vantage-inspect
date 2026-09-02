"use client";

import { useEffect, useRef } from "react";

function executeMarkup(host: HTMLDivElement, code: string) {
  host.replaceChildren();
  const template = document.createElement("template");
  template.innerHTML = code;
  const fragment = template.content;
  const scripts = Array.from(fragment.querySelectorAll("script"));
  for (const script of scripts) script.remove();
  host.appendChild(fragment.cloneNode(true));
  for (const oldScript of scripts) {
    const script = document.createElement("script");
    for (const attr of Array.from(oldScript.attributes)) script.setAttribute(attr.name, attr.value);
    if (oldScript.src) script.src = oldScript.src;
    else script.textContent = oldScript.textContent;
    host.appendChild(script);
  }
}

export function MonetizationCode({ code, className }: { code: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && code.trim()) executeMarkup(ref.current, code);
    return () => ref.current?.replaceChildren();
  }, [code]);
  if (!code.trim()) return null;
  return <div ref={ref} className={className} data-monetization-code />;
}
