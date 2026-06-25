"use client";

import React, { useMemo, useState } from "react";
import styles from "./system-control-demo.module.css";
import type { DemoEmployee, RoleDef } from "./system-control-data";
import { DEPARTMENTS, deptNameById, empNameById, roleMeta } from "./system-control-data";

type Props = {
  employees: DemoEmployee[];
  allRoles: RoleDef[];
  customRoles: RoleDef[];
  onSaveEmployee: (id: string, roleId: string) => void;
  onBulkAssign: (ids: string[], roleId: string) => void;
};

export default function AssignUsersTab({
  employees,
  allRoles,
  customRoles,
  onSaveEmployee,
  onBulkAssign,
}: Props) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState("officer");
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});

  const assignableRoles = allRoles.filter((r) => !r.system);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (deptFilter !== "all" && e.departmentId !== deptFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.id.includes(q) ||
        roleMeta(e.roleId, allRoles).name.toLowerCase().includes(q)
      );
    });
  }, [employees, search, deptFilter, allRoles]);

  function getDraftRole(emp: DemoEmployee) {
    return draftRoles[emp.id] ?? emp.roleId;
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  }

  return (
    <div className={styles.assignShell}>
      <div className={styles.assignToolbar}>
        <div className={styles.assignFilters}>
          <select
            className={styles.inlineSelect}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className={styles.searchInput}
            placeholder="Search name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.assignBulk}>
          <select
            className={styles.inlineSelect}
            value={bulkRole}
            onChange={(e) => setBulkRole(e.target.value)}
          >
            {assignableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.btnSolidPurple}
            disabled={selected.size === 0}
            onClick={() => {
              onBulkAssign([...selected], bulkRole);
              setSelected(new Set());
              setDraftRoles({});
            }}
          >
            Apply to selected ({selected.size})
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th>Emp ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Reports to</th>
              <th>Role</th>
              <th className={styles.colAction}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => {
              const draft = getDraftRole(emp);
              const changed = draft !== emp.roleId;
              return (
                <tr key={emp.id} className={changed ? styles.rowChanged : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(emp.id)}
                      onChange={() => toggleRow(emp.id)}
                      aria-label={`Select ${emp.name}`}
                    />
                  </td>
                  <td className={styles.monoCell}>{emp.id}</td>
                  <td>
                    <div className={styles.tableNameCell}>
                      <span className={styles.tableAvatar}>{emp.initials}</span>
                      {emp.name}
                    </div>
                  </td>
                  <td>{deptNameById(emp.departmentId)}</td>
                  <td className={styles.mutedCell}>
                    {emp.reportsTo ? empNameById(employees, emp.reportsTo) : "— Top level —"}
                  </td>
                  <td>
                    <select
                      className={styles.tableSelect}
                      value={draft}
                      onChange={(e) =>
                        setDraftRoles((prev) => ({ ...prev, [emp.id]: e.target.value }))
                      }
                    >
                      {assignableRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {customRoles.some((c) => c.id === r.id) ? " (custom)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnTableSave}
                      disabled={!changed}
                      onClick={() => {
                        onSaveEmployee(emp.id, draft);
                        setDraftRoles((prev) => {
                          const next = { ...prev };
                          delete next[emp.id];
                          return next;
                        });
                      }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.assignFooter}>
        Changing role updates portal and menu on next login. Use the Roles tab to configure what
        each role can access.
      </p>
    </div>
  );
}
