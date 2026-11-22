import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../lib/auth.ts';
import {
  type AnswerKey,
  type AntiCheatMode,
  DEFAULT_PORTAL_BRANDING,
  type EducationLevel,
  type ExamPackage,
  type ExamSchedule,
  type LayoutMode,
  type PortalBranding,
  type QuestionAdmin,
  type QuestionConfig,
  type QuestionPublic,
  type QuestionType,
  type School,
  type ScoringMode,
  type StimulusBlock,
  type SubjectCategory,
} from '../types/exam.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tka_exam.sqlite');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & concurrency tuning for up to 1,500 students per session
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`);

// Create relational schema
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npsn TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exam_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    education_level TEXT NOT NULL,
    subject_category TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    title TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 75,
    description TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exam_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES exam_packages(id) ON DELETE CASCADE,
    session_number INTEGER NOT NULL CHECK(session_number IN (1, 2, 3)),
    exam_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    token TEXT NOT NULL,
    show_token_to_student INTEGER NOT NULL DEFAULT 1,
    anti_cheat_mode TEXT NOT NULL DEFAULT 'strict',
    max_warnings INTEGER NOT NULL DEFAULT 1,
    allowed_school_ids_json TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES exam_packages(id) ON DELETE CASCADE,
    order_number INTEGER NOT NULL,
    question_type TEXT NOT NULL,
    layout_mode TEXT NOT NULL DEFAULT 'single_column',
    stimulus_json TEXT,
    prompt TEXT NOT NULL,
    config_json TEXT NOT NULL,
    answer_key_json TEXT NOT NULL,
    max_score REAL NOT NULL DEFAULT 1,
    scoring_mode TEXT NOT NULL DEFAULT 'partial',
    explanation TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    nis TEXT NOT NULL DEFAULT '',
    class_name TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'Laki-Laki',
    birth_date TEXT NOT NULL DEFAULT '2011-01-01',
    assigned_session INTEGER NOT NULL DEFAULT 1 CHECK(assigned_session IN (1, 2, 3)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exam_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    schedule_id INTEGER NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    package_id INTEGER NOT NULL REFERENCES exam_packages(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    device_token TEXT NOT NULL,
    unlock_token TEXT,
    violation_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    expires_at TEXT,
    finished_at TEXT,
    auto_score REAL NOT NULL DEFAULT 0,
    manual_score REAL NOT NULL DEFAULT 0,
    total_score REAL NOT NULL DEFAULT 0,
    max_score REAL NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0,
    needs_manual_grading INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(participant_id, schedule_id)
  );

  CREATE TABLE IF NOT EXISTS session_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_json TEXT,
    is_doubtful INTEGER NOT NULL DEFAULT 0,
    auto_score_earned REAL NOT NULL DEFAULT 0,
    manual_score_earned REAL,
    is_graded INTEGER NOT NULL DEFAULT 1,
    grader_note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS violation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    action_taken TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_questions_package ON questions(package_id, order_number);
  CREATE INDEX IF NOT EXISTS idx_participants_username ON participants(username);
  CREATE INDEX IF NOT EXISTS idx_participants_school ON participants(school_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_schedule ON exam_sessions(schedule_id, status);
  CREATE INDEX IF NOT EXISTS idx_sessions_participant ON exam_sessions(participant_id);
  CREATE INDEX IF NOT EXISTS idx_answers_session ON session_answers(session_id);
  CREATE INDEX IF NOT EXISTS idx_violations_session ON violation_logs(session_id);
`);

// Safe schema migration for existing SQLite files (add nis & class_name columns)
const participantCols = db
  .prepare('PRAGMA table_info(participants)')
  .all()
  .map((c) => String(c.name));
