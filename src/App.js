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
    allocation: "Floor Incharge",
    shift: "Morning",
  });

  const handleLoginSuccess = (role, name, allocation, shift) => {
    setUserDetails({ name, role, allocation, shift });
    setCurrentScreen("STAFF");
  };

  const handleLogout = () => {
    setUserDetails({ name: "", role: "", allocation: "", shift: "" });
    setCurrentScreen("LOGIN");
  };

  const handleUpdateMeta = (allocation, shift) => {
    setUserDetails((prev) => ({ ...prev, allocation, shift }));
  };

  return (
    <div className="app-container">
      {currentScreen === "SPLASH" && (
        <SplashScreen onFinish={() => setCurrentScreen("LOGIN")} />
      )}
      {currentScreen === "LOGIN" && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
      {currentScreen === "STAFF" && (
        <StaffDashboard
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={setCurrentScreen}
          onUpdateMeta={handleUpdateMeta}
        />
      )}
      {currentScreen === "ADMIN" && (
        <AdminScreen
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={setCurrentScreen}
          onUpdateMeta={handleUpdateMeta}
        />
      )}
      {currentScreen === "PAR_CONTROL" && (
        <ParControlScreen
          user={userDetails}
          onLogout={handleLogout}
          onSwitchRole={setCurrentScreen}
        />
      )}
    </div>
  );
}
