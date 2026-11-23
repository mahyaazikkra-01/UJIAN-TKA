import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  db,
  getAdminQuestionsByPackage,
  getCachedPublicQuestions,
  getPdfReportConfig,
  getPortalBranding,
  invalidatePackageCache,
  listPackages,
  listSchedules,
  listSchools,
  savePdfReportConfig,
  savePortalBranding,
  seedDatabaseIfEmpty,
} from './src/db/localDb.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  requireAdminAuth,
  requireParticipantAuth,
  signAuthToken,
  verifyPassword,
} from './src/lib/auth.ts';
import { gradeQuestionAnswer } from './src/lib/scoring.ts';
import {
  type AnswerKey,
  DEFAULT_PDF_REPORT_CONFIG,
  DEFAULT_PORTAL_BRANDING,
  type ExamResultDetail,
  type HeaderThemePreset,
  type PdfReportConfig,
  type PortalBranding,
  type QuestionConfig,
  type QuestionType,
  type ScoringMode,
  type SessionStatus,
  type StudentAnswerPayload,
} from './src/types/exam.ts';

dotenv.config();
seedDatabaseIfEmpty();

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json({ limit: '3mb' }));

function generateShortToken(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function getActiveAdminPasscodeHash(): string | null {
  const envCode = process.env.ADMIN_PASSCODE?.trim();
  if (envCode) {
    return null; // Managed via env var directly
  }
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'admin_password_hash'")
    .get();
  return row ? String(row.value) : null;
}

function finalizeSessionGrading(sessionId: number) {
  const sessionRow = db
    .prepare(
      `SELECT es.*, p.full_name as participant_name, s.name as school_name,
              ep.title as package_title, ep.subject_name, sch.session_number
       FROM exam_sessions es
       JOIN participants p ON p.id = es.participant_id
       JOIN schools s ON s.id = p.school_id
       JOIN exam_packages ep ON ep.id = es.package_id
       JOIN exam_schedules sch ON sch.id = es.schedule_id
       WHERE es.id = ?`,
    )
    .get(sessionId);

  if (!sessionRow) return null;

  const packageId = Number(sessionRow.package_id);
  const questions = getAdminQuestionsByPackage(packageId);
  const answersRows = db
    .prepare('SELECT * FROM session_answers WHERE session_id = ?')
    .all(sessionId);

  const answersMap = new Map<number, Record<string, unknown>>();
  for (const row of answersRows) {
    answersMap.set(Number(row.question_id), row);
  }

  let totalAutoScore = 0;
  let totalManualScore = 0;
  let maxScore = 0;
  let needsManualGrading = false;
  const details: ExamResultDetail[] = [];

  const upsertGrade = db.prepare(
    `INSERT INTO session_answers (session_id, question_id, answer_json, is_doubtful, auto_score_earned, manual_score_earned, is_graded, grader_note, updated_at)
     VALUES (?, ?, ?, 0, ?, NULL, ?, NULL, datetime('now'))
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       auto_score_earned = excluded.auto_score_earned,
       is_graded = CASE WHEN session_answers.manual_score_earned IS NOT NULL THEN 1 ELSE excluded.is_graded END`,
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const q of questions) {
      maxScore += q.maxScore;
      const saved = answersMap.get(q.id);
      const studentAnswer = saved?.answer_json
        ? (JSON.parse(String(saved.answer_json)) as StudentAnswerPayload)
        : null;

      const grade = gradeQuestionAnswer(
        q.questionType,
        q.config,
        q.answerKey,
        studentAnswer,
        q.maxScore,
        q.scoringMode,
      );

      const hasManualOverride =
        saved?.manual_score_earned !== null && saved?.manual_score_earned !== undefined;
      const manualScoreEarned = hasManualOverride
        ? Number(saved!.manual_score_earned)
        : null;
      const isGraded = hasManualOverride ? true : grade.isGraded;

      if (!isGraded) {
        needsManualGrading = true;
      }

      upsertGrade.run(
        sessionId,
        q.id,
        studentAnswer ? JSON.stringify(studentAnswer) : null,
        grade.autoScore,
        isGraded ? 1 : 0,
      );

      const effectiveScore =
        manualScoreEarned !== null ? manualScoreEarned : grade.autoScore;
      if (q.questionType === 'URAIAN' && manualScoreEarned !== null) {
        totalManualScore += manualScoreEarned;
      } else {
        totalAutoScore += grade.autoScore;
      }

      details.push({
        questionId: q.id,
        orderNumber: q.orderNumber,
        questionType: q.questionType,
        prompt: q.prompt,
        studentAnswer,
        answerKey: q.answerKey,
        explanation: q.explanation,
        autoScoreEarned: grade.autoScore,
        manualScoreEarned,
        maxScore: q.maxScore,
        isGraded,
        graderNote: saved?.grader_note ? String(saved.grader_note) : null,
      });
    }

    const totalScore = Math.round((totalAutoScore + totalManualScore) * 100) / 100;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

    db.prepare(
      `UPDATE exam_sessions
       SET status = 'COMPLETED',
           finished_at = COALESCE(finished_at, datetime('now')),
           auto_score = ?,
           manual_score = ?,
           total_score = ?,
           max_score = ?,
           percentage = ?,
           needs_manual_grading = ?
       WHERE id = ?`,
    ).run(
      totalAutoScore,
      totalManualScore,
      totalScore,
      maxScore,
      percentage,
      needsManualGrading ? 1 : 0,
      sessionId,
    );

    db.exec('COMMIT');

    return {
      sessionId,
      status: 'COMPLETED' as SessionStatus,
      packageTitle: String(sessionRow.package_title),
      subjectName: String(sessionRow.subject_name),
      participantName: String(sessionRow.participant_name),
      schoolName: String(sessionRow.school_name),
      sessionNumber: Number(sessionRow.session_number) as 1 | 2 | 3,
      startedAt: sessionRow.started_at ? String(sessionRow.started_at) : null,
      finishedAt: new Date().toISOString(),
      totalScore,
      maxScore,
      percentage,
      needsManualGrading,
      violationCount: Number(sessionRow.violation_count || 0),
      details,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function sanitizeLogoUrl(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const val = String(raw ?? '').trim();
  if (!val) return { ok: true, value: '' };
  if (val.length > 650_000) {
    return { ok: false, error: 'Ukuran gambar logo terlalu besar (maksimal 500 KB).' };
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(val)) {
    return { ok: true, value: val };
  }
  if (val.startsWith('/') && !val.startsWith('//')) {
    return { ok: true, value: val };
  }
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return { ok: true, value: val };
    }
  } catch {
    // invalid URL
  }
  return {
    ok: false,
    error: 'Format Logo tidak valid. Gunakan unggahan PNG/JPG/WebP atau tautan http(s) yang valid.',
  };
}

const VALID_THEMES: HeaderThemePreset[] = ['pusmendik_blue', 'navy', 'emerald', 'maroon', 'slate'];

// ==========================================
// PUBLIC CATALOG & PARTICIPANT DEMO DISCOVERY
// ==========================================
app.get('/api/catalog', (_req, res) => {
  try {
    const packages = listPackages().filter((p) => p.isActive);
    const schedules = listSchedules().filter((s) => s.isActive);
    const schools = listSchools();
    const branding = getPortalBranding();
    res.json({ packages, schedules, schools, branding });
  } catch (err) {
    console.error('Failed to load catalog:', err);
    res.status(500).json({ error: 'Gagal memuat katalog simulasi.' });
  }
});

app.get('/api/branding', (_req, res) => {
  try {
    res.json({ branding: getPortalBranding() });
  } catch (err) {
    console.error('Failed to load branding:', err);
    res.status(500).json({ error: 'Gagal memuat pengaturan tampilan.' });
  }
});

app.get('/api/admin/pdf-config', requireAdminAuth, (_req, res) => {
  try {
    res.json({ config: getPdfReportConfig() });
  } catch (err) {
    console.error('Get PDF config error:', err);
    res.status(500).json({ error: 'Gagal memuat pengaturan PDF.' });
  }
});

app.put('/api/admin/pdf-config', requireAdminAuth, (req, res) => {
  try {
    const body = req.body || {};
    const updated = savePdfReportConfig(body);
    res.json({ ok: true, config: updated });
  } catch (err) {
    console.error('Save PDF config error:', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan PDF.' });
  }
});


// ==========================================
// PARTICIPANT AUTH & 4-STEP TKA EXAM WORKFLOW
// ==========================================
app.post('/api/participant/login', (req, res) => {
  try {
    const { username, password, packageId, scheduleId } = req.body || {};
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    let row = db
      .prepare(
        `SELECT p.*, s.name as school_name, s.npsn
         FROM participants p
         JOIN schools s ON s.id = p.school_id
         WHERE p.username = ?`,
      )
      .get(cleanUser);

    if (!row) {
      const byNis = db
        .prepare(
          `SELECT p.*, s.name as school_name, s.npsn
           FROM participants p
           JOIN schools s ON s.id = p.school_id
           WHERE p.nis != '' AND p.nis = ?`,
        )
        .all(cleanUser);
      if (byNis.length === 1) {
        row = byNis[0];
      }
    }

    if (!row || !verifyPassword(cleanPass, String(row.password_hash))) {
      return res.status(401).json({ error: 'Username/NIS atau password peserta tidak sesuai.' });
    }

    const participantId = Number(row.id);

    // Choose matching schedule (selected scheduleId or assigned session for selected packageId)
    let scheduleRow: Record<string, unknown> | undefined;
    if (scheduleId) {
      scheduleRow = db
        .prepare(
          `SELECT sch.*, ep.title as package_title, ep.subject_name, ep.duration_minutes, ep.education_level
           FROM exam_schedules sch
           JOIN exam_packages ep ON ep.id = sch.package_id
           WHERE sch.id = ? AND sch.is_active = 1`,
        )
        .get(Number(scheduleId));
    } else if (packageId) {
      scheduleRow = db
        .prepare(
          `SELECT sch.*, ep.title as package_title, ep.subject_name, ep.duration_minutes, ep.education_level
           FROM exam_schedules sch
           JOIN exam_packages ep ON ep.id = sch.package_id
           WHERE sch.package_id = ? AND sch.session_number = ? AND sch.is_active = 1
           LIMIT 1`,
        )
        .get(Number(packageId), Number(row.assigned_session));

      if (!scheduleRow) {
        scheduleRow = db
          .prepare(
            `SELECT sch.*, ep.title as package_title, ep.subject_name, ep.duration_minutes, ep.education_level
             FROM exam_schedules sch
             JOIN exam_packages ep ON ep.id = sch.package_id
             WHERE sch.package_id = ? AND sch.is_active = 1
             ORDER BY sch.session_number ASC
             LIMIT 1`,
          )
          .get(Number(packageId));
      }
    }

    if (!scheduleRow) {
      return res.status(404).json({ error: 'Jadwal sesi ujian untuk mata pelajaran ini belum aktif.' });
    }

    const allowedSchools = JSON.parse(String(scheduleRow.allowed_school_ids_json || '[]')) as number[];
    if (allowedSchools.length > 0 && !allowedSchools.includes(Number(row.school_id))) {
      return res.status(403).json({
        error: `Sekolah Anda (${String(row.school_name)}) tidak terdaftar pada jadwal sesi ini.`,
      });
    }

    // Check existing session for single-device lock if already IN_PROGRESS
    const existingSession = db
      .prepare('SELECT * FROM exam_sessions WHERE participant_id = ? AND schedule_id = ?')
      .get(participantId, Number(scheduleRow.id));

    if (
      existingSession &&
      String(existingSession.status) === 'IN_PROGRESS' &&
      String(existingSession.device_token)
    ) {
      return res.status(409).json({
        error:
          'Akun ini sedang aktif mengerjakan ujian di perangkat lain (Single-Device Lock). Hubungi Pengawas untuk Reset Login jika terjadi kendala perangkat.',
      });
    }

    const deviceToken = crypto.randomBytes(16).toString('hex');
    const authToken = signAuthToken({
      role: 'participant',
      sub: participantId,
      deviceToken,
    });

    const showToken = Boolean(scheduleRow.show_token_to_student);

    res.json({
      authToken,
      deviceToken,
      participant: {
        id: participantId,
        schoolId: Number(row.school_id),
        schoolName: String(row.school_name),
        npsn: String(row.npsn),
        nis: String(row.nis || ''),
        className: String(row.class_name || ''),
        username: String(row.username),
        fullName: String(row.full_name),
        gender: String(row.gender),
        birthDate: String(row.birth_date),
        assignedSession: Number(row.assigned_session),
      },
      schedule: {
        id: Number(scheduleRow.id),
        packageId: Number(scheduleRow.package_id),
        packageTitle: String(scheduleRow.package_title),
        subjectName: String(scheduleRow.subject_name),
        durationMinutes: Number(scheduleRow.duration_minutes),
        sessionNumber: Number(scheduleRow.session_number),
        examDate: String(scheduleRow.exam_date),
        startTime: String(scheduleRow.start_time),
        endTime: String(scheduleRow.end_time),
        antiCheatMode: String(scheduleRow.anti_cheat_mode),
        maxWarnings: Number(scheduleRow.max_warnings),
        visibleToken: showToken ? String(scheduleRow.token) : null,
      },
      existingSessionStatus: existingSession ? String(existingSession.status) : null,
    });
  } catch (err) {
    console.error('Participant login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan saat proses login peserta.' });
  }
});

// Step 3: Confirm Participant Data & Verify Session Token
app.post('/api/participant/confirm', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const deviceToken = req.auth!.deviceToken || '';
    const { scheduleId, typedName, birthDay, birthMonth, birthYear, tokenInput } = req.body || {};

    const participant = db
      .prepare(
        `SELECT p.*, s.name as school_name
         FROM participants p
         JOIN schools s ON s.id = p.school_id
         WHERE p.id = ?`,
      )
      .get(participantId);

    const schedule = db
      .prepare(
        `SELECT sch.*, ep.title as package_title, ep.subject_name, ep.duration_minutes
         FROM exam_schedules sch
         JOIN exam_packages ep ON ep.id = sch.package_id
         WHERE sch.id = ? AND sch.is_active = 1`,
      )
      .get(Number(scheduleId));

    if (!participant || !schedule) {
      return res.status(404).json({ error: 'Data peserta atau jadwal ujian tidak ditemukan.' });
    }

    if (!String(typedName || '').trim()) {
      return res.status(400).json({ error: 'Silakan ketik ulang Nama Peserta untuk konfirmasi.' });
    }

    if (!birthDay || !birthMonth || !birthYear) {
      return res.status(400).json({ error: 'Tanggal lahir (Hari, Bulan, Tahun) wajib dipilih.' });
    }

    const cleanToken = String(tokenInput || '').trim().toUpperCase();
    if (cleanToken !== String(schedule.token).trim().toUpperCase()) {
      return res.status(400).json({ error: 'Token ujian tidak sesuai. Periksa kembali token dari pengawas.' });
    }

    const existing = db
      .prepare('SELECT * FROM exam_sessions WHERE participant_id = ? AND schedule_id = ?')
      .get(participantId, Number(schedule.id));

    let sessionId: number;
    let status: SessionStatus = 'CONFIRMED';

    if (existing) {
      sessionId = Number(existing.id);
      const existingStatus = String(existing.status) as SessionStatus;
      if (existingStatus === 'COMPLETED') {
        const summary = finalizeSessionGrading(sessionId);
        return res.json({ alreadyCompleted: true, summary });
      }
      status = existingStatus;
      db.prepare('UPDATE exam_sessions SET device_token = ? WHERE id = ?').run(deviceToken, sessionId);
    } else {
      const inserted = db
        .prepare(
          `INSERT INTO exam_sessions (participant_id, schedule_id, package_id, status, device_token)
           VALUES (?, ?, ?, 'CONFIRMED', ?)`,
        )
        .run(participantId, Number(schedule.id), Number(schedule.package_id), deviceToken);
      sessionId = Number(inserted.lastInsertRowid);
    }

    res.json({
      sessionId,
      status,
      testSummary: {
        packageTitle: String(schedule.package_title),
        subjectName: String(schedule.subject_name),
        testStatus: status === 'CONFIRMED' ? 'Tes Baru' : status === 'LOCKED' ? 'Terkunci (Butuh Token Buka Kunci)' : 'Lanjutkan Tes',
        examDateTime: `${String(schedule.exam_date)}, ${String(schedule.start_time)} WIB`,
        durationMinutes: Number(schedule.duration_minutes),
        sessionNumber: Number(schedule.session_number),
        antiCheatMode: String(schedule.anti_cheat_mode),
        maxWarnings: Number(schedule.max_warnings),
      },
    });
  } catch (err) {
    console.error('Participant confirm error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi data peserta.' });
  }
});

