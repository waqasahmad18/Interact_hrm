"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  FaClock,
  FaCalendarAlt,
  FaUsers,
  FaMoneyBillWave,
  FaHandHoldingUsd,
} from "react-icons/fa";
import {
  getDateStringInTimeZone,
  getParts,
  SERVER_TIMEZONE,
} from "../../lib/timezone";
import { ATTENDANCE_DATA_CHANGED } from "../../lib/ui-sync/breakPrayerDataRefresh";
import styles from "./employee-dashboard.module.css";
import { fetchEmployeeHierarchy, type HierarchyPerson } from "../employee-hierarchy-api";
import { EmployeeAvatar } from "../components/EmployeeAvatar";

type AttendanceRow = {
  id?: number;
  date?: string;
  clock_in?: string | null;
  clock_out?: string | null;
  is_late?: boolean;
  late_minutes?: number;
};

type DayChart = {
  label: string;
  dateKey: string;
  hours: number;
  status: "onTime" | "tardy" | "absent";
  lateMinutes: number;
  isToday: boolean;
};

type LeaveBalance = {
  annual: number;
  annualAllowance: number;
  casual: number;
  bereavement: number;
  bereavementAllowance: number;
};

function last5Weekdays(): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < 5) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function dateKey(d: Date) {
  return getDateStringInTimeZone(d, SERVER_TIMEZONE);
}

function recordDateKey(record: AttendanceRow) {
  if (record.date) {
    const m = /^\d{4}-\d{2}-\d{2}/.exec(String(record.date));
    if (m) return m[0];
  }
  if (record.clock_in) return getDateStringInTimeZone(record.clock_in, SERVER_TIMEZONE);
  return "";
}

function workHours(record: AttendanceRow): number {
  if (!record.clock_in) return 0;
  const inParts = getParts(record.clock_in, SERVER_TIMEZONE);
  if (!inParts) return 0;
  const start = Date.UTC(
    inParts.year,
    inParts.month - 1,
    inParts.day,
    inParts.hour,
    inParts.minute,
    inParts.second
  );
  let end: number;
  if (record.clock_out) {
    const outParts = getParts(record.clock_out, SERVER_TIMEZONE);
    if (!outParts) return 0;
    end = Date.UTC(
      outParts.year,
      outParts.month - 1,
      outParts.day,
      outParts.hour,
      outParts.minute,
      outParts.second
    );
  } else {
    const nowParts = getParts(new Date(), SERVER_TIMEZONE);
    if (!nowParts) return 0;
    end = Date.UTC(
      nowParts.year,
      nowParts.month - 1,
      nowParts.day,
      nowParts.hour,
      nowParts.minute,
      nowParts.second
    );
  }
  return Math.max(0, (end - start) / 3600000);
}

function StatValue({ value }: { value: string }) {
  return <>{value}</>;
}

const ProgressRing = React.memo(function ProgressRing({
  pct,
  color,
  size = 54,
  children,
}: {
  pct: number;
  color: string;
  size?: number;
  children?: React.ReactNode;
}) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c - (clamped / 100) * c;

  return (
    <div className={styles.ringWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={styles.ringArc}
        />
      </svg>
      {children ? <div className={styles.ringCenter}>{children}</div> : null}
    </div>
  );
});

