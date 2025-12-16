
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const id = loginId.trim().toLowerCase();
    // Admin login (local, not DB)
    const validAdmin =
      ((id === "admin@interact.com" || id === "interactadmin" || id === "admin") && password === "interact123");
    if (validAdmin) {
      if (typeof window !== "undefined") {
        localStorage.setItem("loginId", loginId);
      }
      router.push("/dashboard");
      setLoading(false);
      return;
    }
    // Employee login via backend
    try {
      const res = await fetch("/api/employee-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("loginId", loginId);
          localStorage.setItem("userRole", data.role || "Officer");
        }
        const role = data.role || "Officer";
        // Route based on role
        if (role === "BOD/CEO") router.push("/bod-dashboard");
        else if (role === "HOD") router.push("/hod-dashboard");
        else if (role === "Management") router.push("/management-dashboard");
        else if (role === "Leader") router.push("/leader-dashboard");
        else router.push("/employee-dashboard");
      } else {
        setError(data.error || "Invalid credentials. Please try again.");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className={styles.bgGradient}>
      <div className={styles.centerCard}>
        <Image src="/logo.png" alt="Interact HRM Logo" width={90} height={90} className={styles.logo} />
        <h1 className={styles.title}>Welcome to Interact HRM</h1>
        <h2 className={styles.subtitle}>Login to your account</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Email or Username"
            className={styles.input}
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className={styles.input}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.footer}>Powered by <span style={{ color: "#3478f6", fontWeight: 600 }}>Interact HRM</span></div>
      </div>
    </div>
  );
}
