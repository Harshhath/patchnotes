"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

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
    glow: "rgba(255,70,85,0.35)",
    spotlightColor: "255,70,85",
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
    glow: "rgba(232,160,32,0.35)",
    spotlightColor: "232,160,32",
    tags: ["Weapons", "Maps", "Economy"],
  },
] as const;

const STACK_POS = [
  { x: 0,  y: 0,  scale: 1,    z: 2, skew: -6, opacity: 1    },
  { x: 28, y: 20, scale: 0.94, z: 1, skew: -6, opacity: 0.68 },
];

const SPRING_CONFIG = {
  type: "spring" as const,
  stiffness: 340,
  damping: 30,
  mass: 0.9,
};

const TILT_SPRING = { stiffness: 300, damping: 25 };

function GameCard({
  game,
  isFront,
  onClick,
  pos,
}: {
  game: typeof GAMES[number];
  isFront: boolean;
  onClick: () => void;
  pos: typeof STACK_POS[number];
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Motion values for tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), TILT_SPRING);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), TILT_SPRING);

  // Spotlight position
  const [spotlight, setSpotlight] = useState({ x: -999, y: -999, visible: false });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isFront || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
    setSpotlight({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
    setSpotlight((s) => ({ ...s, visible: false }));
  }

  return (
    <motion.div
      animate={{
        x: pos.x,
        y: pos.y,
        scale: pos.scale,
        skewY: pos.skew,
        opacity: pos.opacity,
        zIndex: pos.z,
      }}
      transition={SPRING_CONFIG}
      style={{
        position: "absolute",
        width: "22rem",
        height: "11rem",
        cursor: "pointer",
        perspective: 800,
      }}
      onClick={onClick}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: "100%",
          height: "100%",
          rotateX: isFront ? rotateX : 0,
          rotateY: isFront ? rotateY : 0,
          transformStyle: "preserve-3d",
          background: game.bg,
          border: `2px solid ${game.border}`,
          borderRadius: "16px",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
        whileHover={isFront ? { borderColor: game.borderHover } : {}}
        transition={{ duration: 0.2 }}
      >
        {/* Spotlight radial gradient */}
        {isFront && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "14px",
              pointerEvents: "none",
              background: spotlight.visible
                ? `radial-gradient(240px circle at ${spotlight.x}px ${spotlight.y}px, rgba(${game.spotlightColor}, 0.12), transparent 70%)`
                : "transparent",
              transition: "background 0.1s ease",
              zIndex: 0,
            }}
          />
        )}

        {/* Card content — above spotlight */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
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
                <span key={tag} style={{
                  fontSize: 10,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: `${game.accent}18`,
                  color: `${game.accent}bb`,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}>
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
      </motion.div>
    </motion.div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [frontIndex, setFrontIndex] = useState(0);
  const [isSwapping, setIsSwapping] = useState(false);

  const swap = useCallback(() => {
    if (isSwapping) return;
    setIsSwapping(true);
    setFrontIndex((i) => (i + 1) % GAMES.length);
    setTimeout(() => setIsSwapping(false), 350);
  }, [isSwapping]);

  useEffect(() => {
    let cooldown = false;
    const onWheel = () => {
      if (cooldown) return;
      cooldown = true;
      swap();
      setTimeout(() => { cooldown = false; }, 400);
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
        {order.map((gameIdx, stackPos) => (
          <GameCard
            key={GAMES[gameIdx].id}
            game={GAMES[gameIdx]}
            isFront={stackPos === 0}
            onClick={stackPos === 0 ? () => router.push(GAMES[gameIdx].route) : swap}
            pos={STACK_POS[stackPos]}
          />
        ))}
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