// Step 4 -> Start Exam Workspace (returns cached public questions without answer keys)
app.post('/api/participant/start', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const deviceToken = req.auth!.deviceToken || '';
    const { sessionId } = req.body || {};

    const session = db
      .prepare(
        `SELECT es.*, ep.duration_minutes, ep.title as package_title, ep.subject_name,
                sch.anti_cheat_mode, sch.max_warnings, sch.session_number
         FROM exam_sessions es
         JOIN exam_packages ep ON ep.id = es.package_id
         JOIN exam_schedules sch ON sch.id = es.schedule_id
         WHERE es.id = ? AND es.participant_id = ?`,
      )
      .get(Number(sessionId), participantId);

    if (!session) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }

    if (String(session.device_token) !== deviceToken) {
      return res.status(409).json({
        error: 'Sesi perangkat tidak cocok. Hubungi Pengawas untuk Reset Login.',
      });
    }

    const currentStatus = String(session.status) as SessionStatus;
    if (currentStatus === 'COMPLETED') {
      const summary = finalizeSessionGrading(Number(session.id));
      return res.json({ status: 'COMPLETED', summary });
    }

    const nowMs = Date.now();
    let startedAt = session.started_at ? String(session.started_at) : null;
    let expiresAt = session.expires_at ? String(session.expires_at) : null;

    if (!startedAt || !expiresAt) {
      const durationMs = Number(session.duration_minutes) * 60 * 1000;
      startedAt = new Date(nowMs).toISOString();
      expiresAt = new Date(nowMs + durationMs).toISOString();
      db.prepare(
        `UPDATE exam_sessions
         SET status = 'IN_PROGRESS', started_at = ?, expires_at = ?
         WHERE id = ?`,
      ).run(startedAt, expiresAt, Number(session.id));
    }

    if (currentStatus === 'LOCKED') {
      return res.json({
        status: 'LOCKED',
        violationCount: Number(session.violation_count),
        expiresAt,
        serverNow: new Date(nowMs).toISOString(),
        questions: [],
        savedAnswers: [],
      });
    }

    // Serve cached questions (0 DB hits for question payloads!)
    const questions = getCachedPublicQuestions(Number(session.package_id));
    const savedRows = db
      .prepare('SELECT question_id, answer_json, is_doubtful FROM session_answers WHERE session_id = ?')
      .all(Number(session.id));

    const savedAnswers = savedRows.map((r) => ({
      questionId: Number(r.question_id),
      answer: r.answer_json ? (JSON.parse(String(r.answer_json)) as StudentAnswerPayload) : null,
      isDoubtful: Boolean(r.is_doubtful),
    }));

    res.json({
      status: 'IN_PROGRESS',
      sessionId: Number(session.id),
      startedAt,
      expiresAt,
      serverNow: new Date(nowMs).toISOString(),
      antiCheatMode: String(session.anti_cheat_mode),
      maxWarnings: Number(session.max_warnings),
      violationCount: Number(session.violation_count),
      questions,
      savedAnswers,
    });
  } catch (err) {
    console.error('Start exam error:', err);
    res.status(500).json({ error: 'Gagal memulai ujian.' });
  }
});

