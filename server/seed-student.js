'use strict';

// 往 students 表插一条测试学生，供任务 02 的登录验收用（正式名单导入在任务 05）。
// 幂等：重复执行只会覆盖这条测试数据。
//
// 用法：node seed-student.js [学号] [姓名]

const { db, dbPath } = require('./db');

const studentId = process.argv[2] || '2026000001';
const name = process.argv[3] || '李明悦';
const college = '计算机学院';
const className = '计算机 2026-1 班';

db.prepare(
  `INSERT INTO students (student_id, name, college, class_name)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(student_id) DO UPDATE SET
     name = excluded.name,
     college = excluded.college,
     class_name = excluded.class_name`
).run(studentId, name, college, className);

const row = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
console.log(`[seed] db: ${dbPath}`);
console.log(`[seed] 测试学生已写入: ${JSON.stringify(row)}`);
db.close();
