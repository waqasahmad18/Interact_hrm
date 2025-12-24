"use client";
import { useEffect, useState } from "react";
import styles from "./my-info.module.css";

export default function MyInfoPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Get employee ID from session/localStorage
    const employeeId = localStorage.getItem("employeeId") || sessionStorage.getItem("employeeId");
    
    if (!employeeId) {
      setError("Employee ID not found. Please login again.");
      setLoading(false);
      return;
    }

    fetch(`/api/my-info?employeeId=${employeeId}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || "Failed to fetch data");
        }
        setLoading(false);
      })
      .catch(err => {
        setError("Failed to fetch data: " + String(err));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading your information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Information</h1>
        <p className={styles.subtitle}>Your personal and contact details</p>
      </div>

      <div className={styles.card}>
        {/* Shift Timing Section */}
        {/* First Line: Employee ID & Pseudonym */}
        <div className={styles.topRow}>
          <div className={styles.badge}>
            <span className={styles.badgeLabel}>Employee ID</span>
            <span className={styles.badgeValue}>{data?.employee_id || 'N/A'}</span>
          </div>
          {data?.pseudonym && (
            <div className={styles.badge}>
              <span className={styles.badgeLabel}>Pseudonym</span>
              <span className={styles.badgeValue}>{data.pseudonym}</span>
            </div>
          )}
        </div>

        {/* Personal Information Section */}
        <div className={styles.section}>
           <h2 className={styles.sectionTitle}>Personal Information</h2>
           <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label}>Full Name</label>
              <div className={styles.value}>{`${data?.first_name || ''} ${data?.last_name || ''}`}</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>CNIC Number</label>
              <div className={styles.value}>{data?.cnic_number || 'Not Provided'}</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>CNIC Address</label>
              <div className={styles.value}>{data?.cnic_address || 'Not Provided'}</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Shift Timing</label>
              <div className={styles.value}>{data?.shift_timing || 'Not Assigned'}</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Working Days</label>
              <div className={styles.value}>Monday to Friday</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Employment Status</label>
              <div className={`${styles.value} ${styles.status}`}>
                <span className={data?.employment_status === 'Permanent' ? styles.permanent : styles.probation}>
                  {data?.employment_status || 'Not Set'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact Information</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label}>Work Email</label>
              <div className={styles.value}>
                {data?.email_work ? (
                  <a href={`mailto:${data.email_work}`} className={styles.link}>
                    {data.email_work}
                  </a>
                ) : (
                  'Not Provided'
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Other Email</label>
              <div className={styles.value}>
                {data?.email_other ? (
                  <a href={`mailto:${data.email_other}`} className={styles.link}>
                    {data.email_other}
                  </a>
                ) : (
                  'Not Provided'
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Phone Number</label>
              <div className={styles.value}>
                {data?.phone_mobile ? (
                  <a href={`tel:${data.phone_mobile}`} className={styles.link}>
                    {data.phone_mobile}
                  </a>
                ) : (
                  'Not Provided'
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