// Save answer UPSERT (debounced / per question switch)
app.post('/api/participant/answer', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const deviceToken = req.auth!.deviceToken || '';
    const { sessionId, questionId, answer, isDoubtful } = req.body || {};

    const session = db
      .prepare('SELECT id, participant_id, status, device_token, expires_at FROM exam_sessions WHERE id = ?')
      .get(Number(sessionId));

    if (!session || Number(session.participant_id) !== participantId) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }
    if (String(session.device_token) !== deviceToken) {
      return res.status(409).json({ error: 'Sesi digantikan perangkat lain.' });
    }
    if (String(session.status) === 'LOCKED') {
      return res.status(423).json({ error: 'Sesi ujian terkunci karena pelanggaran. Masukkan Token Buka Kunci.' });
    }
    if (String(session.status) === 'COMPLETED') {
      return res.status(409).json({ error: 'Ujian telah selesai.' });
    }

    db.prepare(
      `INSERT INTO session_answers (session_id, question_id, answer_json, is_doubtful, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, question_id) DO UPDATE SET
         answer_json = excluded.answer_json,
         is_doubtful = excluded.is_doubtful,
         updated_at = datetime('now')`,
    ).run(
      Number(sessionId),
      Number(questionId),
      answer ? JSON.stringify(answer) : null,
      isDoubtful ? 1 : 0,
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Save answer error:', err);
    res.status(500).json({ error: 'Gagal menyimpan jawaban.' });
  }
});

