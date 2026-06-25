"use client";

import React from "react";
import styles from "./system-control-demo.module.css";
import type { RoleDef } from "./system-control-data";

type Props = {
  sessionTimeout: string;
  onSessionTimeoutChange: (v: string) => void;
  defaultRole: string;
  onDefaultRoleChange: (v: string) => void;
  twoStepLeave: boolean;
  onTwoStepLeaveChange: (v: boolean) => void;
  systemControlRoles: string[];
  onSystemControlRolesChange: (ids: string[]) => void;
  allRoles: RoleDef[];
  onSave: () => void;
};

export default function SettingsTab({
  sessionTimeout,
  onSessionTimeoutChange,
  defaultRole,
  onDefaultRoleChange,
  twoStepLeave,
  onTwoStepLeaveChange,
  systemControlRoles,
  onSystemControlRolesChange,
  allRoles,
  onSave,
}: Props) {
  const assignable = allRoles.filter((r) => !r.system || r.id === "super_admin");

  function toggleControlRole(roleId: string) {
    if (systemControlRoles.includes(roleId)) {
      onSystemControlRolesChange(systemControlRoles.filter((id) => id !== roleId));
    } else {
      onSystemControlRolesChange([...systemControlRoles, roleId]);
    }
  }

  return (
    <div className={styles.panelBody}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>System settings</h2>
          <p className={styles.sectionSub}>
            Defaults and workflow options applied organization-wide.
          </p>
        </div>
        <button type="button" className={styles.btnSolidPurple} onClick={onSave}>
          Save settings
        </button>
      </div>

      <div className={styles.settingsGrid}>
        <div className={styles.settingCard}>
          <label className={styles.settingLabel}>Session timeout (minutes)</label>
          <p className={styles.settingHint}>Auto logout after inactivity</p>
          <input
            type="number"
            className={styles.settingInput}
            value={sessionTimeout}
            onChange={(e) => onSessionTimeoutChange(e.target.value)}
          />
        </div>

        <div className={styles.settingCard}>
          <label className={styles.settingLabel}>Default role for new employees</label>
          <p className={styles.settingHint}>Applied when HR adds a new record</p>
          <select
            className={styles.settingInput}
            value={defaultRole}
            onChange={(e) => onDefaultRoleChange(e.target.value)}
          >
            {allRoles.filter((r) => !r.system).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.settingCard}>
          <label className={styles.settingLabel}>Leave approval workflow</label>
          <p className={styles.settingHint}>How leave requests are approved</p>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="leaveFlow"
              checked={!twoStepLeave}
              onChange={() => onTwoStepLeaveChange(false)}
            />
            Single approver (HR only)
          </label>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="leaveFlow"
              checked={twoStepLeave}
              onChange={() => onTwoStepLeaveChange(true)}
            />
            Manager first, then HR final
          </label>
        </div>

        <div className={styles.settingCardWide}>
          <label className={styles.settingLabel}>Who can open System Control</label>
          <p className={styles.settingHint}>Roles allowed to access this admin area</p>
          <div className={styles.checkboxGrid}>
            {assignable.map((r) => (
              <label key={r.id} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={systemControlRoles.includes(r.id)}
                  onChange={() => toggleControlRole(r.id)}
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.infoBanner}>
        <strong>Runtime at login:</strong> Employee → GET /api/access-control/me → portal routes to
        admin-dashboard, leader-dashboard, or employee-dashboard. Sidebar menu is built from saved
        permissions.
      </div>
    </div>
  );
}
