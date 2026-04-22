import { useEffect, useRef } from "react";
import styles from "./HeroSection.module.css";

export default function HeroSection({ account, connecting, onConnect }) {
  const canvasRef = useRef(null);
  const heroRef  = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero   = heroRef.current;
    if (!canvas || !hero) return;

    const ctx = canvas.getContext("2d");
    let animId;
    let W = 0, H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = hero.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width  = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width  = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    resize();

    // ── Particles ──────────────────────────────────────────────────────────
    const COUNT = 90;
    const MAX_DIST = 140;

    const particles = Array.from({ length: COUNT }, (_, i) => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r:  i < 12 ? Math.random() * 2.5 + 1.5 : Math.random() * 1.2 + 0.4,
      hub: i < 12,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Subtle radial background tint
      const grad = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.6);
      grad.addColorStop(0, "rgba(0,60,40,0.18)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Update + bounce
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0)  { p.x = 0;  p.vx *= -1; }
        if (p.x > W)  { p.x = W;  p.vx *= -1; }
        if (p.y < 0)  { p.y = 0;  p.vy *= -1; }
        if (p.y > H)  { p.y = H;  p.vy *= -1; }
      }

      // Edges
      ctx.lineWidth = 0.7;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            const a = (1 - d / MAX_DIST) * 0.35;
            ctx.strokeStyle = `rgba(0,200,150,${a})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const p of particles) {
        if (p.hub) {
          // Glow
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          g.addColorStop(0, "rgba(0,200,150,0.5)");
          g.addColorStop(1, "rgba(0,200,150,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.hub ? "rgba(0,232,176,0.9)" : "rgba(0,200,150,0.55)";
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(hero);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <section className={styles.hero} ref={heroRef}>
      <canvas className={styles.canvas} ref={canvasRef} />

      {/* Floating coins */}
      <div className={`${styles.coin} ${styles.coinBtc}`}>
        <span className={styles.coinSymbol}>₿</span>
        <div className={styles.coinReflect} />
      </div>
      <div className={`${styles.coin} ${styles.coinEth}`}>
        <span className={styles.coinSymbol}>◆</span>
        <div className={styles.coinReflect} />
      </div>
      <div className={`${styles.coin} ${styles.coinUsd}`}>
        <span className={styles.coinSymbol}>$</span>
        <div className={styles.coinReflect} />
      </div>

      {/* Content */}
      <div className={styles.content}>
        <div className={styles.tagline}>
          <span className={styles.taglineDot} />
          Powered by Ethereum
        </div>
        <h1 className={styles.title}>Decentralized<br />Crowdfunding</h1>
        <p className={styles.subtitle}>
          Fund projects you believe in. No middlemen,<br />no borders — powered by Ethereum.
        </p>
        {account ? (
          <div className={styles.connectedNote}>
            <span className={styles.greenDot} /> Wallet connected
          </div>
        ) : (
          <button className={styles.cta} onClick={onConnect} disabled={connecting}>
            {connecting ? (
              <><span className="spinner" style={{ width: 18, height: 18, borderTopColor: "#000" }} /> Connecting…</>
            ) : (
              "Connect Wallet"
            )}
          </button>
        )}
      </div>
    </section>
  );
}
