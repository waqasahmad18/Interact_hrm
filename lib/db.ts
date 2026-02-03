import mysql from 'mysql2/promise';

// Update these values as per your local setup if needed
export const pool = mysql.createPool({
	host: 'localhost',
	user: 'root', // apna MySQL user
	password: '', // apna MySQL password
	database: 'interact_hrm',
	waitForConnections: true,
	connectionLimit: 10,  // Reduced from 30 to prevent overwhelming MySQL
	queueLimit: 0,
	maxIdle: 10, // Maximum idle connections
	idleTimeout: 60000, // Close idle connections after 60 seconds
	enableKeepAlive: true,
	keepAliveInitialDelay: 0
});


// Generic query function
export async function query(sql: string, params?: any[]) {
	const [rows] = await pool.query(sql, params);
	return rows;
}
