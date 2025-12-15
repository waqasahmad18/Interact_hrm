import React, { useState, useEffect } from "react";
import Image from "next/image";
import styles from "./add-employee.module.css";
import AttachmentsUploader from "./AttachmentsUploader";

const employeeTabs = [
  { name: "Personal Details" },
  { name: "Contact Details" },
  { name: "Emergency Contacts" },
  { name: "Job" },
  { name: "Salary" },
  { name: "Attachments" },
];

export default function AddEmployeeForm({
  edit = false,
  employeeId: editEmployeeId = null,
  onSaved,
}: {
  edit?: boolean;
  employeeId?: string | null;
  onSaved?: () => void;
}) {
  const isEdit = edit;
  
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
        setActiveTab('Job');
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

  // Job Details handler
  const handleJobSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      alert('Please save Personal Details first.');
      return;
    }
    try {
      const res = await fetch('/api/employee_jobs', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          ...jobDetails
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Job details saved!');
        setActiveTab('Salary');
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
        if (onSaved) onSaved();
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
  const [employeeId, setEmployeeId] = useState<string | null>(editEmployeeId);
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
  const [activeTab, setActiveTab] = useState(employeeTabs[0].name);
  
  const [contactAddress, setContactAddress] = useState({ street1: "", street2: "", city: "", state: "", zip: "", country: "" });
  const [contactTelephone, setContactTelephone] = useState({ home: "", mobile: "", work: "" });
  const [contactEmail, setContactEmail] = useState({ work: "", other: "" });
  
  const [jobDetails, setJobDetails] = useState({
    joinedDate: "",
    jobTitle: "",
    jobSpecification: "Not Defined",
    jobCategory: "",
    subUnit: "",
    location: "",
    employmentStatus: "",
    includeContract: false,
  });
  
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
      console.log('Fetching employee data for:', editEmployeeId);
      // 1. Personal Details
      fetch(`/api/hrm_employees?employeeId=${editEmployeeId}`)
        .then(res => res.json())
        .then(data => {
          console.log('HRM Employee data:', data);
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
            setCreateLogin(!!data.employee.username);
          }
        })
        .catch(err => console.error('Error fetching personal details:', err));
      // 2. Contact Details - try both id and employee_code
      Promise.all([
        fetch(`/api/employee_contacts?employeeId=${editEmployeeId}`).then(r => r.json()),
        fetch(`/api/employee_contacts?employeeId=${employeeId}`).then(r => r.json())
      ]).then(([data1, data2]) => {
        const data = (data1.success ? data1 : data2);
        console.log('Contact data:', data);
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
      })
      .catch(err => console.error('Error fetching contact details:', err));
      // 3. Emergency Contacts
      Promise.all([
        fetch(`/api/employee_emergency_contacts?employeeId=${editEmployeeId}`).then(r => r.json()),
        fetch(`/api/employee_emergency_contacts?employeeId=${employeeId}`).then(r => r.json())
      ]).then(([data1, data2]) => {
        const data = (data1.success ? data1 : data2);
        console.log('Emergency contacts data:', data);
        if (data.success && Array.isArray(data.contacts)) {
          setEmergencyContacts([
            data.contacts[0] || { contact_name: '', relationship: '', phone: '' },
            data.contacts[1] || { contact_name: '', relationship: '', phone: '' }
          ]);
        }
      })
      .catch(err => console.error('Error fetching emergency contacts:', err));
      // 4. Job Details
      Promise.all([
        fetch(`/api/employee_jobs?employeeId=${editEmployeeId}`).then(r => r.json()),
        fetch(`/api/employee_jobs?employeeId=${employeeId}`).then(r => r.json())
      ]).then(([data1, data2]) => {
        const data = (data1.success ? data1 : data2);
        console.log('Job data:', data);
        if (data.success && data.job) {
          setJobDetails(j => ({
            ...j,
            joinedDate: data.job.joined_date || "",
            jobTitle: data.job.job_title || "",
            jobSpecification: data.job.job_specification || "Not Defined",
            jobCategory: data.job.job_category || "",
            subUnit: data.job.sub_unit || "",
            location: data.job.location || "",
            employmentStatus: data.job.employment_status || "",
            includeContract: !!data.job.include_contract
          }));
        }
      })
      .catch(err => console.error('Error fetching job details:', err));
      // 5. Salary Details
      Promise.all([
        fetch(`/api/employee_salaries?employeeId=${editEmployeeId}`).then(r => r.json()),
        fetch(`/api/employee_salaries?employeeId=${employeeId}`).then(r => r.json())
      ]).then(([data1, data2]) => {
        const data = (data1.success ? data1 : data2);
        console.log('Salary data:', data);
        if (data.success && data.salary) {
          setSalaryDetails(s => ({
            ...s,
            component: data.salary.component || "",
            payGrade: data.salary.pay_grade || "",
            payFrequency: data.salary.pay_frequency || "",
            currency: data.salary.currency || "",
            amount: data.salary.amount || "",
            comments: data.salary.comments || "",
            directDeposit: !!data.salary.direct_deposit,
            accountNumber: data.salary.account_number || "",
            accountType: data.salary.account_type || "",
            routingNumber: data.salary.routing_number || "",
            depositAmount: data.salary.deposit_amount || ""
          }));
        }
      })
      .catch(err => console.error('Error fetching salary details:', err));
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
    
    const hrmPayload: any = {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      employee_code: employeeId,
      dob,
      gender,
      marital_status: maritalStatus,
      nationality,
      profile_img: profileImg,
      username: createLogin ? username : undefined,
      password: createLogin ? password : undefined,
      status: createLogin ? status : undefined
    };
    
    try {
      let hrmRes, hrmData, res, data;
      if (isEdit) {
        hrmRes = await fetch('/api/hrm_employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hrmPayload) });
        hrmData = await hrmRes.json();
        if (!hrmData.success) {
          alert('Update failed: ' + (hrmData.error || 'Unknown'));
          return;
        }
        setEmployeeId(editEmployeeId);
        res = await fetch('/api/employee', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        data = await res.json();
        alert('Employee updated.');
      } else {
        hrmRes = await fetch('/api/hrm_employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hrmPayload) });
        hrmData = await hrmRes.json();
        if (!hrmData.success || !hrmData.id) {
          alert('Save failed: ' + (hrmData.error || 'Unknown'));
          return;
        }
        setEmployeeId(hrmData.id);
        res = await fetch('/api/employee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        data = await res.json();
        alert('Employee saved.');
      }
      setActiveTab('Contact Details');
    } catch (err) {
      alert('Save failed: ' + String(err));
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "60vh", background: "#F7FAFC" }}>
      {/* Employee Sidebar */}
      <aside className={styles.sidebar}>
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
      {/* Main Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div className={styles.formCard}>
          <h2 className={styles.heading}>{isEdit ? 'Edit Employee' : 'Add Employee'}</h2>
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
                <input className={styles.input} type="text" placeholder="Middle Name" value={middleName} onChange={e => setMiddleName(e.target.value)} />
                <input className={styles.input} type="text" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
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
                <div style={{ fontWeight: 600, fontSize: "1.1rem", margin: "18px 0 10px 0" }}>Telephone</div>
                <div className={styles.row}>
                  <input className={styles.input} type="text" placeholder="Home" value={contactTelephone.home} onChange={e => setContactTelephone(t => ({ ...t, home: e.target.value }))} />
                  <input className={styles.input} type="text" placeholder="Mobile" value={contactTelephone.mobile} onChange={e => setContactTelephone(t => ({ ...t, mobile: e.target.value }))} required />
                  <input className={styles.input} type="text" placeholder="Work" value={contactTelephone.work} onChange={e => setContactTelephone(t => ({ ...t, work: e.target.value }))} />
                </div>
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
          {activeTab === "Job" && (
            <div>
              <h2 className={styles.heading}>Job Details</h2>
              {employeeId && (
                <div style={{fontWeight:600, color:'#0052CC', marginBottom:8}}>
                  Employee: {firstName} {lastName} (ID: {employeeId})
                </div>
              )}
              <form className={styles.form} style={{ width: "100%" }} onSubmit={handleJobSave}>
                <div className={styles.row}>
                  <input className={styles.input} type="date" placeholder="Joined Date" value={jobDetails.joinedDate} onChange={e => setJobDetails(j => ({ ...j, joinedDate: e.target.value }))} />
                  <select className={styles.select} value={jobDetails.jobTitle} onChange={e => setJobDetails(j => ({ ...j, jobTitle: e.target.value }))}>
                    <option value="">-- Select Job Title --</option>
                    <option value="Software Engineer">Software Engineer</option>
                    <option value="HR Manager">HR Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Other">Other</option>
                  </select>
                  <input className={styles.input} type="text" placeholder="Job Specification" value={jobDetails.jobSpecification} onChange={e => setJobDetails(j => ({ ...j, jobSpecification: e.target.value }))} />
                </div>
                <div className={styles.row}>
                  <select className={styles.select} value={jobDetails.jobCategory} onChange={e => setJobDetails(j => ({ ...j, jobCategory: e.target.value }))}>
                    <option value="">-- Select Job Category --</option>
                    <option value="IT">IT</option>
                    <option value="HR">HR</option>
                    <option value="Finance">Finance</option>
                    <option value="Other">Other</option>
                  </select>
                  <select className={styles.select} value={jobDetails.subUnit} onChange={e => setJobDetails(j => ({ ...j, subUnit: e.target.value }))}>
                    <option value="">-- Select Sub Unit --</option>
                    <option value="Development">Development</option>
                    <option value="Recruitment">Recruitment</option>
                    <option value="Accounts">Accounts</option>
                    <option value="Other">Other</option>
                  </select>
                  <select className={styles.select} value={jobDetails.location} onChange={e => setJobDetails(j => ({ ...j, location: e.target.value }))}>
                    <option value="">-- Select Location --</option>
                    <option value="Lahore">Lahore</option>
                    <option value="Karachi">Karachi</option>
                    <option value="Islamabad">Islamabad</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className={styles.row}>
                  <select className={styles.select} value={jobDetails.employmentStatus} onChange={e => setJobDetails(j => ({ ...j, employmentStatus: e.target.value }))}>
                    <option value="">-- Select Employment Status --</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                  <button type="submit" style={{ background: "#8BC34A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 32px", fontWeight: 600, fontSize: "1.08rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,82,204,0.10)" }}>Save</button>
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
          <div className={styles.note}>* Required</div>
        </div>
      </div>
    </div>
  );
}
