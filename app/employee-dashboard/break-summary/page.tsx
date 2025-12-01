"use client";
import React from "react";
import Layout from "../layout";

export default function BreakSummaryPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <h1 style={{ color: "#3478f6", fontWeight: 700, fontSize: "2rem", marginBottom: 18 }}>Break Summary</h1>
      <p style={{ color: "#555", fontSize: "1.1rem" }}>Your break records will appear here.</p>
    </div>
  );
}