// Log anti-cheat violation & auto-lock session when threshold reached
app.post('/api/participant/violation', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const { sessionId, reason, durationSeconds } = req.body || {};

    const session = db
      .prepare(
        `SELECT es.*, sch.anti_cheat_mode, sch.max_warnings
         FROM exam_sessions es
         JOIN exam_schedules sch ON sch.id = es.schedule_id
         WHERE es.id = ? AND es.participant_id = ?`,
      )
      .get(Number(sessionId), participantId);

    if (!session) {
      return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    }
    if (String(session.status) === 'COMPLETED') {
      return res.json({ status: 'COMPLETED', locked: false });
    }

    const nextCount = Number(session.violation_count || 0) + 1;
    const mode = String(session.anti_cheat_mode);
    const maxWarnings = Number(session.max_warnings || 1);
    const shouldLock = mode === 'strict' || nextCount >= maxWarnings;

    const unlockToken =
      shouldLock && !session.unlock_token
        ? generateShortToken(6)
        : session.unlock_token
          ? String(session.unlock_token)
          : null;

    const actionTaken = shouldLock ? 'LOCKED_SESSION' : `WARNING_${nextCount}`;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO violation_logs (session_id, reason, duration_seconds, action_taken)
         VALUES (?, ?, ?, ?)`,
      ).run(
        Number(session.id),
        String(reason || 'Keluar dari halaman ujian'),
        Number(durationSeconds || 0),
        actionTaken,
      );

      db.prepare(
        `UPDATE exam_sessions
         SET violation_count = ?,
             status = CASE WHEN ? = 1 THEN 'LOCKED' ELSE status END,
             unlock_token = COALESCE(unlock_token, ?)
         WHERE id = ?`,
      ).run(nextCount, shouldLock ? 1 : 0, unlockToken, Number(session.id));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({
      locked: shouldLock,
      status: shouldLock ? 'LOCKED' : String(session.status),
      violationCount: nextCount,
      maxWarnings,
    });
  } catch (err) {
    console.error('Violation log error:', err);
    res.status(500).json({ error: 'Gagal mencatat pelanggaran.' });
  }
});

// Student checks if Proktor unlocked directly OR submits Unlock Token
app.get('/api/participant/session-status', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const sessionId = Number(req.query.sessionId);
    const session = db
      .prepare('SELECT id, status, violation_count, package_id, expires_at FROM exam_sessions WHERE id = ? AND participant_id = ?')
      .get(sessionId, participantId);

    if (!session) {
      return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    }
    res.json({
      status: String(session.status),
      violationCount: Number(session.violation_count),
      expiresAt: session.expires_at ? String(session.expires_at) : null,
    });
  } catch (err) {
    console.error('Session status error:', err);
    res.status(500).json({ error: 'Gagal memeriksa status sesi.' });
  }
});

app.post('/api/participant/unlock', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const { sessionId, unlockToken } = req.body || {};
    const cleanUnlock = String(unlockToken || '').trim().toUpperCase();

    const session = db
      .prepare('SELECT * FROM exam_sessions WHERE id = ? AND participant_id = ?')
      .get(Number(sessionId), participantId);

    if (!session) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }

    if (String(session.status) !== 'LOCKED') {
      return res.json({ unlocked: true, status: String(session.status) });
    }

    if (!session.unlock_token || cleanUnlock !== String(session.unlock_token).trim().toUpperCase()) {
      return res.status(400).json({
        error: 'Token Buka Kunci tidak valid. Minta kode token 6 karakter dari Pengawas/Proktor.',
      });
    }

    db.prepare(
      `UPDATE exam_sessions
       SET status = 'IN_PROGRESS', unlock_token = NULL
       WHERE id = ?`,
    ).run(Number(session.id));

    db.prepare(
      `INSERT INTO violation_logs (session_id, reason, duration_seconds, action_taken)
       VALUES (?, 'Pembukaan kunci dengan Token Ulang', 0, 'UNLOCKED_BY_TOKEN')`,
    ).run(Number(session.id));

    const questions = getCachedPublicQuestions(Number(session.package_id));
    const savedRows = db
      .prepare('SELECT question_id, answer_json, is_doubtful FROM session_answers WHERE session_id = ?')
      .all(Number(session.id));

    res.json({
      unlocked: true,
      status: 'IN_PROGRESS',
      expiresAt: session.expires_at ? String(session.expires_at) : null,
      serverNow: new Date().toISOString(),
      questions,
      savedAnswers: savedRows.map((r) => ({
        questionId: Number(r.question_id),
        answer: r.answer_json ? (JSON.parse(String(r.answer_json)) as StudentAnswerPayload) : null,
        isDoubtful: Boolean(r.is_doubtful),
      })),
    });
  } catch (err) {
    console.error('Unlock session error:', err);
    res.status(500).json({ error: 'Gagal membuka kunci sesi.' });
  }
});

// Finish exam & calculate accurate scores on server
app.post('/api/participant/finish', requireParticipantAuth, (req: AuthenticatedRequest, res) => {
  try {
    const participantId = req.auth!.sub;
    const { sessionId } = req.body || {};

    const session = db
      .prepare('SELECT id, participant_id FROM exam_sessions WHERE id = ?')
      .get(Number(sessionId));

    if (!session || Number(session.participant_id) !== participantId) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }

    const summary = finalizeSessionGrading(Number(session.id));
    res.json({ summary });
  } catch (err) {
    console.error('Finish exam error:', err);
    res.status(500).json({ error: 'Gagal menyelesaikan dan menghitung nilai ujian.' });
  }
});

// ==========================================
// ADMIN / PROKTOR PORTAL (Bank Soal, Sesi 1-3, Monitoring, Rekap)
// ==========================================
app.get('/api/admin/status', (_req, res) => {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const storedHash = getActiveAdminPasscodeHash();
  res.json({
    isConfigured: Boolean(envPasscode || storedHash),
    managedByEnv: Boolean(envPasscode),
  });
});

app.post('/api/admin/claim', (req, res) => {
  try {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      return res.status(400).json({ error: 'Passcode Admin sudah diatur melalui konfigurasi server.' });
    }
    const existingHash = getActiveAdminPasscodeHash();
    if (existingHash) {
      return res.status(409).json({ error: 'Password Admin sudah diklaim sebelumnya. Silakan login.' });
    }
    const password = String(req.body?.password || '').trim();
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password Admin minimal 6 karakter.' });
    }

    const hashed = hashPassword(password);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_password_hash', ?)").run(hashed);

    const token = signAuthToken({ role: 'admin', sub: 1 });
    res.json({ token });
  } catch (err) {
    console.error('Admin claim error:', err);
    res.status(500).json({ error: 'Gagal menyimpan password Admin pertama kali.' });
  }
});

app.post('/api/admin/login', (req, res) => {
  try {
    const password = String(req.body?.password || '');
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();

    if (envPasscode) {
      const a = Buffer.from(password);
      const b = Buffer.from(envPasscode);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'Passcode Admin/Proktor salah.' });
      }
      return res.json({ token: signAuthToken({ role: 'admin', sub: 1 }) });
    }

    const storedHash = getActiveAdminPasscodeHash();
    if (!storedHash) {
      return res.status(400).json({ error: 'Akun Admin belum diatur. Silakan buat password Admin terlebih dahulu.' });
    }
    if (!verifyPassword(password, storedHash)) {
      return res.status(401).json({ error: 'Password Admin/Proktor salah.' });
    }

    res.json({ token: signAuthToken({ role: 'admin', sub: 1 }) });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi login Admin.' });
  }
});

// Live Monitoring & Anti-Cheat Controls
app.get('/api/admin/monitoring', requireAdminAuth, (_req, res) => {
  try {
    const sessions = db
      .prepare(
        `SELECT es.*, p.username, p.full_name, p.nis, p.class_name, p.school_id, s.name as school_name, s.npsn,
                ep.title as package_title, sch.session_number
         FROM exam_sessions es
         JOIN participants p ON p.id = es.participant_id
         JOIN schools s ON s.id = p.school_id
         JOIN exam_packages ep ON ep.id = es.package_id
         JOIN exam_schedules sch ON sch.id = es.schedule_id
         ORDER BY
           CASE es.status WHEN 'LOCKED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'CONFIRMED' THEN 2 ELSE 3 END,
           es.id DESC`,
      )
      .all();

    const logs = db
      .prepare(
        `SELECT vl.*, es.participant_id
         FROM violation_logs vl
         JOIN exam_sessions es ON es.id = vl.session_id
         ORDER BY vl.id DESC
         LIMIT 150`,
      )
      .all();

    const logsBySession = new Map<number, unknown[]>();
    for (const l of logs) {
      const sid = Number(l.session_id);
      if (!logsBySession.has(sid)) logsBySession.set(sid, []);
      logsBySession.get(sid)!.push({
        id: Number(l.id),
        reason: String(l.reason),
        durationSeconds: Number(l.duration_seconds),
        actionTaken: String(l.action_taken),
        createdAt: String(l.created_at),
      });
    }

    res.json({
      sessions: sessions.map((s) => ({
        id: Number(s.id),
        participantId: Number(s.participant_id),
        username: String(s.username),
        fullName: String(s.full_name),
        nis: String(s.nis || ''),
        className: String(s.class_name || ''),
        schoolId: Number(s.school_id),
        schoolName: String(s.school_name),
        npsn: String(s.npsn),
        packageTitle: String(s.package_title),
        sessionNumber: Number(s.session_number),
        status: String(s.status),
        unlockToken: s.unlock_token ? String(s.unlock_token) : null,
        violationCount: Number(s.violation_count),
        startedAt: s.started_at ? String(s.started_at) : null,
        finishedAt: s.finished_at ? String(s.finished_at) : null,
        totalScore: Number(s.total_score),
        maxScore: Number(s.max_score),
        percentage: Number(s.percentage),
        needsManualGrading: Boolean(s.needs_manual_grading),
        violations: logsBySession.get(Number(s.id)) || [],
      })),
    });
  } catch (err) {
    console.error('Monitoring fetch error:', err);
    res.status(500).json({ error: 'Gagal memuat data monitoring sesi.' });
  }
});

app.post('/api/admin/sessions/:id/issue-unlock-token', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const token = generateShortToken(6);
    db.prepare("UPDATE exam_sessions SET status = 'LOCKED', unlock_token = ? WHERE id = ? AND status != 'COMPLETED'").run(token, id);
    res.json({ unlockToken: token });
  } catch (err) {
    console.error('Issue unlock token error:', err);
    res.status(500).json({ error: 'Gagal membuat token buka kunci.' });
  }
});

app.post('/api/admin/sessions/:id/unlock-direct', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare("UPDATE exam_sessions SET status = 'IN_PROGRESS', unlock_token = NULL WHERE id = ? AND status = 'LOCKED'").run(id);
    db.prepare("INSERT INTO violation_logs (session_id, reason, duration_seconds, action_taken) VALUES (?, 'Dibuka langsung oleh Pengawas', 0, 'UNLOCKED_DIRECT')").run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Direct unlock error:', err);
    res.status(500).json({ error: 'Gagal membuka kunci sesi secara langsung.' });
  }
});

app.post('/api/admin/sessions/:id/reset-device', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare("UPDATE exam_sessions SET device_token = '', status = CASE WHEN status = 'IN_PROGRESS' THEN 'CONFIRMED' ELSE status END WHERE id = ? AND status != 'COMPLETED'").run(id);
    db.prepare("INSERT INTO violation_logs (session_id, reason, duration_seconds, action_taken) VALUES (?, 'Reset Login Perangkat oleh Pengawas', 0, 'DEVICE_RESET')").run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset device error:', err);
    res.status(500).json({ error: 'Gagal mereset login perangkat.' });
  }
});

app.post('/api/admin/sessions/:id/force-finish', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const summary = finalizeSessionGrading(id);
    if (!summary) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    res.json({ summary });
  } catch (err) {
    console.error('Force finish error:', err);
    res.status(500).json({ error: 'Gagal mengakhiri sesi secara paksa.' });
  }
});

app.delete('/api/admin/sessions/:id', requireAdminAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM exam_sessions WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Gagal mereset sesi peserta.' });
  }
});

// Schools CRUD
app.get('/api/admin/schools', requireAdminAuth, (_req, res) => {
  res.json({ schools: listSchools() });
});

app.post('/api/admin/schools', requireAdminAuth, (req, res) => {
  try {
    const { npsn, name, district } = req.body || {};
    if (!npsn || !name) {
      return res.status(400).json({ error: 'NPSN dan Nama Sekolah wajib diisi.' });
    }
    const cleanNpsn = String(npsn).trim();
    const cleanName = String(name).trim();
    if (!cleanNpsn || !cleanName) {
      return res.status(400).json({ error: 'NPSN dan Nama Sekolah tidak boleh kosong.' });
    }
    const result = db
      .prepare('INSERT INTO schools (npsn, name, district) VALUES (?, ?, ?)')
      .run(cleanNpsn, cleanName, String(district || '-').trim() || '-');
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('Create school error:', err);
    res.status(400).json({ error: 'Gagal menambah sekolah (pastikan NPSN belum terdaftar).' });
  }
});

app.patch('/api/admin/schools/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM schools WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Data sekolah tidak ditemukan.' });
    }

    const { npsn, name, district } = req.body || {};
    const cleanNpsn = typeof npsn === 'string' ? npsn.trim() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanDistrict = typeof district === 'string' ? district.trim() : '';

    if (!cleanNpsn || !cleanName) {
      return res.status(400).json({ error: 'NPSN dan Nama Sekolah wajib diisi.' });
    }

    db.prepare('UPDATE schools SET npsn = ?, name = ?, district = ? WHERE id = ?').run(
      cleanNpsn,
      cleanName,
      cleanDistrict || '-',
      id,
    );

    res.json({
      ok: true,
      school: { id, npsn: cleanNpsn, name: cleanName, district: cleanDistrict || '-' },
    });
  } catch (err) {
    console.error('Update school error:', err);
    res.status(400).json({
      error: 'Gagal memperbarui identitas sekolah (pastikan NPSN belum dipakai sekolah lain).',
    });
  }
});

app.delete('/api/admin/schools/:id', requireAdminAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM schools WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete school error:', err);
    res.status(500).json({ error: 'Gagal menghapus sekolah.' });
  }
});

// Packages CRUD
app.get('/api/admin/packages', requireAdminAuth, (_req, res) => {
  res.json({ packages: listPackages() });
});

app.post('/api/admin/packages', requireAdminAuth, (req, res) => {
  try {
    const {
      educationLevel,
      subjectCategory,
      subjectName,
      title,
      durationMinutes,
      description,
      isActive,
      autoScheduleSesi1,
      initialToken,
    } = req.body || {};
    if (!subjectName || !title) {
      return res.status(400).json({ error: 'Mata pelajaran dan judul paket wajib diisi.' });
    }
    const rawInitialToken = typeof initialToken === 'string' ? initialToken.trim().toUpperCase() : '';
    if (autoScheduleSesi1 && rawInitialToken && !/^[A-Z0-9_-]{3,20}$/.test(rawInitialToken)) {
      return res.status(400).json({
        error: 'Format token harus 3–20 karakter (hanya huruf, angka, tanda hubung -, atau garis bawah _).',
      });
    }
    const activeVal = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : 1;
    const result = db
      .prepare(
        `INSERT INTO exam_packages (education_level, subject_category, subject_name, title, duration_minutes, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(educationLevel || 'SMP/MTs/Sederajat'),
        String(subjectCategory || 'Mata Pelajaran Wajib'),
        String(subjectName).trim(),
        String(title).trim(),
        Math.max(5, Number(durationMinutes || 75)),
        String(description || '').trim(),
        activeVal,
      );

    const newPkgId = Number(result.lastInsertRowid);
    let scheduleToken: string | null = null;

    if (autoScheduleSesi1) {
      scheduleToken = rawInitialToken || generateShortToken(6);
      const schoolIds = listSchools().map((s) => s.id);
      db.prepare(
        `INSERT INTO exam_schedules (package_id, session_number, exam_date, start_time, end_time, token, show_token_to_student, anti_cheat_mode, max_warnings, allowed_school_ids_json, is_active)
         VALUES (?, 1, ?, '07:30', '23:59', ?, 1, 'strict', 1, ?, 1)`,
      ).run(
        newPkgId,
        new Date().toISOString().slice(0, 10),
        scheduleToken,
        JSON.stringify(schoolIds),
      );
    }

    res.json({ id: newPkgId, scheduleToken });
  } catch (err) {
    console.error('Create package error:', err);
    res.status(500).json({ error: 'Gagal membuat paket soal.' });
  }
});

