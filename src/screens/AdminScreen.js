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

// ─── AUDIO UNLOCKER & SYNTHESIZERS ──────────────────────────────────────────
let globalAudioCtx = null;
let audioUnlocked = false;

const getAudioCtx = () => {
  if (!globalAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) globalAudioCtx = new Ctx();
  }
  return globalAudioCtx;
};

// Forces mobile browsers to unlock speakers upon very first touch
const unlockAudio = () => {
  if (audioUnlocked) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume();
  }

  // Play a microscopic, silent buffer to verify unlock to iOS/Android
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  audioUnlocked = true;
};

const playPremiumChime = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  try {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

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
    console.warn("Audio failed", e);
  }
};

const playDing = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  try {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);

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
const checkAccountability = (user, allEntries, recentLimit) => {
  const shift = user?.shift;
  if (!shift) return false;

  const now = new Date();
  const time = now.getHours() + now.getMinutes() / 60;

  let isAlertTime = false;

  if (shift === "Morning") {
    isAlertTime = time >= 16.5 && time < 19.0;
  } else if (shift === "Afternoon") {
    isAlertTime = time >= 22.5 || time < 1.0;
  } else if (shift === "Night") {
    isAlertTime = time >= 7.0 && time < 9.5;
  }

  if (!isAlertTime) return false;

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
export default function AdminScreen({
  user,
  onLogout,
  onSwitchRole,
  onUpdateMeta,
}) {
  const [activeTab, setActiveTab] = useState("STATUS");
  const [area, setArea] = useState("All Areas");
  const [allEntries, setAllEntries] = useState([]);

  const [, setTick] = useState(0);

  const [expandedStatusShift, setExpandedStatusShift] = useState("Morning");
  const [displayItems, setDisplayItems] = useState(FALLBACK_ITEMS);
  const [parValues, setParValues] = useState(DEFAULT_PAR);

  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [showMetaEdit, setShowMetaEdit] = useState(false);
  const [editAllocation, setEditAllocation] = useState("");
  const [editShift, setEditShift] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const isCreator = user?.role === "CREATOR" || user?.allocation === "Creator";
  const initialLoadDone = useRef(false);
  const initialNotifLoadDone = useRef(false);

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

  const showBanner = checkAccountability(user, allEntries, recentLimit);

  useEffect(() => {
    let escalateTimer;
    if (showBanner) {
      escalateTimer = setTimeout(() => {
        playPremiumChime();

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Shift Sign-off Required", {
            body: "Your shift ends soon. Please verify and save your area status.",
            icon: "https://cdn-icons-png.flaticon.com/512/564/564276.png",
          });
        }
      }, 600000);
    }
    return () => clearTimeout(escalateTimer);
  }, [showBanner]);

  // 1. Fetch live updates (Inventory data)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "extra_item_entries"), (snap) => {
      const fetchedDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedDocs.sort((a, b) => b.createdAt - a.createdAt);
      setAllEntries(fetchedDocs);
      initialLoadDone.current = true;
    });
    return () => unsub();
  }, []);

  // 2. Fetch Bell Notifications & Trigger Ding & Push Notification
  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (initialNotifLoadDone.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const newNotif = change.doc.data();

            playDing(); // Ding on new notification

            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                navigator.serviceWorker.ready
                  .then((registration) => {
                    registration.showNotification("Team Housekeeping Update", {
                      body: newNotif.message,
                      icon: "https://cdn-icons-png.flaticon.com/512/564/564276.png",
                      vibrate: [200, 100, 200],
                    });
                  })
                  .catch(() => {
                    new Notification("Team Housekeeping Update", {
                      body: newNotif.message,
                      icon: "https://cdn-icons-png.flaticon.com/512/564/564276.png",
                    });
                  });
              } catch (e) {
                new Notification("Team Housekeeping Update", {
                  body: newNotif.message,
                });
              }
            }
          }
        });
      }

      setNotifications(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      initialNotifLoadDone.current = true;
    });
    return () => unsub();
  }, []);

  // 3. Fetch Par Values
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

  const todaysNotifications = notifications.filter(
    (n) => n.createdAt >= recentLimit
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
            await updateDoc(doc(db, "notifications", n.id), {
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
    if (!window.confirm("Permanently delete this activity log?")) return;
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

  // ─── XLS HTML EXPORT: COLORS IN EXCEL ───
  const exportCSV = () => {
    if (!startDate || !endDate)
      return alert("Please select both a start and end date.");

    const startParts = startDate.split("-");
    const endParts = endDate.split("-");
    const startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const endObj = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    endObj.setHours(23, 59, 59, 999);

    const rangeEntries = allEntries.filter(
      (e) =>
        e.createdAt >= startObj.getTime() && e.createdAt <= endObj.getTime()
    );

    const signOffs = rangeEntries.filter((e) => e.itemName === "Status Check");
    const deployments = rangeEntries.filter(
      (e) => e.itemName !== "Status Check"
    );

    const getDateStr = (ts) => {
      const d = new Date(ts);
      return `${String(d.getDate()).padStart(2, "0")}-${String(
        d.getMonth() + 1
      ).padStart(2, "0")}-${d.getFullYear()}`;
    };

    const dateStrings = [];
    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
      dateStrings.push(getDateStr(d.getTime()));
    }

    const shiftsOrder = ["Morning", "Afternoon", "Night"];
    const allItemNames = Array.from(
      new Set([...displayItems, ...deployments.map((d) => d.itemName)])
    ).sort();

    let htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1" style="font-family: Calibri, sans-serif; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #0F1B2D; color: #D4AF37; font-weight: bold; text-align: left;">
              <th style="padding: 8px;">Date</th>
              <th style="padding: 8px;">Time</th>
              <th style="padding: 8px;">Shift</th>
              <th style="padding: 8px;">Action Status</th>
              <th style="padding: 8px;">Item Name</th>
              <th style="padding: 8px;">Quantity</th>
              <th style="padding: 8px;">Current Master PAR</th>
              <th style="padding: 8px;">Variance</th>
              <th style="padding: 8px;">Specific Location</th>
              <th style="padding: 8px;">Incharge (Updated By)</th>
              <th style="padding: 8px;">Area Sign-Off Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    dateStrings.forEach((dateStr) => {
      shiftsOrder.forEach((shift) => {
        const shiftSignOffs = signOffs.filter(
          (s) => getDateStr(s.createdAt) === dateStr && s.shift === shift
        );
        const shiftIsUnsigned = shiftSignOffs.length === 0;

        let serialNumber = 1;

        allItemNames.forEach((item) => {
          const itemEntries = deployments.filter(
            (dep) =>
              getDateStr(dep.createdAt) === dateStr &&
              dep.shift === shift &&
              dep.itemName === item
          );
          let totalQty = 0;

          if (itemEntries.length === 0) {
            const par = parValues[item] || 0;
            const variance = 0 - par;

            const signStatusText = shiftIsUnsigned
              ? "ALERT: UNSIGNED"
              : "SIGNED (No Changes)";
            const signStatusColor = shiftIsUnsigned ? "#EF4444" : "#10B981";

            htmlContent += `
              <tr style="background-color: #FFFFFF;">
                <td style="padding: 6px;">${dateStr}</td>
                <td style="padding: 6px;">-</td>
                <td style="padding: 6px;">${shift}</td>
                <td style="padding: 6px; color: #3B82F6; font-weight: bold;">Unchanged</td>
                <td style="padding: 6px;">${serialNumber}. ${item}</td>
                <td style="padding: 6px;">0</td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;">-</td>
                <td style="padding: 6px;">-</td>
                <td style="padding: 6px; color: ${signStatusColor}; font-weight: bold;">${signStatusText}</td>
              </tr>
            `;

            const varianceColor =
              variance < 0 ? "#EF4444" : variance > 0 ? "#10B981" : "#000000";
            htmlContent += `
              <tr style="background-color: #F3F4F6; font-weight: bold;">
                <td style="padding: 6px;">${dateStr}</td>
                <td style="padding: 6px;">-</td>
                <td style="padding: 6px;">${shift}</td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;">Total</td>
                <td style="padding: 6px;">0</td>
                <td style="padding: 6px;">${par}</td>
                <td style="padding: 6px; color: ${varianceColor};">${variance}</td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;"></td>
              </tr>
            `;
          } else {
            itemEntries.sort((a, b) => a.createdAt - b.createdAt);

            itemEntries.forEach((entry, index) => {
              const timeStr = new Date(entry.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const qty = parseInt(entry.qty) || 0;
              totalQty += qty;

              const loc =
                entry.area === entry.locLabel
                  ? entry.area
                  : `${entry.area} - ${entry.locLabel}`;

              const areaSigned = shiftSignOffs.find(
                (s) => s.area === entry.area
              );
              const signStatusText = areaSigned
                ? `SIGNED by ${areaSigned.createdBy}`
                : "ALERT: UNSIGNED";
              const signStatusColor = areaSigned ? "#10B981" : "#EF4444";

              const displayItemName =
                itemEntries.length > 1
                  ? `${serialNumber}. ${item} (Entry ${index + 1})`
                  : `${serialNumber}. ${item}`;

              htmlContent += `
                <tr style="background-color: #FFFFFF;">
                  <td style="padding: 6px;">${dateStr}</td>
                  <td style="padding: 6px;">${timeStr}</td>
                  <td style="padding: 6px;">${shift}</td>
                  <td style="padding: 6px; color: #10B981; font-weight: bold;">Changed (Deployed)</td>
                  <td style="padding: 6px;">${displayItemName}</td>
                  <td style="padding: 6px;">${qty}</td>
                  <td style="padding: 6px;"></td>
                  <td style="padding: 6px;"></td>
                  <td style="padding: 6px;">${loc}</td>
                  <td style="padding: 6px;">${entry.createdBy}</td>
                  <td style="padding: 6px; color: ${signStatusColor}; font-weight: bold;">${signStatusText}</td>
                </tr>
              `;
            });

            const par = parValues[item] || 0;
            const variance = totalQty - par;
            const varianceColor =
              variance < 0 ? "#EF4444" : variance > 0 ? "#10B981" : "#000000";

            htmlContent += `
              <tr style="background-color: #F3F4F6; font-weight: bold;">
                <td style="padding: 6px;">${dateStr}</td>
                <td style="padding: 6px;">-</td>
                <td style="padding: 6px;">${shift}</td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;">Total</td>
                <td style="padding: 6px;">${totalQty}</td>
                <td style="padding: 6px;">${par}</td>
                <td style="padding: 6px; color: ${varianceColor};">${variance}</td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;"></td>
                <td style="padding: 6px;"></td>
              </tr>
            `;
          }

          serialNumber++;
        });
      });
    });

    htmlContent += `</tbody></table></body></html>`;

    const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `TOND_Master_Inventory_${startDate}_to_${endDate}.xls`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportActivityReport = async () => {
    if (!isCreator || !startDate || !endDate)
      return alert("Please select both a start and end date.");
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

      if (snap.empty)
        return alert(
          "No user activity logs found for this specific date range."
        );

      let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8" /></head>
        <body>
          <table border="1" style="font-family: Calibri, sans-serif; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #0F1B2D; color: #D4AF37; font-weight: bold; text-align: left;">
                <th style="padding: 8px;">Date</th>
                <th style="padding: 8px;">Time</th>
                <th style="padding: 8px;">Shift</th>
                <th style="padding: 8px;">User</th>
                <th style="padding: 8px;">Action</th>
                <th style="padding: 8px;">Quantity</th>
                <th style="padding: 8px;">Item Name</th>
                <th style="padding: 8px;">Location</th>
              </tr>
            </thead>
            <tbody>
      `;

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

        let shift = notif.shift;
        const rawUser = notif.createdBy || "Unknown";

        if (!shift) {
          const sameDayEntries = allEntries.filter(
            (e) =>
              e.createdBy === rawUser &&
              new Date(e.createdAt).toDateString() === d.toDateString() &&
              e.shift
          );
          if (sameDayEntries.length > 0) {
            sameDayEntries.sort(
              (a, b) =>
                Math.abs(a.createdAt - notif.createdAt) -
                Math.abs(b.createdAt - notif.createdAt)
            );
            shift = sameDayEntries[0].shift;
          }
        }

        shift = shift || "Not Recorded";

        const msg = notif.message;
        let action = "Unknown";
        let qty = "-";
        let item = "-";
        let location = "-";
        let parsedUser = rawUser;
        let actionColor = "#000000";

        if (msg.includes(" placed ")) {
          action = "Placed Item";
          actionColor = "#10B981";
          const match = msg.match(/(.+?) placed (\d+) (.+?) in (.+)/);
          if (match) {
            parsedUser = match[1];
            qty = match[2];
            item = match[3];
            location = match[4];
          }
        } else if (msg.includes(" removed ") && !msg.includes("verification")) {
          action = "Removed Item";
          actionColor = "#EF4444";
          const match = msg.match(/(.+?) removed (\d+) (.+?) from (.+)/);
          if (match) {
            parsedUser = match[1];
            qty = match[2];
            item = match[3];
            location = match[4];
          }
        } else if (msg.includes("signed off and verified")) {
          action = "Verified Area";
          actionColor = "#3B82F6";
          const match = msg.match(/(.+?) signed off and verified (.+)/);
          if (match) {
            parsedUser = match[1];
            location = match[2];
          }
        } else if (msg.includes("removed verification")) {
          action = "Removed Verification";
          actionColor = "#F59E0B";
          const match = msg.match(/(.+?) removed verification/);
          if (match) {
            parsedUser = match[1];
          }
        } else {
          action = msg;
        }

        htmlContent += `
          <tr>
            <td style="padding: 6px;">${dateStr}</td>
            <td style="padding: 6px;">${timeStr}</td>
            <td style="padding: 6px;">${shift}</td>
            <td style="padding: 6px;">${parsedUser}</td>
            <td style="padding: 6px; color: ${actionColor}; font-weight: bold;">${action}</td>
            <td style="padding: 6px;">${qty}</td>
            <td style="padding: 6px;">${item}</td>
            <td style="padding: 6px;">${location}</td>
          </tr>
        `;
      });

      htmlContent += `</tbody></table></body></html>`;

      const blob = new Blob([htmlContent], {
        type: "application/vnd.ms-excel",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `TOND_User_Activity_${startDate}_to_${endDate}.xls`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Error generating activity report: " + err.message);
    }
  };

  const getShiftStatusData = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayNight = today.getTime() + 23.5 * 60 * 60 * 1000 - 86400000;
    const todayMorning = today.getTime() + 8 * 60 * 60 * 1000;

    const data = {
      "Night (Previous)": {},
      Morning: {},
      Afternoon: {},
      "Night (Today)": {},
    };

    const shifts = Object.keys(data);
    shifts.forEach((shift) => {
      TRACKING_AREAS.forEach((area) => {
        data[shift][area] = { updates: [], latestUser: null, time: 0 };
      });
    });

    allEntries.forEach((e) => {
      if (e.createdAt < yesterdayNight) return;
      if (!displayItems.includes(e.itemName) && e.itemName !== "Status Check")
        return;

      let category = e.shift || "Morning";
      if (category === "Night")
        category =
          e.createdAt < todayMorning ? "Night (Previous)" : "Night (Today)";

      if (data[category] && data[category][e.area]) {
        const areaObj = data[category][e.area];
        const text =
          e.itemName === "Status Check"
            ? "Verified & Signed Off"
            : `${e.itemName} (${e.locLabel}: ${e.qty})`;

        if (!areaObj.updates.includes(text)) areaObj.updates.push(text);
        if (e.createdAt > areaObj.time) {
          areaObj.time = e.createdAt;
          areaObj.latestUser = e.createdBy;
        }
      }
    });

    return data;
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
    <div style={S.root} onClick={unlockAudio} onTouchStart={unlockAudio}>
      {/* ── CSS Animations for Premium UI ── */}
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
                Shift Sign-Off Required
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                Please verify and save your area status in the Staff Dashboard
                to complete your accountability.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>Admin Command Center</div>

          <div
            style={{
              ...S.userName,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onClick={() => onSwitchRole("PROFILE")}
            title="Click to view Profile"
          >
            {user?.name}
            <span style={{ fontSize: "14px", color: C.muted }}>⚙️</span>
          </div>

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
                <div style={S.notifHeader}>Recent Updates</div>
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
              Switch ▾
            </button>
            {showRoleMenu && (
              <div style={S.dropdown}>
                {[
                  ["ADMIN", "Admin Dashboard"],
                  ["STAFF", "Staff Dashboard"],
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
              Select a date range to generate a highly detailed CSV Excel file.
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
                Download Master Inventory Log
              </button>

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
                  Download Master User Activity Log
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT 3: STATUS ── */}
      {activeTab === "STATUS" &&
        (() => {
          const shiftData = getShiftStatusData();
          const shiftsOrder = [
            "Night (Previous)",
            "Morning",
            "Afternoon",
            "Night (Today)",
          ];
          const shiftColors = {
            "Night (Previous)": "#64748B",
            Morning: "#F59E0B",
            Afternoon: "#F97316",
            "Night (Today)": "#3B82F6",
          };

          return (
            <div>
              <div style={S.subheader}>
                <span style={S.subheaderText}>Location Status</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shiftsOrder.map((shiftName) => {
                  const isExpanded = expandedStatusShift === shiftName;
                  const activeColor = shiftColors[shiftName];

                  return (
                    <div
                      key={shiftName}
                      style={{
                        ...S.card,
                        transition: "all 0.3s ease",
                        border: isExpanded
                          ? `1px solid ${C.borderMid}`
                          : `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        onClick={() =>
                          setExpandedStatusShift(isExpanded ? null : shiftName)
                        }
                        style={{
                          padding: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          background: isExpanded
                            ? "rgba(255,255,255,0.02)"
                            : "transparent",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: activeColor,
                              boxShadow: `0 0 10px ${activeColor}80`,
                            }}
                          />
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: C.text,
                            }}
                          >
                            {shiftName} Shift
                          </div>
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: 20,
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          ‹
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            padding: "0 16px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={S.divider} />
                          {TRACKING_AREAS.map((areaName) => {
                            const areaData = shiftData[shiftName][areaName];
                            const isUpdated = areaData.updates.length > 0;

                            return (
                              <div key={areaName} style={S.statusAreaCard}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: isUpdated ? 8 : 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        backgroundColor: isUpdated
                                          ? "#34D399"
                                          : "#F87171",
                                      }}
                                    />
                                    <div
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        color: C.text,
                                      }}
                                    >
                                      {areaName}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      color: isUpdated ? "#34D399" : C.muted,
                                    }}
                                  >
                                    {isUpdated
                                      ? formatTime(areaData.time)
                                      : "Not Updated"}
                                  </div>
                                </div>
                                {isUpdated && (
                                  <div style={{ paddingLeft: 14 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: C.muted,
                                        marginBottom: 8,
                                      }}
                                    >
                                      By: {areaData.latestUser}
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 6,
                                      }}
                                    >
                                      {areaData.updates.map((upd, i) => (
                                        <span key={i} style={S.statusBadge}>
                                          {upd}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {/* ── TAB CONTENT 4: USER ACTIVITY LOG ── */}
      {activeTab === "ACTIVITY" && (
        <div>
          <div style={S.subheader}>
            <span style={S.subheaderText}>Global Action Log</span>
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
                const isRemoval =
                  notif.message.includes("removed") ||
                  notif.message.includes("unsigned");
                const isCheck = notif.message.includes("signed off");
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
                      {isCreator && (
                        <button
                          onClick={() => deleteLogEntry(notif.id)}
                          style={S.deleteBtn}
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

      {/* ── MODALS ── */}
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
                style={S.input}
                value={editAllocation}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditAllocation(val);
                  if (val === "Floor Incharge") setEditShift("Morning");
                  else if (val === "Shift Incharge") setEditShift("Afternoon");
                  else if (val === "Housekeeping Desk") setEditShift("Morning");
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

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#07101E",
  surface: "#0F1B2D",
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
  userName: { fontSize: 26, fontWeight: 700, color: C.text },
  userMeta: { fontSize: 13, fontWeight: 500, color: C.gold, marginTop: 4 },
  ghostBtn: {
    background: "transparent",
    border: "none",
    color: C.gold,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: "4px 0",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: 30,
    width: 170,
    background: "#111F35",
    borderRadius: 14,
    border: `1px solid ${C.borderMid}`,
    zIndex: 999,
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
    gap: 4,
    background: C.surface,
    borderRadius: 12,
    padding: 6,
    marginBottom: 20,
    border: `1px solid ${C.borderMid}`,
  },
  tabBtn: {
    flex: 1,
    background: "transparent",
    border: "none",
    padding: "10px 4px",
    fontSize: 12,
    fontWeight: 600,
    color: C.muted,
    borderRadius: 8,
    cursor: "pointer",
  },
  tabBtnActive: { background: "#162236", color: C.text },
  pillsWrap: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 },
  pill: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    color: C.muted,
    cursor: "pointer",
  },
  pillActive: { background: C.gold, borderColor: C.gold, color: "#000" },
  subheader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  subheaderText: { fontSize: 13, fontWeight: 600, color: C.text },
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
  cardName: { fontSize: 15, fontWeight: 600, color: C.text },
  cardSub: { fontSize: 12, color: C.muted },
  cardRight: { display: "flex", alignItems: "center", gap: 10 },
  varChip: {
    borderRadius: 8,
    padding: "3px 9px",
    fontSize: 12,
    fontWeight: 700,
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
    border: `1px solid ${C.border}`,
  },
  expandPanel: { padding: "0 16px 14px" },
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
  statusAreaCard: {
    background: "rgba(255, 255, 255, 0.02)",
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "12px 14px",
  },
  statusBadge: {
    background: "#162236",
    fontSize: 11,
    color: "#B0BFDA",
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
  },
  modal: {
    background: "#0F1B2D",
    borderRadius: "24px 24px 0 0",
    padding: "24px 20px 36px",
    width: "100%",
    maxWidth: 480,
    border: `1px solid ${C.borderMid}`,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: C.gold,
    marginBottom: 4,
  },
  modalTitle: { fontSize: 22, fontWeight: 700, color: C.text },
  closeBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "none",
    color: C.muted,
    borderRadius: 10,
    width: 32,
    height: 32,
    cursor: "pointer",
  },
  modalDivider: { height: "1px", background: C.border, margin: "16px 0" },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
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
  },
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
  },
  notificationPanel: {
    position: "fixed",
    right: 16,
    top: 70,
    width: "320px",
    background: "#111F35",
    borderRadius: 14,
    border: `1px solid ${C.borderMid}`,
    zIndex: 1000,
  },
  notifHeader: {
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 700,
    background: "#162236",
    borderBottom: `1px solid ${C.border}`,
  },
  notifBody: { overflowY: "auto", maxHeight: "300px" },
  notifItem: { padding: "12px 16px", borderBottom: `1px solid ${C.border}` },
  notifMsg: { fontSize: 13, color: "#B0BFDA" },
  notifTime: { fontSize: 11, color: C.muted },
  deleteBtn: {
    background: "rgba(248,113,113,0.12)",
    color: "#F87171",
    border: "none",
    borderRadius: 8,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
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
};
