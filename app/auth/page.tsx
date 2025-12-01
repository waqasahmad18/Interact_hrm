
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim().toLowerCase();
    // Admin login
    const validAdmin =
      ((id === "admin@interact.com" || id === "interactadmin" || id === "admin") && password === "interact123");
    // Employee login
    const validEmployee =
      ((id === "waqas1" || id === "waqas@company.com") && password === "waqas125");
    if (validAdmin) {
      if (typeof window !== "undefined") {
        localStorage.setItem("loginId", loginId);
      }
      router.push("/dashboard");
    } else if (validEmployee) {
      if (typeof window !== "undefined") {
        localStorage.setItem("loginId", loginId);
      }
      router.push("/employee-dashboard");
    } else {
      setError("Invalid credentials. Please try again.");
    }
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
          <button type="submit" className={styles.button}>
            Login
          </button>
        </form>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.footer}>Powered by <span style={{ color: "#3478f6", fontWeight: 600 }}>Interact HRM</span></div>
      </div>
    </div>
  );
}