if (!participantCols.includes('nis')) {
  db.exec("ALTER TABLE participants ADD COLUMN nis TEXT NOT NULL DEFAULT ''");
}
if (!participantCols.includes('class_name')) {
  db.exec("ALTER TABLE participants ADD COLUMN class_name TEXT NOT NULL DEFAULT ''");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_participants_class ON participants(class_name)');
db.exec('CREATE INDEX IF NOT EXISTS idx_participants_nis ON participants(nis)');

// In-memory cache for package questions (stripped of answer keys) to handle 1,500 concurrent starts smoothly
const packageQuestionsCache = new Map<number, QuestionPublic[]>();

export function invalidatePackageCache(packageId?: number) {
  if (typeof packageId === 'number') {
    packageQuestionsCache.delete(packageId);
  } else {
    packageQuestionsCache.clear();
  }
}

export function getCachedPublicQuestions(packageId: number): QuestionPublic[] {
  const cached = packageQuestionsCache.get(packageId);
  if (cached) return cached;

  const rows = db
    .prepare(
      `SELECT id, package_id, order_number, question_type, layout_mode, stimulus_json, prompt, config_json, max_score, scoring_mode
       FROM questions
       WHERE package_id = ?
       ORDER BY order_number ASC, id ASC`,
    )
    .all(packageId);

  const parsed: QuestionPublic[] = rows.map((row) => ({
    id: Number(row.id),
    packageId: Number(row.package_id),
    orderNumber: Number(row.order_number),
    questionType: String(row.question_type) as QuestionType,
    layoutMode: String(row.layout_mode) as LayoutMode,
    stimulus: row.stimulus_json ? (JSON.parse(String(row.stimulus_json)) as StimulusBlock) : null,
    prompt: String(row.prompt),
    config: JSON.parse(String(row.config_json)) as QuestionConfig,
    maxScore: Number(row.max_score),
    scoringMode: String(row.scoring_mode) as ScoringMode,
  }));

  packageQuestionsCache.set(packageId, parsed);
  return parsed;
}

export function getAdminQuestionsByPackage(packageId: number): QuestionAdmin[] {
  const rows = db
    .prepare(
      `SELECT id, package_id, order_number, question_type, layout_mode, stimulus_json, prompt, config_json, answer_key_json, max_score, scoring_mode, explanation
       FROM questions
       WHERE package_id = ?
       ORDER BY order_number ASC, id ASC`,
    )
    .all(packageId);

  return rows.map((row) => ({
    id: Number(row.id),
    packageId: Number(row.package_id),
    orderNumber: Number(row.order_number),
    questionType: String(row.question_type) as QuestionType,
    layoutMode: String(row.layout_mode) as LayoutMode,
    stimulus: row.stimulus_json ? (JSON.parse(String(row.stimulus_json)) as StimulusBlock) : null,
    prompt: String(row.prompt),
    config: JSON.parse(String(row.config_json)) as QuestionConfig,
    answerKey: JSON.parse(String(row.answer_key_json)) as AnswerKey,
    maxScore: Number(row.max_score),
    scoringMode: String(row.scoring_mode) as ScoringMode,
    explanation: String(row.explanation || ''),
  }));
}

export function migrateSmpn1BejiNpsnOnce() {
  const done = db
    .prepare("SELECT value FROM app_settings WHERE key = 'smpn1_beji_npsn_20519205_v1'")
    .get();
  if (done) return;

  const conflict = db
    .prepare("SELECT id FROM schools WHERE npsn = '20519205' AND UPPER(name) != 'SMPN 1 BEJI'")
    .get();
  if (!conflict) {
    db.prepare(
      "UPDATE schools SET npsn = '20519205' WHERE UPPER(name) = 'SMPN 1 BEJI' AND npsn = '20100001'",
    ).run();
  }
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('smpn1_beji_npsn_20519205_v1', '1')",
  ).run();
}

