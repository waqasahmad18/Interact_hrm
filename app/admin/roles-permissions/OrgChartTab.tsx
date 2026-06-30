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
  onInsertAbove: (draggedId: string, targetId: string) => void;
  onMakeSibling: (draggedId: string, targetId: string) => void;
  onResetChart: () => void;
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

function tierCardClass(tier: RoleDef["tier"] | undefined, styles: Record<string, string>) {
  const map: Record<string, string> = {
    board: styles.orgCardTierBoard,
    partner: styles.orgCardTierPartner,
    director: styles.orgCardTierDirector,
    manager: styles.orgCardTierManager,
    lead: styles.orgCardTierLead,
    staff: styles.orgCardTierStaff,
    support: styles.orgCardTierSupport,
    junior: styles.orgCardTierJunior,
  };
  return tier ? map[tier] || "" : "";
}

/** "Managing Partner — IT & Technology" → "IT & Technology" for dept box headers */
function deptBoxLabel(name: string): string {
  const dash = name.indexOf("—");
  if (dash >= 0) return name.slice(dash + 1).trim();
  return name;
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
  onInsertAbove,
  onMakeSibling,
  onResetChart,
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
  // Drop intent based on cursor position over the target card:
  //  "above"   → dragged role becomes the target's manager
  //  "sibling" → dragged role becomes a parallel sibling
  //  "child"   → dragged role reports to the target
  type DropMode = "child" | "above" | "sibling";
  type DropEdge = "top" | "bottom" | "left" | "right";
  const [dropMode, setDropMode] = useState<DropMode>("child");
  const [siblingSide, setSiblingSide] = useState<"left" | "right">("right");
  // Which edge of the target the cursor is nearest — drives the joint symbol.
  const [dropEdge, setDropEdge] = useState<DropEdge>("bottom");
  // Mirror drag state in refs so handlers read the CURRENT value synchronously;
  // React state is async/batched and the first dragover could otherwise skip
  // preventDefault and silently block the drop.
  const dragIdRef = React.useRef<string | null>(null);
  const dropModeRef = React.useRef<DropMode>("child");
  // Click-and-drag panning of the empty canvas surface (replaces scrollbars).
  const panRef = React.useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  // Role ids whose card is hidden — their direct reports visually attach to the
  // hidden role's parent (only the card disappears, not the subtree).
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
    const sourceId = dragIdRef.current ?? dragId;
    if (sourceId && sourceId !== targetId) {
      const mode = dropModeRef.current;
      if (mode === "above") onInsertAbove(sourceId, targetId);
      else if (mode === "sibling") onMakeSibling(sourceId, targetId);
      else onReparent(sourceId, targetId);
    }
    dragIdRef.current = null;
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

  /** Direct children promoted up through any hidden intermediate roles. */
  function visibleKids(roleId: string): RoleDef[] {
    const out: RoleDef[] = [];
    for (const child of childRoles(allRoles, roleId)) {
      if (collapsed.has(child.id)) {
        out.push(...visibleKids(child.id));
      } else {
        out.push(child);
      }
    }
    return out;
  }

  function hiddenDirectKids(roleId: string): RoleDef[] {
    return childRoles(allRoles, roleId).filter((c) => collapsed.has(c.id));
  }

  function renderChildList(parentId: string): React.ReactNode {
    const hidden = hiddenDirectKids(parentId);
    const visible = visibleKids(parentId);
    if (hidden.length === 0 && visible.length === 0) return null;
    return (
      <>
        {hidden.length > 0 && (
          <div className={styles.orgHiddenRestoreBar}>
            {hidden.map((h) => (
              <button
                key={h.id}
                type="button"
                className={styles.orgHiddenRestoreBtn}
                onClick={() => toggleCollapse(h.id)}
              >
                Show: {h.name}
              </button>
            ))}
          </div>
        )}
        {visible.length > 0 && (
          <ul className={styles.orgList}>
            {visible.map((kid) => renderNode(kid))}
          </ul>
        )}
      </>
    );
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
    if (collapsed.has(role.id)) return null;

    const kids = childRoles(allRoles, role.id);
    const accent = accentOf(role);
    const locked = isRoleLocked(role.id);
    const isDropping = dropTargetId === role.id && dragId !== role.id;
    const isDroppingAbove = isDropping && dropMode === "above";
    const isDroppingChild = isDropping && dropMode === "child";
    const isDroppingSibling = isDropping && dropMode === "sibling";
    const isDragging = dragId === role.id;
    const tierClass = tierCardClass(role.tier, styles);

    return (
      <li key={role.id} className={styles.orgItem}>
        <div
          data-orgcard=""
          className={[
            styles.orgCard,
            tierClass,
            isDroppingChild ? styles.orgCardDrop : "",
            isDroppingAbove ? styles.orgCardDropAbove : "",
            isDroppingSibling ? styles.orgCardDropSibling : "",
            isDroppingSibling && siblingSide === "left"
              ? styles.orgCardDropSiblingLeft
              : "",
            isDroppingSibling && siblingSide === "right"
              ? styles.orgCardDropSiblingRight
              : "",
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
            dragIdRef.current = role.id;
            setDragId(role.id);
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", role.id);
            } catch {
              /* ignore */
            }
          }}
          onDragEnd={() => {
            dragIdRef.current = null;
            setDragId(null);
            setDropTargetId(null);
          }}
          onDragOver={(e) => {
            const source = dragIdRef.current;
            if (!source || source === role.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            // Pick the NEAREST edge to whichever side the cursor came in from:
            //  top → ABOVE (manager), bottom → CHILD (reports),
            //  left/right → SIBLING (parallel, same manager).
            const rect = e.currentTarget.getBoundingClientRect();
            const yRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
            const xRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
            const dTop = yRatio;
            const dBottom = 1 - yRatio;
            const dLeft = xRatio;
            const dRight = 1 - xRatio;
            const nearest = Math.min(dTop, dBottom, dLeft, dRight);
            let edge: DropEdge;
            let mode: DropMode;
            if (nearest === dLeft) {
              edge = "left";
              mode = "sibling";
              if (siblingSide !== "left") setSiblingSide("left");
            } else if (nearest === dRight) {
              edge = "right";
              mode = "sibling";
              if (siblingSide !== "right") setSiblingSide("right");
            } else if (nearest === dTop) {
              edge = "top";
              mode = "above";
            } else {
              edge = "bottom";
              mode = "child";
            }
            dropModeRef.current = mode;
            if (dropTargetId !== role.id) setDropTargetId(role.id);
            if (dropMode !== mode) setDropMode(mode);
            if (dropEdge !== edge) setDropEdge(edge);
          }}
          onDragLeave={() => {
            if (dropTargetId === role.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(role.id);
          }}
        >
          {isDropping && (
            <>
              <span
                className={`${styles.orgJoint} ${
                  dropEdge === "top"
                    ? styles.orgJointTop
                    : dropEdge === "bottom"
                      ? styles.orgJointBottom
                      : dropEdge === "left"
                        ? styles.orgJointLeft
                        : styles.orgJointRight
                }`}
                aria-hidden
              >
                <span className={styles.orgJointDot} />
              </span>
              <span
                className={`${styles.orgJointLabel} ${
                  dropEdge === "top"
                    ? styles.orgJointLabelTop
                    : dropEdge === "bottom"
                      ? styles.orgJointLabelBottom
                      : dropEdge === "left"
                        ? styles.orgJointLabelLeft
                        : styles.orgJointLabelRight
                }`}
              >
                {dropEdge === "top"
                  ? "↑ Becomes manager"
                  : dropEdge === "bottom"
                    ? "↓ Reports here"
                    : "↔ Parallel role"}
              </span>
            </>
          )}

          <div className={styles.orgCardLabel}>{role.name}</div>

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
              className={styles.orgCardBtn}
              title="Hide this role — direct reports move up to the manager above"
              aria-label={`Hide ${role.name}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(role.id);
              }}
            >
              <IconEye off={false} />
            </button>
          </div>
        </div>

        {kids.length > 0 &&
          (role.tier === "board" ? (
            <div className={styles.orgDeptRow}>
              {kids.map((kid) => (
                <div key={kid.id} className={styles.orgDeptBox}>
                  <div className={styles.orgDeptBoxTitle}>{deptBoxLabel(kid.name)}</div>
                  <ul className={styles.orgList}>{renderNode(kid)}</ul>
                </div>
              ))}
            </div>
          ) : (
            renderChildList(role.id)
          ))}
      </li>
    );
  }

  return (
    <div className={styles.orgWrap}>
      <div className={styles.orgHintBar}>
        <strong>Drag</strong> a card onto another and aim at an edge — drop near
        the <strong>top</strong> to make it the manager, the{" "}
        <strong>bottom</strong> to make it report, or the{" "}
        <strong>left/right</strong> to place it parallel. Hierarchy, arrows, and
        permissions update live.
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
            <h2 className={styles.orgChartTitle}>Organizational Chart</h2>
            {roots.length > 0 ? (
              <ul className={styles.orgList}>{roots.map((r) => renderNode(r))}</ul>
            ) : (
              <p className={styles.orgEmpty}>No roles yet.</p>
            )}
          </div>
        </div>

        <button
          type="button"
          className={styles.orgResetBtn}
          onClick={onResetChart}
          title="Reset all drag-drop hierarchy, names, levels and permissions to default"
        >
          ⟲ Reset chart
        </button>
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
