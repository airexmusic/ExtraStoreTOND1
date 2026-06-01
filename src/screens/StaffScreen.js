import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

// ─── CATALOG ──────────────────────────────────────────────────────────────────
const EXTRA_ITEMS = [
  "Child Bed",
  "Extension Board",
  "Extra Bed",
  "Fan",
  "Oil Heater",
  "Zipper",
];

const DEFAULT_PAR = {
  "Child Bed": 4,
  "Extension Board": 6,
  "Extra Bed": 5,
  Fan: 8,
  "Oil Heater": 3,
  Zipper: 10,
};

const AREAS = [
  "All Areas",
  "Floor 1",
  "Floor 2",
  "Floor 3",
  "Floor 4",
  "Floor 5",
  "Floor 6",
  "Floor 7",
  "Floor 8",
  "HK Desk",
  "HK Office",
  "Compactor",
];

const FLOOR_AREAS = new Set([
  "Floor 1",
  "Floor 2",
  "Floor 3",
  "Floor 4",
  "Floor 5",
  "Floor 6",
  "Floor 7",
  "Floor 8",
]);

function isFloor(area) {
  return FLOOR_AREAS.has(area);
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function buildLocLabel(locType, pantry, room) {
  if (locType === "Pantry") return `Pantry ${pantry}`;
  if (locType === "Room") return `Room ${room.trim()}`;
  return "Landing";
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function StaffDashboard({
  user,
  onLogout,
  onSwitchRole,
  onUpdateMeta,
}) {
  const [area, setArea] = useState("All Areas");
  const [expanded, setExpanded] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [parValues, setParValues] = useState(DEFAULT_PAR);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // Meta Edit Modal Fields
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  // modal fields
  const [locType, setLocType] = useState("Pantry");
  const [pantry, setPantry] = useState("A");
  const [room, setRoom] = useState("");
  const [qty, setQty] = useState("");
  const [staged, setStaged] = useState([]);
  const [saving, setSaving] = useState(false);

  const tapTimer = useRef(null);
  const isCreator = user?.role === "CREATOR";

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      setAllEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, "par_deployments"),
          orderBy("deployedAt", "desc"),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const latest = snap.docs[0].data();
          if (latest?.items) {
            const map = {};
            latest.items.forEach((i) => {
              map[i.name] = i.par;
            });
            setParValues((p) => ({ ...p, ...map }));
          }
        }
      } catch (_) {}
    })();
  }, []);

  function filtered(itemName, filterArea) {
    return allEntries.filter(
      (e) =>
        e.itemName === itemName &&
        (filterArea === "All Areas" || e.area === filterArea)
    );
  }

  function total(itemName, filterArea) {
    return filtered(itemName, filterArea).reduce(
      (s, e) => s + (parseInt(e.qty) || 0),
      0
    );
  }

  function groupedRows(itemName, filterArea) {
    const map = {};
    filtered(itemName, filterArea).forEach((e) => {
      const key =
        filterArea === "All Areas" ? `${e.area} · ${e.locLabel}` : e.locLabel;
      map[key] = (map[key] || 0) + (parseInt(e.qty) || 0);
    });
    return map;
  }

  function openModal(itemName) {
    if (area === "All Areas") return; // no entry from All Areas view
    setModalItem(itemName);
    setStaged([]);
    setLocType(isFloor(area) ? "Pantry" : "None");
    setPantry("A");
    setRoom("");
    setQty("");
  }

  function closeModal() {
    setModalItem(null);
    setStaged([]);
  }

  function handleTap(itemName) {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      openModal(itemName);
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setExpanded((p) => (p === itemName ? null : itemName));
      }, 240);
    }
  }

  function stageEntry() {
    const q = parseInt(qty);
    if (!q || q <= 0) return;
    if (locType === "Room" && !room.trim()) return;
    const locLabel = isFloor(area)
      ? buildLocLabel(locType, pantry, room)
      : area;
    setStaged((p) => [...p, { tempId: makeId(), locLabel, qty: q }]);
    setQty("");
    setRoom("");
  }

  async function save() {
    if (!staged.length) {
      closeModal();
      return;
    }
    setSaving(true);
    try {
      for (const e of staged) {
        // 1. Save the actual inventory entry
        await setDoc(doc(db, "extra_item_entries", makeId()), {
          itemName: modalItem,
          area,
          locLabel: e.locLabel,
          qty: e.qty,
          createdBy: user?.name || "Unknown",
          createdAt: Date.now(),
        });

        // 2. Trigger the notification for the Admin dashboard
        await addDoc(collection(db, "notifications"), {
          message: `${user?.name || "Unknown"} placed ${
            e.qty
          } ${modalItem} in ${area} (${e.locLabel})`,
          createdBy: user?.name || "Unknown",
          createdAt: Date.now(),
          readBy: [],
        });
      }
      closeModal();
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id) {
    try {
      await deleteDoc(doc(db, "extra_item_entries", id));
    } catch (err) {
      alert("Remove failed: " + err.message);
    }
  }

  const openMetaEdit = () => {
    setEditAllocation(user?.allocation || "Floor Incharge");
    setEditShift(user?.shift || "Morning");
    setShowMetaEdit(true);
  };

  const saveMetaEdit = () => {
    if (onUpdateMeta) onUpdateMeta(editAllocation, editShift);
    setShowMetaEdit(false);
  };

  const existingForModal = modalItem ? filtered(modalItem, area) : [];
  const isAll = area === "All Areas";

  return (
    <div style={S.root}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Team Housekeeping</div>
          <div style={S.userName}>{user?.name}</div>
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
            title="Click to edit shift details"
          >
            {user?.allocation || "Staff"} • {user?.shift || "Day"} Shift ✎
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
                  ["ADMIN", "Admin"],
                  ["STAFF", "Staff"],
                  ...(isCreator ? [["PAR_CONTROL", "PAR Control"]] : []),
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

          <button
            onClick={onLogout}
            style={{ ...S.ghostBtn, color: "#F87171" }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── AREA PILLS ── */}
      <div style={S.pillsWrap}>
        {AREAS.map((a) => (
          <button
            key={a}
            onClick={() => {
              setArea(a);
              setExpanded(null);
            }}
            style={{ ...S.pill, ...(area === a ? S.pillActive : {}) }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* ── SUBHEADER ── */}
      <div style={S.subheader}>
        <span style={S.subheaderText}>
          {isAll ? "Overview · All Locations" : area}
        </span>
        {isAll && (
          <span style={S.subheaderNote}>
            Tap item to expand · Select a floor to log entries
          </span>
        )}
        {!isAll && (
          <span style={S.subheaderNote}>Tap to expand · Double-tap to log</span>
        )}
      </div>

      {/* ── ITEM CARDS ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EXTRA_ITEMS.map((itemName) => {
          const actual = total(itemName, area);
          const par = parValues[itemName] || 0;
          const variance = actual - par;
          const isOpen = expanded === itemName;
          const rows = isOpen ? groupedRows(itemName, area) : {};
          const rowKeys = Object.keys(rows);

          return (
            <div
              key={itemName}
              style={S.card}
              onClick={() => handleTap(itemName)}
            >
              {/* card top row */}
              <div style={S.cardRow}>
                <div style={S.cardLeft}>
                  <div style={S.cardName}>{itemName}</div>
                  {isAll && <div style={S.cardSub}>PAR {par}</div>}
                </div>
                <div style={S.cardRight}>
                  {isAll && (
                    <div
                      style={{
                        ...S.varChip,
                        background:
                          variance >= 0
                            ? "rgba(52,211,153,0.12)"
                            : "rgba(248,113,113,0.12)",
                        color: variance >= 0 ? "#34D399" : "#F87171",
                      }}
                    >
                      {variance >= 0 ? "+" : ""}
                      {variance}
                    </div>
                  )}
                  <div style={S.qtyBox}>{actual}</div>
                  <div
                    style={{
                      ...S.chevron,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ‹
                  </div>
                </div>
              </div>

              {/* expand panel */}
              {isOpen && (
                <div style={S.expandPanel}>
                  <div style={S.divider} />
                  {rowKeys.length === 0 ? (
                    <div style={S.emptyMsg}>
                      {isAll
                        ? "No entries recorded"
                        : "No entries · Double-tap to add"}
                    </div>
                  ) : (
                    rowKeys.map((k) => (
                      <div key={k} style={S.locRow}>
                        <span style={S.locName}>{k}</span>
                        <span style={S.locCount}>{rows[k]}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ITEM ENTRY MODAL ── */}
      {modalItem && (
        <div style={S.overlay} onClick={closeModal}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            {/* modal header */}
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalEyebrow}>{area}</div>
                <div style={S.modalTitle}>{modalItem}</div>
              </div>
              <button onClick={closeModal} style={S.closeBtn}>
                ✕
              </button>
            </div>

            <div style={S.modalDivider} />

            {/* location type */}
            {isFloor(area) && (
              <div style={S.fieldBlock}>
                <div style={S.fieldLabel}>Location</div>
                <div style={S.chipRow}>
                  {["Pantry", "Room", "Landing"].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setLocType(t);
                        setRoom("");
                      }}
                      style={{
                        ...S.chip,
                        ...(locType === t ? S.chipActive : {}),
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isFloor(area) && locType === "Pantry" && (
              <div style={S.fieldBlock}>
                <div style={S.fieldLabel}>Pantry</div>
                <div style={S.chipRow}>
                  {["A", "B", "C"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPantry(p)}
                      style={{
                        ...S.chip,
                        ...(pantry === p ? S.chipActive : {}),
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isFloor(area) && locType === "Room" && (
              <div style={S.fieldBlock}>
                <div style={S.fieldLabel}>Room Number</div>
                <input
                  type="text"
                  placeholder="e.g. 118"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  style={S.input}
                />
              </div>
            )}

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Quantity</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  style={{ ...S.input, flex: 1 }}
                />
                <button onClick={stageEntry} style={S.addBtn}>
                  Add
                </button>
              </div>
            </div>

            {/* staged */}
            {staged.length > 0 && (
              <div style={S.entriesBlock}>
                <div style={S.entriesLabel}>New entries</div>
                {staged.map((e) => (
                  <div key={e.tempId} style={S.entryRow}>
                    <span style={S.entryText}>
                      {e.locLabel} · {e.qty}
                    </span>
                    <button
                      onClick={() =>
                        setStaged((p) => p.filter((x) => x.tempId !== e.tempId))
                      }
                      style={S.removeBtn}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* existing */}
            {existingForModal.length > 0 && (
              <div style={S.entriesBlock}>
                <div style={S.entriesLabel}>Saved entries</div>
                {existingForModal.map((e) => (
                  <div key={e.id} style={S.entryRow}>
                    <span style={S.entryText}>
                      {e.locLabel} · {e.qty}
                    </span>
                    <button
                      onClick={() => removeEntry(e.id)}
                      style={S.removeBtn}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={S.modalDivider} />

            {/* actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={closeModal} style={S.cancelBtn}>
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || staged.length === 0}
                style={{
                  ...S.saveBtn,
                  opacity: saving || staged.length === 0 ? 0.5 : 1,
                }}
              >
                {saving
                  ? "Saving…"
                  : `Save ${staged.length > 0 ? `(${staged.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHIFT / ALLOCATION EDIT MODAL ── */}
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
                onChange={(e) => setEditAllocation(e.target.value)}
              >
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

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
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
  pillsWrap: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  pill: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: C.muted,
    cursor: "pointer",
    letterSpacing: "0.01em",
    transition: "all 0.15s",
  },
  pillActive: {
    background: C.gold,
    borderColor: C.gold,
    color: "#000",
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
    cursor: "pointer",
    userSelect: "none",
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
  varChip: {
    borderRadius: 8,
    padding: "3px 9px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  qtyBox: {
    background: "#162236",
    borderRadius: 10,
    minWidth: 44,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    border: `1px solid ${C.border}`,
  },
  chevron: {
    color: C.muted,
    fontSize: 20,
    transition: "transform 0.2s",
    display: "inline-block",
    lineHeight: 1,
    marginLeft: 2,
  },
  expandPanel: {
    padding: "0 16px 14px",
    animation: "expandDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  divider: { height: "1px", background: C.border, marginBottom: 10 },
  locRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "7px 0",
    borderBottom: `1px solid ${C.border}`,
    fontSize: 13,
  },
  locName: { color: C.muted },
  locCount: { fontWeight: 600, color: C.text },
  emptyMsg: {
    fontSize: 12,
    color: C.muted,
    padding: "8px 0",
    textAlign: "center",
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
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    background: "#162236",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    color: C.muted,
    cursor: "pointer",
  },
  chipActive: {
    background: C.gold,
    borderColor: C.gold,
    color: "#000",
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
  addBtn: {
    background: C.gold,
    border: "none",
    borderRadius: 12,
    padding: "12px 20px",
    color: "#000",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  entriesBlock: { marginBottom: 14 },
  entriesLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 8,
  },
  entryRow: {
    background: "#162236",
    borderRadius: 10,
    padding: "10px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  entryText: { fontSize: 13, color: "#B0BFDA" },
  removeBtn: {
    background: "rgba(248,113,113,0.12)",
    color: "#F87171",
    border: "none",
    borderRadius: 8,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    border: `1px solid ${C.borderMid}`,
    background: "transparent",
    color: C.muted,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBtn: {
    flex: 2,
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
