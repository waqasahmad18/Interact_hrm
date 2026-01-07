"use client";
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "./layout-dashboard.module.css";
import { FaTachometerAlt, FaUserShield, FaCalendarAlt, FaClock, FaUserPlus, FaIdBadge, FaListAlt, FaPray, FaClipboardList, FaBuilding, FaCog, FaUser, FaChartBar, FaKey } from "react-icons/fa";

const sidebarLinks = [
	{
		group: "Main",
		links: [
			{ name: "Dashboard", path: "/dashboard", icon: <FaTachometerAlt /> },
			{ name: "Admin", path: "/admin", icon: <FaUserShield /> },
		],
	},
	{
		group: "HR",
		links: [
			{ name: "Leave", path: "/leave", icon: <FaCalendarAlt /> },
			{ name: "Time", path: "/time", icon: <FaClock /> },
			{ name: "Manage Attendance", path: "/admin/manage-attendance", icon: <FaClipboardList /> },
			{ name: "Recruitment", path: "/recruitment", icon: <FaUserPlus /> },
			{ name: "Add Employee", path: "/add-employee", icon: <FaUserPlus /> },
			{ name: "Employee List", path: "/admin/employee-list", icon: <FaListAlt /> },
			{ name: "Employee Credentials", path: "/admin/employee-credentials", icon: <FaKey /> },
			{ name: "Shift Management", path: "/admin/shift-management", icon: <FaClock /> },
			{ name: "Events", path: "/admin/events", icon: <FaCalendarAlt /> },
			{ name: "Departments", path: "/admin/departments", icon: <FaBuilding /> },
		],
	},
	{
		group: "Personal",
		links: [
			{ name: "My Info", path: "/my-info", icon: <FaUser /> },
			{ name: "Performance", path: "/performance", icon: <FaChartBar /> },
		],
	},
];

export default function LayoutDashboard({ children }: { children: React.ReactNode }) {
	const [menuOpen, setMenuOpen] = React.useState(false);
	const menuRef = React.useRef<HTMLDivElement>(null);
	const router = useRouter();
	const pathname = usePathname();

	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setMenuOpen(false);
			}
		}
		if (menuOpen) {
			window.addEventListener("mousedown", handleClickOutside);
			return () => window.removeEventListener("mousedown", handleClickOutside);
		}
	}, [menuOpen]);

	return (
		<>
			<div className={styles.topBar}>
				<div className={styles.topBarLeft}>
					<span className={styles.sidebarTitle}>Interact Global</span>
					<span className={styles.sidebarMenuIcon}>&#9776;</span>
				</div>
				<div className={styles.topBarRight}>
					<div className={styles.topBarProfile}>
						{/* If user image exists, show image, else show initials */}
						{false ? (
							<span className={styles.topBarProfilePic} style={{backgroundImage: "url('https://ui-avatars.com/api/?name=Admin')"}}></span>
						) : (
							<span className={styles.topBarProfileInitials}>A</span>
						)}
						<span className={styles.topBarProfileName}>Admin</span>
						<div className={styles.profileMenuWrapper} ref={menuRef}>
							<button
								className={styles.profileMenuButton}
								onClick={() => setMenuOpen((open) => !open)}
								aria-label="Open menu"
							>
								<span style={{ fontSize: "1.7rem", color: "#fff" }}>⋮</span>
							</button>
							{menuOpen && (
								<div className={styles.profileMenuDropdown}>
									<button
										className={styles.logoutButton}
										onClick={() => {
											if (typeof window !== "undefined") {
												localStorage.removeItem("loginId");
											}
											router.push("/auth");
										}}
									>
										Logout
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className={styles.layout}>
				<aside className={styles.sidebar}>
					<nav className={styles.nav}>
						{sidebarLinks.map((group, idx) => (
							<div key={group.group}>
								{group.group !== "Main" && (
									<div
										style={{
											fontSize: "0.95rem",
											color: "#bfc8e2",
											fontWeight: 600,
											margin: "16px 0 8px 32px",
										}}
									>
										{group.group}
									</div>
								)}
								{group.links.map((link) => {
									const isActive = pathname === link.path;
									return (
										<div
											key={link.name}
											onClick={() => router.push(link.path)}
											className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
										>
											<span className={styles.navIcon}>{link.icon}</span>
											<span>{link.name}</span>
										</div>
									);
								})}
							</div>
						))}
					</nav>
				</aside>
				<div className={styles.contentArea}>
					<main className={styles.main}>{children}</main>
				</div>
			</div>
		</>
	 );
}
