"use client";
import React from "react";
import Layout from "../layout";

export default function LeavePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <h1 style={{ color: "#3478f6", fontWeight: 700, fontSize: "2rem", marginBottom: 18 }}>Leave</h1>
      <p style={{ color: "#555", fontSize: "1.1rem" }}>Apply for leave or view your leave status here.</p>
    </div>
  );
}