app.patch('/api/admin/packages/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM exam_packages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Folder paket soal tidak ditemukan.' });
    }

    const {
      educationLevel,
      subjectCategory,
      subjectName,
      title,
      durationMinutes,
      description,
      isActive,
    } = req.body || {};

    db.prepare(
      `UPDATE exam_packages
       SET education_level = COALESCE(?, education_level),
           subject_category = COALESCE(?, subject_category),
           subject_name = COALESCE(?, subject_name),
           title = COALESCE(?, title),
           duration_minutes = COALESCE(?, duration_minutes),
           description = COALESCE(?, description),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
    ).run(
      educationLevel ? String(educationLevel).trim() : null,
      subjectCategory ? String(subjectCategory).trim() : null,
      subjectName ? String(subjectName).trim() : null,
      title ? String(title).trim() : null,
      typeof durationMinutes === 'number' ? Math.max(5, durationMinutes) : null,
      typeof description === 'string' ? description.trim() : null,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
      id,
    );

    invalidatePackageCache(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update package error:', err);
    res.status(500).json({ error: 'Gagal memperbarui folder paket soal.' });
  }
});

app.delete('/api/admin/packages/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM exam_packages WHERE id = ?').run(id);
    invalidatePackageCache(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete package error:', err);
    res.status(500).json({ error: 'Gagal menghapus paket ujian.' });
  }
});

// Schedules (Sesi 1, 2, 3) CRUD
app.get('/api/admin/schedules', requireAdminAuth, (_req, res) => {
  res.json({ schedules: listSchedules() });
});

app.post('/api/admin/schedules', requireAdminAuth, (req, res) => {
  try {
    const {
      packageId,
      sessionNumber,
      examDate,
      startTime,
      endTime,
      token,
      showTokenToStudent,
      antiCheatMode,
      maxWarnings,
      allowedSchoolIds,
    } = req.body || {};

    const rawToken = typeof token === 'string' ? token.trim().toUpperCase() : '';
    if (rawToken && !/^[A-Z0-9_-]{3,20}$/.test(rawToken)) {
      return res.status(400).json({
        error: 'Format token harus 3–20 karakter (huruf, angka, -, atau _ tanpa spasi).',
      });
    }
    const cleanToken = rawToken || generateShortToken(6);
    const result = db
      .prepare(
        `INSERT INTO exam_schedules (package_id, session_number, exam_date, start_time, end_time, token, show_token_to_student, anti_cheat_mode, max_warnings, allowed_school_ids_json, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        Number(packageId),
        [1, 2, 3].includes(Number(sessionNumber)) ? Number(sessionNumber) : 1,
        String(examDate || new Date().toISOString().slice(0, 10)),
        String(startTime || '07:30'),
        String(endTime || '09:30'),
        cleanToken,
        showTokenToStudent ? 1 : 0,
        antiCheatMode === 'tolerance' ? 'tolerance' : 'strict',
        Math.max(1, Number(maxWarnings || 1)),
        JSON.stringify(Array.isArray(allowedSchoolIds) ? allowedSchoolIds : []),
      );

    res.json({ id: Number(result.lastInsertRowid), token: cleanToken });
  } catch (err) {
    console.error('Create schedule error:', err);
    res.status(500).json({ error: 'Gagal membuat jadwal sesi.' });
  }
});

