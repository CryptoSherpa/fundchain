import { useState, useEffect, useRef } from "react";
import { shareUrl } from "../utils";
import styles from "./ShareButton.module.css";

export default function ShareButton({ campaign, compact = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  const url = shareUrl(campaign.id);
  const text = encodeURIComponent(`Check out "${campaign.title}" on FundChain`);
  const encodedUrl = encodeURIComponent(url);

  const options = [
    {
      label: "Twitter / X",
      icon: "𝕏",
      href: `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`,
    },
    {
      label: "Facebook",
      icon: "f",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: "WhatsApp",
      icon: "W",
      href: `https://wa.me/?text=${text}%20${encodedUrl}`,
    },
  ];

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={`${styles.trigger} ${compact ? styles.compact : ""}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="Share campaign"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        {!compact && "Share"}
      </button>

      {open && (
        <div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          {options.map((o) => (
            <a
              key={o.label}
              href={o.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.option}
              onClick={() => setOpen(false)}
            >
              <span className={styles.icon}>{o.icon}</span>
              {o.label}
            </a>
          ))}
          <button className={styles.option} onClick={handleCopy}>
            <span className={styles.icon}>
              {copied ? "✓" : "🔗"}
            </span>
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      )}
    </div>
  );
}
