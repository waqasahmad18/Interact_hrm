"use client";

import React from "react";
import styles from "./login.module.css";

export type CarouselAnimation = "fade" | "fade-zoom" | "slide";

type ImageSlide = {
  id: number;
  url: string;
};

type Props = {
  images: ImageSlide[];
  includeBrandSlide: boolean;
  enabled: boolean;
  intervalMs: number;
  animation: CarouselAnimation;
  brand: React.ReactNode;
};

type Frame =
  | { kind: "brand"; key: string }
  | { kind: "image"; key: string; url: string; id: number };

function animClass(
  animation: CarouselAnimation,
  active: boolean,
  stylesMap: typeof styles
): string {
  if (animation === "fade-zoom") {
    return active ? stylesMap.slideZoomActive : stylesMap.slideZoom;
  }
  if (animation === "slide") {
    return active ? stylesMap.slideSlideActive : stylesMap.slideSlide;
  }
  return active ? stylesMap.slideFadeActive : stylesMap.slideFade;
}

/** Images in order; brand slide after every 3 images (not after each one). */
function buildFrames(
  images: ImageSlide[],
  includeBrandSlide: boolean
): Frame[] {
  if (images.length === 0) {
    return includeBrandSlide
      ? [{ kind: "brand", key: "brand-0" }]
      : [];
  }

  if (!includeBrandSlide) {
    return images.map((img) => ({
      kind: "image" as const,
      key: `img-${img.id}`,
      url: img.url,
      id: img.id,
    }));
  }

  const list: Frame[] = [];
  images.forEach((img, i) => {
    list.push({
      kind: "image",
      key: `img-${img.id}`,
      url: img.url,
      id: img.id,
    });
    if ((i + 1) % 3 === 0) {
      list.push({ kind: "brand", key: `brand-after-${i}` });
    }
  });
  return list;
}

export function AuthLoginCarousel({
  images,
  includeBrandSlide,
  enabled,
  intervalMs,
  animation,
  brand,
}: Props) {
  const frames = React.useMemo(
    () => buildFrames(images, includeBrandSlide),
    [images, includeBrandSlide]
  );

  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    setIndex(0);
  }, [frames.length]);

  React.useEffect(() => {
    if (!enabled || frames.length <= 1 || paused) return;
    const ms = Math.min(30000, Math.max(2000, intervalMs || 5000));
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, ms);
    return () => window.clearInterval(t);
  }, [enabled, frames.length, intervalMs, paused]);

  const safeIndex = frames.length ? index % frames.length : 0;

  return (
    <div
      className={styles.carouselFrame}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {frames.map((frame, i) => {
        const active = i === safeIndex;
        const cls = `${styles.carouselSlide} ${animClass(animation, active, styles)}`;
        if (frame.kind === "brand") {
          return (
            <div
              key={frame.key}
              className={`${cls} ${styles.brandSlide}`}
              aria-hidden={!active}
            >
              <div className={styles.leftContent}>{brand}</div>
            </div>
          );
        }
        return (
          <div
            key={frame.key}
            className={`${cls} ${styles.imageSlide}`}
            aria-hidden={!active}
          >
            {/* Soft fill so letterbox areas aren't solid bars */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frame.url}
              alt=""
              className={styles.carouselImageBleed}
              decoding="async"
              draggable={false}
              aria-hidden
            />
            {/* Full photo visible (no left/right crop) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frame.url}
              alt=""
              className={styles.carouselImage}
              decoding="async"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}
