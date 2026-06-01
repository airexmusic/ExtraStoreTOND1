import React, { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const DEFAULT_ITEMS = [
  { id: 1, name: "Child Bed", par: 0 },
  { id: 2, name: "Extension Board", par: 0 },
  { id: 3, name: "Extra Bed", par: 0 },
  { id: 4, name: "Fan", par: 0 },
  { id: 5, name: "Oil Heater", par: 0 },
  { id: 6, name: "Zipper", par: 0 },
];

export default function ParControlScreen({ user, onLogout, onSwitchRole }) {
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [newItemName, setNewItemName] = useState("");
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false); // Added success state

  const isCreator = user?.allocation === "Creator";

  const handleParChange = (id, value) => {
    if (!isCreator) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, par: parseInt(value) || 0 } : item
      )
    );
  };

  const addItem = () => {
    if (!isCreator || !newItemName.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: Date.now(), name: newItemName.trim(), par: 0 },
    ]);
    setNewItemName("");
  };

  const deleteItem = (id) => {
    if (!isCreator) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const saveAndDeploy = async () => {
    setDeploying(true);
    setDeploySuccess(false);
    try {
      await addDoc(collection(db, "par_deployments"), {
        deployedBy: user?.name || "Unknown",
        role: user?.allocation || "Unknown",
        items,
        deployedAt: serverTimestamp(),
      });
      // Show green success state for 3 seconds instead of annoying alert
      setDeploySuccess(true);
      setTimeout(() => setDeploySuccess(false), 3000);
    } catch (error) {
      alert("Deployment failed: " + error.message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div style={S.root}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Master PAR Control</div>
          <div style={S.userName}>Editor: {user?.name}</div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            position: "relative",
          }}
        >
          {isCreator && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowRoleMenu((v) => !v)}
                style={S.ghostBtn}
              >
                Switch ▾
              </button>
              {showRoleMenu && (
                <div style={S.dropdown}>
                  {[
                    ["ADMIN", "Admin"],
                    ["PAR_CONTROL", "PAR Control"],
                    ["STAFF", "Staff"],
                  ].map(([k, l]) => (
                    <div
                      key={k}
                      onClick={() => {
                        onSwitchRole(k);
                        setShowRoleMenu(false);
                      }}
                      style={S.dropItem}
                    >
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onLogout}
            style={{ ...S.ghostBtn, color: "#F87171" }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── SECTION TAB ── */}
      <div style={S.subheader}>
        <span style={S.subheaderText}>Extra Items</span>
        <span style={S.subheaderNote}>
          {isCreator ? "Edit PAR quantities below" : "View-only mode"}
        </span>
      </div>

      {/* ── ITEMS ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {items.map((item) => (
          <div key={item.id} style={S.card}>
            <div style={S.cardRow}>
              <div style={S.cardLeft}>
                <div style={S.cardName}>{item.name}</div>
                <div style={S.cardSub}>Global PAR Quantity</div>
              </div>
              <div style={S.cardRight}>
                <div style={S.parInputWrap}>
                  <input
                    type="number"
                    value={item.par}
                    readOnly={!isCreator}
                    onChange={(e) => handleParChange(item.id, e.target.value)}
                    style={{
                      ...S.parInput,
                      opacity: isCreator ? 1 : 0.55,
                      cursor: isCreator ? "text" : "default",
                    }}
                  />
                </div>
                {isCreator && (
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={S.deleteBtn}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── ADD ITEM ── */}
      {isCreator && (
        <div style={S.addCard}>
          <input
            type="text"
            placeholder="New item name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            style={S.input}
          />
          <button onClick={addItem} style={S.addBtn}>
            + Add Item
          </button>
        </div>
      )}

      {/* ── DEPLOY ── (Removed sticky, changed colors on deploy state) */}
      <div style={{ marginTop: 24, paddingBottom: 20 }}>
        <button
          onClick={saveAndDeploy}
          disabled={deploying || deploySuccess}
          style={{
            ...S.deployBtn,
            opacity: deploying ? 0.7 : 1,
            background: deploying || deploySuccess ? "#2ECC71" : C.gold, // Turns green
            color: deploying || deploySuccess ? "#FFFFFF" : "#000", // Text turns white on green
            transition: "background-color 0.3s ease, color 0.3s ease",
          }}
        >
          {deploySuccess
            ? "Deployed Successfully! ✓"
            : deploying
            ? "Deploying…"
            : "Save & Deploy Master PARs"}
        </button>
      </div>
    </div>
  );
}

// ─── DESIGN TOKENS ──────────────────────────
const C = {
  bg: "#07101E",
  surface: "#0F1B2D",
  surfaceDeep: "#162236",
  border: "rgba(255,255,255,0.06)",
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
    padding: "20px 16px 40px",
    boxSizing: "border-box",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.gold,
    marginBottom: 4,
  },
  userName: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    color: C.text,
  },
  ghostBtn: {
    background: "transparent",
    border: "none",
    color: C.gold,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: "4px 0",
    letterSpacing: "0.02em",
    fontFamily: "inherit",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: 30,
    width: 180,
    background: "#111F35",
    borderRadius: 14,
    border: `1px solid ${C.borderMid}`,
    overflow: "hidden",
    zIndex: 999,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  dropItem: {
    padding: "13px 16px",
    fontSize: 13,
    color: "#B0BFDA",
    cursor: "pointer",
    borderBottom: `1px solid ${C.border}`,
  },
  subheader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 4,
  },
  subheaderText: {
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    letterSpacing: "0.01em",
  },
  subheaderNote: {
    fontSize: 11,
    color: C.muted,
  },
  card: {
    background: C.surface,
    borderRadius: 16,
    border: `1px solid ${C.border}`,
    overflow: "hidden",
  },
  cardRow: {
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: 600,
    color: C.text,
    letterSpacing: "-0.1px",
  },
  cardSub: {
    fontSize: 12,
    color: C.muted,
  },
  cardRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  parInputWrap: {},
  parInput: {
    background: C.surfaceDeep,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    minWidth: 44,
    height: 38,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    fontFamily: "inherit",
    outline: "none",
    width: 70,
  },
  deleteBtn: {
    background: "rgba(248,113,113,0.12)",
    color: "#F87171",
    border: "none",
    borderRadius: 8,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  addCard: {
    background: C.surface,
    borderRadius: 16,
    border: `1px solid ${C.border}`,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    background: C.surfaceDeep,
    border: `1px solid ${C.borderMid}`,
    borderRadius: 12,
    padding: "12px 14px",
    color: C.text,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  addBtn: {
    width: "100%",
    background: C.gold,
    border: "none",
    borderRadius: 12,
    padding: "12px 20px",
    color: "#000",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.02em",
  },
  deployBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    border: "none",
    background: C.gold,
    color: "#000",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.02em",
  },
};
