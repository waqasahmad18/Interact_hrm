"use client";

import React, { useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../attendance-summary/attendance-summary.module.css";

export default function EmploymentStatusUpdatePage() {
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState("");

	const handleUpdate = async () => {
		setLoading(true);
		setError("");
		setResult(null);

		try {
			const response = await fetch("/api/auto-update-employment-status", {
				method: "GET",
				headers: { "Content-Type": "application/json" }
			});

			const data = await response.json();

			if (data.success) {
				setResult(data);
			} else {
				setError(data.error || "Update failed");
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	return (
		<LayoutDashboard>
			<div className={styles.attendanceSummaryContainer}>
				<div style={{ marginBottom: 20 }}>
					<h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22223B", margin: 0 }}>
						Employment Status Auto-Update
					</h1>
					<p style={{ color: "#4A5568", fontSize: "0.9rem", marginTop: 4 }}>
						Automatically promote employees from Probation to Permanent after 3 months
					</p>
				</div>

				<div style={{
					background: "#F7FAFC",
					border: "1px solid #E2E8F0",
					borderRadius: 12,
					padding: 20,
					marginBottom: 20
				}}>
					<h3 style={{ marginTop: 0, color: "#0f1d40" }}>How It Works</h3>
					<ul style={{ color: "#4A5568", lineHeight: 1.8 }}>
						<li>This tool checks all employees with "Probation" employment status</li>
						<li>Calculates if 3 months have passed since their joining date</li>
						<li>Automatically promotes eligible employees to "Permanent" status</li>
						<li>Example: If an employee joined on Aug 25, 2025, they'll be promoted on Nov 25, 2025</li>
					</ul>

					<h3 style={{ color: "#0f1d40" }}>Setup Automated Cron Job (Optional)</h3>
					<p style={{ color: "#4A5568" }}>To automatically run this update daily, set up a cron job or scheduled task:</p>

					<div style={{
						background: "#fff",
						border: "1px solid #CBD5E0",
						borderRadius: 8,
						padding: 12,
						fontFamily: "monospace",
						fontSize: "0.9rem",
						marginBottom: 10,
						overflowX: "auto"
					}}>
						<code style={{ color: "#E53E3E" }}>curl -X GET http://localhost:3000/api/auto-update-employment-status</code>
					</div>

					<p style={{ color: "#718096", fontSize: "0.9rem" }}>
						<strong>Linux/Mac:</strong> Add to crontab: <code>0 0 * * * curl -X GET http://your-app-url/api/auto-update-employment-status</code>
					</p>
					<p style={{ color: "#718096", fontSize: "0.9rem" }}>
						<strong>Windows:</strong> Use Task Scheduler to run the curl command daily at a specific time
					</p>
				</div>

				<button
					onClick={handleUpdate}
					disabled={loading}
					style={{
						background: loading ? "#CBD5E0" : "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)",
						color: "#fff",
						border: "none",
						padding: "12px 24px",
						borderRadius: 8,
						fontSize: "1rem",
						fontWeight: 600,
						cursor: loading ? "not-allowed" : "pointer",
						marginBottom: 20
					}}
				>
					{loading ? "Processing..." : "Run Employment Status Update Now"}
				</button>

				{error && (
					<div style={{
						background: "#FED7D7",
						border: "1px solid #FC8181",
						borderRadius: 8,
						padding: 12,
						color: "#742A2A",
						marginBottom: 20
					}}>
						<strong>Error:</strong> {error}
					</div>
				)}

				{result && (
					<div style={{
						background: "#F0FFF4",
						border: "1px solid #9AE6B4",
						borderRadius: 8,
						padding: 16,
						marginBottom: 20
					}}>
						<div style={{ color: "#22543D" }}>
							<h3 style={{ marginTop: 0, color: "#276749" }}>✓ Update Completed Successfully</h3>

							<div style={{ marginBottom: 16 }}>
								<p style={{ marginBottom: 8 }}>
									<strong>Message:</strong> {result.message}
								</p>
								<p style={{ marginBottom: 8 }}>
									<strong>Employees Updated:</strong> <span style={{ fontSize: "1.2rem", color: "#276749", fontWeight: 700 }}>{result.updated_count}</span>
								</p>
								<p style={{ marginBottom: 8 }}>
									<strong>Total in Probation:</strong> {result.total_probation_employees}
								</p>
							</div>

							{result.updated_count > 0 && (
								<div>
									<h4 style={{ marginBottom: 10, color: "#22543D" }}>Updated Employees:</h4>
									<table style={{
										width: "100%",
										borderCollapse: "collapse",
										background: "#fff"
									}}>
										<thead>
											<tr style={{ background: "#C6F6D5", borderBottom: "2px solid #9AE6B4" }}>
												<th style={{ padding: "10px", textAlign: "left", fontWeight: 600, color: "#22543D" }}>Employee ID</th>
												<th style={{ padding: "10px", textAlign: "left", fontWeight: 600, color: "#22543D" }}>Joined Date</th>
												<th style={{ padding: "10px", textAlign: "left", fontWeight: 600, color: "#22543D" }}>Days Since Joining</th>
											</tr>
										</thead>
										<tbody>
											{result.updated_employees.map((emp: any, idx: number) => (
												<tr key={idx} style={{ borderBottom: "1px solid #E2E8F0" }}>
													<td style={{ padding: "10px", color: "#22543D" }}>{emp.employee_id}</td>
													<td style={{ padding: "10px", color: "#22543D" }}>
														{new Date(emp.joined_date).toLocaleDateString()}
													</td>
													<td style={{ padding: "10px", color: "#22543D" }}>{emp.days_since_joining} days</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				)}

				{result && result.updated_count === 0 && (
					<div style={{
						background: "#FFFFF0",
						border: "1px solid #F6E05E",
						borderRadius: 8,
						padding: 12,
						color: "#744210"
					}}>
						<strong>ℹ All employees in probation status are still within their 3-month period.</strong>
					</div>
				)}
			</div>
		</LayoutDashboard>
	);
}
