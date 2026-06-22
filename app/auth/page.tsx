
"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaUser } from "react-icons/fa";
import {
  loadSavedLogins,
  persistSavedLogin,
  type SavedLogin,
} from "@/lib/saved-login-client";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showSavedPicker, setShowSavedPicker] = useState(false);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const syncSavedLogins = useCallback(async () => {
    const saved = await loadSavedLogins();
    setSavedLogins(saved);
    if (saved.length > 0) setRememberMe(true);
    return saved;
  }, []);

  useEffect(() => {
    void syncSavedLogins();
  }, [syncSavedLogins]);

  const persistCredentials = useCallback(
    async (id: string, pass: string) => {
      if (!rememberMe) return;
      const ok = await persistSavedLogin(id, pass);
      if (ok) {
        const updated = await loadSavedLogins();
        setSavedLogins(updated);
      }
    },
    [rememberMe]
  );

  const performLogin = useCallback(
    async (rawLoginId: string, rawPassword: string) => {
      setError("");
      setLoading(true);
      const id = rawLoginId.trim().toLowerCase();
      const validAdmin =
        (id === "admin@interact.com" || id === "interactadmin" || id === "admin") &&
        rawPassword === "interact123";

      if (validAdmin) {
        if (typeof window !== "undefined") {
          localStorage.setItem("loginId", rawLoginId);
        }
        await persistCredentials(rawLoginId, rawPassword);
        router.push("/dashboard");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/employee-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginId: rawLoginId, password: rawPassword }),
        });
        const data = await res.json();
        if (data.success) {
          if (typeof window !== "undefined") {
            localStorage.setItem("loginId", rawLoginId);
            localStorage.setItem("userRole", data.role || data.employee?.role || "Officer");
          }
          await persistCredentials(rawLoginId, rawPassword);
          const role = data.role || data.employee?.role || "Officer";
          if (role === "BOD/CEO") router.push("/bod-dashboard");
          else if (role === "HOD") router.push("/hod-dashboard");
          else if (role === "Management") router.push("/management-dashboard");
          else if (role === "Leader") router.push("/leader-dashboard");
          else router.push("/employee-dashboard");
        } else {
          setError(data.error || "Invalid credentials. Please try again.");
        }
      } catch {
        setError("Login failed. Please try again.");
      }
      setLoading(false);
    },
    [persistCredentials, router]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(loginId, password);
  };

  const handleUseSaved = (saved: SavedLogin) => {
    setLoginId(saved.loginId);
    setPassword(saved.password);
    setShowSavedPicker(false);
  };

  const openSavedPickerIfNeeded = () => {
    void syncSavedLogins().then((saved) => {
      if (saved.length > 0) setShowSavedPicker(true);
    });
  };

  const closeSavedPicker = () => {
    window.setTimeout(() => setShowSavedPicker(false), 180);
  };

  const hasSavedPanel = showSavedPicker && savedLogins.length > 0;

  return (
    <div className={styles.splitWrap}>
      <section className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <div className={styles.brandLockup}>
            <span className={styles.kicker}>WELCOME TO</span>
            <h1 className={styles.brandTitle}>
              <span className={styles.shimmer}>INTERACT GLOBAL</span>
            </h1>
            <h2 className={styles.brandSub}>HRM PLATFORM</h2>
          </div>
          <p className={styles.brandText}>Secure, Fast And Smart Employee Management.</p>
        </div>
      </section>

      <section className={styles.rightPanel}>
        <div className={`${styles.formWrap} ${hasSavedPanel ? styles.formWrapWithSaved : ""}`}>
          <Image src="/logo1.png" alt="Interact Logo" width={96} height={96} className={styles.logoImage} />
          <h3 className={styles.formTitle}>Sign in to continue</h3>

          <div className={styles.formRow}>
            <form className={styles.form} onSubmit={handleSubmit} method="post" autoComplete="on">
              <input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Email or Username"
                className={styles.input}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                onFocus={openSavedPickerIfNeeded}
                onClick={openSavedPickerIfNeeded}
                onBlur={closeSavedPicker}
                required
              />
              <div className={styles.passwordWrapper}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={openSavedPickerIfNeeded}
                  onClick={openSavedPickerIfNeeded}
                  onBlur={closeSavedPicker}
                  required
                />
                <button
                  type="button"
                  className={styles.togglePasswordBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <div className={styles.rowBetween}>
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me
                </label>
                <a className={styles.linkBtn} onClick={() => router.push("/auth/forgot-password")}>
                  Forgot password?
                </a>
              </div>
              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>

            {hasSavedPanel ? (
              <aside
                className={styles.savedPanel}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Saved logins on this device"
              >
                <div className={styles.savedPanelTitle}>Saved on this device</div>
                <div className={styles.savedPanelList}>
                  {savedLogins.map((saved) => (
                    <button
                      key={saved.loginId}
                      type="button"
                      className={styles.savedAccountBtn}
                      onClick={() => handleUseSaved(saved)}
                    >
                      <FaUser className={styles.savedAccountIcon} aria-hidden />
                      <span className={styles.savedAccountText}>
                        <strong>{saved.loginId}</strong>
                        <span>Saved password</span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.rightFooter}>
            Powered by{" "}
            <a href="https://interactglobals.com/" target="_blank" rel="noopener noreferrer">
              Interact Global
            </a>
            <em> v1.0</em>
          </div>
        </div>
      </section>
    </div>
  );
}
