import React, { useState } from "react";
import SplashScreen from "./screens/SplashScreen";
import LoginScreen from "./screens/LoginScreen";
import StaffDashboard from "./screens/StaffScreen";
import AdminScreen from "./screens/AdminScreen";
import ParControlScreen from "./screens/ParControlScreen";
import "./styles.css";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState("SPLASH");

  const [userDetails, setUserDetails] = useState({
    name: "",
    role: "",
    allocation: "",
    shift: "",
  });

  const handleLoginSuccess = (role, name, allocation, shift) => {
    const userData = {
      name,
      role,
      allocation,
      shift,
    };

    setUserDetails(userData);

    // Creator gets dashboard picker
    if (role === "CREATOR") {
      setCurrentScreen("CREATOR_PICKER");
      return;
    }

    // Everyone else goes to Staff Dashboard
    setCurrentScreen("STAFF");
  };

  const handleLogout = () => {
    setUserDetails({
      name: "",
      role: "",
      allocation: "",
      shift: "",
    });

    setCurrentScreen("LOGIN");
  };

  const handleUpdateMeta = (allocation, shift) => {
    setUserDetails((prev) => ({
      ...prev,
      allocation,
      shift,
    }));
  };

  const handleSwitchRole = (screen) => {
    setCurrentScreen(screen);
  };

  // ─────────────────────────────────────────────
  // CREATOR DASHBOARD PICKER
  // ─────────────────────────────────────────────
  if (currentScreen === "CREATOR_PICKER") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#07101E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            background: "#0F1B2D",
            width: "100%",
            maxWidth: "440px",
            borderRadius: "24px",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "40px 32px",
            boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#D4AF37",
              marginBottom: 8,
            }}
          >
            Creator Access
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              color: "#F0F4FF",
              marginBottom: 8,
            }}
          >
            Select Dashboard
          </h2>

          <p
            style={{
              fontSize: 14,
              color: "#6B7A99",
              marginBottom: 32,
            }}
          >
            Welcome, {userDetails.name}
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {[
              {
                label: "Staff Dashboard",
                screen: "STAFF",
                icon: "🧹",
              },
              {
                label: "Admin Dashboard",
                screen: "ADMIN",
                icon: "🛡️",
              },
              {
                label: "PAR Control",
                screen: "PAR_CONTROL",
                icon: "📋",
              },
            ].map((item) => (
              <div
                key={item.screen}
                onClick={() => setCurrentScreen(item.screen)}
                style={{
                  background: "#162236",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "14px",
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 24 }}>{item.icon}</span>

                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#F0F4FF",
                  }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleLogout}
            style={{
              marginTop: 20,
              width: "100%",
              height: 50,
              border: "none",
              borderRadius: 12,
              background: "#1D2B44",
              color: "#F87171",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {currentScreen === "SPLASH" && (
        <SplashScreen
          onFinish={() => {
            setCurrentScreen("LOGIN");
          }}
        />
      )}

      {currentScreen === "LOGIN" && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}

      {currentScreen === "STAFF" && (
        <StaffDashboard
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
          onUpdateMeta={handleUpdateMeta}
        />
      )}

      {currentScreen === "ADMIN" && (
        <AdminScreen
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
          onUpdateMeta={handleUpdateMeta}
        />
      )}

      {currentScreen === "PAR_CONTROL" && userDetails.role === "CREATOR" && (
        <ParControlScreen
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
        />
      )}
    </div>
  );
}
