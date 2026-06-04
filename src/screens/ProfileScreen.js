import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, deleteDoc } from "firebase/firestore";

export default function ProfileScreen({ user, onBack }) {
  const [requests, setRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [requestType, setRequestType] = useState("");
  const [newValue, setNewValue] = useState("");
  const isCreator = user?.role === "CREATOR" || user?.name === "Rahul Sengupta";

  useEffect(() => {
    const q = query(collection(db, "user_requests"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const submitRequest = async () => {
    await addDoc(collection(db, "user_requests"), {
      requestUserId: user?.id || "unknown_id",
      requestUserName: user?.name || "Unknown User",
      type: requestType,
      newValue: newValue,
      status: "Pending",
      createdAt: Date.now(),
    });
    setShowModal(false);
  };

  const deleteRequest = async (id) => { if (window.confirm("Delete this entry?")) await deleteDoc(doc(db, "user_requests", id)); };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <div style={S.headerTitle}>USER PROFILE</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={S.card}>
        <div style={S.avatarBox}>
          <img src="/store_logo.webp" alt="Logo" style={S.logo} onError={(e) => e.target.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png"} />
        </div>
        <div style={S.grid}>
          {[ {l:"USER ID", v: user?.name, a: "Name"}, {l:"EMAIL", v: user?.email || "Not Set", a: "Email"}, {l:"DESIGNATION", v: user?.allocation || "Staff"}, {l:"PASSWORD", v: "••••••••", a: "Password Reset", btn: "Reset"} ].map((item, i) => (
            <div key={i} style={S.row}>
              <div style={S.label}>{item.l}</div>
              <div style={S.value}>
                {item.v}
                {item.a && <button onClick={() => {setRequestType(item.a); setShowModal(true)}} style={S.actionBtn}>{item.btn || "Edit"}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.sectionTitle}>MY CHANGE REQUESTS</div>
      <div style={S.list}>
        {(isCreator ? requests : requests.filter(r => r.requestUserName === user?.name)).map((req) => (
          <div key={req.id} style={S.requestCard}>
            <div style={{ padding: "16px" }}>
              <div style={S.reqHeader}>{req.requestUserName} requested a {req.type} change</div>
              <div style={S.reqBody}>Value: {req.newValue} | Status: <span style={{color: req.status === "Pending" ? C.gold : req.status === "Approved" ? C.green : C.red}}>{req.status}</span></div>
            </div>
            {/* The line and button group matching your screenshot */}
            <div style={S.line} />
            <div style={S.buttonGroup}>
               <button onClick={() => deleteRequest(req.id)} style={S.btnDelete}>✕ Delete Entry</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>Request {requestType}</div>
            <input placeholder="New Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} style={S.input} />
            <button onClick={submitRequest} style={S.mainBtn}>Submit</button>
          </div>
        </div>
      )}
    </div>
  );
}

const C = { bg: "#07101E", card: "#0F1B2D", border: "#1f2937", text: "#FFF", muted: "#8E8E93", gold: "#D4AF37", green: "#22c55e", red: "#ef4444" };
const S = {
  root: { minHeight: "100vh", background: C.bg, padding: "20px", color: C.text, fontFamily: "Inter, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  backBtn: { background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 },
  headerTitle: { fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: 1 },
  card: { background: C.card, borderRadius: 20, padding: 24 },
  avatarBox: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 },
  logo: { width: 200, height: 200, borderRadius: 25 },
  grid: { display: "flex", flexDirection: "column", gap: 16 },
  row: { paddingBottom: 5 },
  label: { fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 },
  value: { fontSize: 15, display: "flex", justifyContent: "space-between" },
  actionBtn: { background: "none", border: "none", color: "#3B82F6", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 30, marginBottom: 15, marginLeft: 5 },
  requestCard: { background: C.card, borderRadius: 16, marginBottom: 12 },
  reqHeader: { fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 },
  reqBody: { fontSize: 13, color: C.muted },
  line: { height: 1, background: C.border }, // The line/dash divider
  buttonGroup: { display: "flex" },
  btnDelete: { width: "100%", background: "transparent", border: "none", color: C.red, padding: 12, fontWeight: 600, fontSize: 13, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { background: C.card, padding: 24, borderRadius: 20, width: "100%", maxWidth: 350 },
  modalHeader: { fontSize: 18, fontWeight: 700, marginBottom: 15 },
  input: { width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, boxSizing: "border-box", marginBottom: 15 },
  mainBtn: { width: "100%", padding: 12, borderRadius: 10, background: C.gold, border: "none", fontWeight: 700, cursor: "pointer" }
};