"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Category } from "@/data/site-content";

type CategoryCardsProps = {
  categories: Category[];
};

export function CategoryCards({ categories }: CategoryCardsProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function pulseCategory(name: string) {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    setActiveCategory(name);
    timerRef.current = window.setTimeout(() => setActiveCategory(null), 620);
  }

  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category) => (
        <button
          key={category.name}
          type="button"
          aria-label={`Anima sticker ${category.name}`}
          onClick={() => pulseCategory(category.name)}
          className={`category-card group ${
            activeCategory === category.name ? "category-card--tapped" : ""
          }`}
        >
          <span className="category-sticker" aria-hidden="true">
            <Image
              src={category.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 260px, (min-width: 640px) 240px, 220px"
              className="category-sticker__image"
            />
          </span>
          <span className="category-card__title">{category.name}</span>
        </button>
      ))}
    </div>
  );
}
