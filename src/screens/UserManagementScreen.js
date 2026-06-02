import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";

export default function UserManagementScreen({
  user,
  onLogout,
  onSwitchRole,
  onUpdateMeta,
  onBack,
}) {
  const [users, setUsers] = useState([]);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // Meta Edit Modal Fields
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  // Fetch users from our Firestore 'users' collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const userList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort users alphabetically by name
      userList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setUsers(userList);
    });
    return () => unsub();
  }, []);

  const handleRemoveUser = async (userId, userName) => {
    if (window.confirm(`Are you sure you want to remove ${userName}?`)) {
      try {
        await deleteDoc(doc(db, "users", userId));
      } catch (err) {
        alert("Error removing user: " + err.message);
      }
    }
  };

  const openMetaEdit = () => {
    setEditAllocation(user?.allocation || "Floor Incharge");
    setEditShift(user?.shift || "Morning");
    setShowMetaEdit(true);
  };

  const saveMetaEdit = () => {
    if (onUpdateMeta) onUpdateMeta(editAllocation, editShift);
    setShowMetaEdit(false);
  };

  return (
    <div style={S.root}>
      {/* ── HEADER (Identical to Admin/Staff Screens) ── */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>System Administration</div>
          <div style={S.userName}>{user?.name || "System Admin"}</div>
          <div
            style={{
              ...S.userMeta,
              cursor: "pointer",
              display: "inline-block",
              padding: "4px 8px",
              background: "rgba(212,175,55,0.08)",
              borderRadius: "6px",
              marginLeft: "-8px",
              userSelect: "none",
            }}
            onDoubleClick={openMetaEdit}
            title="Double-click to edit shift details"
          >
            {user?.allocation || "Creator"} • {user?.shift || "Day"} Shift ✎
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            position: "relative",
          }}
        >
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
                  ["ADMIN", "Admin Dashboard"],
                  ["STAFF", "Staff Dashboard"],
                  ["PAR_CONTROL", "PAR Control"],
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

                {/* Back to main menu option */}
                <div
                  onClick={() => {
                    onBack();
                    setShowRoleMenu(false);
                  }}
                  style={{
                    ...S.dropItem,
                    borderTop: `1px solid ${C.border}`,
                    color: C.gold,
                  }}
                >
                  Main Menu
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            style={{ ...S.ghostBtn, color: "#F87171" }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── SUBHEADER ── */}
      <div style={S.subheader}>
        <span style={S.subheaderText}>Registered Users</span>
        <span style={S.subheaderNote}>All registered staff and admins</span>
      </div>

      {/* ── USER LIST ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {users.length === 0 ? (
          <div style={S.card}>
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No users synced yet. As staff log in, they will appear here
              automatically.
            </div>
          </div>
        ) : (
          users.map((u) => (
            <div key={u.id} style={S.card}>
              <div style={S.cardRow}>
                <div style={S.cardLeft}>
                  <div style={S.cardName}>{u.name || "Unnamed User"}</div>
                  <div style={S.cardSub}>{u.email || "No email provided"}</div>
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      background: "#162236",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.muted,
                      letterSpacing: "0.05em",
                      width: "fit-content",
                    }}
                  >
                    {u.role || "STAFF"}
                  </div>
                </div>

                <div style={S.cardRight}>
                  {/* Prevent creator from deleting themselves accidentally */}
                  {u.id !== user?.id && (
                    <button
                      onClick={() => handleRemoveUser(u.id, u.name)}
                      style={S.deleteBtn}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── META EDIT MODAL ── */}
      {showMetaEdit && (
        <div style={S.overlay} onClick={() => setShowMetaEdit(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalEyebrow}>Update Session</div>
                <div style={S.modalTitle}>Change Shift Details</div>
              </div>
              <button onClick={() => setShowMetaEdit(false)} style={S.closeBtn}>
                ✕
              </button>
            </div>

            <div style={S.modalDivider} />

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Allocation</div>
              <select
                className="light-input"
                style={S.input}
                value={editAllocation}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditAllocation(value);

                  if (value === "Floor Incharge") {
                    setEditShift("Morning");
                  } else if (value === "Shift Incharge") {
                    setEditShift("Afternoon");
                  } else if (value === "Housekeeping Desk") {
                    setEditShift("Morning");
                  }
                }}
              >
                <option>Creator</option>
                <option>Floor Incharge</option>
                <option>Shift Incharge</option>
                <option>Housekeeping Desk</option>
              </select>
            </div>

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Shift</div>
              <select
                className="light-input"
                style={S.input}
                value={editShift}
                onChange={(e) => setEditShift(e.target.value)}
              >
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Night</option>
              </select>
            </div>

            <button
              onClick={saveMetaEdit}
              style={{ ...S.saveBtn, width: "100%", marginTop: "10px" }}
            >
              Update Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DESIGN TOKENS (Synced with Staff & Admin Screens) ───
const C = {
  bg: "#07101E",
  surface: "#0F1B2D",
  surfaceHover: "#162236",
  border: "rgba(255,255,255,0.06)",
  borderMid: "rgba(255,255,255,0.10)",
  text: "#F0F4FF",
  muted: "#6B7A99",
  gold: "#D4AF37",
  blue: "#3B7EF6",
  blueDeep: "#2563EB",
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
  userMeta: {
    fontSize: 13,
    fontWeight: 500,
    color: C.gold,
    marginTop: 4,
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
    transformOrigin: "top right",
    animation: "scaleInFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
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
    transition: "border-color 0.15s",
  },
  cardRow: {
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLeft: { display: "flex", flexDirection: "column", gap: 3 },
  cardName: {
    fontSize: 15,
    fontWeight: 600,
    color: C.text,
    letterSpacing: "-0.1px",
  },
  cardSub: { fontSize: 12, color: C.muted },
  cardRight: { display: "flex", alignItems: "center", gap: 10 },
  deleteBtn: {
    background: "rgba(248,113,113,0.12)",
    color: "#F87171",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 999,
    animation: "fadeIn 0.3s ease-out",
  },
  modal: {
    background: "#0F1B2D",
    borderRadius: "24px 24px 0 0",
    padding: "24px 20px 36px",
    width: "100%",
    maxWidth: 480,
    border: `1px solid ${C.borderMid}`,
    borderBottom: "none",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.gold,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: C.text,
    letterSpacing: "-0.3px",
  },
  closeBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "none",
    color: C.muted,
    borderRadius: 10,
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDivider: { height: "1px", background: C.border, margin: "16px 0" },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    background: "#162236",
    border: `1px solid ${C.borderMid}`,
    borderRadius: 12,
    padding: "12px 14px",
    color: C.text,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  saveBtn: {
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
