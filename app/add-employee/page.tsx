"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "./add-employee.module.css";
import LayoutDashboard from "../layout-dashboard";
import AttachmentsUploader from "./AttachmentsUploader";
const employeeTabs = [
  { name: "Personal Details" },
  { name: "Contact Details" },
  { name: "Emergency Contacts" },
  { name: "Salary" },
  { name: "Attachments" },
];

// Accept props for modal usage, fallback to searchParams for page usage
export default function AddEmployeePage({ edit: editProp, employeeId: employeeIdProp, searchParams: searchParamsProp, onSaved }: {
  edit?: boolean|string,
  employeeId?: string|null,
  searchParams?: any,
  onSaved?: () => void
} = {}) {
  // Use searchParams hook at the top level
  const searchParamsFromHook = useSearchParams();
  
  let isEdit = false;
  let editEmployeeId: string|null = null;
  
  // Priority: props > searchParams
  if (typeof editProp !== 'undefined' && typeof employeeIdProp !== 'undefined') {
    isEdit = editProp === true || editProp === '1';
    editEmployeeId = employeeIdProp || null;
  } else if (searchParamsProp && typeof searchParamsProp.then === 'function') {
    // If searchParamsProp is a Promise, we can't use it synchronously
    // Fall back to useSearchParams hook
    if (searchParamsFromHook) {
      isEdit = searchParamsFromHook.get("edit") === "1";
      editEmployeeId = searchParamsFromHook.get("employeeId") || null;
    }
  } else if (searchParamsProp) {
    // If searchParamsProp is already unwrapped
    isEdit = searchParamsProp.edit === '1' || searchParamsProp.edit === true;
    editEmployeeId = searchParamsProp.employeeId || null;
  } else if (searchParamsFromHook) {
    isEdit = searchParamsFromHook.get("edit") === "1";
    editEmployeeId = searchParamsFromHook.get("employeeId") || null;
  }
  // Personal Details form state
    // Emergency Contacts state
    const [emergencyContacts, setEmergencyContacts] = useState([
      { contact_name: '', relationship: '', phone: '' },
      { contact_name: '', relationship: '', phone: '' }
    ]);

    // Emergency Contacts handlers
    const handleEmergencyContactsChange = (index: number, field: string, value: string) => {
      setEmergencyContacts(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    };

    const handleEmergencyContactsSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!employeeId) {
        alert('Please save Personal Details first.');
        return;
      }
      try {
        const res = await fetch('/api/employee_emergency_contacts', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: employeeId, contacts: emergencyContacts })
        });
        const data = await res.json();
        if (data.success) {
          alert('Emergency contacts saved!');
          setActiveTab('Salary');
        } else {
          alert('Save failed: ' + (data.error || 'Unknown'));
        }
      } catch (err) {
        alert('Save failed: ' + String(err));
      }
    };

    // Contact Details handler
    const handleContactSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!employeeId) {
        alert('Please save Personal Details first.');
        return;
      }
      try {
        const res = await fetch('/api/employee_contacts', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employeeId,
            street1: contactAddress.street1,
            street2: contactAddress.street2,
            city: contactAddress.city,
            state: contactAddress.state,
            zip: contactAddress.zip,
            country: contactAddress.country,
            phone_home: contactTelephone.home,
            phone_mobile: contactTelephone.mobile,
            phone_work: contactTelephone.work,
            email_work: contactEmail.work,
            email_other: contactEmail.other
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('Contact details saved!');
          setActiveTab('Emergency Contacts');
        } else {
          alert('Save failed: ' + (data.error || 'Unknown'));
        }
      } catch (err) {
        alert('Save failed: ' + String(err));
      }
    };



    // Salary Details handler
    const handleSalarySave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!employeeId) {
        alert('Please save Personal Details first.');
        return;
      }
      try {
        const res = await fetch('/api/employee_salaries', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employeeId,
            ...salaryDetails
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('Salary details saved!');
          setActiveTab('Attachments');
        } else {
          alert('Save failed: ' + (data.error || 'Unknown'));
        }
      } catch (err) {
        alert('Save failed: ' + String(err));
      }
    };
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  // Employee ID state (set after personal details save)
  const [employeeId, setEmployeeId] = useState<string | null>(editEmployeeId);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [nationality, setNationality] = useState("");
  const [cnicNumber, setCnicNumber] = useState("");
  const [cnicAddress, setCnicAddress] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [createLogin, setCreateLogin] = useState(false);
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("disabled");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(employeeTabs[0].name);
  // Import Excel state
  const [importingBusy, setImportingBusy] = useState(false);
  const [importSummary, setImportSummary] = useState<any|null>(null);
  // Role selection for hrm_employees
  const roleOptions = ["BOD/CEO", "HOD", "Management", "Leader", "Officer"] as const;
  const [role, setRole] = useState<string>("Officer");
  useEffect(() => {
    setStatus(createLogin ? "active" : "disabled");
  }, [createLogin]);
  // Contact Details form state (moved inside component)
  const [contactAddress, setContactAddress] = useState({ street1: "", street2: "", city: "", state: "", zip: "", country: "" });
  const [contactTelephone, setContactTelephone] = useState({ home: "", mobile: "", work: "" });
  const [contactEmail, setContactEmail] = useState({ work: "", other: "" });

  // Salary Details form state
  const [salaryDetails, setSalaryDetails] = useState({
    component: "",
    payGrade: "",
    payFrequency: "",
    currency: "",
    amount: "",
    comments: "",
    directDeposit: false,
    accountNumber: "",
    accountType: "",
    routingNumber: "",
    depositAmount: ""
  });

  // Prefill all form states in edit mode
  useEffect(() => {
    if (isEdit && editEmployeeId) {
      // Fetch all employee details from API (personal, contact, emergency, job, salary)
      // 1. Personal Details
      fetch(`/api/hrm_employees?employeeId=${editEmployeeId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.employee) {
            setFirstName(data.employee.first_name || "");
            setMiddleName(data.employee.middle_name || "");
            setLastName(data.employee.last_name || "");
            setEmployeeId(data.employee.employee_code || editEmployeeId || "");
            setDob(data.employee.dob || "");
            setGender(data.employee.gender || "");
            setMaritalStatus(data.employee.marital_status || "");
            setNationality(data.employee.nationality || "");
            setProfileImg(data.employee.profile_img || null);
            setUsername(data.employee.username || "");
            setStatus(data.employee.status || "enabled");
            setRole(data.employee.role || "Officer");
            setCreateLogin(!!data.employee.username);
          }
        });
      // 2. Contact Details
      fetch(`/api/employee_contacts?employeeId=${editEmployeeId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.contact) {
            setContactAddress({
              street1: data.contact.street1 || "",
              street2: data.contact.street2 || "",
              city: data.contact.city || "",
              state: data.contact.state || "",
              zip: data.contact.zip || "",
              country: data.contact.country || ""
            });
            setContactTelephone({
              home: data.contact.phone_home || "",
              mobile: data.contact.phone_mobile || "",
              work: data.contact.phone_work || ""
            });
            setContactEmail({
              work: data.contact.email_work || "",
              other: data.contact.email_other || ""
            });
          }
        });
      // 3. Emergency Contacts
      fetch(`/api/employee_emergency_contacts?employeeId=${editEmployeeId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.contacts)) {
            setEmergencyContacts([
              data.contacts[0] || { contact_name: '', relationship: '', phone: '' },
              data.contacts[1] || { contact_name: '', relationship: '', phone: '' }
            ]);
          }
        });

      // 5. Salary Details
      fetch(`/api/employee_salaries?employeeId=${editEmployeeId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.salary) {
            setSalaryDetails(s => ({
              ...s,
              component: data.salary.component || "",
              payGrade: data.salary.payGrade || "",
              payFrequency: data.salary.payFrequency || "",
              currency: data.salary.currency || "",
              amount: data.salary.amount || "",
              comments: data.salary.comments || "",
              directDeposit: !!data.salary.directDeposit,
              accountNumber: data.salary.accountNumber || "",
              accountType: data.salary.accountType || "",
              routingNumber: data.salary.routingNumber || "",
              depositAmount: data.salary.depositAmount || ""
            }));
          }
        });
    }
  }, [isEdit, editEmployeeId]);

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
      // Prepare hrm_employees payload
      const hrmPayload: any = {
        first_name: firstName || '',
        middle_name: middleName || '',
        last_name: lastName || '',
        employee_code: employeeId || '',
        dob: dob || '',
        gender: gender || '',
        marital_status: maritalStatus || '',
        nationality: nationality || '',
        cnic_number: cnicNumber || '',
        cnic_address: cnicAddress || '',
        employment_status: employmentStatus || '',
        profile_img: profileImg || '',
        username: createLogin ? username : '',
        password: createLogin ? password : '',
        status: createLogin ? 'active' : 'disabled',
        role: role || 'Officer'
      };
      try {
        let hrmRes, hrmData;
        if (isEdit) {
          // Update mode - send both id and employee_code
          const editPayload = { ...hrmPayload, id: employeeId, employee_code: employeeId };
          hrmRes = await fetch('/api/hrm_employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editPayload) });
          hrmData = await hrmRes.json();
          if (!hrmData.success) {
            alert('Update failed: ' + (hrmData.error || 'Unknown'));
            return;
          }
          alert('Employee updated.');
          if (onSaved) onSaved();
        } else {
          // Create mode
          hrmRes = await fetch('/api/hrm_employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hrmPayload) });
          hrmData = await hrmRes.json();
          if (!hrmData.success || !hrmData.id) {
            alert('Save failed: ' + (hrmData.error || 'Unknown'));
            return;
          }
          setEmployeeId(hrmData.id);
          alert('Employee saved.');
        }
        setActiveTab('Contact Details');
      } catch (err) {
        alert('Save failed: ' + String(err));
      }
    }

    return (
      <LayoutDashboard>
        <div style={{ display: "flex", minHeight: "100vh", background: "#F7FAFC", gap: "20px", paddingTop: "30px" }}>
          {/* Employee Sidebar */}
          <aside className={styles.sidebar} style={{ marginLeft: "20px", paddingTop: "30px" }}>
            <nav className={styles.nav}>
              {employeeTabs.map(tab => {
                const isActive = activeTab === tab.name;
                return (
                  <div
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
                    className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                  >
                    <span>{tab.name}</span>
                  </div>
                );
              })}
            </nav>
          </aside>
          {/* Main Add Employee Form */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "30px", paddingRight: "30px" }}>
            <div className={styles.formCard}>
              <h2 className={styles.heading}>Add Employee</h2>
              
              {/* Prominent Excel Import Section */}
              <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 12, padding: 20, marginBottom: 24, color: '#fff', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}>
                <h3 style={{ margin: 0, marginBottom: 8, fontSize: '1.2rem', fontWeight: 700 }}>📊 Bulk Import Employees (Excel)</h3>
                <p style={{ margin: 0, marginBottom: 12, fontSize: '0.95rem', opacity: 0.95 }}>Upload an Excel file to add multiple employees at once. Max file size: 100MB</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a href="/api/employee-import?template=1" style={{ background: '#fff', color: '#667eea', textDecoration: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <span>⬇️</span> Download Template
                  </a>
                  <label style={{ background: '#48bb78', color: '#fff', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <span>⬆️</span> Upload Excel
                    <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const MAX_SIZE = 100 * 1024 * 1024; // 100MB
                      if (f.size > MAX_SIZE) {
                        alert('File size exceeds 100MB limit. Please choose a smaller file.');
                        e.target.value = '';
                        return;
                      }
                      setImportingBusy(true);
                      setImportSummary(null);
                      const fd = new FormData();
                      fd.append('file', f);
                      try {
                        const res = await fetch('/api/employee-import', { method: 'POST', body: fd });
                        const data = await res.json();
                        setImportSummary(data);
                        if (data.success) {
                          alert(`Import finished!\\n✅ Inserted: ${data.summary.inserted}\\n⚠️ Skipped: ${data.summary.skipped}\\n❌ Failed: ${data.summary.failed}`);
                        } else {
                          alert('Import failed: ' + (data.error || 'Unknown'));
                        }
                      } catch (err) {
                        alert('Upload failed: ' + String(err));
                      }
                      setImportingBusy(false);
                      e.target.value = '';
                    }} />
                  </label>
                  {importingBusy && <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>⏳ Processing...</span>}
                </div>
                {importSummary && importSummary.success && (
                  <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 12, backdropFilter: 'blur(10px)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Import Summary:</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.9rem' }}>
                      <span>✅ Inserted: <strong>{importSummary.summary?.inserted ?? 0}</strong></span>
                      <span>⚠️ Skipped: <strong>{importSummary.summary?.skipped ?? 0}</strong></span>
                      <span>❌ Failed: <strong>{importSummary.summary?.failed ?? 0}</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {activeTab === "Personal Details" && (
                <form className={styles.form} onSubmit={handleSave}>
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
                    <input className={styles.input} type="text" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
                    <input className={styles.input} type="text" placeholder="Pseudonym" value={middleName} onChange={e => setMiddleName(e.target.value)} />
                  </div>
                  <input className={styles.input} type="text" placeholder="Employee Id" value={employeeId || ''} readOnly required />
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
                  <div className={styles.row}>
                    <input className={styles.input} type="text" placeholder="Nationality" value={nationality} onChange={e => setNationality(e.target.value)} />
                  </div>
                  <div className={styles.row}>
                    <input className={styles.input} type="text" placeholder="CNIC #" value={cnicNumber} onChange={e => setCnicNumber(e.target.value)} />
                    <input className={styles.input} type="text" placeholder="CNIC Address" value={cnicAddress} onChange={e => setCnicAddress(e.target.value)} />
                  </div>
                  <select className={styles.select} value={employmentStatus} onChange={e => setEmploymentStatus(e.target.value)} required>
                    <option value="">Select Employment Status</option>
                    <option value="Probation">Probation</option>
                    <option value="Permanent">Permanent</option>
                  </select>
                  <select className={styles.select} value={role} onChange={e => setRole(e.target.value)} required>
                    <option value="">Select Role</option>
                    <option value="BOD/CEO">BOD/CEO</option>
                    <option value="HOD">HOD</option>
                    <option value="Management">Management</option>
                    <option value="Leader">Leader</option>
                    <option value="Officer">Officer</option>
                  </select>
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
              )}
              {activeTab === "Contact Details" && (
                <div>
                  <h2 className={styles.heading}>Contact Details</h2>
                  {employeeId && (
                    <div style={{fontWeight:600, color:'#0052CC', marginBottom:8}}>
                      Employee: {firstName} {lastName} (ID: {employeeId})
                    </div>
                  )}
                  <form className={styles.form} style={{ width: "100%" }} onSubmit={handleContactSave}>
                    {/* Address Section */}
                    <div style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: 10 }}>Address</div>
                    <div className={styles.row}>
                      <input className={styles.input} type="text" placeholder="Street 1" value={contactAddress.street1} onChange={e => setContactAddress(a => ({ ...a, street1: e.target.value }))} required />
                      <input className={styles.input} type="text" placeholder="Street 2" value={contactAddress.street2} onChange={e => setContactAddress(a => ({ ...a, street2: e.target.value }))} />
                      <input className={styles.input} type="text" placeholder="City" value={contactAddress.city} onChange={e => setContactAddress(a => ({ ...a, city: e.target.value }))} required />
                    </div>
                    <div className={styles.row}>
                      <input className={styles.input} type="text" placeholder="State/Province" value={contactAddress.state} onChange={e => setContactAddress(a => ({ ...a, state: e.target.value }))} required />
                      <input className={styles.input} type="text" placeholder="Zip/Postal Code" value={contactAddress.zip} onChange={e => setContactAddress(a => ({ ...a, zip: e.target.value }))} />
                      <select className={styles.select} value={contactAddress.country} onChange={e => setContactAddress(a => ({ ...a, country: e.target.value }))} required>
                        <option value="">-- Select --</option>
                        <option value="Pakistan">Pakistan</option>
                        <option value="India">India</option>
                        <option value="UAE">UAE</option>
                        <option value="USA">USA</option>
                        <option value="UK">UK</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {/* Telephone Section */}
                    <div style={{ fontWeight: 600, fontSize: "1.1rem", margin: "18px 0 10px 0" }}>Telephone</div>
                    <div className={styles.row}>
                      <input className={styles.input} type="text" placeholder="Home" value={contactTelephone.home} onChange={e => setContactTelephone(t => ({ ...t, home: e.target.value }))} />
                      <input className={styles.input} type="text" placeholder="Mobile" value={contactTelephone.mobile} onChange={e => setContactTelephone(t => ({ ...t, mobile: e.target.value }))} required />
                      <input className={styles.input} type="text" placeholder="Work" value={contactTelephone.work} onChange={e => setContactTelephone(t => ({ ...t, work: e.target.value }))} />
                    </div>
                    {/* Email Section */}
                    <div style={{ fontWeight: 600, fontSize: "1.1rem", margin: "18px 0 10px 0" }}>Email</div>
                    <div className={styles.row}>
                      <input className={styles.input} type="email" placeholder="Work Email" value={contactEmail.work} onChange={e => setContactEmail(em => ({ ...em, work: e.target.value }))} required />
                      <input className={styles.input} type="email" placeholder="Other Email" value={contactEmail.other} onChange={e => setContactEmail(em => ({ ...em, other: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                      <button type="submit" style={{ background: "#8BC34A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 32px", fontWeight: 600, fontSize: "1.08rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,82,204,0.10)" }}>Save</button>
                    </div>
                  </form>
                </div>
              )}
              {activeTab === "Emergency Contacts" && (
                <div>
                  <h2 className={styles.heading}>Emergency Contacts</h2>
                  {employeeId && (
                    <div style={{fontWeight:600, color:'#0052CC', marginBottom:8}}>
                      Employee: {firstName} {lastName} (ID: {employeeId})
                    </div>
                  )}
                  <form className={styles.form} style={{ width: '100%' }} onSubmit={handleEmergencyContactsSave}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Emergency Contact 1</div>
                    <div className={styles.row}>
                      <input className={styles.input} placeholder="Name" value={emergencyContacts[0].contact_name} onChange={e => handleEmergencyContactsChange(0, 'contact_name', e.target.value)} />
                      <input className={styles.input} placeholder="Relationship" value={emergencyContacts[0].relationship} onChange={e => handleEmergencyContactsChange(0, 'relationship', e.target.value)} />
                      <input className={styles.input} placeholder="Phone" value={emergencyContacts[0].phone} onChange={e => handleEmergencyContactsChange(0, 'phone', e.target.value)} />
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 12 }}>Emergency Contact 2</div>
                    <div className={styles.row}>
                      <input className={styles.input} placeholder="Name" value={emergencyContacts[1].contact_name} onChange={e => handleEmergencyContactsChange(1, 'contact_name', e.target.value)} />
                      <input className={styles.input} placeholder="Relationship" value={emergencyContacts[1].relationship} onChange={e => handleEmergencyContactsChange(1, 'relationship', e.target.value)} />
                      <input className={styles.input} placeholder="Phone" value={emergencyContacts[1].phone} onChange={e => handleEmergencyContactsChange(1, 'phone', e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                      <button type="submit" style={{ background: "#8BC34A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 32px", fontWeight: 600, fontSize: "1.08rem", cursor: "pointer" }}>Save</button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === "Salary" && (
                <div>
                  <h2 className={styles.heading}>Add Salary Component</h2>
                  {employeeId && (
                    <div style={{fontWeight:600, color:'#0052CC', marginBottom:8}}>
                      Employee: {firstName} {lastName} (ID: {employeeId})
                    </div>
                  )}
                  <form className={styles.form} style={{ width: "100%" }} onSubmit={handleSalarySave}>
                    <div className={styles.row}>
                      <input className={styles.input} type="text" placeholder="Salary Component*" value={salaryDetails.component} onChange={e => setSalaryDetails(s => ({ ...s, component: e.target.value }))} />
                      <select className={styles.select} value={salaryDetails.payGrade} onChange={e => setSalaryDetails(s => ({ ...s, payGrade: e.target.value }))}>
                        <option value="">-- Select --</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                      <select className={styles.select} value={salaryDetails.payFrequency} onChange={e => setSalaryDetails(s => ({ ...s, payFrequency: e.target.value }))}>
                        <option value="">-- Select --</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Yearly">Yearly</option>
                      </select>
                    </div>
                    <div className={styles.row}>
                      <select className={styles.select} value={salaryDetails.currency} onChange={e => setSalaryDetails(s => ({ ...s, currency: e.target.value }))}>
                        <option value="">-- Select --</option>
                        <option value="PKR">PKR</option>
                        <option value="USD">USD</option>
                        <option value="INR">INR</option>
                        <option value="AED">AED</option>
                      </select>
                      <input className={styles.input} type="number" placeholder="Amount*" value={salaryDetails.amount} onChange={e => setSalaryDetails(s => ({ ...s, amount: e.target.value }))} />
                    </div>
                    <div className={styles.row}>
                      <textarea className={styles.input} placeholder="Comments" value={salaryDetails.comments} onChange={e => setSalaryDetails(s => ({ ...s, comments: e.target.value }))} style={{ minHeight: 60, resize: "vertical" }} />
                    </div>
                    <div style={{ margin: "18px 0 10px 0", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontWeight: 600 }}>Include Direct Deposit Details</span>
                      <label style={{ display: "inline-block", position: "relative", width: 40, height: 22 }}>
                        <input type="checkbox" checked={salaryDetails.directDeposit} onChange={e => setSalaryDetails(s => ({ ...s, directDeposit: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
                        <span style={{ position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0, background: salaryDetails.directDeposit ? "#FFA726" : "#E2E8F0", borderRadius: 22, transition: "background 0.2s" }}></span>
                        <span style={{ position: "absolute", left: salaryDetails.directDeposit ? 20 : 2, top: 2, width: 18, height: 18, background: "#fff", borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,82,204,0.12)", transition: "left 0.2s" }}></span>
                      </label>
                    </div>
                    {salaryDetails.directDeposit && (
                      <div>
                        <div className={styles.row}>
                          <input className={styles.input} type="text" placeholder="Account Number*" value={salaryDetails.accountNumber} onChange={e => setSalaryDetails(s => ({ ...s, accountNumber: e.target.value }))} />
                          <select className={styles.select} value={salaryDetails.accountType} onChange={e => setSalaryDetails(s => ({ ...s, accountType: e.target.value }))}>
                            <option value="">-- Select --</option>
                            <option value="Savings">Savings</option>
                            <option value="Current">Current</option>
                          </select>
                        </div>
                        <div className={styles.row}>
                          <input className={styles.input} type="text" placeholder="Bank Name*" value={salaryDetails.routingNumber} onChange={e => setSalaryDetails(s => ({ ...s, routingNumber: e.target.value }))} />
                          <input className={styles.input} type="number" placeholder="Amount*" value={salaryDetails.depositAmount} onChange={e => setSalaryDetails(s => ({ ...s, depositAmount: e.target.value }))} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                      <button type="button" style={{ background: "#fff", color: "#8BC34A", border: "1px solid #8BC34A", borderRadius: 8, padding: "10px 32px", fontWeight: 600, fontSize: "1.08rem", cursor: "pointer" }}>Cancel</button>
                      <button type="submit" style={{ background: "#8BC34A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 32px", fontWeight: 600, fontSize: "1.08rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,82,204,0.10)" }}>Save</button>
                    </div>
                  </form>
                </div>
              )}

              <div className={styles.note}>* Required</div>

              {activeTab === "Attachments" && (
                <div>
                  <h2 className={styles.heading}>Attachments</h2>
                  {employeeId ? (
                    <AttachmentsUploader employeeId={employeeId} />
                  ) : (
                    <div style={{ color: '#C00', fontWeight: 500 }}>Please save Personal Details first.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </LayoutDashboard>
    );
  }