function CompanyPolicyWidget() {
  const [policies, setPolicies] = React.useState<
    Array<{ id: number; heading: string; description: string }>
  >([]);
  const [modalOpen, setModalOpen] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch("/api/company-policies", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) =>
        setPolicies(Array.isArray(data.policies) ? data.policies : [])
      );
  }, []);

  if (!policies.length) return null;

  const active = policies.find((p) => p.id === modalOpen);

  return (
    <div className={styles.policyBlock}>
      <p className={styles.cardTitle} style={{ marginBottom: 10, fontSize: 13 }}>Company policies</p>
      {policies.map((policy) => {
        const showReadMore =
          policy.description && policy.description.length > 80;
        return (
          <div key={policy.id} className={styles.policyItem}>
            <div className={styles.policyHead}>{policy.heading}</div>
            <div className={styles.policyBody}>
              {showReadMore
                ? policy.description.slice(0, 80) + "..."
                : policy.description}
            </div>
            {showReadMore && (
              <button
                type="button"
                className={styles.policyMore}
                onClick={() => setModalOpen(policy.id)}
              >
                Read more
              </button>
            )}
          </div>
        );
      })}
      {active && (
        <div
          className={styles.modalBg}
          onClick={() => setModalOpen(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setModalOpen(null)}
            >
              Close
            </button>
            <h3 className={styles.modalTitle}>{active.heading}</h3>
            <p className={styles.policyBody}>{active.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState("");
  const [calendarNow, setCalendarNow] = React.useState(() => new Date());
  const [attendance, setAttendance] = React.useState<AttendanceRow[]>([]);
  const [leaveBalance, setLeaveBalance] = React.useState<LeaveBalance>({
    annual: 0,
    annualAllowance: 20,
    casual: 0,
    bereavement: 0,
    bereavementAllowance: 3,
  });
  const [events, setEvents] = React.useState<
    Array<{
      id: number;
      title: string;
      description?: string;
      start_at: string;
      location?: string | null;
    }>
  >([]);
  const [widgetHeading, setWidgetHeading] = React.useState("Upcoming Events");
  const [reminders, setReminders] = React.useState<
    Array<{ id: number; message: string }>
  >([]);
  const [reportsTo, setReportsTo] = React.useState<HierarchyPerson | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<HierarchyPerson[]>([]);

  const todayParts = React.useMemo(() => {
    const parts = getParts(calendarNow, SERVER_TIMEZONE);
    if (parts) return parts;
    const fallback = calendarNow;
    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      hour: fallback.getHours(),
      minute: fallback.getMinutes(),
      second: fallback.getSeconds(),
    };
  }, [calendarNow]);

  const todayKey = React.useMemo(
    () => getDateStringInTimeZone(calendarNow, SERVER_TIMEZONE),
    [calendarNow]
  );

  React.useEffect(() => {
    const syncNow = () => setCalendarNow(new Date());
    const interval = setInterval(syncNow, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", syncNow);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", syncNow);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const empId =
      localStorage.getItem("employeeId") || localStorage.getItem("loginId") || "";
    setEmployeeId(empId);
  }, []);

  const fetchAttendance = React.useCallback(async () => {
    if (!employeeId) return;
    try {
      const res = await fetch(
        `/api/attendance?employeeId=${employeeId}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) setAttendance(data.attendance || []);
    } catch (err) {
      console.error("attendance fetch", err);
    }
  }, [employeeId]);

  const fetchLeaveBalance = React.useCallback(async () => {
    if (!employeeId) return;
    try {
      const res = await fetch(
        `/api/leave-balance?employee_id=${employeeId}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) {
        setLeaveBalance({
          annual: data.annualBalance ?? 0,
          annualAllowance: data.annualAllowance ?? 20,
          casual: data.categoryBalance?.casual ?? 0,
          bereavement: data.bereavementBalance ?? 0,
          bereavementAllowance: 3,
        });
      }
    } catch (err) {
      console.error("leave balance fetch", err);
    }
  }, [employeeId]);

  const fetchEvents = React.useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) {
        setEvents(data.events || []);
        if (data.widgetHeading) setWidgetHeading(data.widgetHeading);
      }
    } catch (err) {
      console.error("events fetch", err);
    }
  }, []);

  const fetchReminders = React.useCallback(async () => {
    try {
      const res = await fetch("/api/reminders", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) setReminders(data.reminders || []);
    } catch (err) {
      console.error("reminders fetch", err);
    }
  }, []);

  React.useEffect(() => {
    if (!employeeId) return;
    fetchAttendance();
    fetchLeaveBalance();
    void fetchEmployeeHierarchy(employeeId).then((data) => {
      if (!data) return;
      setReportsTo(data.reportsTo);
      setTeamMembers(data.teamMembers);
    });
  }, [employeeId, fetchAttendance, fetchLeaveBalance]);

  React.useEffect(() => {
    fetchEvents();
    fetchReminders();
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString());
        if (msg?.type === "events_updated") fetchEvents();
        if (msg?.type === "reminders_updated") fetchReminders();
        if (msg?.type === "leave_update") fetchLeaveBalance();
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [fetchEvents, fetchReminders, fetchLeaveBalance]);

  React.useEffect(() => {
    const lastFetchRef = { at: 0 };
    const onAttendance = () => {
      const now = Date.now();
      if (now - lastFetchRef.at < 8000) return;
      lastFetchRef.at = now;
      fetchAttendance();
    };
    window.addEventListener(ATTENDANCE_DATA_CHANGED, onAttendance);
    return () =>
      window.removeEventListener(ATTENDANCE_DATA_CHANGED, onAttendance);
  }, [fetchAttendance]);

  const attendanceByDate = React.useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    attendance.forEach((row) => {
      const key = recordDateKey(row);
      if (!key) return;
      const existing = map.get(key);
      if (!existing || workHours(row) > workHours(existing)) map.set(key, row);
    });
    return map;
  }, [attendance]);

  const weekDays = React.useMemo(() => last5Weekdays(), [todayKey]);

  const weekChart: DayChart[] = React.useMemo(() => {
    return weekDays.map((d) => {
      const key = dateKey(d);
      const record = attendanceByDate.get(key);
      const isToday = key === todayKey;
      if (!record?.clock_in) {
        return { label: dayLabel(d), dateKey: key, hours: 0, status: "absent", lateMinutes: 0, isToday };
      }
      const hours = workHours(record);
      const status = record.is_late ? "tardy" : "onTime";
      return {
        label: dayLabel(d),
        dateKey: key,
        hours,
        status,
        lateMinutes: record.late_minutes || 0,
        isToday,
      };
    });
  }, [weekDays, attendanceByDate, todayKey]);

  const maxChartHours = Math.max(8, ...weekChart.map((d) => d.hours), 1);

  const todayRecord = attendanceByDate.get(todayKey);
  const todayHours = todayRecord ? workHours(todayRecord) : 0;
  const todayStatus = !todayRecord?.clock_in
    ? "Not clocked in"
    : todayRecord.is_late
      ? `Late · ${todayRecord.late_minutes || 0}m`
      : "On time";

  const monthStart = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-01`;
  const monthTardies = React.useMemo(() => {
    let count = 0;
    attendanceByDate.forEach((row, key) => {
      if (key >= monthStart && key <= todayKey && row.is_late) count++;
    });
    return count;
  }, [attendanceByDate, monthStart, todayKey]);

  const calendarYear = todayParts.year;
  const calendarMonthIndex = todayParts.month - 1;
  const monthStartUtc = new Date(Date.UTC(calendarYear, calendarMonthIndex, 1));
  const monthName = new Intl.DateTimeFormat(undefined, {
    month: "long",
    timeZone: SERVER_TIMEZONE,
  }).format(new Date(Date.UTC(calendarYear, calendarMonthIndex, 1, 12, 0, 0)));
  const daysInMonth = new Date(
    Date.UTC(calendarYear, calendarMonthIndex + 1, 0)
  ).getUTCDate();
  const leadingBlanks = monthStartUtc.getUTCDay();
  const calendarSlots = Array.from(
    { length: leadingBlanks + daysInMonth },
    (_, idx) => {
      if (idx < leadingBlanks) return null;
      const day = idx - leadingBlanks + 1;
      const key = `${calendarYear}-${String(todayParts.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isToday = day === todayParts.day;
      const isTardy = attendanceByDate.get(key)?.is_late === true;
      return { day, isToday, isTardy };
    }
  );

  const annualPct = Math.min(
    100,
    Math.round((leaveBalance.annual / Math.max(leaveBalance.annualAllowance, 1)) * 100)
  );

  const hoursPct = Math.min(100, Math.round((todayHours / 8) * 100));
  const casualPct = Math.min(100, Math.round((leaveBalance.casual / 15) * 100));
  const punctualPct = Math.max(0, 100 - monthTardies * 25);

  const weekStats = React.useMemo(() => {
    let onTime = 0;
    let late = 0;
    let absent = 0;
    let totalHours = 0;
    let present = 0;
    weekChart.forEach((d) => {
      if (d.status === "onTime") {
        onTime++;
        totalHours += d.hours;
        present++;
      } else if (d.status === "tardy") {
        late++;
        totalHours += d.hours;
        present++;
      } else {
        absent++;
      }
    });
    const weekScore =
      weekChart.length === 0
        ? 0
        : Math.round(((onTime * 100 + late * 40) / weekChart.length));
    const avgHours = present > 0 ? totalHours / present : 0;
    return { onTime, late, absent, weekScore, avgHours };
  }, [weekChart]);

  const isClockedIn = Boolean(todayRecord?.clock_in && !todayRecord?.clock_out);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <section className={styles.statRow}>
          <button
            type="button"
            className={`${styles.statCard} ${styles.statCardPurple}`}
            onClick={() => router.push("/employee-dashboard/time")}
          >
            {isClockedIn ? <span className={styles.liveDot} /> : null}
            <div className={styles.statCardTop}>
              <span className={styles.statIconBubble}><FaClock /></span>
              <ProgressRing pct={hoursPct} color="#fff">
                <span className={styles.ringPct}>{hoursPct}%</span>
              </ProgressRing>
            </div>
            <div className={styles.statValue}>
              <StatValue value={`${Math.round(todayHours)}h`} />
            </div>
            <div className={styles.statLabel}>Hours today</div>
            <div className={styles.statHint}>{todayStatus}</div>
            <div className={styles.statBar}>
              <div className={styles.statBarFill} style={{ width: `${hoursPct}%` }} />
            </div>
          </button>

          <button
            type="button"
            className={`${styles.statCard} ${styles.statCardGreen}`}
            onClick={() => router.push("/employee-dashboard/leave")}
          >
            <div className={styles.statCardTop}>
              <span className={styles.statIconBubble}><FaCalendarAlt /></span>
              <ProgressRing pct={annualPct} color="#fff">
                <span className={styles.ringPct}>{annualPct}%</span>
              </ProgressRing>
            </div>
            <div className={styles.statValue}>
              <StatValue value={String(leaveBalance.annual)} />
            </div>
            <div className={styles.statLabel}>Annual leave</div>
            <div className={styles.statHint}>of {leaveBalance.annualAllowance} days</div>
            <div className={styles.statBar}>
              <div className={styles.statBarFill} style={{ width: `${annualPct}%` }} />
            </div>
          </button>

          <button
            type="button"
            className={`${styles.statCard} ${styles.statCardGold}`}
            onClick={() => router.push("/employee-dashboard/leave")}
          >
            <div className={styles.statCardTop}>
              <span className={styles.statIconBubble}><FaCalendarAlt /></span>
              <ProgressRing pct={casualPct} color="#fff">
                <span className={styles.ringPct}>{leaveBalance.casual}</span>
              </ProgressRing>
            </div>
            <div className={styles.statValue}>
              <StatValue value={String(leaveBalance.casual)} />
            </div>
            <div className={styles.statLabel}>Casual leave</div>
            <div className={styles.statHint}>remaining</div>
            <div className={styles.statBar}>
              <div className={`${styles.statBarFill} ${styles.statBarFillGold}`} style={{ width: `${casualPct}%` }} />
            </div>
          </button>

          <button
            type="button"
            className={`${styles.statCard} ${styles.statCardRed}`}
            onClick={() => router.push("/employee-dashboard/time")}
          >
            <div className={styles.statCardTop}>
              <span className={styles.statIconBubble}><FaClock /></span>
              <ProgressRing pct={punctualPct} color="#fff">
                <span className={styles.ringPct}>{monthTardies}</span>
              </ProgressRing>
            </div>
            <div className={styles.statValue}>
              <StatValue value={String(monthTardies)} />
            </div>
            <div className={styles.statLabel}>Tardies</div>
            <div className={styles.statHint}>this month</div>
            <div className={styles.statBar}>
              <div className={`${styles.statBarFill} ${styles.statBarFillRed}`} style={{ width: `${punctualPct}%` }} />
            </div>
          </button>
        </section>

        <section className={styles.pulseStrip}>
          <div className={styles.pulseGlow} aria-hidden />
          <div className={styles.pulseInner}>
            <div className={styles.pulseWeek}>
              <p className={styles.pulseLabel}>This week · tap a day</p>
              <div className={styles.dayPills}>
                {weekChart.map((day) => (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={`${styles.dayPill} ${styles[`dayPill_${day.status}`]} ${day.isToday ? styles.dayPillToday : ""}`}
                    onClick={() => router.push("/employee-dashboard/time")}
                    title={`${day.label}: ${day.status}`}
                  >
                    <span className={styles.dayPillLabel}>{day.label}</span>
                    <span className={styles.dayPillHours}>
                      {day.hours > 0 ? `${Math.round(day.hours)}h` : "—"}
                    </span>
                    {day.status === "tardy" && <span className={styles.dayPillLate} />}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.pulseScore}>
              <ProgressRing pct={weekStats.weekScore} color="#a78bfa" size={76}>
                <span className={styles.scoreNum}>{weekStats.weekScore}</span>
              </ProgressRing>
              <span className={styles.scoreCaption}>Weekly score</span>
            </div>

            <div className={styles.pulseChips}>
              <div className={`${styles.pulseChip} ${styles.chipGreen}`}>
                <strong>{weekStats.onTime}</strong> on time
              </div>
              <div className={`${styles.pulseChip} ${styles.chipRed}`}>
                <strong>{weekStats.late}</strong> late
              </div>
              <div className={`${styles.pulseChip} ${styles.chipPurple}`}>
                <strong>{Math.round(weekStats.avgHours)}h</strong> avg / day
              </div>
              <div className={`${styles.pulseChip} ${styles.chipGold}`}>
                <strong>{leaveBalance.bereavement}</strong> bereavement left
              </div>
            </div>
          </div>
        </section>

        <div className={styles.bento}>
          <article className={`${styles.card} ${styles.bentoChart}`}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Attendance this week</h2>
              <span className={`${styles.pill} ${styles.pillLive}`}>Live</span>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "#007a5a" }} /> On time
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "#dc2626" }} /> Late
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "#e2e8f0" }} /> Absent
              </span>
            </div>
            <div className={styles.chartArea}>
              {weekChart.map((day) => {
                const pct =
                  day.status === "absent"
                    ? 10
                    : Math.max(14, (day.hours / maxChartHours) * 100);
                return (
                  <div key={day.dateKey} className={styles.chartCol}>
                    <div className={styles.chartTrack}>
                      {day.status === "tardy" && <span className={styles.lateDot} />}
                      <div
                        className={`${styles.chartBar} ${
                          day.status === "tardy"
                            ? styles.barLate
                            : day.status === "onTime"
                              ? styles.barOk
                              : styles.barMiss
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={`${styles.chartDay} ${day.isToday ? styles.chartDayToday : ""}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </article>

          <article className={`${styles.card} ${styles.bentoLeave}`}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Leave balance</h2>
            </div>
            <div className={styles.leaveStack}>
              <div className={styles.leaveItem}>
                <div
                  className={`${styles.leaveRing} ${styles.leaveRingPurple}`}
                  style={{ "--pct": `${annualPct}%` } as React.CSSProperties}
                >
                  <span>{leaveBalance.annual}</span>
                </div>
                <div className={styles.leaveInfo}>
                  <div className={styles.leaveName}>Annual</div>
                  <div className={styles.leaveSub}>of {leaveBalance.annualAllowance} days left</div>
                </div>
              </div>
              <div className={styles.leaveItem}>
                <div className={`${styles.leaveRing} ${styles.leaveRingGold}`}>
                  {leaveBalance.casual}
                </div>
                <div className={styles.leaveInfo}>
                  <div className={styles.leaveName}>Casual</div>
                  <div className={styles.leaveSub}>remaining days</div>
                </div>
              </div>
              <div className={styles.leaveItem}>
                <div className={`${styles.leaveRing} ${styles.leaveRingGreen}`}>
                  {leaveBalance.bereavement}
                </div>
                <div className={styles.leaveInfo}>
                  <div className={styles.leaveName}>Bereavement</div>
                  <div className={styles.leaveSub}>available</div>
                </div>
              </div>
            </div>
          </article>

          <article className={`${styles.card} ${styles.bentoCal}`}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{monthName}</h2>
              <span className={styles.pill}>Late days marked</span>
            </div>
            <div className={styles.calDays}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className={styles.calCells}>
              {calendarSlots.map((slot, idx) => {
                if (!slot) return <div key={idx} className={`${styles.calCell} ${styles.calBlank}`} />;
                return (
                  <div
                    key={idx}
                    className={`${styles.calCell} ${slot.isToday ? styles.calToday : ""} ${slot.isTardy && !slot.isToday ? styles.calLate : ""}`}
                  >
                    {slot.day}
                  </div>
                );
              })}
            </div>
          </article>

          <article className={`${styles.card} ${styles.bentoPeople}`}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>People</h2>
              <button type="button" className={styles.textLink} onClick={() => router.push("/employee-dashboard/my-team")}>
                View all
              </button>
            </div>
            {reportsTo ? (
              <div className={styles.teamLead}>
                <EmployeeAvatar name={reportsTo.name} initials={reportsTo.initials} photo={reportsTo.photo} size="sm" />
                <div>
                  <div className={styles.teamLeadLabel}>Reports to</div>
                  <div className={styles.teamLeadName}>{reportsTo.name}</div>
                </div>
              </div>
            ) : null}
            {teamMembers.length > 0 ? (
              <div className={styles.teamGrid}>
                {teamMembers.slice(0, 6).map((m) => (
                  <div key={m.id} className={styles.teamMember} title={m.name}>
                    <EmployeeAvatar name={m.name} initials={m.initials} photo={m.photo} size="sm" />
                    <span className={styles.teamMemberName}>{m.name.split(" ")[0]}</span>
                  </div>
                ))}
                {teamMembers.length > 6 && (
                  <span className={styles.teamMore}>+{teamMembers.length - 6} more</span>
                )}
              </div>
            ) : (
              <p className={styles.muted}>No direct reports</p>
            )}
          </article>

          <article className={`${styles.card} ${styles.bentoActions}`}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Quick actions</h2>
            </div>
            <div className={styles.actionGrid}>
              <button type="button" className={styles.actionBtn} onClick={() => router.push("/employee-dashboard/time")}>
                <span className={`${styles.actionIcon} ${styles.actionIconGreen}`}><FaClock /></span>
                Time &amp; attendance
              </button>
              <button type="button" className={styles.actionBtn} onClick={() => router.push("/employee-dashboard/leave")}>
                <span className={`${styles.actionIcon} ${styles.actionIconGold}`}><FaCalendarAlt /></span>
                Request leave
              </button>
              <button type="button" className={styles.actionBtn} onClick={() => router.push("/employee-dashboard/my-team")}>
                <span className={`${styles.actionIcon} ${styles.actionIconPurple}`}><FaUsers /></span>
                My team
              </button>
              <button type="button" className={styles.actionBtn} onClick={() => router.push("/employee-dashboard/request-advance")}>
                <span className={`${styles.actionIcon} ${styles.actionIconGreen}`}><FaMoneyBillWave /></span>
                Request advance
              </button>
              <button type="button" className={styles.actionBtn} onClick={() => router.push("/employee-dashboard/request-loan")}>
                <span className={`${styles.actionIcon} ${styles.actionIconGold}`}><FaHandHoldingUsd /></span>
                Request loan
              </button>
            </div>
          </article>

          <article className={`${styles.card} ${styles.bentoFeed}`}>
            <div className={styles.feedSplit}>
              <div>
                <h3 className={styles.feedBlockTitle}>Reminders</h3>
                {reminders.length === 0 ? (
                  <p className={styles.empty}>No reminders</p>
                ) : (
                  <ul className={styles.feedList}>
                    {reminders.map((r) => (
                      <li key={r.id} className={styles.feedItem}>{r.message}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className={styles.feedBlockTitle}>{widgetHeading}</h3>
                {events.length === 0 ? (
                  <p className={styles.empty}>No upcoming events</p>
                ) : (
                  <ul className={styles.feedList}>
                    {events.map((ev) => (
                      <li key={ev.id} className={styles.feedItem}>
                        <div className={styles.feedTitle}>{ev.title}</div>
                        <div className={styles.feedMeta}>{new Date(ev.start_at).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <CompanyPolicyWidget />
          </article>
        </div>
      </div>
    </div>
  );
}
