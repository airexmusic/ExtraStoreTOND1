import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  deleteDoc,
  where,
  getDocs,
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

const TRACKING_AREAS = AREAS.filter((a) => a !== "All Areas");

function formatTime(ts) {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(ts) {
  if (!ts) return "--/--/----";
  return new Date(ts).toLocaleDateString();
}

function formatFullDateTime(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function AdminScreen({
  user,
  onLogout,
  onSwitchRole,
  onUpdateMeta,
}) {
  const [activeTab, setActiveTab] = useState("ITEMS");
  const [area, setArea] = useState("All Areas");
  const [allEntries, setAllEntries] = useState([]);

  // Dynamic Items and Par State
  const [displayItems, setDisplayItems] = useState(FALLBACK_ITEMS);
  const [parValues, setParValues] = useState(DEFAULT_PAR);

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Bell Notification State
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Meta Edit Modal Fields
  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const isCreator = user?.role === "CREATOR" || user?.allocation === "Creator";
  const initialLoadDone = useRef(false);

  const todayStart = new Date().setHours(0, 0, 0, 0);

  // 1. Fetch live updates for toasts and actual item entries
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      snap.docChanges().forEach((change) => {
        if (initialLoadDone.current) {
          const data = change.doc.data();
          const notifId = Date.now() + Math.random();
          let msg = "";

          if (change.type === "added" && data.itemName !== "Status Check") {
            msg = `${data.itemName} placed in ${data.locLabel} (Qty: ${data.qty}) by ${data.createdBy}`;
          } else if (
            change.type === "removed" &&
            data.itemName !== "Status Check"
          ) {
            msg = `${data.itemName} removed from ${data.locLabel} (Qty: ${data.qty}) by ${data.createdBy}`;
          }

          if (msg) {
            setToasts((prev) => [...prev, { id: notifId, msg }]);
            setTimeout(
              () => setToasts((prev) => prev.filter((t) => t.id !== notifId)),
              5000
            );
          }
        }
      });
      initialLoadDone.current = true;

      const fetchedDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedDocs.sort((a, b) => b.createdAt - a.createdAt);
      setAllEntries(fetchedDocs);
    });
    return () => unsub();
  }, []);

  // 2. Fetch notifications for the bell icon AND the User Log
  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // 3. LIVE FETCH Par Values & Dynamic Items List
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

  const todaysNotifications = notifications.filter(
    (n) => n.createdAt >= todayStart
  );

  const unreadCount = todaysNotifications.filter(
    (n) => !n.readBy?.includes(user?.name)
  ).length;

  const handleToggleNotifications = () => {
    setShowNotifications((prev) => !prev);
    if (!showNotifications && unreadCount > 0) {
      todaysNotifications.forEach(async (n) => {
        if (!n.readBy?.includes(user?.name)) {
          try {
            const ref = doc(db, "notifications", n.id);
            await updateDoc(ref, {
              readBy: arrayUnion(user?.name || "Admin"),
            });
          } catch (err) {
            console.error("Error marking notification as read:", err);
          }
        }
      });
    }
  };

  const deleteLogEntry = async (id) => {
    if (!isCreator) return;
    const confirmDelete = window.confirm(
      "Permanently delete this activity log?"
    );
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      alert("Failed to delete log: " + err.message);
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

  const exportCSV = () => {
    if (!startDate || !endDate) {
      alert("Please select both a start and end date.");
      return;
    }
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).setHours(23, 59, 59, 999);

    const rangeEntries = allEntries.filter(
      (e) => e.createdAt >= start && e.createdAt <= end
    );

    let csvContent = "\uFEFF";
    csvContent += "Items,Total Par,Variance,Locations,Updated By,Date\n";

    displayItems.forEach((itemName) => {
      const itemEntries = rangeEntries.filter((e) => e.itemName === itemName);

      const actualQty = itemEntries.reduce(
        (sum, e) => sum + (parseInt(e.qty) || 0),
        0
      );
      const par = parValues[itemName] || 0;
      const variance = actualQty - par;

      const locs = itemEntries.map((e) => {
        return `${e.area} ${e.locLabel}`.trim();
      });

      const uniqueLocs = [...new Set(locs)].join("\n");
      const updatedByList = [
        ...new Set(itemEntries.map((e) => e.createdBy)),
      ].join("\n");

      const datesList = [
        ...new Set(
          itemEntries.map((e) => {
            const d = new Date(e.createdAt);
            const day = String(d.getDate()).padStart(2, "0");
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
          })
        ),
      ].join("\n");

      csvContent += `"${itemName}","${par}","${variance}","${uniqueLocs}","${updatedByList}","${datesList}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TOND_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportActivityReport = async () => {
    if (!isCreator) return;
    if (!startDate || !endDate) {
      alert("Please select both a start and end date.");
      return;
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).setHours(23, 59, 59, 999);

    try {
      const q = query(
        collection(db, "notifications"),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        alert("No user activity logs found for this specific date range.");
        return;
      }

      let csvContent = "\uFEFF";
      csvContent += "Date,Time,Action Details\n";

      snap.docs.forEach((docSnap) => {
        const notif = docSnap.data();
        const d = new Date(notif.createdAt);
        const dateStr = `${String(d.getDate()).padStart(2, "0")}-${String(
          d.getMonth() + 1
        ).padStart(2, "0")}-${d.getFullYear()}`;
        const timeStr = d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const safeMsg = notif.message.replace(/"/g, '""');

        csvContent += `"${dateStr}","${timeStr}","${safeMsg}"\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `TOND_User_Activity_${startDate}_to_${endDate}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Error generating activity report: " + err.message);
    }
  };

  // ─── FIXED: IGNORE ORPHANED DATA IN STATUS TAB ───
  const getAreaActivity = (areaName) => {
    const areaEntries = allEntries.filter(
      (e) =>
        e.area === areaName &&
        e.createdAt >= todayStart &&
        // ONLY allow items that are currently in the Master List, or valid Status Checks
        (displayItems.includes(e.itemName) || e.itemName === "Status Check")
    );

    if (areaEntries.length === 0) return null;
    const latest = areaEntries[0];

    const updates = areaEntries.map((e) => {
      if (e.itemName === "Status Check") return "Verified & Signed Off";
      return `${e.itemName} (${e.locLabel}: ${e.qty})`;
    });
    const uniqueUpdates = [...new Set(updates)];

    return {
      latestUser: latest.createdBy,
      time: latest.createdAt,
      updates: uniqueUpdates,
    };
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
      {/* ── TOAST NOTIFICATIONS ── */}
      <div style={S.toastContainer}>
        {toasts.map((t) => (
          <div key={t.id} style={S.toast}>
            <div style={{ fontWeight: 600, color: C.gold, marginBottom: 2 }}>
              Live Update
            </div>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Admin Command Center</div>
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
            title="Double-click to edit shift details"
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
          {/* BELL ICON */}
          <div style={{ position: "relative" }}>
            <button
              onClick={handleToggleNotifications}
              style={{ ...S.ghostBtn, fontSize: 18, padding: "2px 6px" }}
              title="Notifications"
            >
              🔔
              {unreadCount > 0 && <div style={S.badge}>{unreadCount}</div>}
            </button>

            {showNotifications && (
              <div style={S.notificationPanel}>
                <div style={S.notifHeader}>Today's Updates</div>
                <div style={S.notifBody}>
                  {todaysNotifications.length === 0 ? (
                    <div
                      style={{
                        padding: 16,
                        color: C.muted,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      No new notifications
                    </div>
                  ) : (
                    todaysNotifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          ...S.notifItem,
                          background: !n.readBy?.includes(user?.name)
                            ? "rgba(212, 175, 55, 0.05)"
                            : "transparent",
                        }}
                      >
                        <div style={S.notifMsg}>{n.message}</div>
                        <div style={S.notifTime}>
                          {formatTime(n.createdAt)} • {formatDate(n.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowRoleMenu((v) => !v)}
              style={S.ghostBtn}
            >
              Swap Role ▾
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
                  Admin
                </div>
                <div
                  onClick={() => {
                    onSwitchRole("STAFF");
                    setShowRoleMenu(false);
                  }}
                  style={S.dropItem}
                >
                  Staff
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

      {/* ── TABS ── */}
      <div style={S.tabContainer}>
        {["ITEMS", "REPORTS", "STATUS", "ACTIVITY"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...S.tabBtn,
              ...(activeTab === tab ? S.tabBtnActive : {}),
            }}
          >
            {tab === "ITEMS"
              ? "Items"
              : tab === "REPORTS"
              ? "Reports"
              : tab === "STATUS"
              ? "Status"
              : "User Log"}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT 1: EXTRA ITEMS ── */}
      {activeTab === "ITEMS" && (
        <>
          <div style={S.pillsWrap}>
            {AREAS.map((a) => (
              <button
                key={a}
                onClick={() => setArea(a)}
                style={{ ...S.pill, ...(area === a ? S.pillActive : {}) }}
              >
                {a}
              </button>
            ))}
          </div>

          <div style={S.subheader}>
            <span style={S.subheaderText}>
              {area === "All Areas"
                ? "Live Overview · All Locations"
                : `Live View · ${area}`}
            </span>
            <span style={S.subheaderNote}>Read-only mode</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayItems.map((itemName) => {
              const actual = total(itemName, area);
              const par = parValues[itemName] || 0;
              const variance = actual - par;
              const rows = groupedRows(itemName, area);
              const rowKeys = Object.keys(rows);

              return (
                <div key={itemName} style={S.card}>
                  <div style={S.cardRow}>
                    <div style={S.cardLeft}>
                      <div style={S.cardName}>{itemName}</div>
                      {area === "All Areas" && (
                        <div style={S.cardSub}>PAR {par}</div>
                      )}
                    </div>
                    <div style={S.cardRight}>
                      {area === "All Areas" && (
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
                    </div>
                  </div>

                  <div style={S.expandPanel}>
                    <div style={S.divider} />
                    {rowKeys.length === 0 ? (
                      <div style={S.emptyMsg}>No entries recorded</div>
                    ) : (
                      rowKeys.map((k) => (
                        <div key={k} style={S.locRow}>
                          <span style={S.locName}>{k}</span>
                          <span style={S.locCount}>{rows[k]}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── TAB CONTENT 2: REPORTS ── */}
      {activeTab === "REPORTS" && (
        <div style={S.card}>
          <div style={{ padding: "24px 16px" }}>
            <div style={S.cardName}>Export Data Reports</div>
            <div style={{ ...S.cardSub, marginBottom: 20 }}>
              Select a date range to generate a CSV Excel file.
            </div>

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>Start Date</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={S.input}
              />
            </div>

            <div style={S.fieldBlock}>
              <div style={S.fieldLabel}>End Date</div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={S.input}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginTop: 10,
              }}
            >
              <button
                onClick={exportCSV}
                style={{ ...S.saveBtn, width: "100%" }}
              >
                Download Inventory Report
              </button>

              {/* Only Creators can pull deep historical User Logs */}
              {isCreator && (
                <button
                  onClick={exportActivityReport}
                  style={{
                    ...S.saveBtn,
                    width: "100%",
                    background: "#162236",
                    color: C.text,
                    border: `1px solid ${C.borderMid}`,
                  }}
                >
                  Download User Activity Log
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT 3: STATUS ── */}
      {activeTab === "STATUS" && (
        <div>
          <div style={S.subheader}>
            <span style={S.subheaderText}>Today's Location Status</span>
            <span style={S.subheaderNote}>Live updates since midnight</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TRACKING_AREAS.map((areaName) => {
              const activity = getAreaActivity(areaName);
              const isUpdated = activity !== null;

              return (
                <div
                  key={areaName}
                  style={{
                    ...S.card,
                    borderLeft: `4px solid ${
                      isUpdated ? "#34D399" : "#F87171"
                    }`,
                  }}
                >
                  <div style={{ padding: "14px 16px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{ fontSize: 15, fontWeight: 700, color: C.text }}
                      >
                        {areaName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isUpdated ? "#34D399" : "#F87171",
                        }}
                      >
                        {isUpdated ? formatTime(activity.time) : "Not Updated"}
                      </div>
                    </div>

                    {isUpdated ? (
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: C.text,
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ color: C.muted }}>Updated by: </span>
                          {activity.latestUser}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {activity.updates.map((upd, i) => (
                            <span
                              key={i}
                              style={{
                                background: "#162236",
                                fontSize: 11,
                                color: "#B0BFDA",
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              {upd}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.muted }}>
                        No records logged for this area today.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB CONTENT 4: USER ACTIVITY LOG ── */}
      {activeTab === "ACTIVITY" && (
        <div>
          <div style={S.subheader}>
            <span style={S.subheaderText}>Global Action Log</span>
            <span style={S.subheaderNote}>
              Today's complete timeline (Resets at midnight)
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todaysNotifications.length === 0 ? (
              <div style={S.card}>
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  No actions have been logged today.
                </div>
              </div>
            ) : (
              todaysNotifications.map((notif) => {
                const isRemoval = notif.message.includes("removed");
                const isCheck = notif.message.includes("signed off");

                // Color codes removals in red, additions in green, checks in neutral blue
                const borderColor = isRemoval
                  ? "#F87171"
                  : isCheck
                  ? "#3B7EF6"
                  : "#34D399";

                return (
                  <div
                    key={notif.id}
                    style={{
                      ...S.card,
                      borderLeft: `4px solid ${borderColor}`,
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            color: C.text,
                            lineHeight: 1.4,
                            marginBottom: 6,
                          }}
                        >
                          {notif.message}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            fontWeight: 500,
                          }}
                        >
                          {formatFullDateTime(notif.createdAt)}
                        </div>
                      </div>

                      {/* Delete Individual Log Button for Creators */}
                      {isCreator && (
                        <button
                          onClick={() => deleteLogEntry(notif.id)}
                          style={{
                            background: "rgba(248,113,113,0.12)",
                            color: "#F87171",
                            border: "none",
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            marginLeft: 12,
                            flexShrink: 0,
                          }}
                          title="Delete Log"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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
    position: "relative",
  },
  toastContainer: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "90%",
    maxWidth: 400,
    pointerEvents: "none",
  },
  toast: {
    background: "#1A2235",
    border: `1px solid ${C.gold}`,
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 13,
    color: C.text,
    animation: "fadeIn 0.3s ease",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
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
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: 30,
    width: 150,
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
    fontSize: 12,
    fontWeight: 600,
    color: "#B0BFDA",
    cursor: "pointer",
    borderBottom: `1px solid ${C.border}`,
  },
  tabContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    background: C.surface,
    borderRadius: 12,
    padding: 6,
    marginBottom: 20,
    border: `1px solid ${C.borderMid}`,
  },
  tabBtn: {
    flex: 1,
    minWidth: "65px",
    background: "transparent",
    border: "none",
    padding: "10px 4px",
    fontSize: 12,
    fontWeight: 600,
    color: C.muted,
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tabBtnActive: {
    background: "#162236",
    color: C.text,
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
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
    colorScheme: "dark",
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

  // ─── NOTIFICATION NEW STYLES ───
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    background: "#EF4444",
    color: "#FFF",
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 10,
    padding: "2px 5px",
    minWidth: 14,
    textAlign: "center",
    boxSizing: "border-box",
  },
  notificationPanel: {
    position: "fixed",
    right: 16,
    top: 70,
    width: "320px",
    maxWidth: "calc(100vw - 32px)",
    background: "#111F35",
    borderRadius: 14,
    border: `1px solid ${C.borderMid}`,
    overflow: "hidden",
    zIndex: 1000,
    boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "60vh",
    transformOrigin: "top right",
    animation: "scaleInFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  notifHeader: {
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 700,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
    background: "#162236",
  },
  notifBody: {
    overflowY: "auto",
  },
  notifItem: {
    padding: "12px 16px",
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    transition: "background 0.2s",
  },
  notifMsg: {
    fontSize: 13,
    color: "#B0BFDA",
    lineHeight: 1.4,
  },
  notifTime: {
    fontSize: 11,
    color: C.muted,
  },
};
