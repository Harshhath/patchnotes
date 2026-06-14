"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const GAMES = [
  {
    id: "valorant",
    route: "/valorant",
    logo: "/valorant-logo1.png",
    sublabel: "Tactical FPS · Riot Games",
    accent: "#ff4655",
    bg: "#0f1923",
    border: "rgba(255,70,85,0.45)",
    borderHover: "rgba(255,70,85,0.9)",
    glow: "rgba(255,70,85,0.22)",
    tags: ["Agents", "Abilities", "Maps"],
  },
  {
    id: "cs2",
    route: "/cs2",
    logo: "/cs2-logo.png",
    sublabel: "Tactical FPS · Valve",
    accent: "#e8a020",
    bg: "#1a1a1a",
    border: "rgba(232,160,32,0.45)",
    borderHover: "rgba(232,160,32,0.9)",
    glow: "rgba(232,160,32,0.22)",
    tags: ["Weapons", "Maps", "Economy"],
  },
] as const;

const STACK_POS = [
  { x: 0,  y: 0,  scale: 1,    z: 2, skew: -6, opacity: 1    },
  { x: 28, y: 20, scale: 0.94, z: 1, skew: -6, opacity: 0.68 },
];

export default function HomePage() {
  const router = useRouter();
  const [frontIndex, setFrontIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  const swap = useCallback(() => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setFrontIndex((i) => (i + 1) % GAMES.length);
      setAnimating(false);
    }, 220);
  }, [animating]);

  useEffect(() => {
    let cooldown = false;
    const onWheel = () => {
      if (cooldown) return;
      cooldown = true;
      swap();
      setTimeout(() => { cooldown = false; }, 600);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [swap]);

  const order = GAMES.map((_, i) => (frontIndex + i) % GAMES.length);

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 overflow-hidden select-none">
      {/* Header */}
      <div className="text-center mb-16">
        <p className="text-[10px] tracking-[0.35em] uppercase text-white/20 mb-3 font-medium">
          *with RAG based AI chat bot
        </p>
        <h1 className="text-5xl font-black text-white tracking-tight mb-3">
          PATCHNOTES
        </h1>
        <p className="text-white/25 text-sm max-w-[240px] mx-auto leading-relaxed">
          Ask anything about patches, nerfs, buffs &amp; balance changes.
        </p>
      </div>

      {/* Card stack */}
      <div className="relative w-[22rem] h-52">
        {order.map((gameIdx, stackPos) => {
          const game = GAMES[gameIdx];
          const pos  = STACK_POS[stackPos];
          const isFront = stackPos === 0;

          return (
            <div
              key={game.id}
              onClick={isFront ? () => router.push(game.route) : swap}
              style={{
                position: "absolute",
                width: "22rem",
                height: "11rem",
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${pos.scale}) skewY(${pos.skew}deg)`,
                zIndex: pos.z,
                opacity: animating ? 0.45 : pos.opacity,
                transition: "transform 0.35s cubic-bezier(.4,0,.2,1), opacity 0.22s ease, box-shadow 0.25s ease",
                cursor: "pointer",
                background: game.bg,
                border: `2px solid ${game.border}`,
                borderRadius: "16px",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                if (!isFront) return;
                const el = e.currentTarget as HTMLElement;
                el.style.border = `2px solid ${game.borderHover}`;
                el.style.boxShadow = `0 12px 48px ${game.glow}`;
              }}
              onMouseLeave={(e) => {
                if (!isFront) return;
                const el = e.currentTarget as HTMLElement;
                el.style.border = `2px solid ${game.border}`;
                el.style.boxShadow = "none";
              }}
            >
              {/* Logo + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <Image
                  src={game.logo}
                  alt={game.id}
                  width={isFront ? 120 : 100}
                  height={30}
                  style={{ objectFit: "contain", objectPosition: "left" }}
                />
                <span style={{
                  fontSize: isFront ? 11 : 9,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: `${game.accent}99`,
                  whiteSpace: "nowrap",
                  fontFamily: "Arial, sans-serif",
                }}>
                  {game.id === "valorant" ? "Valorant" : "CS2"}
                </span>
              </div>

              {/* Tags — front card only */}
              {isFront && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {game.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: `${game.accent}18`,
                        color: `${game.accent}bb`,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Bottom row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: `${game.accent}66`,
                  fontWeight: 500,
                }}>
                  {game.sublabel}
                </span>
                {isFront && (
                  <span style={{ color: game.accent, fontSize: 18, lineHeight: 1 }}>→</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hints */}
      <div className="mt-24 flex flex-col items-center gap-2">
        <button
          onClick={swap}
          className="text-white/20 hover:text-white/50 transition-colors text-[10px] tracking-widest uppercase"
        >
          ↕ scroll or click to switch
        </button>
        <p className="text-white/10 text-[10px] tracking-widest uppercase">
          click card to enter
        </p>
      </div>
    </main>
  );
}