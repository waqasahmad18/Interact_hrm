"use client";
import React from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import styles from "./layout-dashboard.module.css";

const sidebarLinks = [
	{
		group: "Main",
		links: [
			{ name: "Dashboard", path: "/dashboard" },
			{ name: "Admin", path: "/admin" },
		],
	},
	{
		group: "HR",
		links: [
			{ name: "Leave", path: "/leave" },
			{ name: "Time", path: "/time" },
			{ name: "Recruitment", path: "/recruitment" },
			{ name: "Add Employee", path: "/add-employee" },
			{ name: "Employee Credentials", path: "/employee-credentials" },
			{ name: "Break Summary", path: "/break-summary" },
			{ name: "Prayer Break Summary", path: "/break-summary/prayer" },
			{ name: "Attendance Summary", path: "/attendance-summary" },
		],
	},
	{
		group: "Personal",
		links: [
			{ name: "My Info", path: "/my-info" },
			{ name: "Performance", path: "/performance" },
		],
	},
];

export default function LayoutDashboard({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	return (
		<div className={styles.layout}>
			{/* Sidebar */}
			<aside className={styles.sidebar}>
				<Image
					src="/logo.png"
					alt="Logo"
					width={60}
					height={60}
					className={styles.logo}
				/>
				<h2 className={styles.company}>Interact Global</h2>
				<nav className={styles.nav}>
					{sidebarLinks.map((group, idx) => (
						<div key={group.group}>
							{/* Only show group label if not 'Main' */}
							{group.group !== "Main" && (
								<div
									style={{
										fontSize: "0.95rem",
										color: "#757575",
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
										className={
											isActive
												? `${styles.navItem} ${styles.navItemActive}`
												: styles.navItem
										}
									>
										<span>{link.name}</span>
									</div>
								);
							})}
						</div>
					))}
				</nav>
				{/* User Profile Section */}
				<div className={styles.profile}>
					<Image
						src="/avatar.svg"
						alt="Profile"
						width={48}
						height={48}
					/>
					<div className={styles.profileName}>Admin</div>
				</div>
			</aside>
			{/* Main Content */}
			<main className={styles.main}>
				<div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", width: "100%", marginBottom: 18 }}>
					<button
						onClick={() => router.push("/auth")}
						style={{
							background: "#E53E3E",
							color: "#fff",
							border: "none",
							borderRadius: 8,
							padding: "8px 22px",
							fontWeight: 600,
							fontSize: "1rem",
							boxShadow: "0 2px 8px rgba(229,62,62,0.10)",
							cursor: "pointer",
							transition: "background 0.2s"
						}}
					>
						Logout
					</button>
				</div>
				{children}
			</main>
		</div>
	);
}
