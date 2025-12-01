CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50),
  middle_name VARCHAR(50),
  last_name VARCHAR(50),
  employee_id VARCHAR(20) UNIQUE,
  dob DATE,
  gender VARCHAR(10),
  marital_status VARCHAR(20),
  nationality VARCHAR(50),
  email VARCHAR(100),
  status VARCHAR(20),
  username VARCHAR(50),
  password VARCHAR(100),
  profile_img VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20),
  contact_details TEXT,
  emergency_contacts TEXT,
  dependents TEXT,
  immigration TEXT,
  job TEXT,
  salary TEXT,
  report_to TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);
-- Breaks table for employee lunch breaks
CREATE TABLE breaks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20),
  employee_name VARCHAR(150),
  date DATE,
  break_start DATETIME,
  break_end DATETIME,
  exceed_minutes INT DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);
