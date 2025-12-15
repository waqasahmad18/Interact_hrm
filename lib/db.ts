import mysql from 'mysql2/promise';

// Update these values as per your local setup if needed
export const pool = mysql.createPool({
	host: 'localhost',
	user: 'root', // apna MySQL user
	password: '', // apna MySQL password
	database: 'interact_hrm',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

// Additional code or exports can follow here
