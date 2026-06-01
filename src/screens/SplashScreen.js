import React, { useEffect } from "react";
// REMOVED: import logo from "../store_logo.webp"; <-- This was causing the crash
import "../styles.css";

export default function SplashScreen({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div style={S.root}>
      <div style={S.content}>
        {/* ACCESS VIA PUBLIC PATH */}
        <img src="/store_logo.webp" alt="TOND Logo" style={S.logo} />

        <div style={S.textContainer}>
          <h1 style={S.title}>EXTRA ITEM COUNT</h1>
          <h2 style={S.subtitle}>TEAM HOUSEKEEPING</h2>
        </div>
      </div>

      <div style={S.footer}>
        <div className="ios-spinner"></div>
      </div>
    </div>
  );
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
    background: "#07101E",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "24px",
  },
  logo: {
    width: "120px",
    height: "120px",
    borderRadius: "24px",
    objectFit: "cover",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  },
  textContainer: {
    textAlign: "center",
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: "22px",
    fontWeight: "800",
    letterSpacing: "0.2em",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: "0.1em",
    color: "#D4AF37",
    textTransform: "uppercase",
  },
  footer: {
    position: "absolute",
    bottom: "40px",
  },
};
