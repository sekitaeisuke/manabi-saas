const COLORS = [
  "#6366f1","#ec4899","#f59e0b","#10b981",
  "#3b82f6","#8b5cf6","#ef4444","#14b8a6","#f97316","#06b6d4",
];

type Particle = {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; color: string;
  rotation: number; vr: number; opacity: number;
};

export function triggerConfetti(originX?: number, originY?: number) {
  if (typeof window === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;z-index:9998;pointer-events:none;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const ox = originX ?? canvas.width / 2;
  const oy = originY ?? canvas.height * 0.4;

  let particles: Particle[] = Array.from({ length: 160 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      w: 7 + Math.random() * 9,
      h: 4 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.18,
      opacity: 1,
    };
  });

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.25;
      p.vx *= 0.985;
      p.rotation += p.vr;
      if (p.y > canvas.height * 0.6) p.opacity = Math.max(0, p.opacity - 0.022);
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
      ctx.fill();
      ctx.restore();
    });
    particles = particles.filter((p) => p.opacity > 0.02);
    frame++;
    if (particles.length > 0 && frame < 350) requestAnimationFrame(animate);
    else canvas.remove();
  };
  requestAnimationFrame(animate);
}