app.patch('/api/admin/schedules/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      token,
      regenerateToken,
      showTokenToStudent,
      antiCheatMode,
      isActive,
      maxWarnings,
      examDate,
      startTime,
      endTime,
      sessionNumber,
    } = req.body || {};
    const existing = db.prepare('SELECT * FROM exam_schedules WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });

    let newToken = String(existing.token);
    if (typeof token === 'string') {
      const cleaned = token.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(cleaned)) {
        return res.status(400).json({
          error: 'Token harus 3–20 karakter (huruf, angka, -, atau _ tanpa spasi).',
        });
      }
      newToken = cleaned;
    } else if (regenerateToken) {
      newToken = generateShortToken(6);
    }

    db.prepare(
      `UPDATE exam_schedules
       SET token = ?,
           exam_date = COALESCE(?, exam_date),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
           session_number = COALESCE(?, session_number),
           show_token_to_student = COALESCE(?, show_token_to_student),
           anti_cheat_mode = COALESCE(?, anti_cheat_mode),
           max_warnings = COALESCE(?, max_warnings),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
    ).run(
      newToken,
      examDate ? String(examDate) : null,
      startTime ? String(startTime) : null,
      endTime ? String(endTime) : null,
      [1, 2, 3].includes(Number(sessionNumber)) ? Number(sessionNumber) : null,
      typeof showTokenToStudent === 'boolean' ? (showTokenToStudent ? 1 : 0) : null,
      antiCheatMode ? String(antiCheatMode) : null,
      typeof maxWarnings === 'number' ? maxWarnings : null,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
      id,
    );

    res.json({ token: newToken, ok: true });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: 'Gagal memperbarui jadwal sesi.' });
  }
});

app.delete('/api/admin/schedules/:id', requireAdminAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM exam_schedules WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ error: 'Gagal menghapus jadwal.' });
  }
});

// Participants Management
app.get('/api/admin/participants', requireAdminAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT p.id, p.school_id, p.nis, p.class_name, p.username, p.full_name, p.gender, p.birth_date, p.assigned_session,
                s.name as school_name, s.npsn
         FROM participants p
         JOIN schools s ON s.id = p.school_id
         ORDER BY
           CASE WHEN p.class_name = '' THEN 1 ELSE 0 END,
           p.class_name ASC,
           p.full_name ASC`,
      )
      .all();

    res.json({
      participants: rows.map((r) => ({
        id: Number(r.id),
        schoolId: Number(r.school_id),
        schoolName: String(r.school_name),
        npsn: String(r.npsn),
        nis: String(r.nis || ''),
        className: String(r.class_name || ''),
        username: String(r.username),
        fullName: String(r.full_name),
        gender: String(r.gender),
        birthDate: String(r.birth_date),
        assignedSession: Number(r.assigned_session),
      })),
    });
  } catch (err) {
    console.error('List participants error:', err);
    res.status(500).json({ error: 'Gagal memuat daftar peserta.' });
  }
});

app.get('/api/admin/participants/template.xlsx', requireAdminAuth, async (req, res) => {
  try {
    const classLabel = String(req.query.className || '').trim().toUpperCase();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Portal Ujian CBT';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Daftar Siswa', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'No', key: 'no', width: 8 },
      { header: 'NIS', key: 'nis', width: 20 },
      { header: 'NAMA SISWA', key: 'nama', width: 38 },
      { header: 'Jenis Kelamin (L/P)', key: 'jk', width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E5CB8' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    const sampleRows = [
      { no: 1, nis: '202607001', nama: 'Ahmad Fauzan', jk: 'L' },
      { no: 2, nis: '202607002', nama: 'Putri Lestari', jk: 'P' },
      { no: 3, nis: '202607003', nama: 'Muhammad Rizky', jk: 'L' },
    ];
    for (const item of sampleRows) {
      const r = sheet.addRow(item);
      r.getCell(1).alignment = { horizontal: 'center' };
      r.getCell(2).numFmt = '@';
      r.getCell(4).alignment = { horizontal: 'center' };
    }

    // Add L/P dropdown validation on column D (rows 2 to 200)
    for (let rowIdx = 2; rowIdx <= 200; rowIdx++) {
      sheet.getCell(`B${rowIdx}`).numFmt = '@';
      sheet.getCell(`D${rowIdx}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"L,P"'],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Format Jenis Kelamin',
        error: 'Isi dengan huruf L (Laki-Laki) atau P (Perempuan).',
      };
    }

    const guide = workbook.addWorksheet('Petunjuk Pengisian');
    guide.columns = [
      { header: 'Panduan Impor Data Peserta Ujian (Excel)', key: 'info', width: 78 },
    ];
    guide.getRow(1).font = { bold: true, size: 12 };
    const notes = [
      '1. Gunakan sheet "Daftar Siswa" dengan urutan kolom persis: No | NIS | NAMA SISWA | Jenis Kelamin (L/P).',
      '2. Hapus 3 baris contoh sebelum mengisi daftar siswa kelas Anda yang sebenarnya.',
      '3. Kolom NIS wajib unik per siswa dan otomatis menjadi Username login siswa.',
      '4. Kolom Jenis Kelamin (L/P) diisi dengan L (Laki-Laki) atau P (Perempuan).',
      '5. Pilih Sekolah, Kelas (7A–7K, 8A–8K, 9A–9K), dan Sesi Ujian pada halaman Admin sebelum mengunggah file ini.',
      '6. Format file yang didukung saat impor: .xlsx atau .csv.',
    ];
    for (const n of notes) {
      guide.addRow({ info: n });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeSuffix = classLabel ? `_Kelas_${classLabel.replace(/[^A-Z0-9_-]/g, '')}` : '';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Template_Impor_Siswa${safeSuffix}.xlsx"`,
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Excel template error:', err);
    res.status(500).json({ error: 'Gagal membuat template Excel.' });
  }
});

app.post('/api/admin/participants/parse-excel', requireAdminAuth, async (req, res) => {
  try {
    const { base64Data } = req.body || {};
    if (typeof base64Data !== 'string' || !base64Data.trim()) {
      return res.status(400).json({ error: 'File Excel tidak ditemukan.' });
    }
    const cleanB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const rawBuf = Buffer.from(cleanB64, 'base64');
    if (rawBuf.length === 0 || rawBuf.length > 2_500_000) {
      return res.status(400).json({ error: 'Ukuran file Excel maksimal 2 MB.' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rawBuf as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({ error: 'Sheet di dalam file Excel kosong.' });
    }

    const cellText = (val: ExcelJS.CellValue): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        if ('text' in val && typeof val.text === 'string') return val.text.trim();
        if ('result' in val && val.result !== undefined) return String(val.result).trim();
        if ('richText' in val && Array.isArray(val.richText)) {
          return val.richText.map((rt) => rt.text || '').join('').trim();
        }
      }
      return String(val).trim();
    };

    // Detect header row & column mapping flexibly
    let headerRowIdx = 1;
    let colMap = { no: 1, nis: 2, nama: 3, jk: 4 };

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const texts: string[] = [];
      for (let c = 1; c <= Math.min(10, sheet.columnCount || 6); c++) {
        texts.push(cellText(row.getCell(c).value).toLowerCase());
      }
      const nisIdx = texts.findIndex((t) => t === 'nis' || t.includes('nis'));
      const namaIdx = texts.findIndex((t) => t.includes('nama'));
      if (nisIdx !== -1 && namaIdx !== -1) {
        headerRowIdx = r;
        const noIdx = texts.findIndex((t) => t === 'no' || t === 'no.' || t === 'nomor');
        const jkIdx = texts.findIndex(
          (t) => t.includes('kelamin') || t === 'jk' || t === 'l/p' || t.includes('(l/p)'),
        );
        colMap = {
          no: noIdx !== -1 ? noIdx + 1 : 1,
          nis: nisIdx + 1,
          nama: namaIdx + 1,
          jk: jkIdx !== -1 ? jkIdx + 1 : 4,
        };
        break;
      }
    }

    const rows: Array<{
      no: string;
      nis: string;
      fullName: string;
      gender: 'Laki-Laki' | 'Perempuan';
    }> = [];

    const maxRow = Math.min(sheet.rowCount, headerRowIdx + 2000);
    for (let r = headerRowIdx + 1; r <= maxRow; r++) {
      const row = sheet.getRow(r);
      const no = cellText(row.getCell(colMap.no).value);
      const nis = cellText(row.getCell(colMap.nis).value);
      const fullName = cellText(row.getCell(colMap.nama).value);
      const rawJk = cellText(row.getCell(colMap.jk).value).toUpperCase();

      if (!nis && !fullName) continue;
      if (!nis || !fullName) continue;

      const isFemale =
        rawJk === 'P' || rawJk.startsWith('P') || rawJk.includes('PEREMPUAN') || rawJk.includes('WANITA');
      rows.push({
        no: no || String(rows.length + 1),
        nis,
        fullName,
        gender: isFemale ? 'Perempuan' : 'Laki-Laki',
      });
    }

    res.json({ rows });
  } catch (err) {
    console.error('Parse Excel error:', err);
    res.status(400).json({
      error: 'Gagal membaca file Excel. Pastikan format file adalah .xlsx yang valid sesuai template.',
    });
  }
});

