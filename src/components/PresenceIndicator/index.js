import React from "react";
import "./styles.css";

const PresenceIndicator = ({ isConnected }) => {
  return <div className="presence-indicator">{isConnected ? "🟢" : "🔴"}</div>;
};
export default PresenceIndicator;
