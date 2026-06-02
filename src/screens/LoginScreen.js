import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "../firebase";

export default function LoginScreen({ onLoginSuccess }) {
  const [view, setView] = useState("login"); // "login", "register", "handover"
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Associate");

  // New Remember Me State
  const [rememberMe, setRememberMe] = useState(true);

  // Handover state
  const [allocation, setAllocation] = useState("Floor Incharge");
  const [shift, setShift] = useState("Morning");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (allocation === "Floor Incharge") {
      setShift("Morning");
    } else if (allocation === "Shift Incharge") {
      setShift("Afternoon");
    } else if (allocation === "Housekeeping Desk") {
      setShift("Morning");
    }
  }, [allocation]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // 1. CREATOR BACKDOOR
    if (identifier.toLowerCase() === "rahulsengupta" && password === "1234") {
      setIsLoading(false);
      onLoginSuccess("CREATOR", "Rahul Sengupta", "Creator", "Creator");
      return;
    }

    // 2. TEST BACKDOOR
    if (identifier.toLowerCase() === "test" && password === "test") {
      setIsLoading(false);
      setRole("STAFF");
      setUsername("Test User");
      setView("handover");
      return;
    }

    // 3. STANDARD LOGIN
    try {
      const email = identifier.includes("@")
        ? identifier
        : `${identifier}@tond.com`;

      // Apply the chosen persistence before authenticating
      const persistenceType = rememberMe
        ? browserLocalPersistence
        : browserSessionPersistence;
      await setPersistence(auth, persistenceType);

      if (view === "register") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setIsLoading(false);
      setView("handover");
    } catch (err) {
      setIsLoading(false);
      alert(err.message);
    }
  };

  const handleGoBack = () => {
    // If backing out of handover, clear the firebase auth session just in case
    if (view === "handover") {
      signOut(auth).catch(() => {});
    }
    setView("login");
  };

  // ─── HANDOVER VIEW (PREMIUM FLUID UI) ─────────────────────────────────────
  if (view === "handover") {
    return (
      <div style={S.root}>
        <div style={S.card}>
          <button style={S.backBtn} onClick={handleGoBack}>
            ← Back
          </button>

          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={S.eyebrow}>Authentication Success</div>
            <h2 style={S.title}>Shift Handover</h2>
            <p style={S.subtitle}>Tap to confirm your session details</p>
          </div>

          <div style={S.fieldBlock}>
            <div style={S.fieldLabel}>Designation / Allocation</div>

            <div style={S.optionGrid}>
              {["Floor Incharge", "Shift Incharge", "Housekeeping Desk"].map(
                (opt) => (
                  <div
                    key={opt}
                    onClick={() => {
                      setAllocation(opt);

                      if (opt === "Floor Incharge") {
                        setShift("Morning");
                      } else if (opt === "Shift Incharge") {
                        setShift("Afternoon");
                      } else if (opt === "Housekeeping Desk") {
                        setShift("Morning");
                      }
                    }}
                    style={{
                      ...S.optionBtn,
                      ...(allocation === opt ? S.optionBtnActive : {}),
                    }}
                  >
                    {opt}
                  </div>
                )
              )}
            </div>
          </div>

          <div style={S.fieldBlock}>
            <div style={S.fieldLabel}>Select Shift</div>

            <div
              style={{
                ...S.optionGrid,
                gridTemplateColumns:
                  allocation === "Floor Incharge"
                    ? "1fr"
                    : allocation === "Shift Incharge"
                    ? "repeat(2, 1fr)"
                    : "repeat(2, 1fr)",
              }}
            >
              {(allocation === "Floor Incharge"
                ? ["Morning"]
                : allocation === "Shift Incharge"
                ? ["Afternoon", "Night"]
                : ["Morning", "Afternoon"]
              ).map((opt) => (
                <div
                  key={opt}
                  onClick={() => setShift(opt)}
                  style={{
                    ...S.optionBtn,
                    ...(shift === opt ? S.optionBtnActive : {}),
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>

          <button
            style={{ ...S.btn, marginTop: 24 }}
            onClick={() => {
              const finalAllocation =
                role === "CREATOR" ? "Creator" : allocation;
              onLoginSuccess(
                role,
                username || identifier,
                finalAllocation,
                shift
              );
            }}
          >
            Enter Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── LOGIN / REGISTER VIEW ────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <div style={S.card}>
        {/* Dynamic Back Button for Register Screen */}
        {view === "register" && (
          <button style={S.backBtn} onClick={handleGoBack}>
            ← Back
          </button>
        )}

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={S.eyebrow}>Team Housekeeping</div>
          <h2 style={S.title}>
            {view === "register" ? "Create Account" : "System Login"}
          </h2>
          <p style={S.subtitle}>Enter your credentials to continue</p>
        </div>

        <form
          onSubmit={handleAuth}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {view === "register" && (
            <>
              <input
                style={S.input}
                placeholder="Full Name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <div style={S.optionGrid}>
                {["Associate", "Supervisor", "Manager"].map((opt) => (
                  <div
                    key={opt}
                    onClick={() => setRole(opt)}
                    style={{
                      ...S.optionBtn,
                      padding: "10px",
                      ...(role === opt ? S.optionBtnActive : {}),
                    }}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </>
          )}

          <input
            style={S.input}
            type="text"
            placeholder="User ID or Email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <input
            style={S.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label style={S.checkboxWrap}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={S.checkbox}
            />
            Keep me logged in
          </label>

          <button
            style={{ ...S.btn, marginTop: 8 }}
            type="submit"
            disabled={isLoading}
          >
            {isLoading
              ? "Authenticating..."
              : view === "register"
              ? "Register Account"
              : "Secure Login"}
          </button>
        </form>

        {view === "login" && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <span style={S.toggleText} onClick={() => setView("register")}>
              Don't have an account? Register
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#07101E",
  surface: "#0F1B2D",
  borderMid: "rgba(255,255,255,0.10)",
  text: "#F0F4FF",
  muted: "#6B7A99",
  gold: "#D4AF37",
};

const S = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  card: {
    background: C.surface,
    width: "100%",
    maxWidth: "420px",
    borderRadius: "24px",
    border: `1px solid ${C.borderMid}`,
    padding: "36px 28px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
    position: "relative",
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: C.muted,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: 0,
    marginBottom: 20,
    transition: "color 0.2s",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.gold,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    color: C.text,
    marginBottom: 6,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: C.muted,
  },
  fieldBlock: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 10,
    display: "block",
  },
  optionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "10px",
  },
  optionBtn: {
    background: "#162236",
    border: `1px solid ${C.borderMid}`,
    borderRadius: "12px",
    padding: "14px 10px",
    color: C.muted,
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.25s ease",
    userSelect: "none",
  },
  optionBtnActive: {
    background: "rgba(212, 175, 55, 0.15)", // Subtle gold glow
    borderColor: C.gold,
    color: C.gold,
    boxShadow: "0 4px 12px rgba(212, 175, 55, 0.1)",
  },
  input: {
    width: "100%",
    background: "#162236",
    border: `1px solid ${C.borderMid}`,
    borderRadius: "12px",
    padding: "14px 16px",
    color: C.text,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
  // ─── NEW CHECKBOX STYLES ───
  checkboxWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: C.muted,
    fontSize: 13,
    cursor: "pointer",
    userSelect: "none",
    marginTop: 2,
    marginBottom: 4,
  },
  checkbox: {
    accentColor: C.gold,
    width: 16,
    height: 16,
    cursor: "pointer",
    margin: 0,
  },
  btn: {
    width: "100%",
    height: "52px",
    borderRadius: "14px",
    border: "none",
    background: C.gold,
    color: "#000",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "transform 0.1s, opacity 0.2s",
  },
  toggleText: {
    fontSize: 13,
    color: C.muted,
    cursor: "pointer",
    fontWeight: 500,
    textDecoration: "underline",
    textDecorationColor: "transparent",
    transition: "all 0.2s",
  },
};
