"use client";

import React, { useMemo, useState } from "react";
import styles from "./system-control-demo.module.css";
import { childRoles, type RoleDef } from "./system-control-data";

type Props = {
  allRoles: RoleDef[];
  customRoles: RoleDef[];
  employeeCountByRole: (roleId: string) => number;
  permCountByRole: (roleId: string) => number;
  totalPermCount: number;
  onReparent: (childId: string, newParentId: string | null) => void;
  onAddChild: (parentId: string) => void;
  onRename: (roleId: string, name: string) => void;
  onDelete: (roleId: string) => void;
  onManage: (roleId: string) => void;
  onUpdateLevel: (roleId: string, level: number) => void;
  isRoleLocked: (roleId: string) => boolean;
  isCustomRole: (roleId: string) => boolean;
};

function accentOf(role: RoleDef | undefined) {
  return role?.accent || "#9333ea";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── inline icons (kept tiny so cards stay compact) ─────────────── */
function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function IconEye({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function OrgChartTab({
  allRoles,
  customRoles,
  employeeCountByRole,
  permCountByRole,
  totalPermCount,
  onReparent,
  onAddChild,
  onRename,
  onDelete,
  onManage,
  onUpdateLevel,
  isRoleLocked,
  isCustomRole,
}: Props) {
  const roots = useMemo(() => childRoles(allRoles, null), [allRoles]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Click-and-drag panning of the empty canvas surface (replaces scrollbars).
  const panRef = React.useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  // ids whose subtree (direct reports) is hidden/collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // role currently open in the centered edit modal
  const [editId, setEditId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string>("");
  const [levelDraft, setLevelDraft] = useState<string>("");

  const canvasRef = React.useRef<HTMLDivElement>(null);
  const treeRef = React.useRef<HTMLDivElement>(null);
  // Load at 30% so the whole chart is visible on refresh; user can zoom in,
  // pan, or use the scrollbars from there.
  const [zoom, setZoom] = useState(0.3);
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 1.4;
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  // Compute the zoom that makes the whole tree fit inside the canvas.
  const fitToScreen = React.useCallback(() => {
    const canvas = canvasRef.current;
    const tree = treeRef.current;
    if (!canvas || !tree) return;
    const cw = canvas.clientWidth - 44;
    const ch = canvas.clientHeight - 44;
    const rect = tree.getBoundingClientRect();
    // getBoundingClientRect already includes the current zoom, so undo it.
    const tw = rect.width / zoomRef.current;
    const th = rect.height / zoomRef.current;
    if (tw <= 0 || th <= 0) return;
    setZoom(clampZoom(Math.min(cw / tw, ch / th)));
    canvas.scrollTo({ left: 0, top: 0 });
  }, []);

  const zoomIn = () => setZoom((z) => clampZoom(z + 0.1));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.1));
  const resetZoom = () => {
    setZoom(1);
    canvasRef.current?.scrollTo({ left: 0, top: 0 });
  };

  const editing = editId ? allRoles.find((r) => r.id === editId) ?? null : null;

  React.useEffect(() => {
    if (editing) {
      setNameDraft(editing.name);
      setLevelDraft(String(editing.hierarchyLevel));
    }
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDrop(targetId: string) {
    if (dragId && dragId !== targetId) onReparent(dragId, targetId);
    setDragId(null);
    setDropTargetId(null);
  }

  // Pan starts only on the empty surface, never on a card (so card drag-to-
  // reparent keeps working).
  function startPan(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-orgcard]")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      sl: canvas.scrollLeft,
      st: canvas.scrollTop,
    };
    setIsPanning(true);
  }

  React.useEffect(() => {
    if (!isPanning) return;
    function move(e: MouseEvent) {
      const canvas = canvasRef.current;
      const p = panRef.current;
      if (!canvas || !p) return;
      canvas.scrollLeft = p.sl - (e.clientX - p.x);
      canvas.scrollTop = p.st - (e.clientY - p.y);
    }
    function up() {
      setIsPanning(false);
      panRef.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [isPanning]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function descendantCount(roleId: string): number {
    const kids = childRoles(allRoles, roleId);
    return kids.reduce((n, k) => n + 1 + descendantCount(k.id), 0);
  }

  function commitEdit() {
    if (!editing) return;
    const name = nameDraft.trim();
    if (name && name !== editing.name) onRename(editing.id, name);
    const lvl = parseInt(levelDraft, 10);
    if (!Number.isNaN(lvl) && lvl !== editing.hierarchyLevel) {
      onUpdateLevel(editing.id, lvl);
    }
    setEditId(null);
  }

  function renderNode(role: RoleDef): React.ReactNode {
    const kids = childRoles(allRoles, role.id);
    const accent = accentOf(role);
    const locked = isRoleLocked(role.id);
    const isDropping = dropTargetId === role.id && dragId !== role.id;
    const isDragging = dragId === role.id;
    const isCollapsed = collapsed.has(role.id);
    const hiddenCount = isCollapsed ? descendantCount(role.id) : 0;
    const users = employeeCountByRole(role.id);
    const perms = permCountByRole(role.id);
    const permPct = totalPermCount ? Math.round((perms / totalPermCount) * 100) : 0;
    const tierLabel = role.tier ? role.tier.toUpperCase() : "ROLE";

    return (
      <li key={role.id} className={styles.orgItem}>
        <div
          data-orgcard=""
          className={[
            styles.orgCard,
            isDropping ? styles.orgCardDrop : "",
            isDragging ? styles.orgCardDragging : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--accent": accent,
            } as React.CSSProperties
          }
          draggable={!locked}
          onDragStart={(e) => {
            if (locked) {
              e.preventDefault();
              return;
            }
            setDragId(role.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTargetId(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === role.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dropTargetId !== role.id) setDropTargetId(role.id);
          }}
          onDragLeave={() => {
            if (dropTargetId === role.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(role.id);
          }}
        >
          {/* coloured header band: avatar + name + actions inline */}
          <div
            className={styles.orgCardBand}
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
            }}
          >
            <span className={styles.orgCardAvatar}>{initials(role.name)}</span>
            <span className={styles.orgCardBandText}>
              <span className={styles.orgCardName}>{role.name}</span>
              <span className={styles.orgCardTier}>{tierLabel}</span>
            </span>
          </div>

          <div className={styles.orgCardBody}>
            <div className={styles.orgCardTags}>
              {role.system && <span className={styles.badgeSystem}>System</span>}
              {isCustomRole(role.id) && (
                <span className={styles.tagCustom}>Custom</span>
              )}
              <span className={styles.orgCardScope}>{role.scopeLabel}</span>
            </div>

            <div className={styles.orgCardMeta}>
              <span className={styles.orgCardUsers} title="Employees with this role">
                <span
                  className={styles.orgCardUserDot}
                  style={{ background: accent }}
                />
                {users} {users === 1 ? "user" : "users"}
              </span>
              <span title="Granted permissions">
                {perms}/{totalPermCount}
              </span>
            </div>

            <div className={styles.orgCardPermBar} title={`${permPct}% access`}>
              <span
                className={styles.orgCardPermFill}
                style={{ width: `${permPct}%`, background: accent }}
              />
            </div>

            <div className={styles.orgCardActions}>
              <button
                type="button"
                className={styles.orgCardBtn}
                title="Edit role"
                aria-label={`Edit ${role.name}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditId(role.id);
                }}
              >
                <IconEdit />
              </button>
              <button
                type="button"
                className={styles.orgCardBtn}
                title={locked ? "This role cannot be deleted" : "Delete role"}
                aria-label={`Delete ${role.name}`}
                disabled={locked}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(role.id);
                }}
              >
                <IconTrash />
              </button>
              <button
                type="button"
                className={`${styles.orgCardBtn} ${isCollapsed ? styles.orgCardBtnOn : ""}`}
                title={
                  kids.length === 0
                    ? "No reports to hide"
                    : isCollapsed
                      ? "Show reports"
                      : "Hide reports"
                }
                aria-label={`${isCollapsed ? "Show" : "Hide"} reports of ${role.name}`}
                disabled={kids.length === 0}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(role.id);
                }}
              >
                <IconEye off={isCollapsed} />
              </button>
            </div>

            {isCollapsed && hiddenCount > 0 && (
              <button
                type="button"
                className={styles.orgCollapseBadge}
                title="Show hidden reports"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(role.id);
                }}
              >
                +{hiddenCount} hidden
              </button>
            )}
          </div>
        </div>

        {kids.length > 0 && !isCollapsed && (
          <ul className={styles.orgList}>{kids.map((kid) => renderNode(kid))}</ul>
        )}
      </li>
    );
  }

  return (
    <div className={styles.orgWrap}>
      <div className={styles.orgHintBar}>
        <strong>Drag</strong> any card onto another to change who it reports to —
        the hierarchy and permissions update live. Use the
        <strong> edit</strong>, <strong>delete</strong>, and <strong>hide</strong>{" "}
        buttons on each card to manage it.
      </div>

      <div className={styles.orgCanvasWrap}>
        <div className={styles.orgZoomBar}>
          <button
            type="button"
            className={styles.orgZoomBtn}
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM + 0.001}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className={styles.orgZoomValue}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className={styles.orgZoomBtn}
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM - 0.001}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className={styles.orgZoomDivider} />
          <button
            type="button"
            className={styles.orgZoomText}
            onClick={fitToScreen}
            title="Fit whole chart in view"
          >
            Fit
          </button>
          <button
            type="button"
            className={styles.orgZoomText}
            onClick={resetZoom}
            title="Reset to 100%"
          >
            100%
          </button>
        </div>

        <div
          className={`${styles.orgCanvas} ${isPanning ? styles.orgCanvasPanning : ""}`}
          ref={canvasRef}
          onMouseDown={startPan}
        >
          <div
            className={styles.orgTree}
            ref={treeRef}
            style={{ zoom } as React.CSSProperties}
          >
            {roots.length > 0 ? (
              <ul className={styles.orgList}>{roots.map((r) => renderNode(r))}</ul>
            ) : (
              <p className={styles.orgEmpty}>No roles yet.</p>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setEditId(null)}
        >
          <div
            className={styles.orgEditModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="org-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={styles.orgEditHead}
              style={{ borderTopColor: accentOf(editing) }}
            >
              <span
                className={styles.orgCardAvatar}
                style={{
                  background: `${accentOf(editing)}1a`,
                  color: accentOf(editing),
                }}
              >
                {initials(editing.name)}
              </span>
              <div className={styles.orgEditHeadText}>
                <div id="org-edit-title" className={styles.orgPanelTitle}>
                  {editing.name}
                </div>
                <div className={styles.orgCardSlug}>{editing.id}</div>
              </div>
              <button
                type="button"
                className={styles.orgEditClose}
                aria-label="Close"
                onClick={() => setEditId(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.orgEditBody}>
              <label className={styles.orgPanelLabel}>Role name</label>
              <input
                className={styles.orgPanelInput}
                value={nameDraft}
                disabled={isRoleLocked(editing.id)}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                }}
              />

              <label className={styles.orgPanelLabel}>
                Hierarchy level (lower = higher rank)
              </label>
              <input
                type="number"
                min={1}
                className={styles.orgPanelInput}
                value={levelDraft}
                disabled={isRoleLocked(editing.id)}
                onChange={(e) => setLevelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                }}
              />

              <div className={styles.orgPanelChips}>
                <span className={styles.roleChip}>{editing.portal}</span>
                <span className={styles.roleChip}>Scope: {editing.scopeLabel}</span>
              </div>

              <div className={styles.orgPanelStats}>
                <div>
                  <span className={styles.orgPanelStatValue}>
                    {employeeCountByRole(editing.id)}
                  </span>
                  <span className={styles.orgPanelStatLabel}>Users</span>
                </div>
                <div>
                  <span className={styles.orgPanelStatValue}>
                    {permCountByRole(editing.id)}/{totalPermCount}
                  </span>
                  <span className={styles.orgPanelStatLabel}>Permissions</span>
                </div>
              </div>

              <div className={styles.orgEditActions}>
                <button
                  type="button"
                  className={styles.btnSolidPurple}
                  onClick={() => {
                    onAddChild(editing.id);
                    setEditId(null);
                  }}
                >
                  + Add role under this
                </button>
                <button
                  type="button"
                  className={styles.btnOutlinePurple}
                  onClick={() => {
                    onManage(editing.id);
                    setEditId(null);
                  }}
                >
                  Manage permissions
                </button>
                <button
                  type="button"
                  className={styles.btnDangerSoft}
                  disabled={isRoleLocked(editing.id)}
                  title={
                    isRoleLocked(editing.id)
                      ? "Core system role cannot be deleted"
                      : "Delete role"
                  }
                  onClick={() => {
                    const id = editing.id;
                    setEditId(null);
                    onDelete(id);
                  }}
                >
                  Delete role
                </button>
              </div>

              <p className={styles.orgPanelNote}>
                Deleting a role moves its direct reports up to its parent.
                Renames, levels, and permissions sync live to the other tabs.
              </p>
            </div>

            <div className={styles.orgEditFooter}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setEditId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnSolidPurple}
                disabled={isRoleLocked(editing.id)}
                onClick={commitEdit}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