app.post('/api/admin/participants', requireAdminAuth, (req, res) => {
  try {
    const {
      schoolId,
      nis,
      className,
      username,
      password,
      fullName,
      gender,
      birthDate,
      assignedSession,
    } = req.body || {};
    const cleanNis = String(nis || '').trim();
    const cleanClass = String(className || '').trim().toUpperCase();
    const cleanUsername = String(username || cleanNis || '').trim();
    const cleanFullName = String(fullName || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!schoolId || !cleanUsername || !cleanPassword || !cleanFullName) {
      return res.status(400).json({
        error: 'Sekolah, username/NIS, password, dan nama lengkap wajib diisi.',
      });
    }
    const result = db
      .prepare(
        `INSERT INTO participants (school_id, nis, class_name, username, password_hash, full_name, gender, birth_date, assigned_session)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(schoolId),
        cleanNis,
        cleanClass,
        cleanUsername,
        hashPassword(cleanPassword),
        cleanFullName,
        gender === 'Perempuan' ? 'Perempuan' : 'Laki-Laki',
        String(birthDate || '2011-01-01'),
        [1, 2, 3].includes(Number(assignedSession)) ? Number(assignedSession) : 1,
      );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('Create participant error:', err);
    res.status(400).json({ error: 'Gagal menambah peserta (pastikan username belum dipakai).' });
  }
});

app.patch('/api/admin/participants/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Data peserta tidak ditemukan.' });
    }

    const {
      schoolId,
      nis,
      className,
      username,
      fullName,
      gender,
      birthDate,
      assignedSession,
      newPassword,
    } = req.body || {};

    const cleanUsername =
      typeof username === 'string' ? username.trim() : String(existing.username);
    const cleanFullName =
      typeof fullName === 'string' ? fullName.trim() : String(existing.full_name);
    const cleanNis = typeof nis === 'string' ? nis.trim() : String(existing.nis || '');
    const cleanClass =
      typeof className === 'string' ? className.trim().toUpperCase() : String(existing.class_name || '');
    const cleanSchoolId = schoolId ? Number(schoolId) : Number(existing.school_id);
    const cleanGender =
      gender === 'Perempuan' || gender === 'P' ? 'Perempuan' : gender === 'Laki-Laki' || gender === 'L' ? 'Laki-Laki' : String(existing.gender);
    const cleanBirthDate =
      typeof birthDate === 'string' && birthDate.trim()
        ? birthDate.trim()
        : String(existing.birth_date);
    const cleanSession = [1, 2, 3].includes(Number(assignedSession))
      ? Number(assignedSession)
      : Number(existing.assigned_session);

    if (!cleanUsername || !cleanFullName || !cleanSchoolId) {
      return res.status(400).json({ error: 'Sekolah, username, dan nama siswa wajib diisi.' });
    }

    const nextPasswordHash =
      typeof newPassword === 'string' && newPassword.trim()
        ? hashPassword(newPassword.trim())
        : String(existing.password_hash);

    db.prepare(
      `UPDATE participants
       SET school_id = ?,
           nis = ?,
           class_name = ?,
           username = ?,
           password_hash = ?,
           full_name = ?,
           gender = ?,
           birth_date = ?,
           assigned_session = ?
       WHERE id = ?`,
    ).run(
      cleanSchoolId,
      cleanNis,
      cleanClass,
      cleanUsername,
      nextPasswordHash,
      cleanFullName,
      cleanGender,
      cleanBirthDate,
      cleanSession,
      id,
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Update participant error:', err);
    res.status(400).json({
      error: 'Gagal memperbarui data peserta (pastikan username belum digunakan siswa lain).',
    });
  }
});

app.post('/api/admin/participants/bulk', requireAdminAuth, (req, res) => {
  try {
    const { schoolId, className, assignedSession, rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Daftar peserta untuk impor massal kosong.' });
    }
    const defaultSchoolId = Number(schoolId);
    const defaultClass = String(className || '').trim().toUpperCase();
    const defaultSession = [1, 2, 3].includes(Number(assignedSession))
      ? Number(assignedSession)
      : 1;

    const schoolsByNpsn = new Map<string, number>();
    for (const sc of listSchools()) {
      schoolsByNpsn.set(sc.npsn, sc.id);
    }

    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO participants (school_id, nis, class_name, username, password_hash, full_name, gender, birth_date, assigned_session)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let insertedCount = 0;
    let skippedCount = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of rows.slice(0, 2000)) {
        const nis = String(item?.nis || '').trim();
        const username = String(item?.username || nis || '').trim();
        const password = String(item?.password || nis || 'tka2026').trim();
        const fullName = String(item?.fullName || '').trim();
        const rowClass = String(item?.className || defaultClass || '').trim().toUpperCase();
        const resolvedSchoolId = item?.npsn
          ? schoolsByNpsn.get(String(item.npsn).trim()) || defaultSchoolId
          : Number(item?.schoolId || defaultSchoolId);

        if (!username || !password || !fullName || !resolvedSchoolId) {
          skippedCount++;
          continue;
        }

        const rawGender = String(item?.gender || '').trim().toUpperCase();
        const resolvedGender =
          rawGender === 'P' || rawGender === 'PEREMPUAN' || rawGender.startsWith('P')
            ? 'Perempuan'
            : 'Laki-Laki';

        const changes = insertStmt.run(
          resolvedSchoolId,
          nis,
          rowClass,
          username,
          hashPassword(password),
          fullName,
          resolvedGender,
          String(item?.birthDate || '2011-01-01'),
          [1, 2, 3].includes(Number(item?.assignedSession))
            ? Number(item.assignedSession)
            : defaultSession,
        ).changes;

        if (Number(changes) > 0) insertedCount++;
        else skippedCount++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ insertedCount, skippedCount });
  } catch (err) {
    console.error('Bulk import participants error:', err);
    res.status(500).json({ error: 'Gagal melakukan impor massal peserta.' });
  }
});

app.delete('/api/admin/participants/:id', requireAdminAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM participants WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete participant error:', err);
    res.status(500).json({ error: 'Gagal menghapus peserta.' });
  }
});

// Questions Bank (All 5 Official TKA Types)
app.get('/api/admin/questions', requireAdminAuth, (req, res) => {
  try {
    const packageId = Number(req.query.packageId);
    if (!packageId) {
      return res.status(400).json({ error: 'packageId wajib disertakan.' });
    }
    res.json({ questions: getAdminQuestionsByPackage(packageId) });
  } catch (err) {
    console.error('Get admin questions error:', err);
    res.status(500).json({ error: 'Gagal memuat bank soal.' });
  }
});

app.post('/api/admin/questions', requireAdminAuth, (req, res) => {
  try {
    const {
      packageId,
      orderNumber,
      questionType,
      layoutMode,
      stimulus,
      prompt,
      config,
      answerKey,
      maxScore,
      scoringMode,
      explanation,
    } = req.body || {};

    if (!packageId || !questionType || !prompt) {
      return res.status(400).json({ error: 'Paket, jenis soal, dan pertanyaan wajib diisi.' });
    }

    const pkgIdNum = Number(packageId);
    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(order_number), 0) as max_ord FROM questions WHERE package_id = ?')
      .get(pkgIdNum);
    const nextOrder = Number(orderNumber || Number(maxOrderRow?.max_ord || 0) + 1);

    const result = db
      .prepare(
        `INSERT INTO questions (package_id, order_number, question_type, layout_mode, stimulus_json, prompt, config_json, answer_key_json, max_score, scoring_mode, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        pkgIdNum,
        nextOrder,
        String(questionType) as QuestionType,
        layoutMode === 'split_two_column' ? 'split_two_column' : 'single_column',
        stimulus ? JSON.stringify(stimulus) : null,
        String(prompt).trim(),
        JSON.stringify((config || {}) as QuestionConfig),
        JSON.stringify((answerKey || {}) as AnswerKey),
        Math.max(1, Number(maxScore || 1)),
        (scoringMode === 'exact' ? 'exact' : 'partial') as ScoringMode,
        String(explanation || '').trim(),
      );

    invalidatePackageCache(pkgIdNum);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('Create question error:', err);
    res.status(500).json({ error: 'Gagal menyimpan soal baru.' });
  }
});

app.put('/api/admin/questions/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT package_id FROM questions WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

    const {
      orderNumber,
      questionType,
      layoutMode,
      stimulus,
      prompt,
      config,
      answerKey,
      maxScore,
      scoringMode,
      explanation,
    } = req.body || {};

    db.prepare(
      `UPDATE questions
       SET order_number = ?, question_type = ?, layout_mode = ?, stimulus_json = ?, prompt = ?,
           config_json = ?, answer_key_json = ?, max_score = ?, scoring_mode = ?, explanation = ?
       WHERE id = ?`,
    ).run(
      Number(orderNumber || 1),
      String(questionType),
      layoutMode === 'split_two_column' ? 'split_two_column' : 'single_column',
      stimulus ? JSON.stringify(stimulus) : null,
      String(prompt).trim(),
      JSON.stringify(config || {}),
      JSON.stringify(answerKey || {}),
      Math.max(1, Number(maxScore || 1)),
      scoringMode === 'exact' ? 'exact' : 'partial',
      String(explanation || '').trim(),
      id,
    );

    invalidatePackageCache(Number(existing.package_id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Update question error:', err);
    res.status(500).json({ error: 'Gagal memperbarui butir soal.' });
  }
});

app.delete('/api/admin/questions/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT package_id FROM questions WHERE id = ?').get(id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    if (existing) invalidatePackageCache(Number(existing.package_id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ error: 'Gagal menghapus butir soal.' });
  }
});

