import React, { useState, useEffect, useRef, useMemo } from "react";
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

// ─── AUDIO CHIME (Quick 1-Second Ding) ─────────────────────────
const playDing = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // High C

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.0);
  } catch (e) {
    console.warn("Audio failed", e);
  }
};

// ─── ACCOUNTABILITY CHECKER ──────────────────────────────────────────────────
const getAccountabilityAlert = (user, allEntries, recentLimit) => {
  const shift = user?.shift;
  if (!shift) return null;

  const now = new Date();
  const time = now.getHours() + now.getMinutes() / 60;

  let isShiftInAlertTime = false;
  let isShiftOutAlertTime = false;

  // STRICT TIME BOXING
  if (shift === "Morning") {
    isShiftInAlertTime = time >= 7.5 && time < 10.0;
    isShiftOutAlertTime = time >= 16.5 && time < 19.0;
  } else if (shift === "Afternoon") {
    isShiftInAlertTime = time >= 13.5 && time < 16.0;
    isShiftOutAlertTime = time >= 22.5 || time < 1.0;
  } else if (shift === "Night") {
    isShiftInAlertTime = time >= 21.5 || time < 0.0;
    isShiftOutAlertTime = time >= 7.0 && time < 9.5;
  }

  if (isShiftInAlertTime) {
    const hasShiftedIn = allEntries.some(
      (e) =>
        e.itemName === "Shift In" &&
        e.shift === shift &&
        e.createdBy === user?.name &&
        e.createdAt >= recentLimit
    );
    if (!hasShiftedIn) return "SHIFT_IN";
  }

  if (isShiftOutAlertTime) {
    const hasSignedOut = allEntries.some(
      (e) =>
        e.itemName === "Status Check" &&
        e.shift === shift &&
        e.createdBy === user?.name &&
        e.createdAt >= recentLimit
    );
    if (!hasSignedOut) return "SHIFT_OUT";
  }

  return null;
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

  const [displayItems, setDisplayItems] = useState(FALLBACK_ITEMS);
  const [parValues, setParValues] = useState(DEFAULT_PAR);

  // Daily Configuration Overlay (Shift In) States
  const [shiftInAllocation, setShiftInAllocation] = useState(
    user?.allocation || "Floor Incharge"
  );
  const [shiftInShift, setShiftInShift] = useState(user?.shift || "Morning");
  const [shiftInFloors, setShiftInFloors] = useState(
    user?.selectedFloors || []
  );

  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");
  const [editSelectedFloors, setEditSelectedFloors] = useState([]);

  const [locType, setLocType] = useState("Pantry");
  const [pantry, setPantry] = useState("A");
  const [room, setRoom] = useState("");
  const [qty, setQty] = useState("");
  const [staged, setStaged] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checkSuccess, setCheckSuccess] = useState(null);

  const [, setTick] = useState(0);
  const tapTimer = useRef(null);
  const isCreator = user?.role === "CREATOR" || user?.allocation === "Creator";

  const recentLimit = Date.now() - 12 * 60 * 60 * 1000;

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const alertType = getAccountabilityAlert(user, allEntries, recentLimit);

  useEffect(() => {
    let escalateTimer;
    if (alertType) {
      escalateTimer = setTimeout(() => {
        playDing();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(
            alertType === "SHIFT_IN"
              ? "Shift In Required"
              : "Shift Sign-off Required",
            {
              body:
                alertType === "SHIFT_IN"
                  ? "Please tap 'Start Shift' to begin your session."
                  : "Your shift ends soon. Please verify and Shift Out.",
            }
          );
        }
      }, 600000);
    }
    return () => clearTimeout(escalateTimer);
  }, [alertType]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      const fetchedDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedDocs.sort((a, b) => b.createdAt - a.createdAt);
      setAllEntries(fetchedDocs);
    });
    return () => unsub();
  }, []);

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
          if (names.length > 0) setDisplayItems(names);
        }
      }
    });
    return () => unsub();
  }, []);

  // ─── STRICT AREA FILTERING BASED ON ALLOCATION & SHIFT ───
  const visibleAreas = useMemo(() => {
    const allocation = user?.allocation || "";
    const shift = user?.shift || "";
    const selected = user?.selectedFloors || [];

    if (allocation === "Housekeeping Desk") {
      return ["All Areas", "HK Desk", "HK Office", "Compactor"];
    }

    if (allocation === "Shift Incharge" && shift === "Night") {
      return AREAS;
    }

    if (
      (allocation === "Shift Incharge" || allocation === "Floor Incharge") &&
      shift === "Afternoon"
    ) {
      return ["All Areas", ...Array.from(FLOOR_AREAS)];
    }

    if (allocation === "Floor Incharge" && shift === "Morning") {
      if (selected.length > 0) return ["All Areas", ...selected];
      return ["All Areas", ...Array.from(FLOOR_AREAS)];
    }

    return AREAS;
  }, [user]);

  useEffect(() => {
    if (!visibleAreas.includes(area)) setArea("All Areas");
  }, [visibleAreas, area]);

  // ─── SHIFT IN LOGIC & OVERLAY ───
  const hasShiftedIn = allEntries.some(
    (e) =>
      e.itemName === "Shift In" &&
      e.createdBy === user?.name &&
      (e.shift === user?.shift || !e.shift) &&
      e.createdAt >= recentLimit
  );

  const handleShiftInToggleFloor = (floor) => {
    setShiftInFloors((prev) =>
      prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor]
    );
  };

  const handleShiftIn = async () => {
    if (
      shiftInAllocation === "Floor Incharge" &&
      shiftInShift === "Morning" &&
      shiftInFloors.length === 0
    ) {
      alert("Please assign at least one floor before starting your shift.");
      return;
    }

    setSaving(true);

    // Sync App.js immediately with new popup choices
    if (onUpdateMeta) {
      onUpdateMeta(
        shiftInAllocation,
        shiftInShift,
        shiftInAllocation === "Floor Incharge" && shiftInShift === "Morning"
          ? shiftInFloors
          : []
      );
    }

    try {
      let targetAreas = [];
      if (shiftInAllocation === "Shift Incharge" && shiftInShift === "Night") {
        targetAreas = [
          ...Array.from(FLOOR_AREAS),
          "HK Desk",
          "HK Office",
          "Compactor",
        ];
      } else if (
        (shiftInAllocation === "Shift Incharge" ||
          shiftInAllocation === "Floor Incharge") &&
        shiftInShift === "Afternoon"
      ) {
        targetAreas = Array.from(FLOOR_AREAS);
      } else if (shiftInAllocation === "Housekeeping Desk") {
        targetAreas = ["HK Desk", "HK Office", "Compactor"];
      } else if (
        shiftInAllocation === "Floor Incharge" &&
        shiftInShift === "Morning" &&
        shiftInFloors.length > 0
      ) {
        targetAreas = shiftInFloors;
      } else {
        targetAreas = [area];
      }

      // Simultaneously write Shift In status for all selected areas
      for (const signArea of targetAreas) {
        await setDoc(doc(db, "extra_item_entries", makeId()), {
          itemName: "Shift In",
          area: signArea,
          locLabel: signArea,
          qty: 0,
          createdBy: user?.name || "Unknown",
          shift: shiftInShift || "Unknown",
          createdAt: Date.now(),
        });
      }

      await addDoc(collection(db, "notifications"), {
        message: `${
          user?.name || "Unknown"
        } started shift in ${targetAreas.join(", ")}`,
        createdBy: user?.name || "Unknown",
        shift: shiftInShift || "Unknown",
        createdAt: Date.now(),
        readBy: [],
      });
      playDing();
    } catch (err) {
      alert("Shift In failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

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
      playDing();
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
      playDing();
    } catch (err) {}
  }

  // ─── SHIFT OUT / UNSIGN LOGIC (MULTI-FLOOR COMPATIBLE) ───
  const hasSignedOut = allEntries.some(
    (e) =>
      e.area === area &&
      e.itemName === "Status Check" &&
      (e.shift === user?.shift || !e.shift) &&
      e.createdAt >= recentLimit
  );

  const handleShiftAction = async (actionType) => {
    const allocation = user?.allocation || "";
    const shift = user?.shift || "";
    const selected = user?.selectedFloors || [];

    let targetAreas = [];
    if (allocation === "Shift Incharge" && shift === "Night")
      targetAreas = [
        ...Array.from(FLOOR_AREAS),
        "HK Desk",
        "HK Office",
        "Compactor",
      ];
    else if (
      (allocation === "Shift Incharge" || allocation === "Floor Incharge") &&
      shift === "Afternoon"
    )
      targetAreas = Array.from(FLOOR_AREAS);
    else if (allocation === "Housekeeping Desk")
      targetAreas = ["HK Desk", "HK Office", "Compactor"];
    else if (
      allocation === "Floor Incharge" &&
      shift === "Morning" &&
      selected.length > 0
    )
      targetAreas = selected;
    else targetAreas = [area];

    let confirmMsg = "";
    if (actionType === "SHIFT_OUT")
      confirmMsg = `SIGN & VERIFY (Shift Out)\n\nYou are about to verify:\n\n${targetAreas.join(
        ", "
      )}\n\nContinue?`;
    else if (actionType === "UNSIGN")
      confirmMsg = `Remove verification (Undo Shift Out) for:\n\n${targetAreas.join(
        ", "
      )}\n\nContinue?`;

    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    try {
      if (actionType === "UNSIGN") {
        const entriesToDelete = allEntries.filter(
          (e) =>
            e.itemName === "Status Check" &&
            targetAreas.includes(e.area) &&
            (e.shift === user?.shift || !e.shift) &&
            e.createdAt >= recentLimit
        );
        for (const entry of entriesToDelete) {
          await deleteDoc(doc(db, "extra_item_entries", entry.id));
        }
        await addDoc(collection(db, "notifications"), {
          message: `${user?.name || "Unknown"} removed shift verification`,
          createdBy: user?.name || "Unknown",
          shift: user?.shift || "Unknown",
          createdAt: Date.now(),
          readBy: [],
        });
      } else {
        // Automatically verify ALL assigned areas simultaneously
        for (const signArea of targetAreas) {
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
            } signed off and verified ${signArea} (Shift Out)`,
            createdBy: user?.name || "Unknown",
            shift: user?.shift || "Unknown",
            createdAt: Date.now(),
            readBy: [],
          });
        }
      }
      playDing();
      setCheckSuccess(actionType);
      setTimeout(() => setCheckSuccess(null), 3000);
    } catch (err) {
      alert("Action failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openMetaEdit = () => {
    setEditAllocation(user?.allocation || "Floor Incharge");
    setEditShift(user?.shift || "Morning");
    setEditSelectedFloors(user?.selectedFloors || []);
    setShowMetaEdit(true);
  };

  const handleEditFloorToggle = (floor) => {
    setEditSelectedFloors((prev) =>
      prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor]
    );
  };

  const saveMetaEdit = () => {
    if (
      editAllocation === "Floor Incharge" &&
      editShift === "Morning" &&
      editSelectedFloors.length === 0
    ) {
      alert("Please select at least one assigned floor to continue.");
      return;
    }
    if (onUpdateMeta) {
      onUpdateMeta(
        editAllocation,
        editShift,
        editAllocation === "Floor Incharge" && editShift === "Morning"
          ? editSelectedFloors
          : []
      );
    }
    setShowMetaEdit(false);
  };

  const existingForModal = modalItem ? filtered(modalItem, area) : [];
  const isAll = area === "All Areas";

  return (
    <div style={S.root}>
      <style>{`
        @keyframes iosSlideIn { 0% { opacity: 0; transform: translateY(-30px) scale(0.95); } 60% { transform: translateY(5px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes subtleGlow { 0% { box-shadow: 0 8px 32px rgba(255, 59, 48, 0.15); border-color: rgba(255, 100, 100, 0.15); } 50% { box-shadow: 0 8px 40px rgba(255, 59, 48, 0.4); border-color: rgba(255, 100, 100, 0.4); } 100% { box-shadow: 0 8px 32px rgba(255, 59, 48, 0.15); border-color: rgba(255, 100, 100, 0.15); } }
        @keyframes pulseGold { 0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); } 70% { box-shadow: 0 0 0 15px rgba(212, 175, 55, 0); } 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); } }
        .ios-glass-alert { background: linear-gradient(135deg, rgba(255, 59, 48, 0.15) 0%, rgba(255, 59, 48, 0.05) 100%); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); border: 1px solid rgba(255, 100, 100, 0.3); border-top: 1px solid rgba(255, 150, 150, 0.4); border-radius: 20px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; animation: iosSlideIn 0.8s cubic-bezier(0.16, 1, 0.3, 1), subtleGlow 3s infinite ease-in-out; }
        .ios-icon-glow { background: linear-gradient(135deg, rgba(255, 59, 48, 0.6), rgba(255, 59, 48, 0.2)); box-shadow: 0 4px 15px rgba(255, 59, 48, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 50%; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
        .overlay-card { background: rgba(15, 27, 45, 0.85); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 32px; width: 90%; max-width: 440px; box-shadow: 0 32px 64px rgba(0,0,0,0.6); animation: iosSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .pulse-btn { width: 100%; background: #D4AF37; color: #000; border: none; border-radius: 16px; padding: 18px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 24px; animation: pulseGold 2s infinite; transition: transform 0.2s; }
        .pulse-btn:active { transform: scale(0.96); }
      `}</style>

      {/* ── DAILY CONFIGURATION OVERLAY (SHIFT IN) ── */}
      {!hasShiftedIn && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7, 16, 30, 0.8)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="overlay-card">
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: 26,
                color: "#FFF",
                fontWeight: 700,
                letterSpacing: "-0.5px",
                textAlign: "center",
              }}
            >
              Start Your Shift
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 14,
                color: "#B0BFDA",
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              Please confirm your assignment for today.
            </p>

            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                borderRadius: 20,
                padding: "20px",
                border: "1px solid rgba(255,255,255,0.05)",
                textAlign: "left",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={S.fieldLabel}>Allocation</div>
                <select
                  style={S.input}
                  value={shiftInAllocation}
                  onChange={(e) => {
                    const value = e.target.value;
                    setShiftInAllocation(value);
                    if (value === "Floor Incharge") {
                      if (
                        shiftInShift !== "Morning" &&
                        shiftInShift !== "Afternoon"
                      )
                        setShiftInShift("Morning");
                    } else if (value === "Shift Incharge") {
                      if (
                        shiftInShift !== "Afternoon" &&
                        shiftInShift !== "Night"
                      )
                        setShiftInShift("Afternoon");
                    } else if (value === "Housekeeping Desk") {
                      if (
                        shiftInShift !== "Morning" &&
                        shiftInShift !== "Afternoon"
                      )
                        setShiftInShift("Morning");
                    }
                  }}
                >
                  <option>Floor Incharge</option>
                  <option>Shift Incharge</option>
                  <option>Housekeeping Desk</option>
                </select>
              </div>

              <div
                style={{
                  marginBottom:
                    shiftInAllocation === "Floor Incharge" &&
                    shiftInShift === "Morning"
                      ? 16
                      : 0,
                }}
              >
                <div style={S.fieldLabel}>Shift</div>
                <select
                  style={S.input}
                  value={shiftInShift}
                  onChange={(e) => setShiftInShift(e.target.value)}
                >
                  {shiftInAllocation === "Floor Incharge" && (
                    <>
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                    </>
                  )}
                  {shiftInAllocation === "Shift Incharge" && (
                    <>
                      <option value="Afternoon">Afternoon</option>
                      <option value="Night">Night</option>
                    </>
                  )}
                  {shiftInAllocation === "Housekeeping Desk" && (
                    <>
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                    </>
                  )}
                </select>
              </div>

              {shiftInAllocation === "Floor Incharge" &&
                shiftInShift === "Morning" && (
                  <div>
                    <div style={{ ...S.fieldLabel, marginBottom: 12 }}>
                      Assigned Floors (Tap to select)
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "8px",
                      }}
                    >
                      {Array.from(FLOOR_AREAS).map((floor) => {
                        const isActive = shiftInFloors.includes(floor);
                        return (
                          <div
                            key={floor}
                            onClick={() => handleShiftInToggleFloor(floor)}
                            style={{
                              background: isActive
                                ? "rgba(212, 175, 55, 0.15)"
                                : "#162236",
                              border: `1px solid ${
                                isActive ? C.gold : C.borderMid
                              }`,
                              borderRadius: "10px",
                              padding: "10px",
                              color: isActive ? C.gold : C.muted,
                              fontSize: 13,
                              fontWeight: 600,
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "all 0.2s",
                              userSelect: "none",
                            }}
                          >
                            {floor}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            <button
              onClick={handleShiftIn}
              disabled={saving}
              className="pulse-btn"
            >
              {saving ? "Processing..." : "Confirm & Start Shift"}
            </button>
            <button
              onClick={onLogout}
              style={{
                background: "none",
                border: "none",
                color: "#F87171",
                fontSize: 14,
                fontWeight: 600,
                marginTop: 24,
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* ── PREMIUM DYNAMIC ACCOUNTABILITY BANNER ── */}
      {alertType && (
        <div className="ios-glass-alert">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="ios-icon-glow">⚠️</div>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  color: "#FFF",
                }}
              >
                {alertType === "SHIFT_IN"
                  ? "Shift In Required"
                  : "Shift Sign-Off Required"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {alertType === "SHIFT_IN"
                  ? "Please start your shift to log your accountability."
                  : "Please verify and save your area status below to complete your shift."}
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
                <div
                  onClick={() => {
                    onSwitchRole("ADMIN");
                    setShowRoleMenu(false);
                  }}
                  style={S.dropItem}
                >
                  Admin Dashboard
                </div>
                <div
                  onClick={() => {
                    onSwitchRole("STAFF");
                    setShowRoleMenu(false);
                  }}
                  style={S.dropItem}
                >
                  Staff Dashboard
                </div>
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
                {isCreator && (
                  <div
                    onClick={() => {
                      onSwitchRole("USER_MGMT");
                      setShowRoleMenu(false);
                    }}
                    style={{
                      ...S.dropItem,
                      borderTop: `1px solid ${C.border}`,
                      color: C.gold,
                    }}
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
        {visibleAreas.map((a) => (
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

      {/* ── DYNAMIC SHIFT OUT BUTTONS ── */}
      {!isAll && (
        <div style={{ marginTop: 24, paddingBottom: 20 }}>
          {hasSignedOut ? (
            <button
              onClick={() => handleShiftAction("UNSIGN")}
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
              {saving ? "Updating..." : `✕ Undo Shift Out (${area})`}
            </button>
          ) : (
            <button
              onClick={() => handleShiftAction("SHIFT_OUT")}
              disabled={saving || checkSuccess === "SHIFT_OUT"}
              style={{
                ...S.saveBtn,
                width: "100%",
                background:
                  saving || checkSuccess === "SHIFT_OUT" ? "#2ECC71" : C.gold,
                color:
                  saving || checkSuccess === "SHIFT_OUT" ? "#FFFFFF" : "#000",
                transition: "background-color 0.3s ease, color 0.3s ease",
              }}
            >
              {checkSuccess === "SHIFT_OUT"
                ? "Verified Successfully ✓"
                : saving
                ? "Verifying..."
                : `Sign & Verify ${area} (Shift Out)`}
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

      {/* ── UPDATE SESSION (META EDIT) MODAL ── */}
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
                    if (editShift !== "Morning" && editShift !== "Afternoon")
                      setEditShift("Morning");
                  } else if (value === "Shift Incharge") {
                    if (editShift !== "Afternoon" && editShift !== "Night")
                      setEditShift("Afternoon");
                  } else if (value === "Housekeeping Desk") {
                    if (editShift !== "Morning" && editShift !== "Afternoon")
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
                  <>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                  </>
                )}
                {editAllocation === "Shift Incharge" && (
                  <>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Night">Night</option>
                  </>
                )}
                {editAllocation === "Housekeeping Desk" && (
                  <>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                  </>
                )}
              </select>
            </div>

            {editAllocation === "Floor Incharge" && editShift === "Morning" && (
              <div style={S.fieldBlock}>
                <div style={S.fieldLabel}>Assigned Floors (Multi-Select)</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  {Array.from(FLOOR_AREAS).map((floor) => {
                    const isActive = editSelectedFloors.includes(floor);
                    return (
                      <div
                        key={floor}
                        onClick={() => handleEditFloorToggle(floor)}
                        style={{
                          background: isActive
                            ? "rgba(212, 175, 55, 0.15)"
                            : "#162236",
                          border: `1px solid ${
                            isActive ? C.gold : C.borderMid
                          }`,
                          borderRadius: "12px",
                          padding: "14px 10px",
                          color: isActive ? C.gold : C.muted,
                          fontSize: 13,
                          fontWeight: 600,
                          textAlign: "center",
                          cursor: "pointer",
                          userSelect: "none",
                          transition: "all 0.2s",
                        }}
                      >
                        {floor}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
  userMeta: { fontSize: 13, fontWeight: 500, color: C.gold, marginTop: 4 },
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
  pillsWrap: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 },
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
  pillActive: { background: C.gold, borderColor: C.gold, color: "#000" },
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
  subheaderNote: { fontSize: 11, color: C.muted },
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
    display: "block",
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
  chipActive: { background: C.gold, borderColor: C.gold, color: "#000" },
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
