"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function AnimatedThread() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const desktopPathRef = useRef<SVGPathElement>(null);
  const mobilePathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = [desktopPathRef.current, mobilePathRef.current].filter(Boolean) as SVGPathElement[];

    const ctx = gsap.context(() => {
      paths.forEach((path) => {
        const length = path.getTotalLength();
        gsap.set(path, {
          strokeDasharray: length,
          strokeDashoffset: reduceMotion ? 0 : length
        });

        if (!reduceMotion) {
          gsap.to(path, {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: {
              trigger: wrapperRef.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 1.1
            }
          });
        }
      });

      if (!reduceMotion && wrapperRef.current) {
        gsap.to(wrapperRef.current, {
          y: window.innerWidth < 768 ? 18 : 36,
          ease: "none",
          scrollTrigger: {
            trigger: wrapperRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 1.4
          }
        });
      }
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <svg
        className="hidden h-full w-full md:block"
        viewBox="0 0 1440 5400"
        preserveAspectRatio="none"
      >
        <path
          ref={desktopPathRef}
          d="M-80 680 C 260 560 330 760 650 690 C 920 630 1100 620 1510 520 M 90 1020 C 280 1240 660 1220 720 980 C 775 750 440 740 405 960 C 360 1240 735 1340 990 1135 C 1230 940 1115 840 1420 910 M 1370 1550 C 1020 1530 915 1820 1015 2030 C 1125 2265 1360 2100 1285 1885 C 1190 1610 760 1785 660 2120 C 560 2450 895 2590 1160 2445 C 1340 2345 1395 2340 1510 2380 M -120 2600 C 205 2460 470 2635 410 2860 C 355 3068 95 3008 170 2812 C 265 2560 690 2770 735 3115 C 770 3370 475 3520 205 3405 C 25 3330 -20 3270 -120 3300 M 1510 3520 C 1110 3400 820 3530 800 3780 C 780 4030 1115 4065 1115 3815 C 1115 3610 760 3600 520 3855 C 320 4070 320 4325 570 4420 C 840 4520 1040 4300 1305 4450 M 1420 4820 C 1110 4720 870 4860 810 5070 C 760 5250 885 5360 1010 5315"
          fill="none"
          stroke="#D65A1F"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
          opacity="0.3"
        />
      </svg>
      <svg
        className="h-full w-full md:hidden"
        viewBox="0 0 390 5200"
        preserveAspectRatio="none"
      >
        <path
          ref={mobilePathRef}
          d="M-24 780 C 108 700 208 750 414 660 M 338 900 C 246 946 252 1106 340 1186 C 436 1274 464 1032 346 998 C 278 978 290 1128 420 1180 M 360 1660 C 210 1670 126 1810 172 1988 C 224 2185 368 2118 332 1962 C 286 1750 90 1878 74 2148 C 58 2428 250 2502 416 2412 M -28 2820 C 146 2720 272 2848 230 3034 C 198 3170 64 3150 82 3002 C 108 2790 328 2920 342 3215 C 354 3458 154 3595 -30 3510 M 420 3760 C 210 3692 90 3800 112 4018 C 136 4230 318 4210 300 4020 C 278 3812 80 3930 70 4210 C 62 4430 210 4520 338 4460 M 386 4860 C 250 4805 160 4888 142 5068 C 128 5195 204 5250 274 5210"
          fill="none"
          stroke="#D65A1F"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
          opacity="0.18"
        />
      </svg>
    </div>
  );
}
