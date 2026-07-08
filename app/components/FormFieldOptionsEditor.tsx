"use client";

import React from "react";
import { ensureOptionRows } from "@/lib/form-field-options";
import styles from "../admin/employee-files/employee-files.module.css";

type Props = {
  options: string[];
  onChange: (options: string[]) => void;
  minRows?: number;
  placeholder?: string;
  hint?: string;
};

export function FormFieldOptionsEditor({
  options,
  onChange,
  minRows = 2,
  placeholder = "Option label",
  hint,
}: Props) {
  const rows = ensureOptionRows(options, minRows);

  function updateRow(index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  function removeRow(index: number) {
    if (rows.length <= minRows) {
      const next = [...rows];
      next[index] = "";
      onChange(next);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.optionEditor}>
      {hint ? <p className={styles.optionEditorHint}>{hint}</p> : null}
      {rows.map((opt, index) => (
        <div key={index} className={styles.optionEditorRow}>
          <span className={styles.optionEditorNum}>{index + 1}.</span>
          <input
            className={styles.input}
            placeholder={`${placeholder} ${index + 1}`}
            value={opt}
            onChange={(e) => updateRow(index, e.target.value)}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => removeRow(index)}
            aria-label="Remove option"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className={styles.btn} onClick={addRow}>
        + Add option
      </button>
    </div>
  );
}
