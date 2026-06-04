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
} from "firebase/firestore";

// ─── CATALOG & CONSTANTS ──────────────────────────────────────────────────────
const FALLBACK_ITEMS = [
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

// ─── PREMIUM AUDIO CHIME (Native Browser Synthesis) ─────────────────────────
const playPremiumChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Creates a pleasant, hotel-style bell sound (A5 + C#6 chord)
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.frequency.setValueAtTime(1108.73, ctx.currentTime);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 2.5);
    osc2.stop(ctx.currentTime + 2.5);
  } catch (e) {
    console.warn("Audio autoplay blocked by browser policies.", e);
  }
};

// ─── ACCOUNTABILITY CHECKER ──────────────────────────────────────────────────
const checkAccountability = (user, allEntries, recentLimit) => {
  const shift = user?.shift;
  if (!shift) return false;

  const now = new Date();
  const time = now.getHours() + now.getMinutes() / 60;

  let isAlertTime = false;

  // STRICT TIME BOXING: Alerts only show during a specific window for that shift
  if (shift === "Morning") {
    // 4:30 PM (16.5) to 7:00 PM (19.0)
    isAlertTime = time >= 16.5 && time < 19.0;
  } else if (shift === "Afternoon") {
    // 10:30 PM (22.5) to 1:00 AM (1.0)
    isAlertTime = time >= 22.5 || time < 1.0;
  } else if (shift === "Night") {
    // 7:00 AM (7.0) to 9:30 AM (9.5)
    isAlertTime = time >= 7.0 && time < 9.5;
  }

  // If outside the active alert window, hide the banner entirely
  if (!isAlertTime) return false;

  // Has THIS user submitted ANY Status Check for THIS shift recently?
  const hasSigned = allEntries.some(
    (e) =>
      e.itemName === "Status Check" &&
      e.shift === shift &&
      e.createdBy === user?.name &&
      e.createdAt >= recentLimit
  );

  return !hasSigned;
};

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
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // Dynamic Items and Par State
  const [displayItems, setDisplayItems] = useState(FALLBACK_ITEMS);
  const [parValues, setParValues] = useState(DEFAULT_PAR);

  // Meta Edit Modal Fields
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  // Modal fields
  const [locType, setLocType] = useState("Pantry");
  const [pantry, setPantry] = useState("A");
  const [room, setRoom] = useState("");
  const [qty, setQty] = useState("");
  const [staged, setStaged] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checkSuccess, setCheckSuccess] = useState(false);

  const [, setTick] = useState(0);
  const tapTimer = useRef(null);
  const isCreator = user?.role === "CREATOR" || user?.allocation === "Creator";

  // Use a rolling 12-hour window
  const recentLimit = Date.now() - 12 * 60 * 60 * 1000;

  // Ask for Push Notification Permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Ticker for real-time clock evaluation (Updates every 60s)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Global Check: Show banner based strictly on time and user sign-off status
  const showBanner = checkAccountability(user, allEntries, recentLimit);

  // 10-Minute Escalation Timer (Chime + Push Notification)
  useEffect(() => {
    let escalateTimer;
    if (showBanner) {
      // 600000 ms = 10 minutes
      escalateTimer = setTimeout(() => {
        playPremiumChime();

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Shift Sign-off Required", {
            body: "Your shift ends soon. Please verify and save your area status.",
            icon: "https://cdn-icons-png.flaticon.com/512/564/564276.png"
          });
        }
      }, 600000); 
    }
    return () => clearTimeout(escalateTimer);
  }, [showBanner]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      const fetchedDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedDocs.sort((a, b) => b.createdAt - a.createdAt);
      setAllEntries(fetchedDocs);
    });
    return () => unsub();
  }, []);

  // LIVE FETCH Par Values & Dynamic Items List
  useEffect(() => {
    const q = query(
      collection(db, "par_deployments"),
      orderBy("deployedAt", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const latest = snap.docs[0].data();
        if (latest?.items) {
          const map = {};
          const names = [];
          latest.items.forEach((i) => {
            map[i.name] = i.par;
            names.push(i.name);
          });
          setParValues((p) => ({ ...p, ...map }));
          if (names.length > 0) {
            setDisplayItems(names);
          }
        }
      }
    });
    return () => unsub();
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
    if (area === "All Areas") return;
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
        await setDoc(doc(db, "extra_item_entries", makeId()), {
          itemName: modalItem,
          area,
          locLabel: e.locLabel,
          qty: e.qty,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
          createdAt: Date.now(),
        });

        await addDoc(collection(db, "notifications"), {
          message: `${user?.name || "Unknown"} placed ${
            e.qty
          } ${modalItem} in ${area} (${e.locLabel})`,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
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
      const entryToDel = allEntries.find((e) => e.id === id);

      if (entryToDel) {
        await addDoc(collection(db, "notifications"), {
          message: `${user?.name || "Unknown"} removed ${entryToDel.qty} ${
            entryToDel.itemName
          } from ${entryToDel.area} (${entryToDel.locLabel})`,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
          createdAt: Date.now(),
          readBy: [],
        });
      }

      await deleteDoc(doc(db, "extra_item_entries", id));
    } catch (err) {
      alert("Remove failed: " + err.message);
    }
  }

  // ─── ACCOUNTABILITY SIGN-OFF STATUS LOGIC ───

  const currentAreaGhostEntries = allEntries.filter(
    (e) =>
      e.area === area &&
      e.itemName === "Status Check" &&
      (e.shift === user?.shift || !e.shift) &&
      e.createdAt >= recentLimit
  );

  const isAreaSigned = currentAreaGhostEntries.length > 0;

  const markAreaChecked = async () => {
    setSaving(true);

    try {
      const allocation = user?.allocation || "";
      const shift = user?.shift || "";

      let areasToSign = [];

      if (allocation === "Shift Incharge" && shift === "Night") {
        areasToSign = [
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
      } else if (allocation === "Shift Incharge" && shift === "Afternoon") {
        areasToSign = [
          "Floor 1",
          "Floor 2",
          "Floor 3",
          "Floor 4",
          "Floor 5",
          "Floor 6",
          "Floor 7",
          "Floor 8",
        ];
      } else if (allocation === "Floor Incharge" && shift === "Afternoon") {
        areasToSign = [
          "Floor 1",
          "Floor 2",
          "Floor 3",
          "Floor 4",
          "Floor 5",
          "Floor 6",
          "Floor 7",
          "Floor 8",
        ];
      } else if (
        allocation === "Housekeeping Desk" &&
        (shift === "Morning" || shift === "Afternoon")
      ) {
        areasToSign = ["HK Desk", "HK Office", "Compactor"];
      } else if (allocation === "Floor Incharge" && shift === "Morning") {
        areasToSign = [area];
      } else {
        areasToSign = [area];
      }

      for (const signArea of areasToSign) {
        await setDoc(doc(db, "extra_item_entries", makeId()), {
          itemName: "Status Check",
          area: signArea,
          locLabel: signArea,
          qty: 0,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
          createdAt: Date.now(),
        });

        await addDoc(collection(db, "notifications"), {
          message: `${
            user?.name || "Unknown"
          } signed off and verified ${signArea}`,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
          createdAt: Date.now(),
          readBy: [],
        });
      }

      setCheckSuccess(true);
      setTimeout(() => setCheckSuccess(false), 3000);
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const unsignArea = async () => {
    const confirmUnsign = window.confirm(
      `Remove current shift verification for ${area}?`
    );

    if (!confirmUnsign) return;

    setSaving(true);

    try {
      const allocation = user?.allocation || "";
      const shift = user?.shift || "";

      let areasToUnsign = [];

      if (allocation === "Shift Incharge" && shift === "Night") {
        areasToUnsign = [
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
      } else if (allocation === "Shift Incharge" && shift === "Afternoon") {
        areasToUnsign = [
          "Floor 1",
          "Floor 2",
          "Floor 3",
          "Floor 4",
          "Floor 5",
          "Floor 6",
          "Floor 7",
          "Floor 8",
        ];
      } else if (allocation === "Floor Incharge" && shift === "Afternoon") {
        areasToUnsign = [
          "Floor 1",
          "Floor 2",
          "Floor 3",
          "Floor 4",
          "Floor 5",
          "Floor 6",
          "Floor 7",
          "Floor 8",
        ];
      } else if (
        allocation === "Housekeeping Desk" &&
        (shift === "Morning" || shift === "Afternoon")
      ) {
        areasToUnsign = ["HK Desk", "HK Office", "Compactor"];
      } else {
        areasToUnsign = [area];
      }

      const entriesToDelete = allEntries.filter(
        (e) =>
          e.itemName === "Status Check" &&
          areasToUnsign.includes(e.area) &&
          (e.shift === user?.shift || !e.shift) &&
          e.createdAt >= recentLimit
      );

      for (const entry of entriesToDelete) {
        await deleteDoc(doc(db, "extra_item_entries", entry.id));
      }

      await addDoc(collection(db, "notifications"), {
        message: `${user?.name || "Unknown"} removed verification`,
        createdBy: user?.name || "Unknown",
        shift: user?.shift || "Unknown",
        createdAt: Date.now(),
        readBy: [],
      });
    } catch (err) {
      alert("Unsign failed: " + err.message);
    } finally {
      setSaving(false);
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

  const existingForModal = modalItem ? filtered(modalItem, area) : [];
  const isAll = area === "All Areas";

  return (
    <div style={S.root}>
      {/* ── CSS Animations for Premium iOS Glassmorphism UI ── */}
      <style>{`
        @keyframes iosSlideIn {
          0% { opacity: 0; transform: translateY(-30px) scale(0.95); }
          60% { transform: translateY(5px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes subtleGlow {
          0% { box-shadow: 0 8px 32px rgba(255, 59, 48, 0.15); border-color: rgba(255, 100, 100, 0.15); }
          50% { box-shadow: 0 8px 40px rgba(255, 59, 48, 0.4); border-color: rgba(255, 100, 100, 0.4); }
          100% { box-shadow: 0 8px 32px rgba(255, 59, 48, 0.15); border-color: rgba(255, 100, 100, 0.15); }
        }
        .ios-glass-alert {
          background: linear-gradient(135deg, rgba(255, 59, 48, 0.15) 0%, rgba(255, 59, 48, 0.05) 100%);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 100, 100, 0.3);
          border-top: 1px solid rgba(255, 150, 150, 0.4); 
          border-radius: 20px;
          padding: 16px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          animation: iosSlideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1), subtleGlow 3s infinite ease-in-out;
        }
        .ios-icon-glow {
          background: linear-gradient(135deg, rgba(255, 59, 48, 0.6), rgba(255, 59, 48, 0.2));
          box-shadow: 0 4px 15px rgba(255, 59, 48, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          width: 46px;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }
      `}</style>

      {/* ── PREMIUM ACCOUNTABILITY BANNER ── */}
      {showBanner && (
        <div className="ios-glass-alert">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="ios-icon-glow">
              ⚠️
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.01em", color: "#FFF" }}>
                Shift Sign-Off Required
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 1.4 }}>
                Please verify and save your area status below to complete your accountability.
              </div>
            </div>
          </div>
        </div>
      )}

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
                {/* 1. Admin Dashboard Option */}
                <div
                  onClick={() => {
                    onSwitchRole("ADMIN"); 
                    setShowRoleMenu(false);
                  }}
                  style={S.dropItem}
                >
                  Admin Dashboard
                </div>

                {/* 2. Staff Dashboard Option */}
                <div
                  onClick={() => {
                    onSwitchRole("STAFF"); 
                    setShowRoleMenu(false);
                  }}
                  style={S.dropItem}
                >
                  Staff Dashboard
                </div>

                {/* 3. PAR Control Option (Creator Only) */}
                {isCreator && (
                  <div
                    onClick={() => {
                      onSwitchRole("PAR_CONTROL");
                      setShowRoleMenu(false);
                    }}
                    style={S.dropItem}
                  >
                    PAR Control
                  </div>
                )}
                
                {/* 4. User Management Option (Creator Only) */}
                {isCreator && (
                  <div
                    onClick={() => {
                      onSwitchRole("USER_MGMT"); 
                      setShowRoleMenu(false);
                    }}
                    style={{ ...S.dropItem, borderTop: `1px solid ${C.border}`, color: C.gold }}
                  >
                    Manage Users
                  </div>
                )}
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
        {displayItems.map((itemName) => {
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

      {/* ── DYNAMIC ACCOUNTABILITY SIGN OFF BUTTON ── */}
      {!isAll && (
        <div style={{ marginTop: 24, paddingBottom: 20 }}>
          {isAreaSigned ? (
            <button
              onClick={unsignArea}
              disabled={saving}
              style={{
                ...S.saveBtn,
                width: "100%",
                background: "rgba(248,113,113,0.12)",
                color: "#F87171",
                border: "1px solid rgba(248,113,113,0.3)",
                transition: "all 0.3s ease",
              }}
            >
              {saving ? "Updating..." : `✕ Unsign ${area}`}
            </button>
          ) : (
            <button
              onClick={() => {
                const allocation = user?.allocation || "";
                const shift = user?.shift || "";

                let signText = area;

                if (allocation === "Shift Incharge" && shift === "Night") {
                  signText = "Floor 1-8, HK Desk, HK Office and Compactor";
                } else if (
                  (allocation === "Shift Incharge" && shift === "Afternoon") ||
                  (allocation === "Floor Incharge" && shift === "Afternoon")
                ) {
                  signText = "Floor 1-8";
                } else if (
                  allocation === "Housekeeping Desk" &&
                  (shift === "Morning" || shift === "Afternoon")
                ) {
                  signText = "HK Desk, HK Office and Compactor";
                }

                const confirmed = window.confirm(
                  `SIGN VERIFICATION\n\nYou are about to verify:\n\n${signText}\n\nContinue?`
                );

                if (confirmed) {
                  markAreaChecked();
                }
              }}
              disabled={saving || checkSuccess}
              style={{
                ...S.saveBtn,
                width: "100%",
                background: saving || checkSuccess ? "#2ECC71" : C.gold,
                color: saving || checkSuccess ? "#FFFFFF" : "#000",
                transition: "background-color 0.3s ease, color 0.3s ease",
              }}
            >
              {checkSuccess
                ? "Signed Successfully ✓"
                : saving
                ? "Signing..."
                : `Sign & Save ${area} Status`}
            </button>
          )}
        </div>
      )}

      {/* ── ITEM ENTRY MODAL ── */}
      {modalItem && (
        <div style={S.overlay} onClick={closeModal}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
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
                {editAllocation === "Floor Incharge" && (
                  <option>Morning</option>
                )}

                {editAllocation === "Shift Incharge" && (
                  <>
                    <option>Afternoon</option>
                    <option>Night</option>
                  </>
                )}

                {editAllocation === "Housekeeping Desk" && (
                  <>
                    <option>Morning</option>
                    <option>Afternoon</option>
                  </>
                )}
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