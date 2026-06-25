"use client";

import React from "react";
import styles from "./system-control-demo.module.css";
import type { RoleDef } from "./system-control-data";
import { isSystemRole, scopeLabelFromScope } from "./system-control-data";

type Props = {
  open: boolean;
  onClose: () => void;
  allRoles: RoleDef[];
  name: string;
  onNameChange: (v: string) => void;
  cloneFrom: string;
  onCloneFromChange: (id: string) => void;
  portal: string;
  onPortalChange: (v: string) => void;
  scope: string;
  onScopeChange: (v: string) => void;
  onCreate: () => void;
};

export default function NewRoleModal({
  open,
  onClose,
  allRoles,
  name,
  onNameChange,
  cloneFrom,
  onCloneFromChange,
  portal,
  onPortalChange,
  scope,
  onScopeChange,
  onCreate,
}: Props) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-labelledby="new-role-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-role-title" className={styles.modalTitle}>
          Create new role
        </h2>
        <p className={styles.modalSub}>
          Clone permissions from an existing role, then set portal and data scope.
        </p>

        <div className={styles.fieldGrid}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label>Role display name</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Night Shift Manager"
              autoFocus
            />
          </div>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label>Clone permissions from</label>
            <select value={cloneFrom} onChange={(e) => onCloneFromChange(e.target.value)}>
              {allRoles.filter((r) => !isSystemRole(r.id)).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Portal / dashboard</label>
            <select value={portal} onChange={(e) => onPortalChange(e.target.value)}>
              <option value="admin-dashboard">Admin dashboard</option>
              <option value="leader-dashboard">Team Lead dashboard</option>
              <option value="employee-dashboard">Employee dashboard</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Data scope</label>
            <select value={scope} onChange={(e) => onScopeChange(e.target.value)}>
              <option value="ALL">ALL company</option>
              <option value="DEPARTMENT">DEPARTMENT</option>
              <option value="TEAM">TEAM</option>
              <option value="SELF">SELF</option>
            </select>
          </div>
        </div>

        <div className={styles.previewChipBox}>
          <span className={styles.previewChip}>Portal: {portal}</span>
          <span className={styles.previewChip}>Scope: {scopeLabelFromScope(scope)}</span>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.btnSolidPurple} onClick={onCreate}>
            Create role
          </button>
        </div>
      </div>
    </div>
  );
}
