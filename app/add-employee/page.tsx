"use client";
"use client";
"use client";
import React, { useState } from "react";
import Image from "next/image";
import styles from "./add-employee.module.css";
import LayoutDashboard from "../layout-dashboard";

const employeeTabs = [
  // Removed Dashboard tab
  { name: "Employee List", path: "/employee-list" },
  { name: "Personal Details", path: "/employee-details/personal" },
  { name: "Contact Details", path: "/employee-details/contact" },
  { name: "Emergency Contacts", path: "/employee-details/emergency" },
  { name: "Dependents", path: "/employee-details/dependents" },
  { name: "Job", path: "/employee-details/job" },
  { name: "Salary", path: "/employee-details/salary" },
];

import { useRouter, usePathname } from "next/navigation";
  export default function AddEmployeePage() {
    const [firstName, setFirstName] = useState("");
    const [middleName, setMiddleName] = useState("");
    const [lastName, setLastName] = useState("");
    const [employeeId, setEmployeeId] = useState("");
    const [dob, setDob] = useState("");
    const [gender, setGender] = useState("");
    const [maritalStatus, setMaritalStatus] = useState("");
    const [nationality, setNationality] = useState("");
    const [createLogin, setCreateLogin] = useState(false);
    const [profileImg, setProfileImg] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [status, setStatus] = useState("enabled");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const router = useRouter();
    const pathname = usePathname();

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size <= 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setProfileImg(ev.target?.result as string);
          };
          reader.readAsDataURL(file);
        } else {
          alert("File size must be less than 1MB");
        }
      }
    };

    async function handleSave(e: React.FormEvent) {
      e.preventDefault();
      if (createLogin && password !== confirmPassword) {
        alert('Password and Confirm Password do not match');
        return;
      }
      const payload: any = {
        firstName,
        middleName,
        lastName,
        employeeId,
        dob,
        gender,
        maritalStatus,
        nationality,
        username: createLogin ? username : undefined,
        status: createLogin ? status : undefined,
        password: createLogin ? password : undefined,
        profileImg
      };
      try {
        const res = await fetch('/api/employee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
          alert('Employee saved');
          router.push('/employee-list');
        } else {
          alert('Save failed: ' + (data.error || 'Unknown'));
        }
      } catch (err) {
        alert('Save failed: ' + String(err));
      }
    }

    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "#F7FAFC" }}>
        {/* Employee Sidebar */}
        <aside className={styles.sidebar}>
          <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", margin: "18px 0 12px 0" }}>
            <button
              aria-label="Back to Dashboard"
              onClick={() => router.push("/dashboard")}
              style={{
                background: "#fff",
                border: "none",
                borderRadius: "50%",
                boxShadow: "0 2px 8px rgba(0,82,204,0.10)",
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="14" fill="#0052CC" />
                <path d="M16.5 9L12.5 14L16.5 19" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <nav className={styles.nav}>
            {employeeTabs.map(tab => {
              const isActive = pathname === tab.path;
              return (
                <div
                  key={tab.name}
                  onClick={() => router.push(tab.path)}
                  className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                >
                  <span>{tab.name}</span>
                </div>
              );
            })}
          </nav>
        </aside>
        {/* Main Add Employee Form */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={styles.formCard}>
            <h2 className={styles.heading}>Add Employee</h2>
            {/* ...existing form code... */}
            <form className={styles.form} onSubmit={handleSave}>
              {/* ...existing form fields... */}
              <div className={styles.row} style={{ justifyContent: "center", alignItems: "center" }}>
                <div className={styles.profileImg}>
                  <Image src={profileImg || "/avatar.svg"} alt="Profile" width={90} height={90} />
                  <label htmlFor="profileImg" className={styles.uploadBtn}>
                    +
                    <input id="profileImg" type="file" accept=".jpg,.png,.gif" style={{ display: "none" }} onChange={handleImageChange} />
                  </label>
                </div>
                <div className={styles.note}>
                  Accepts jpg, png, gif up to 1MB.<br />Recommended dimensions: 200px X 200px
                </div>
              </div>
              <div className={styles.row}>
                <input className={styles.input} type="text" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                <input className={styles.input} type="text" placeholder="Middle Name" value={middleName} onChange={e => setMiddleName(e.target.value)} />
                <input className={styles.input} type="text" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
              <input className={styles.input} type="text" placeholder="Employee Id" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required />
              <div className={styles.row}>
                <input className={styles.input} type="date" placeholder="Date of Birth" value={dob} onChange={e => setDob(e.target.value)} />
                <select className={styles.select} value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="">Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <select className={styles.select} value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)}>
                  <option value="">Marital Status</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <input className={styles.input} type="text" placeholder="Nationality" value={nationality} onChange={e => setNationality(e.target.value)} />
              <div className={styles.row} style={{ alignItems: "center" }}>
                <span style={{ color: "#0052CC", fontWeight: "600", fontSize: "0.95rem" }}>Create Login Details</span>
                <label style={{ display: "inline-block", position: "relative", width: 40, height: 22 }}>
                  <input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0, background: createLogin ? "#0052CC" : "#E2E8F0", borderRadius: 22, transition: "background 0.2s" }}></span>
                  <span style={{ position: "absolute", left: createLogin ? 20 : 2, top: 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,82,204,0.12)", transition: "left 0.2s" }}></span>
                </label>
              </div>
              {createLogin && (
                <div style={{ background: "#F7FAFC", borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <div className={styles.row}>
                    <input className={styles.input} type="text" placeholder="Username*" value={username} onChange={e => setUsername(e.target.value)} required />
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ color: "#0052CC", fontWeight: "bold", marginRight: 6 }}>Status</label>
                      <input type="radio" id="enabled" name="status" value="enabled" checked={status === "enabled"} onChange={() => setStatus("enabled")}/>
                      <label htmlFor="enabled" style={{ marginRight: 8, color: status === "enabled" ? "#0052CC" : "#888" }}>Enabled</label>
                      <input type="radio" id="disabled" name="status" value="disabled" checked={status === "disabled"} onChange={() => setStatus("disabled")}/>
                      <label htmlFor="disabled" style={{ color: status === "disabled" ? "#0052CC" : "#888" }}>Disabled</label>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <input className={styles.input} type="password" placeholder="Password*" value={password} onChange={e => setPassword(e.target.value)} required />
                    <input className={styles.input} type="password" placeholder="Confirm Password*" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                  </div>
                  <div className={styles.note}>
                    For a strong password, please use a hard to guess combination of text with upper and lower case characters, symbols and numbers
                  </div>
                </div>
              )}
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.saveBtn}>Save</button>
              </div>
            </form>
            <div className={styles.note}>* Required</div>
          </div>
        </div>
      </div>
    );
  }
