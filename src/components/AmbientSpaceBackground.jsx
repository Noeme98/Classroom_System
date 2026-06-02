import { useEffect, useRef } from "react";
import styles from "./AmbientSpaceBackground.module.css";

const VARIANTS = {
  full: { stars: 120, xpLabels: true, xpInterval: 3200, shootMin: 2800, shootMax: 5500, orbScale: 1, forceDark: false },
  subtle: { stars: 55, xpLabels: false, xpInterval: 0, shootMin: 5200, shootMax: 9000, orbScale: 0.4, forceDark: false },
  auth: { stars: 95, xpLabels: true, xpInterval: 3800, shootMin: 3200, shootMax: 6200, orbScale: 0.85, forceDark: true },
};

const XP_LABELS = ["+50 XP", "+25 XP", "+10 XP", "+100 XP", "Level up!", "Streak!", "Bonus!", "Nice work!", "On fire!"];

const ORBS = [
  { nx: 0.12, ny: 0.22, radius: 0.38, rgb: [139, 127, 232], phase: 0, pulse: 0.55 },
  { nx: 0.88, ny: 0.48, radius: 0.42, rgb: [245, 158, 11], phase: 2.1, pulse: 0.48 },
  { nx: 0.52, ny: 0.82, radius: 0.34, rgb: [110, 231, 183], phase: 4.3, pulse: 0.52 },
];

function createStars(width, height, count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.15 + 0.35,
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 1.65,
    driftX: (Math.random() - 0.5) * 0.12,
    driftY: (Math.random() - 0.5) * 0.1,
  }));
}

/**
 * Full-page ambient background: stars, glow orbs, shooting stars, floating XP labels.
 */
