"use client";

import { useEffect, useState } from "react";
import { SessaSignature } from "@/components/SessaSignature";

export function InitialLoader() {
  const [loaded, setLoaded] = useState(false);
  const [minimumDone, setMinimumDone] = useState(false);
  const [visible, setVisible] = useState(true);
  const exiting = loaded && minimumDone;

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minimumDelay = reduceMotion ? 650 : 3700;
    const finishLoad = () => setLoaded(true);
    const minimumTimer = window.setTimeout(() => setMinimumDone(true), minimumDelay);

    if (document.readyState === "complete") {
      finishLoad();
    } else {
      window.addEventListener("load", finishLoad, { once: true });
    }

    return () => {
      window.clearTimeout(minimumTimer);
      window.removeEventListener("load", finishLoad);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if (!loaded || !minimumDone) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const exitTimer = window.setTimeout(() => setVisible(false), reduceMotion ? 220 : 920);

    return () => window.clearTimeout(exitTimer);
  }, [loaded, minimumDone]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-label="Caricamento Pasticceria Sessa"
      aria-live="polite"
      className={`initial-loader ${exiting ? "initial-loader--exit" : ""}`}
      role="status"
    >
      <div className="initial-loader__inner">
        <SessaSignature
          animate
          className="initial-loader__signature"
          idSuffix="loader"
          tail="long"
        />
      </div>
    </div>
  );
}
