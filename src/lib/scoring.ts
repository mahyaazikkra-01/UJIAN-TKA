import type {
  AnswerKey,
  QuestionConfig,
  QuestionType,
  ScoringMode,
  StudentAnswerPayload,
} from '../types/exam.ts';

export interface GradeItemResult {
  autoScore: number;
  isGraded: boolean;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function gradeQuestionAnswer(
  questionType: QuestionType,
  config: QuestionConfig,
  answerKey: AnswerKey,
  studentAnswer: StudentAnswerPayload | null,
  maxScore: number,
  scoringMode: ScoringMode,
): GradeItemResult {
  if (!studentAnswer) {
    return {
      autoScore: 0,
      isGraded: questionType !== 'URAIAN',
    };
  }

  switch (questionType) {
    case 'PG_SEDERHANA': {
      if (studentAnswer.type !== 'PG_SEDERHANA') {
        return { autoScore: 0, isGraded: true };
      }
      const isCorrect = Boolean(
        answerKey.correctOptionId &&
          studentAnswer.optionId === answerKey.correctOptionId,
      );
      return {
        autoScore: isCorrect ? maxScore : 0,
        isGraded: true,
      };
    }

    case 'MCMA': {
      if (studentAnswer.type !== 'MCMA') {
        return { autoScore: 0, isGraded: true };
      }
      const expected = new Set(answerKey.correctOptionIds || []);
      const chosen = new Set(studentAnswer.optionIds || []);

      if (expected.size === 0 || chosen.size === 0) {
        return { autoScore: 0, isGraded: true };
      }

      let truePositives = 0;
      let falsePositives = 0;
      for (const id of chosen) {
        if (expected.has(id)) {
          truePositives++;
        } else {
          falsePositives++;
        }
      }

      if (scoringMode === 'exact') {
        const exactMatch =
          truePositives === expected.size && falsePositives === 0;
        return {
          autoScore: exactMatch ? maxScore : 0,
          isGraded: true,
        };
      }

      // Partial MCMA scoring: reward each correct choice, penalize distractors proportionally
      const totalOptions = Math.max(config.options?.length || expected.size, expected.size);
      const distractorCount = Math.max(totalOptions - expected.size, 1);
      const rawRatio =
        truePositives / expected.size - falsePositives / distractorCount;
      const clamped = Math.max(0, Math.min(1, rawRatio));
      return {
        autoScore: roundScore(clamped * maxScore),
        isGraded: true,
      };
    }

    case 'PGK_KATEGORI': {
      if (studentAnswer.type !== 'PGK_KATEGORI') {
        return { autoScore: 0, isGraded: true };
      }
      const expectedMap = answerKey.correctCategories || {};
      const statementIds = Object.keys(expectedMap);
      if (statementIds.length === 0) {
        return { autoScore: 0, isGraded: true };
      }

      let correctCount = 0;
      for (const sid of statementIds) {
        if (studentAnswer.selections?.[sid] === expectedMap[sid]) {
          correctCount++;
        }
      }

      if (scoringMode === 'exact') {
        return {
          autoScore: correctCount === statementIds.length ? maxScore : 0,
          isGraded: true,
        };
      }

      return {
        autoScore: roundScore((correctCount / statementIds.length) * maxScore),
        isGraded: true,
      };
    }

    case 'MENJODOHKAN': {
      if (studentAnswer.type !== 'MENJODOHKAN') {
        return { autoScore: 0, isGraded: true };
      }
      const expectedPairs = answerKey.correctPairs || {};
      const leftIds = Object.keys(expectedPairs);
      if (leftIds.length === 0) {
        return { autoScore: 0, isGraded: true };
      }

      let correctPairs = 0;
      for (const lid of leftIds) {
        if (studentAnswer.pairs?.[lid] === expectedPairs[lid]) {
          correctPairs++;
        }
      }

      if (scoringMode === 'exact') {
        return {
          autoScore: correctPairs === leftIds.length ? maxScore : 0,
          isGraded: true,
        };
      }

      return {
        autoScore: roundScore((correctPairs / leftIds.length) * maxScore),
        isGraded: true,
      };
    }

    case 'URAIAN': {
      if (studentAnswer.type !== 'URAIAN') {
        return { autoScore: 0, isGraded: false };
      }
      const rawText = (studentAnswer.text || '').trim().toLowerCase();
      if (!rawText) {
        return { autoScore: 0, isGraded: false };
      }

      const keywords = (answerKey.expectedKeywords || [])
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      if (keywords.length === 0) {
        return { autoScore: 0, isGraded: false };
      }

      let matched = 0;
      for (const kw of keywords) {
        if (rawText.includes(kw)) {
          matched++;
        }
      }

      const suggested = roundScore((matched / keywords.length) * maxScore);
      // If autoGradeExactNumeric is enabled and matches modelAnswer exactly, mark graded
      if (
        answerKey.autoGradeExactNumeric &&
        answerKey.modelAnswer &&
        rawText === answerKey.modelAnswer.trim().toLowerCase()
      ) {
        return { autoScore: maxScore, isGraded: true };
      }

      return {
        autoScore: suggested,
        isGraded: false,
      };
    }
  }
}