function AmbientSpaceBackground({ className = "", variant = "full" }) {
  const canvasRef = useRef(null);
  const xpLayerRef = useRef(null);
  const frameRef = useRef(0);
  const config = VARIANTS[variant] || VARIANTS.full;

  useEffect(() => {
    const canvas = canvasRef.current;
    const xpLayer = xpLayerRef.current;
    if (!canvas) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isLightAppTheme =
      !config.forceDark && document.documentElement.getAttribute("data-theme") === "light";
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let stars = [];
    let shootingStars = [];
    let nextShootAt = 0;
    let nextXpAt = 0;
    let xpTimer = null;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(width, height, config.stars);
      shootingStars = [];
      nextShootAt = performance.now() + config.shootMin * 0.4 + Math.random() * config.shootMin;
      nextXpAt = config.xpLabels
        ? performance.now() + 1500 + Math.random() * 2000
        : Number.POSITIVE_INFINITY;
    };

    const spawnShootingStar = () => {
      const startX = Math.random() * width * 0.75;
      const startY = Math.random() * height * 0.4;
      const angle = (Math.PI / 6) + Math.random() * (Math.PI / 5);
      const speed = 10 + Math.random() * 8;
      shootingStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        len: 70 + Math.random() * 90,
      });
    };

    const spawnXpLabel = () => {
      if (!xpLayer || reducedMotion) return;
      const el = document.createElement("span");
      const variant = Math.random();
      const tone =
        variant > 0.66 ? styles.xpLabelGold : variant > 0.33 ? styles.xpLabelTeal : styles.xpLabelViolet;
      el.className = `${styles.xpLabel} ${tone}`;
      el.textContent = XP_LABELS[Math.floor(Math.random() * XP_LABELS.length)];
      el.style.left = `${8 + Math.random() * 84}%`;
      el.style.bottom = `${5 + Math.random() * 35}%`;
      const duration = 4.5 + Math.random() * 3;
      const delay = Math.random() * 0.4;
      el.style.animationDuration = `${duration}s`;
      el.style.animationDelay = `${delay}s`;
      xpLayer.appendChild(el);
      window.setTimeout(() => el.remove(), (duration + delay) * 1000 + 100);
    };

    const drawOrbs = (time) => {
      const t = time * 0.001;
      ORBS.forEach((orb) => {
        const cx = orb.nx * width;
        const cy = orb.ny * height;
        const pulse = 0.5 + 0.5 * Math.sin(t * orb.pulse + orb.phase);
        const r = Math.max(width, height) * orb.radius * (0.92 + pulse * 0.12);
        const [rC, gC, bC] = orb.rgb;
        const alpha = (0.07 + pulse * 0.06) * config.orbScale;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, `rgba(${rC}, ${gC}, ${bC}, ${alpha})`);
        gradient.addColorStop(0.45, `rgba(${rC}, ${gC}, ${bC}, ${alpha * 0.35})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    };

    const drawStars = (time) => {
      const t = time * 0.001;
      stars.forEach((star) => {
        star.x += star.driftX;
        star.y += star.driftY;
        if (star.x < 0) star.x += width;
        if (star.x > width) star.x -= width;
        if (star.y < 0) star.y += height;
        if (star.y > height) star.y -= height;

        const twinkle = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        const starAlpha = isLightAppTheme ? twinkle * 0.35 : twinkle * 0.85;
        const starRgb = isLightAppTheme ? "90, 80, 120" : "255, 255, 255";
        ctx.fillStyle = `rgba(${starRgb}, ${starAlpha})`;
        ctx.fill();
      });
    };

    const drawShootingStars = () => {
      shootingStars = shootingStars.filter((s) => s.life > 0.02);
      shootingStars.forEach((s) => {
        const tailX = s.x - (s.vx / Math.hypot(s.vx, s.vy)) * s.len;
        const tailY = s.y - (s.vy / Math.hypot(s.vx, s.vy)) * s.len;
        const gradient = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
        gradient.addColorStop(0.65, `rgba(196, 181, 253, ${s.life * 0.35})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${s.life * 0.95})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.life})`;
        ctx.fill();

        s.x += s.vx;
        s.y += s.vy;
        s.life *= 0.94;
      });
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      drawOrbs(0);
      const starRgb = isLightAppTheme ? "90, 80, 120" : "255, 255, 255";
      const starAlpha = isLightAppTheme ? 0.28 : 0.55;
      stars.forEach((star) => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${starRgb}, ${starAlpha})`;
        ctx.fill();
      });
    };

    const tick = (time) => {
      if (!running) return;
      frameRef.current = requestAnimationFrame(tick);

      if (reducedMotion) return;

      if (time >= nextShootAt) {
        spawnShootingStar();
        nextShootAt = time + config.shootMin + Math.random() * (config.shootMax - config.shootMin);
      }

      if (config.xpLabels && time >= nextXpAt) {
        spawnXpLabel();
        nextXpAt = time + 2200 + Math.random() * 3200;
      }

      ctx.clearRect(0, 0, width, height);
      drawOrbs(time);
      drawStars(time);
      drawShootingStars();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    if (reducedMotion) {
      drawStatic();
      return () => {
        running = false;
        ro.disconnect();
      };
    }

    if (config.xpLabels) {
      spawnXpLabel();
      xpTimer = window.setInterval(spawnXpLabel, config.xpInterval || 3200);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      if (xpTimer) window.clearInterval(xpTimer);
      ro.disconnect();
      if (xpLayer) xpLayer.replaceChildren();
    };
  }, [
    variant,
    config.stars,
    config.xpLabels,
    config.xpInterval,
    config.shootMin,
    config.shootMax,
    config.orbScale,
    config.forceDark,
  ]);

  const rootClass = `${styles.root} ${variant === "subtle" ? styles.subtle : ""} ${
    variant === "auth" ? styles.auth : ""
  } ${className}`.trim();

  return (
    <div className={rootClass} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={xpLayerRef} className={styles.xpLayer} />
    </div>
  );
}

export default AmbientSpaceBackground;
