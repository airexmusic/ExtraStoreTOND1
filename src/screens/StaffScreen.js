import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
} from "firebase/firestore";

const EXTRA_ITEMS = [
  "Child Bed",
  "Extension Board",
  "Extra Bed",
  "Fan",
  "Oil Heater",
  "Zipper",
];
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
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      setAllEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const openMetaEdit = () => {
    setEditAllocation(user?.allocation);
    setEditShift(user?.shift);
    setShowMetaEdit(true);
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Team Housekeeping</div>
          <div style={S.userName}>{user?.name}</div>
          <div style={S.userMeta} onDoubleClick={openMetaEdit}>
            {user?.allocation || "Staff"} • {user?.shift || "Day"} Shift ✎
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            style={S.ghostBtn}
          >
            Swap Role ▾
          </button>
          {showRoleMenu && (
            <div style={S.dropdown}>
              <div onClick={() => onSwitchRole("ADMIN")} style={S.dropItem}>
                Admin
              </div>
              <div onClick={() => onSwitchRole("STAFF")} style={S.dropItem}>
                Staff
              </div>
              <div
                onClick={() => onSwitchRole("PAR_CONTROL")}
                style={S.dropItem}
              >
                PAR Control
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ... (Keep your existing tab/card rendering logic here) ... */}

      {showMetaEdit && (
        <div style={S.overlay} onClick={() => setShowMetaEdit(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Edit Session</h3>
            <select
              value={editAllocation}
              onChange={(e) => setEditAllocation(e.target.value)}
              style={S.input}
            >
              <option>Floor Incharge</option>
              <option>Shift Incharge</option>
            </select>
            <select
              value={editShift}
              onChange={(e) => setEditShift(e.target.value)}
              style={S.input}
            >
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Night</option>
            </select>
            <button
              onClick={() => {
                onUpdateMeta(editAllocation, editShift);
                setShowMetaEdit(false);
              }}
              style={S.saveBtn}
            >
              Update
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// Note: S (Styles) object from previous response...