// Results, Essay Rubric Grading & CSV Export
app.get('/api/admin/results/:sessionId', requireAdminAuth, (req, res) => {
  try {
    const summary = finalizeSessionGrading(Number(req.params.sessionId));
    if (!summary) return res.status(404).json({ error: 'Hasil sesi tidak ditemukan.' });
    res.json({ summary });
  } catch (err) {
    console.error('Get result detail error:', err);
    res.status(500).json({ error: 'Gagal memuat detail hasil peserta.' });
  }
});

app.post('/api/admin/results/:sessionId/grade', requireAdminAuth, (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { questionId, manualScore, graderNote } = req.body || {};

    const qRow = db.prepare('SELECT max_score FROM questions WHERE id = ?').get(Number(questionId));
    if (!qRow) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

    const maxScore = Number(qRow.max_score);
    const clampedScore = Math.max(0, Math.min(maxScore, Number(manualScore || 0)));

    db.prepare(
      `INSERT INTO session_answers (session_id, question_id, manual_score_earned, is_graded, grader_note, updated_at)
       VALUES (?, ?, ?, 1, ?, datetime('now'))
       ON CONFLICT(session_id, question_id) DO UPDATE SET
         manual_score_earned = excluded.manual_score_earned,
         is_graded = 1,
         grader_note = excluded.grader_note,
         updated_at = datetime('now')`,
    ).run(sessionId, Number(questionId), clampedScore, String(graderNote || '').trim() || null);

    const summary = finalizeSessionGrading(sessionId);
    res.json({ summary });
  } catch (err) {
    console.error('Manual grade error:', err);
    res.status(500).json({ error: 'Gagal menyimpan nilai koreksi uraian.' });
  }
});

app.get('/api/admin/results-export/csv', requireAdminAuth, (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT p.username, p.nis, p.class_name, p.full_name, s.npsn, s.name as school_name, sch.session_number,
                ep.title as package_title, es.status, es.violation_count,
                es.total_score, es.max_score, es.percentage, es.finished_at
         FROM exam_sessions es
         JOIN participants p ON p.id = es.participant_id
         JOIN schools s ON s.id = p.school_id
         JOIN exam_packages ep ON ep.id = es.package_id
         JOIN exam_schedules sch ON sch.id = es.schedule_id
         ORDER BY s.name ASC, p.class_name ASC, sch.session_number ASC, es.percentage DESC`,
      )
      .all();

    const csvEscape = (v: unknown) => {
      const str = String(v ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };

    const header = [
      'Username',
      'NIS',
      'Kelas',
      'Nama Peserta',
      'NPSN',
      'Sekolah',
      'Sesi',
      'Paket Ujian',
      'Status',
      'Pelanggaran',
      'Skor Diperoleh',
      'Skor Maksimal',
      'Nilai (%)',
      'Waktu Selesai',
    ].join(',');

    const lines = rows.map((r) =>
      [
        csvEscape(r.username),
        csvEscape(r.nis || '-'),
        csvEscape(r.class_name || '-'),
        csvEscape(r.full_name),
        csvEscape(r.npsn),
        csvEscape(r.school_name),
        csvEscape(`Sesi ${r.session_number}`),
        csvEscape(r.package_title),
        csvEscape(r.status),
        csvEscape(r.violation_count),
        csvEscape(r.total_score),
        csvEscape(r.max_score),
        csvEscape(r.percentage),
        csvEscape(r.finished_at || '-'),
      ].join(','),
    );

    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rekap-hasil-tka.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Gagal mengekspor CSV.' });
  }
});

// Admin Portal Branding / Frontpage Settings
app.get('/api/admin/branding', requireAdminAuth, (_req, res) => {
  try {
    res.json({ branding: getPortalBranding() });
  } catch (err) {
    console.error('Get admin branding error:', err);
    res.status(500).json({ error: 'Gagal memuat pengaturan tampilan halaman depan.' });
  }
});

app.put('/api/admin/branding', requireAdminAuth, (req, res) => {
  try {
    const body = (req.body || {}) as Partial<PortalBranding>;
    const logoCheck = sanitizeLogoUrl(body.logoUrl);
    if (!logoCheck.ok) {
      return res.status(400).json({ error: logoCheck.error });
    }

    const cleanText = (val: unknown, fallback: string, maxLen = 140) => {
      const s = String(val ?? '').trim();
      return (s || fallback).slice(0, maxLen);
    };
    const optionalText = (val: unknown, maxLen = 280) => String(val ?? '').trim().slice(0, maxLen);

    const themePreset: HeaderThemePreset = VALID_THEMES.includes(body.themePreset as HeaderThemePreset)
      ? (body.themePreset as HeaderThemePreset)
      : DEFAULT_PORTAL_BRANDING.themePreset;

    const updated = savePortalBranding({
      topBannerText: cleanText(body.topBannerText, DEFAULT_PORTAL_BRANDING.topBannerText, 120),
      headerOrgLabel: cleanText(body.headerOrgLabel, DEFAULT_PORTAL_BRANDING.headerOrgLabel, 80),
      headerAppTitle: cleanText(body.headerAppTitle, DEFAULT_PORTAL_BRANDING.headerAppTitle, 100),
      logoUrl: logoCheck.value || DEFAULT_PORTAL_BRANDING.logoUrl,
      logoBadgeText: cleanText(body.logoBadgeText, DEFAULT_PORTAL_BRANDING.logoBadgeText, 12),
      portalTitle: cleanText(body.portalTitle, DEFAULT_PORTAL_BRANDING.portalTitle, 80),
      portalSubtitle: cleanText(body.portalSubtitle, DEFAULT_PORTAL_BRANDING.portalSubtitle, 180),
      levelLabel: cleanText(body.levelLabel, DEFAULT_PORTAL_BRANDING.levelLabel, 60),
      categoryLabel: cleanText(body.categoryLabel, DEFAULT_PORTAL_BRANDING.categoryLabel, 60),
      subjectLabel: cleanText(body.subjectLabel, DEFAULT_PORTAL_BRANDING.subjectLabel, 60),
      startButtonText: cleanText(body.startButtonText, DEFAULT_PORTAL_BRANDING.startButtonText, 50),
      footerText: optionalText(body.footerText, 180) || DEFAULT_PORTAL_BRANDING.footerText,
      announcementText: optionalText(body.announcementText, 320),
      loginTitle: cleanText(body.loginTitle, DEFAULT_PORTAL_BRANDING.loginTitle, 80),
      loginSubtitle: cleanText(body.loginSubtitle, DEFAULT_PORTAL_BRANDING.loginSubtitle, 200),
      loginButtonText: cleanText(body.loginButtonText, DEFAULT_PORTAL_BRANDING.loginButtonText, 50),
      showDemoAccounts:
        typeof body.showDemoAccounts === 'boolean'
          ? body.showDemoAccounts
          : DEFAULT_PORTAL_BRANDING.showDemoAccounts,
      themePreset,
    });

    res.json({ branding: updated });
  } catch (err) {
    console.error('Update admin branding error:', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan tampilan halaman depan.' });
  }
});

app.post('/api/admin/branding/reset', requireAdminAuth, (_req, res) => {
  try {
    const branding = savePortalBranding({ ...DEFAULT_PORTAL_BRANDING });
    res.json({ branding });
  } catch (err) {
    console.error('Reset branding error:', err);
    res.status(500).json({ error: 'Gagal mereset pengaturan tampilan.' });
  }
});

// ==========================================
// VITE DEV MIDDLEWARE / PRODUCTION DIST
// ==========================================
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TKA CBT Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
