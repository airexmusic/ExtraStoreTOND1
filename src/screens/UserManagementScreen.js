import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteField,
} from "firebase/firestore";

export default function UserManagementScreen({ user, onBack }) {
  const [users, setUsers] = useState([]);

  // Edit Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("Associate");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const pendingUsers = users.filter((u) => u.hasPendingUpdate);
  const activeUsers = users.filter(
    (u) => u.status !== "Suspended" && !u.hasPendingUpdate
  );
  const suspendedUsers = users.filter((u) => u.status === "Suspended");

  const approveChange = async (u) => {
    try {
      await updateDoc(doc(db, "users", u.id), {
        name: u.pendingName,
        hasPendingUpdate: false,
        pendingName: deleteField(),
      });
    } catch (err) {
      alert("Failed to approve: " + err.message);
    }
  };

  const rejectChange = async (u) => {
    try {
      await updateDoc(doc(db, "users", u.id), {
        hasPendingUpdate: false,
        pendingName: deleteField(),
      });
    } catch (err) {
      alert("Failed to reject: " + err.message);
    }
  };

  const toggleUserStatus = async (u, newStatus) => {
    try {
      await updateDoc(doc(db, "users", u.id), { status: newStatus });
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
  };

  // ─── ADMIN EDIT FUNCTIONS ───
  const openEditModal = (u) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditRole(u.role || "Associate");
  };

  const closeEditModal = () => {
    setEditingUser(null);
  };

  const saveUserDetails = async () => {
    if (!editingUser || !editName.trim()) {
      alert("Name cannot be empty.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", editingUser.id), {
        name: editName.trim(),
        role: editRole,
      });
      closeEditModal();
    } catch (err) {
      alert("Failed to update user: " + err.message);
    }
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes iosSlideIn { 0% { opacity: 0; transform: translateY(-30px) scale(0.95); } 60% { transform: translateY(5px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Administration</div>
          <div style={S.title}>User Management</div>
        </div>
        <button onClick={onBack} style={S.backBtn}>
          ← Back to Admin
        </button>
      </div>

      {pendingUsers.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>
            Pending Approvals ({pendingUsers.length})
          </div>
          {pendingUsers.map((u) => (
            <div
              key={u.id}
              style={{ ...S.userCard, borderLeft: `4px solid ${C.gold}` }}
            >
              <div>
                <div style={S.userName}>
                  {u.name}{" "}
                  <span style={{ color: C.muted, fontWeight: 400 }}>
                    wants to change name to
                  </span>{" "}
                  <span style={{ color: C.gold }}>{u.pendingName}</span>
                </div>
                <div style={S.userEmail}>{u.email}</div>
              </div>
              <div style={S.actionRow}>
                <button onClick={() => approveChange(u)} style={S.approveBtn}>
                  Approve
                </button>
                <button onClick={() => rejectChange(u)} style={S.rejectBtn}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionTitle}>Active Staff ({activeUsers.length})</div>
        {activeUsers.map((u) => (
          <div key={u.id} style={S.userCard}>
            <div>
              <div style={S.userName}>
                {u.name} <span style={S.roleBadge}>{u.role}</span>
              </div>
              <div style={S.userEmail}>{u.email}</div>
            </div>
            <div style={S.actionRow}>
              <button onClick={() => openEditModal(u)} style={S.editBtn}>
                Edit
              </button>
              <button
                onClick={() => toggleUserStatus(u, "Suspended")}
                style={S.suspendBtn}
              >
                Deactivate
              </button>
            </div>
          </div>
        ))}
        {activeUsers.length === 0 && (
          <div style={S.empty}>No active users found.</div>
        )}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>
          Deactivated Staff ({suspendedUsers.length})
        </div>
        {suspendedUsers.map((u) => (
          <div key={u.id} style={{ ...S.userCard, opacity: 0.6 }}>
            <div>
              <div style={S.userName}>
                {u.name} <span style={S.roleBadge}>{u.role}</span>
              </div>
              <div style={S.userEmail}>{u.email}</div>
            </div>
            <div style={S.actionRow}>
              <button onClick={() => openEditModal(u)} style={S.editBtn}>
                Edit
              </button>
              <button
                onClick={() => toggleUserStatus(u, "Active")}
                style={S.reactivateBtn}
              >
                Reactivate
              </button>
            </div>
          </div>
        ))}
        {suspendedUsers.length === 0 && (
          <div style={S.empty}>No deactivated users.</div>
        )}
      </div>

      {/* ── ADMIN EDIT MODAL ── */}
      {editingUser && (
        <div style={S.overlay} onClick={closeEditModal}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalEyebrow}>Administrative Override</div>
                <div style={S.modalTitle}>Edit Staff Profile</div>
              </div>
              <button onClick={closeEditModal} style={S.closeIconBtn}>
                ✕
              </button>
            </div>
            <div style={S.modalDivider} />

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Full Name</div>
              <input
                style={S.input}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Role / Position</div>
              <select
                style={S.input}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
              >
                <option>Associate</option>
                <option>Supervisor</option>
                <option>Manager</option>
              </select>
            </div>

            <button
              onClick={saveUserDetails}
              style={{ ...S.saveBtn, marginTop: 12 }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const C = {
  bg: "#07101E",
  surface: "#0F1B2D",
  borderMid: "rgba(255,255,255,0.10)",
  text: "#F0F4FF",
  muted: "#6B7A99",
  gold: "#D4AF37",
  red: "#F87171",
  green: "#34D399",
  blue: "#3B82F6",
};
const S = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    padding: "20px 16px 40px",
    boxSizing: "border-box",
    fontFamily: "-apple-system, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.gold,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: C.text,
    letterSpacing: "-0.3px",
  },
  backBtn: {
    background: "#162236",
    border: `1px solid ${C.borderMid}`,
    color: C.text,
    padding: "8px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 12,
    borderBottom: `1px solid ${C.borderMid}`,
    paddingBottom: 8,
  },
  userCard: {
    background: C.surface,
    border: `1px solid ${C.borderMid}`,
    borderRadius: 16,
    padding: "16px",
    marginBottom: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: {
    fontSize: 15,
    fontWeight: 600,
    color: C.text,
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    background: "rgba(255,255,255,0.1)",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 6,
    color: "#FFF",
  },
  userEmail: { fontSize: 13, color: C.muted },
  actionRow: { display: "flex", gap: 8 },
  approveBtn: {
    background: C.green,
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  rejectBtn: {
    background: "rgba(248,113,113,0.1)",
    color: C.red,
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  suspendBtn: {
    background: "rgba(248,113,113,0.1)",
    color: C.red,
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  reactivateBtn: {
    background: "rgba(52,211,153,0.1)",
    color: C.green,
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  editBtn: {
    background: "rgba(59, 130, 246, 0.1)",
    color: C.blue,
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    padding: "20px 0",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 12,
  },

  // Modal Styles
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 999,
  },
  modal: {
    background: "#0F1B2D",
    borderRadius: "24px 24px 0 0",
    padding: "24px 20px 36px",
    width: "100%",
    maxWidth: 480,
    border: `1px solid ${C.borderMid}`,
    animation: "iosSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
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
  closeIconBtn: {
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
  modalDivider: { height: "1px", background: C.borderMid, margin: "16px 0" },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 8,
    display: "block",
  },
  input: {
    width: "100%",
    background: "#162236",
    border: `1px solid ${C.borderMid}`,
    borderRadius: 12,
    padding: "14px 16px",
    color: C.text,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  saveBtn: {
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
