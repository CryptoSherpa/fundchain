import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "../utils";
import styles from "./CategoryBar.module.css";

const SCROLL_STEP = 240;

export default function CategoryBar({ counts, selected, onSelect }) {
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scrollBy = (dx) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.pill} ${styles.pinned} ${selected === "all" ? styles.active : ""}`}
        onClick={() => onSelect("all")}
      >
        All
      </button>

      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowLeft}`}
        aria-label="Scroll categories left"
        onClick={() => scrollBy(-SCROLL_STEP)}
        disabled={!canScrollLeft}
      >
        ‹
      </button>

      <div className={styles.scrollContainer}>
        <div
          className={`${styles.fade} ${styles.fadeLeft} ${canScrollLeft ? styles.fadeVisible : ""}`}
          aria-hidden="true"
        />
        <div className={styles.scroller} ref={scrollerRef}>
          {CATEGORIES.map((cat) => {
            const n = counts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                className={`${styles.pill} ${selected === cat ? styles.active : ""}`}
                onClick={() => onSelect(cat)}
              >
                <span>{cat}</span>
                <span className={styles.countBadge}>{n}</span>
              </button>
            );
          })}
        </div>
        <div
          className={`${styles.fade} ${styles.fadeRight} ${canScrollRight ? styles.fadeVisible : ""}`}
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowRight}`}
        aria-label="Scroll categories right"
        onClick={() => scrollBy(SCROLL_STEP)}
        disabled={!canScrollRight}
      >
        ›
      </button>
    </div>
  );
}
