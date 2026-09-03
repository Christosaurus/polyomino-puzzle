/** A short canvas confetti burst for the win moment. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

export class Confetti {
  private particles: Particle[] = [];

  burst(originX: number, originY: number, count = 90): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 5 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0]!,
        life: 1,
      });
    }
  }

  get active(): boolean {
    return this.particles.length > 0;
  }

  /** Advance by `dt` seconds and draw. */
  step(ctx: CanvasRenderingContext2D, dt: number): void {
    const g = 22;
    this.particles = this.particles.filter((p) => {
      p.vy += g * dt;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.rot += p.vr;
      p.life -= dt * 0.5;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      return true;
    });
  }

  clear(): void {
    this.particles = [];
  }
}