export function migrateDefaultSchoolsOnce() {
  const migrated = db
    .prepare("SELECT value FROM app_settings WHERE key = 'default_schools_migrated_v1'")
    .get();
  if (migrated) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      "UPDATE schools SET name = 'SMPN 1 BEJI', district = 'Kec. Beji' WHERE name = 'SMPN 1 Nusantara'",
    ).run();
    db.prepare(
      "UPDATE schools SET name = 'SMPN 2 REMBANG', district = 'Kec. Rembang' WHERE name = 'SMPN 2 Harapan Bangsa'",
    ).run();
    db.prepare(
      "UPDATE schools SET name = 'SMPN 2 BEJI', district = 'Kec. Beji' WHERE name = 'MTs Negeri 1 Cendekia'",
    ).run();

    const bangil = db
      .prepare("SELECT id FROM schools WHERE LOWER(name) = LOWER('SMPN 1 BANGIL')")
      .get();
    let bangilId = bangil ? Number(bangil.id) : 0;

    if (!bangilId) {
      const npsn = db.prepare("SELECT id FROM schools WHERE npsn = '20100004'").get()
        ? `2010${Math.floor(1000 + Math.random() * 8999)}`
        : '20100004';
      bangilId = Number(
        db
          .prepare('INSERT INTO schools (npsn, name, district) VALUES (?, ?, ?)')
          .run(npsn, 'SMPN 1 BANGIL', 'Kec. Bangil').lastInsertRowid,
      );
    }

    // Ensure existing schedules allow the newly added default school
    if (bangilId) {
      const scheds = db.prepare('SELECT id, allowed_school_ids_json FROM exam_schedules').all();
      const updSched = db.prepare(
        'UPDATE exam_schedules SET allowed_school_ids_json = ? WHERE id = ?',
      );
      for (const sch of scheds) {
        try {
          const ids = JSON.parse(String(sch.allowed_school_ids_json || '[]')) as number[];
          if (Array.isArray(ids) && ids.length > 0 && !ids.includes(bangilId)) {
            ids.push(bangilId);
            updSched.run(JSON.stringify(ids), Number(sch.id));
          }
        } catch {
          // ignore malformed json
        }
      }

      const existingSiswa04 = db
        .prepare("SELECT id FROM participants WHERE username = 'siswa04'")
        .get();
      if (!existingSiswa04) {
        db.prepare(
          `INSERT INTO participants (school_id, username, password_hash, full_name, gender, birth_date, assigned_session)
           VALUES (?, 'siswa04', ?, 'Rizky Pratama', 'Laki-Laki', '2011-04-18', 1)`,
        ).run(bangilId, hashPassword('tka2026'));
      }
    }

    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_schools_migrated_v1', '1')",
    ).run();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function seedDatabaseIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as total FROM exam_packages').get();
  if (Number(countRow?.total || 0) > 0) {
    migrateDefaultSchoolsOnce();
    migrateSmpn1BejiNpsnOnce();
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Default sample schools
    const insertSchool = db.prepare(
      'INSERT INTO schools (npsn, name, district) VALUES (?, ?, ?)',
    );
    const s1 = Number(insertSchool.run('20519205', 'SMPN 1 BEJI', 'Kec. Beji').lastInsertRowid);
    const s2 = Number(insertSchool.run('20100002', 'SMPN 2 REMBANG', 'Kec. Rembang').lastInsertRowid);
    const s3 = Number(insertSchool.run('20100003', 'SMPN 2 BEJI', 'Kec. Beji').lastInsertRowid);
    const s4 = Number(insertSchool.run('20100004', 'SMPN 1 BANGIL', 'Kec. Bangil').lastInsertRowid);

    // 2. Exam Packages
    const insertPkg = db.prepare(
      `INSERT INTO exam_packages (education_level, subject_category, subject_name, title, duration_minutes, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );

    const mathPkgId = Number(
      insertPkg.run(
        'SMP/MTs/Sederajat' satisfies EducationLevel,
        'Mata Pelajaran Wajib' satisfies SubjectCategory,
        'Matematika',
        'Matematika - SMP Sederajat (Paket 2)',
        75,
        'Paket Simulasi TKA Numerasi & Aljabar standar Pusmendik mencakup 5 jenis soal resmi (PG Sederhana, MCMA, PGK Kategori, Menjodohkan, dan Uraian).',
      ).lastInsertRowid,
    );

    const indPkgId = Number(
      insertPkg.run(
        'SMP/MTs/Sederajat' satisfies EducationLevel,
        'Mata Pelajaran Wajib' satisfies SubjectCategory,
        'Bahasa Indonesia',
        'Bahasa Indonesia - SMP Sederajat (Paket 1)',
        60,
        'Paket Simulasi Literasi Membaca standar TKA untuk SMP/MTs Sederajat.',
      ).lastInsertRowid,
    );

    const smaPkgId = Number(
      insertPkg.run(
        'SMA/MA/SMK/Sederajat' satisfies EducationLevel,
        'Mata Pelajaran Pilihan' satisfies SubjectCategory,
        'Matematika Tingkat Lanjut',
        'Matematika Tingkat Lanjut - SMA/MA (Paket 1)',
        90,
        'Paket Simulasi TKA jenjang SMA/MA/SMK Sederajat.',
      ).lastInsertRowid,
    );

    // 3. Schedules (Sesi 1, Sesi 2, Sesi 3)
    const today = new Date().toISOString().slice(0, 10);
    const insertSched = db.prepare(
      `INSERT INTO exam_schedules (package_id, session_number, exam_date, start_time, end_time, token, show_token_to_student, anti_cheat_mode, max_warnings, allowed_school_ids_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );

    insertSched.run(mathPkgId, 1, today, '07:30', '09:30', 'T7HUYZ', 1, 'strict' satisfies AntiCheatMode, 1, JSON.stringify([s1, s2, s3, s4]));
    insertSched.run(mathPkgId, 2, today, '10:00', '12:00', 'B9K4LM', 1, 'tolerance' satisfies AntiCheatMode, 2, JSON.stringify([s1, s2, s3, s4]));
    insertSched.run(mathPkgId, 3, today, '13:00', '15:00', 'P5RX9Q', 0, 'strict' satisfies AntiCheatMode, 1, JSON.stringify([s1, s2, s3, s4]));
    insertSched.run(indPkgId, 1, today, '07:30', '09:30', 'LIT202', 1, 'tolerance' satisfies AntiCheatMode, 2, JSON.stringify([s1, s2, s3, s4]));
    insertSched.run(smaPkgId, 1, today, '07:30', '09:30', 'SMA771', 1, 'strict' satisfies AntiCheatMode, 1, JSON.stringify([s1, s2, s3, s4]));

    // 4. Questions for Matematika Paket 2 (All 5 official types + PDF models)
    const insertQ = db.prepare(
      `INSERT INTO questions (package_id, order_number, question_type, layout_mode, stimulus_json, prompt, config_json, answer_key_json, max_score, scoring_mode, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Q1: PG Sederhana (PDF #5)
    insertQ.run(
      mathPkgId,
      1,
      'PG_SEDERHANA',
      'single_column',
      JSON.stringify({
        mathFormula: '\\left(7^5 \\times 7^{-2}\\right)^3 = \\dots',
      } satisfies StimulusBlock),
      'Hasil dari operasi bilangan berpangkat di atas adalah ...',
      JSON.stringify({
        options: [
          { id: 'opt-a', label: 'A', text: '$7^3$' },
          { id: 'opt-b', label: 'B', text: '$7^6$' },
          { id: 'opt-c', label: 'C', text: '$7^9$' },
          { id: 'opt-d', label: 'D', text: '$7^{-30}$' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({ correctOptionId: 'opt-c' } satisfies AnswerKey),
      2,
      'exact',
      'Gunakan sifat eksponen $a^m \\times a^n = a^{m+n}$, sehingga $7^5 \\times 7^{-2} = 7^{5+(-2)} = 7^3$. Kemudian $(7^3)^3 = 7^{3 \\times 3} = 7^9$.',
    );

    // Q2: MCMA (PDF #6 - Split 2 columns with Voucher Cashback)
    insertQ.run(
      mathPkgId,
      2,
      'MCMA',
      'split_two_column',
      JSON.stringify({
        title: 'Promo Cashback Belanja Online',
        paragraphs: [
          'Rina lebih suka berbelanja online karena lebih mudah dan praktis. Ia sering menggunakan cashback yang ditawarkan oleh aplikasi belanja online. Cashback merupakan persentase pengembalian uang tunai atau virtual yang didapat saat pembeli memenuhi syarat tertentu.',
          'Berikut beberapa penawaran voucher cashback yang tersedia pada aplikasi belanja online milik Rina:',
        ],
        vouchers: [
          {
            code: 'Voucher A',
            label: 'Voucher A',
            title: 'Cashback 25% s/d 100RB',
            subtitle: 'Berlaku semua metode bayar',
            minPurchase: 'Min. Belanja Rp200.000',
            accentColor: 'rose',
          },
          {
            code: 'Voucher B',
            label: 'Voucher B',
            title: 'Cashback 20% s/d 150RB',
            subtitle: 'Khusus transaksi pengiriman luar kota',
            minPurchase: 'Min. Belanja Rp400.000',
            accentColor: 'blue',
          },
          {
            code: 'Voucher C',
            label: 'Voucher C',
            title: 'Cashback 5% s/d 200RB',
            subtitle: 'Hemat belanja grosir & kado',
            minPurchase: 'Min. Belanja Rp500.000',
            accentColor: 'amber',
          },
          {
            code: 'Voucher D',
            label: 'Voucher D',
            title: 'Cashback 18% s/d 120RB',
            subtitle: 'Bonus pengguna aktif mingguan',
            minPurchase: 'Min. Belanja Rp300.000',
            accentColor: 'emerald',
          },
        ],
      } satisfies StimulusBlock),
      'Rina akan membeli hadiah untuk temannya seharga Rp650.000,00 dalam satu kali transaksi. Jika Rina menginginkan cashback LEBIH DARI Rp100.000,00, voucher mana sajakah yang dapat ia pilih? (Klik pada setiap pilihan jawaban yang benar! Jawaban benar lebih dari satu.)',
      JSON.stringify({
        options: [
          { id: 'opt-a', label: 'A', text: 'Voucher A (25% s/d Rp100.000)' },
          { id: 'opt-b', label: 'B', text: 'Voucher B (20% s/d Rp150.000)' },
          { id: 'opt-c', label: 'C', text: 'Voucher C (5% s/d Rp200.000)' },
          { id: 'opt-d', label: 'D', text: 'Voucher D (18% s/d Rp120.000)' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({ correctOptionIds: ['opt-b', 'opt-d'] } satisfies AnswerKey),
      4,
      'partial',
      'Untuk belanja Rp650.000: Voucher A maksimal hanya Rp100.000 (tidak lebih dari 100rb); Voucher B = 20% × 650rb = Rp130.000 (>100rb); Voucher C = 5% × 650rb = Rp32.500; Voucher D = 18% × 650rb = Rp117.000 (>100rb). Jadi yang tepat adalah Voucher B dan Voucher D.',
    );

    // Q3: PGK Kategori (PDF #7 - Split 2 columns with Voucher Cashback & Benar/Salah statements)
    insertQ.run(
      mathPkgId,
      3,
      'PGK_KATEGORI',
      'split_two_column',
      JSON.stringify({
        title: 'Ketentuan Penggunaan Voucher A, B, dan C',
        paragraphs: [
          'Setiap transaksi hanya dapat menggunakan satu voucher. Persentase cashback dihitung dari total belanja dan tidak dapat melebihi batas maksimal yang tertulis pada masing-masing voucher.',
        ],
        vouchers: [
          {
            code: 'Voucher A',
            label: 'Voucher A',
            title: 'Cashback 25% s/d 100RB',
            subtitle: 'Berlaku untuk total belanja minimal Rp150.000',
            minPurchase: 'Min. Belanja Rp150.000',
            accentColor: 'rose',
          },
          {
            code: 'Voucher B',
            label: 'Voucher B',
            title: 'Cashback 5% s/d 200RB',
            subtitle: 'Berlaku untuk total belanja minimal Rp500.000',
            minPurchase: 'Min. Belanja Rp500.000',
            accentColor: 'blue',
          },
          {
            code: 'Voucher C',
            label: 'Voucher C',
            title: 'Cashback 10% s/d 20RB',
            subtitle: 'Berlaku untuk total belanja minimal Rp80.000',
            minPurchase: 'Min. Belanja Rp80.000',
            accentColor: 'amber',
          },
        ],
      } satisfies StimulusBlock),
      'Rina memiliki voucher A, B, dan C yang bisa digunakan untuk berbelanja online. Tentukan Benar atau Salah untuk setiap pernyataan manfaat cashback pada total belanja berikut!',
      JSON.stringify({
        categories: ['Benar', 'Salah'],
        statements: [
          {
            id: 'stmt-1',
            badgeCode: 'Voucher A',
            badgeAmount: 'Rp600.000,00',
            text: 'Jika Rina berbelanja Rp600.000,00 menggunakan Voucher A, cashback yang diterima maksimal Rp100.000,00.',
          },
          {
            id: 'stmt-2',
            badgeCode: 'Voucher B',
            badgeAmount: 'Rp1.000.000,00',
            text: 'Jika Rina berbelanja Rp1.000.000,00 menggunakan Voucher B, cashback yang diterima adalah Rp200.000,00.',
          },
          {
            id: 'stmt-3',
            badgeCode: 'Voucher C',
            badgeAmount: 'Rp200.000,00',
            text: 'Jika Rina berbelanja Rp200.000,00 menggunakan Voucher C, cashback yang diterima adalah Rp20.000,00.',
          },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({
        correctCategories: {
          'stmt-1': 'Benar',
          'stmt-2': 'Salah',
          'stmt-3': 'Benar',
        },
      } satisfies AnswerKey),
      3,
      'partial',
      '1) 25% × Rp600.000 = Rp150.000, namun dibatasi maksimal Rp100.000 (Benar). 2) 5% × Rp1.000.000 = Rp50.000, bukan Rp200.000 (Salah). 3) 10% × Rp200.000 = Rp20.000, tepat sesuai batas maks Rp20.000 (Benar).',
    );

    // Q4: PGK Kategori (PDF #8 - Algebraic expression Benar/Salah)
    insertQ.run(
      mathPkgId,
      4,
      'PGK_KATEGORI',
      'single_column',
      JSON.stringify({
        paragraphs: ['Diketahui bentuk aljabar berikut ini:'],
        mathFormula: '2a^2 - 3a + a^2b + 4b - 5',
      } satisfies StimulusBlock),
      'Berdasarkan bentuk aljabar tersebut, tentukan Benar atau Salah pada setiap pernyataan berikut!',
      JSON.stringify({
        categories: ['Benar', 'Salah'],
        statements: [
          {
            id: 'alg-1',
            text: 'Terdapat 2 variabel pada bentuk aljabar tersebut, yaitu $a$ dan $b$.',
          },
          {
            id: 'alg-2',
            text: 'Konstanta pada bentuk aljabar tersebut adalah $5$.',
          },
          {
            id: 'alg-3',
            text: 'Bilangan $2$, $-3$, $1$, dan $4$ merupakan koefisien suku-suku aljabar.',
          },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({
        correctCategories: {
          'alg-1': 'Benar',
          'alg-2': 'Salah',
          'alg-3': 'Benar',
        },
      } satisfies AnswerKey),
      3,
      'partial',
      'Variabel yang muncul hanya $a$ dan $b$ (Benar). Konstanta harus menyertakan tanda negatif yaitu $-5$, bukan $5$ (Salah). Koefisien masing-masing suku adalah $2$, $-3$, $1$ (pada $a^2b$), dan $4$ (Benar).',
    );

    // Q5: PGK Kategori (PDF #9 - Arrow Diagrams Fungsi / Bukan Fungsi)
    insertQ.run(
      mathPkgId,
      5,
      'PGK_KATEGORI',
      'single_column',
      JSON.stringify({
        paragraphs: ['Perhatikan tiga diagram panah relasi himpunan $A$ ke himpunan $B$ berikut ini:'],
        arrowDiagrams: [
          {
            title: 'DIAGRAM 1',
            leftTitle: 'A',
            rightTitle: 'B',
            leftNodes: ['1', '2', '3'],
            rightNodes: ['a', 'b', 'c'],
            edges: [
              [0, 0],
              [0, 1],
              [1, 1],
              [2, 2],
            ],
          },
          {
            title: 'DIAGRAM 2',
            leftTitle: 'A',
            rightTitle: 'B',
            leftNodes: ['1', '2', '3'],
            rightNodes: ['a', 'b', 'c'],
            edges: [
              [0, 1],
              [1, 0],
              [2, 2],
            ],
          },
          {
            title: 'DIAGRAM 3',
            leftTitle: 'A',
            rightTitle: 'B',
            leftNodes: ['1', '2', '3'],
            rightNodes: ['a', 'b', 'c'],
            edges: [
              [0, 0],
              [1, 2],
            ],
          },
        ],
      } satisfies StimulusBlock),
      'Apakah Diagram 1, Diagram 2, dan Diagram 3 merupakan fungsi? Tentukan Fungsi atau Bukan Fungsi pada setiap diagram berikut!',
      JSON.stringify({
        categories: ['Fungsi', 'Bukan Fungsi'],
        statements: [
          { id: 'diag-1', text: 'Diagram 1' },
          { id: 'diag-2', text: 'Diagram 2' },
          { id: 'diag-3', text: 'Diagram 3' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({
        correctCategories: {
          'diag-1': 'Bukan Fungsi',
          'diag-2': 'Fungsi',
          'diag-3': 'Bukan Fungsi',
        },
      } satisfies AnswerKey),
      3,
      'partial',
      'Syarat fungsi dari $A$ ke $B$: setiap anggota $A$ memiliki tepat satu pasangan di $B$. Pada Diagram 1 anggota "1" bercabang dua (Bukan Fungsi). Diagram 2 setiap anggota $A$ tepat satu pasangan (Fungsi). Diagram 3 anggota "3" tidak memiliki pasangan (Bukan Fungsi).',
    );

    // Q6: Menjodohkan (Matching)
    insertQ.run(
      mathPkgId,
      6,
      'MENJODOHKAN',
      'single_column',
      JSON.stringify({
        paragraphs: [
          'Perhatikan empat permasalahan aljabar dan geometri di kolom sebelah kiri beserta pilihan hasil di kolom sebelah kanan.',
        ],
      } satisfies StimulusBlock),
      'Pasangkan setiap soal di kolom kiri dengan jawaban yang paling tepat pada kolom kanan!',
      JSON.stringify({
        leftItems: [
          { id: 'L1', text: 'Nilai $x$ yang memenuhi persamaan $3x - 7 = 14$' },
          { id: 'L2', text: 'Bentuk sederhana dari $(2a + 3b) + (4a - b)$' },
          { id: 'L3', text: 'Gradien garis dengan persamaan $y = -4x + 9$' },
          { id: 'L4', text: 'Luas persegi yang kelilingnya $36\\text{ cm}$' },
        ],
        rightItems: [
          { id: 'R1', text: '$6a + 2b$' },
          { id: 'R2', text: '$x = 7$' },
          { id: 'R3', text: '$81\\text{ cm}^2$' },
          { id: 'R4', text: '$m = -4$' },
          { id: 'R5', text: '$x = 5$' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({
        correctPairs: {
          L1: 'R2',
          L2: 'R1',
          L3: 'R4',
          L4: 'R3',
        },
      } satisfies AnswerKey),
      4,
      'partial',
      '1) $3x = 21 \\Rightarrow x = 7$. 2) $(2a+4a)+(3b-b) = 6a+2b$. 3) Pada $y = mx + c$, gradien $m = -4$. 4) Sisi $= 36/4 = 9\\text{ cm}$, Luas $= 9^2 = 81\\text{ cm}^2$.',
    );

    // Q7: Uraian (PDF #10 - Split 2 columns with Bar Chart & Flow Diagram)
    insertQ.run(
      mathPkgId,
      7,
      'URAIAN',
      'split_two_column',
      JSON.stringify({
        title: 'Pemantauan Durasi Bermain Game Online',
        paragraphs: [
          'Andi ingin mengetahui kebiasaan waktu bermain game online selama 12 minggu. Mulai minggu ke-7, Andi sepakat membatasi durasi bermainnya agar tidak mengganggu waktu belajar.',
        ],
        barChart: {
          title: 'DURASI MAIN GAME ONLINE SETIAP MINGGU (JAM)',
          xLabel: 'Minggu ke-',
          yLabel: 'Durasi (jam)',
          data: [
            { label: 'M1', value: 15 },
            { label: 'M2', value: 13 },
            { label: 'M3', value: 14 },
            { label: 'M4', value: 16 },
            { label: 'M5', value: 12 },
            { label: 'M6', value: 14 },
            { label: 'M7', value: 10 },
            { label: 'M8', value: 11 },
            { label: 'M9', value: 8 },
            { label: 'M10', value: 9 },
            { label: 'M11', value: 8 },
            { label: 'M12', value: 8 },
          ],
        },
        flowSteps: [
          { step: 'Fase Pertama', detail: 'Minggu 1 – Minggu 6 (Sebelum pembatasan)' },
          { step: 'Fase Kedua', detail: 'Minggu 7 – Minggu 12 (Setelah pembatasan)' },
          { step: 'Evaluasi', detail: 'Bandingkan rata-rata kedua fase' },
        ],
      } satisfies StimulusBlock),
      'Berdasarkan grafik di samping, hitunglah rata-rata durasi bermain pada Fase Pertama (Minggu 1–6) dan Fase Kedua (Minggu 7–12). Kemudian simpulkan apakah terjadi penurunan durasi bermain dan berapa jam selisih rata-ratanya!',
      JSON.stringify({
        placeholder: 'Tuliskan langkah perhitungan rata-rata Fase 1, Fase 2, dan kesimpulan penurunan Anda di sini...',
        rubricHint: 'Skor maksimal 4 poin: sebutkan rata-rata Fase 1 (14 jam), Fase 2 (9 jam), dan selisih penurunan (5 jam).',
      } satisfies QuestionConfig),
      JSON.stringify({
        expectedKeywords: ['14', '9', '5', 'turun'],
        modelAnswer:
          'Fase Pertama (M1–M6) = (15+13+14+16+12+14)/6 = 84/6 = 14 jam/minggu. Fase Kedua (M7–M12) = (10+11+8+9+8+8)/6 = 54/6 = 9 jam/minggu. Terjadi penurunan rata-rata durasi sebesar 14 - 9 = 5 jam per minggu.',
        rubricNotes:
          '4 poin jika kedua rata-rata dan selisih penurunan tepat; 2-3 poin jika sebagian benar; 1 poin jika hanya menjawab tanpa hitungan akurat.',
      } satisfies AnswerKey),
      4,
      'partial',
      'Total Minggu 1–6 = 84 jam, rata-rata = 84 / 6 = 14 jam. Total Minggu 7–12 = 54 jam, rata-rata = 54 / 6 = 9 jam. Penurunan rata-rata = 14 - 9 = 5 jam per minggu.',
    );

    // Add 2 sample questions for Bahasa Indonesia Paket 1 & 1 for SMA so switching subjects works seamlessly
    insertQ.run(
      indPkgId,
      1,
      'PG_SEDERHANA',
      'split_two_column',
      JSON.stringify({
        title: 'Menjaga Ekosistem Mangrove Pesisir',
        paragraphs: [
          'Hutan mangrove di kawasan pesisir memiliki peran ganda sebagai penahan abrasi alami sekaligus rumah bagi berbagai biota laut muda seperti kepiting bakau dan udang.',
          'Program rehabilitasi berbasis masyarakat yang dilakukan sejak tahun 2022 berhasil memulihkan 45 hektare garis pantai yang sebelumnya kritis akibat alih fungsi lahan.',
        ],
      } satisfies StimulusBlock),
      'Gagasan utama paragraf pertama bacaan tersebut adalah ...',
      JSON.stringify({
        options: [
          { id: 'bi-a', label: 'A', text: 'Keberhasilan rehabilitasi pantai seluas 45 hektare sejak 2022.' },
          { id: 'bi-b', label: 'B', text: 'Peran ganda hutan mangrove sebagai penahan abrasi dan habitat biota laut.' },
          { id: 'bi-c', label: 'C', text: 'Penyebab kerusakan garis pantai akibat alih fungsi lahan pesisir.' },
          { id: 'bi-d', label: 'D', text: 'Jenis-jenis kepiting bakau dan udang di ekosistem laut dalam.' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({ correctOptionId: 'bi-b' } satisfies AnswerKey),
      2,
      'exact',
      'Paragraf pertama berfokus pada dua fungsi utama hutan mangrove: penahan abrasi dan habitat biota laut muda.',
    );

    insertQ.run(
      indPkgId,
      2,
      'PGK_KATEGORI',
      'single_column',
      JSON.stringify({
        paragraphs: [
          'Berdasarkan teks "Menjaga Ekosistem Mangrove Pesisir", tentukan kesesuaian pernyataan berikut dengan isi bacaan!',
        ],
      } satisfies StimulusBlock),
      'Tentukan Sesuai atau Tidak Sesuai untuk setiap pernyataan berikut!',
      JSON.stringify({
        categories: ['Sesuai', 'Tidak Sesuai'],
        statements: [
          { id: 'bi-s1', text: 'Rehabilitasi mangrove melibatkan partisipasi masyarakat sejak 2022.' },
          { id: 'bi-s2', text: 'Luas garis pantai yang dipulihkan mencapai 450 hektare.' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({
        correctCategories: { 'bi-s1': 'Sesuai', 'bi-s2': 'Tidak Sesuai' },
      } satisfies AnswerKey),
      2,
      'partial',
      'Luas pantai yang dipulihkan adalah 45 hektare, bukan 450 hektare.',
    );

    insertQ.run(
      smaPkgId,
      1,
      'PG_SEDERHANA',
      'single_column',
      JSON.stringify({
        mathFormula: '\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2} = \\dots',
      } satisfies StimulusBlock),
      'Nilai limit fungsi aljabar di atas adalah ...',
      JSON.stringify({
        options: [
          { id: 'sma-a', label: 'A', text: '$0$' },
          { id: 'sma-b', label: 'B', text: '$2$' },
          { id: 'sma-c', label: 'C', text: '$4$' },
          { id: 'sma-d', label: 'D', text: 'Tidak terdefinisi' },
        ],
      } satisfies QuestionConfig),
      JSON.stringify({ correctOptionId: 'sma-c' } satisfies AnswerKey),
      2,
      'exact',
      'Faktorkan pembilang: $\\frac{(x-2)(x+2)}{x-2} = x+2$. Substitusi $x=2$ menghasilkan $4$.',
    );

    // 5. Demo Participants across schools & sessions (including 123asd matching PDF!)
    const insertParticipant = db.prepare(
      `INSERT INTO participants (school_id, nis, class_name, username, password_hash, full_name, gender, birth_date, assigned_session)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertParticipant.run(s1, '202607001', '7A', '123asd', hashPassword('123asd'), 'Ahya - PESERTA TKA', 'Laki-Laki', '2010-08-15', 1);
    insertParticipant.run(s2, '202607002', '7B', 'siswa01', hashPassword('tka2026'), 'Siti Rahmawati', 'Perempuan', '2011-05-10', 1);
    insertParticipant.run(s3, '202608001', '8A', 'siswa02', hashPassword('tka2026'), 'Budi Santoso', 'Laki-Laki', '2011-03-22', 2);
    insertParticipant.run(s1, '202609001', '9A', 'siswa03', hashPassword('tka2026'), 'Dewi Lestari', 'Perempuan', '2011-11-04', 3);
    insertParticipant.run(s4, '202608002', '8B', 'siswa04', hashPassword('tka2026'), 'Rizky Pratama', 'Laki-Laki', '2011-04-18', 1);

    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('default_schools_migrated_v1', '1')",
    ).run();
    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('smpn1_beji_npsn_20519205_v1', '1')",
    ).run();

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function listSchools(): School[] {
  return db
    .prepare('SELECT id, npsn, name, district FROM schools ORDER BY name ASC')
    .all()
    .map((r) => ({
      id: Number(r.id),
      npsn: String(r.npsn),
      name: String(r.name),
      district: String(r.district),
    }));
}

export function listPackages(): ExamPackage[] {
  return db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM questions q WHERE q.package_id = p.id) as question_count
       FROM exam_packages p
       ORDER BY p.id ASC`,
    )
    .all()
    .map((r) => ({
      id: Number(r.id),
      educationLevel: String(r.education_level) as EducationLevel,
      subjectCategory: String(r.subject_category) as SubjectCategory,
      subjectName: String(r.subject_name),
      title: String(r.title),
      durationMinutes: Number(r.duration_minutes),
      description: String(r.description),
      isActive: Boolean(r.is_active),
      questionCount: Number(r.question_count),
    }));
}

export function listSchedules(): ExamSchedule[] {
  return db
    .prepare(
      `SELECT s.*, p.title as package_title, p.subject_name, p.education_level
       FROM exam_schedules s
       JOIN exam_packages p ON p.id = s.package_id
       ORDER BY s.session_number ASC, s.id ASC`,
    )
    .all()
    .map((r) => ({
      id: Number(r.id),
      packageId: Number(r.package_id),
      packageTitle: String(r.package_title),
      subjectName: String(r.subject_name),
      educationLevel: String(r.education_level),
      sessionNumber: Number(r.session_number) as 1 | 2 | 3,
      examDate: String(r.exam_date),
      startTime: String(r.start_time),
      endTime: String(r.end_time),
      token: String(r.token),
      showTokenToStudent: Boolean(r.show_token_to_student),
      antiCheatMode: String(r.anti_cheat_mode) as AntiCheatMode,
      maxWarnings: Number(r.max_warnings),
      allowedSchoolIds: JSON.parse(String(r.allowed_school_ids_json || '[]')) as number[],
      isActive: Boolean(r.is_active),
    }));
}

export function getPortalBranding(): PortalBranding {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'portal_branding'")
    .get();
  if (!row) {
    return { ...DEFAULT_PORTAL_BRANDING };
  }
  try {
    const parsed = JSON.parse(String(row.value)) as Partial<PortalBranding>;
    return {
      ...DEFAULT_PORTAL_BRANDING,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_PORTAL_BRANDING };
  }
}

export function savePortalBranding(next: PortalBranding): PortalBranding {
  const merged: PortalBranding = {
    ...DEFAULT_PORTAL_BRANDING,
    ...next,
  };
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('portal_branding', ?)",
  ).run(JSON.stringify(merged));
  return merged;
}

