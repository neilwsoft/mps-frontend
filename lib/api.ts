const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

const TOKEN_KEY = "mps_token";

function authHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let detail = `${res.status} ${res.statusText}`;
  try {
    const data = (await res.json()) as { detail?: string | unknown };
    if (typeof data.detail === "string") detail = data.detail;
  } catch {
    /* ignore non-JSON body */
  }
  throw new Error(detail);
}

// ----- types --------------------------------------------------------------

export type User = {
  id: number;
  email: string;
  name: string;
  role: "student" | "admin";
};

export type AuthResponse = { token: string; user: User };

export type ExamSummary = {
  id: number;
  title: string;
  description: string;
  created_at: string;
  question_count: number;
};

export type StudentQuestion = {
  id: number;
  position: number;
  prompt_latex: string;
  expected_line_count: number;
};

export type AdminQuestion = {
  id: number;
  position: number;
  prompt_latex: string;
  solution_latex: string[];
};

export type Exam = {
  id: number;
  title: string;
  description: string;
  created_at: string;
  questions: StudentQuestion[] | AdminQuestion[];
};

export type SubmitLineResponse = {
  correct: boolean;
  explanation: string | null;
  is_final_for_question: boolean;
  expected_total_lines: number;
  partial_score: number;
};

export type SubmissionLine = {
  id: number;
  question_id: number;
  question_position: number;
  question_prompt: string;
  line_index: number;
  submitted_latex: string;
  correct: 0 | 1;
  explanation: string | null;
  created_at: string;
  partial_score: number;
  time_spent_ms: number | null;
  source: "typed" | "handwriting";
  ocr_confidence: number | null;
  override_correct: 0 | 1 | null;
  override_reason: string | null;
  override_at: string | null;
  override_by_name: string | null;
};

export type HintRecord = {
  question_id: number;
  line_index: number;
  hint_text: string;
  created_at: string;
};

export type ExtractedLine = { latex: string; confidence: number };

export type SubmissionDetail = {
  id: number;
  exam_id: number;
  exam_title: string;
  exam_description: string;
  user_id: number;
  student_email: string;
  student_name: string;
  started_at: string;
  submitted_at: string | null;
  score: number;
  total: number;
  lines: SubmissionLine[];
  hints: HintRecord[];
};

export type SubmissionSummary = {
  id: number;
  exam_id: number;
  exam_title: string;
  user_id?: number;
  student_email?: string;
  student_name?: string;
  started_at: string;
  submitted_at: string | null;
  score: number;
  total: number;
};

export type StudentSummary = {
  id: number;
  email: string;
  name: string;
  created_at: string;
  submission_count: number;
  total_score: number;
  total_lines: number;
};

// ----- auth ---------------------------------------------------------------

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return jsonOrThrow<AuthResponse>(res);
}

export async function registerRequest(
  email: string,
  name: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, password }),
  });
  return jsonOrThrow<AuthResponse>(res);
}

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return jsonOrThrow<User>(res);
}

// ----- exams --------------------------------------------------------------

export async function fetchExams(): Promise<ExamSummary[]> {
  const res = await fetch(`${BASE}/api/exams`, {
    headers: authHeader(),
    cache: "no-store",
  });
  const data = await jsonOrThrow<{ exams: ExamSummary[] }>(res);
  return data.exams;
}

export async function fetchExam(id: number): Promise<Exam> {
  const res = await fetch(`${BASE}/api/exams/${id}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  return jsonOrThrow<Exam>(res);
}

export async function createExam(input: {
  title: string;
  description: string;
  questions: { prompt_latex: string; solution_latex: string[] }[];
}): Promise<{ id: number }> {
  const res = await fetch(`${BASE}/api/exams`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<{ id: number }>(res);
}

// ----- submissions --------------------------------------------------------

export async function startSubmission(
  examId: number,
): Promise<{ submission_id: number; exam_id: number }> {
  const res = await fetch(`${BASE}/api/exams/${examId}/start`, {
    method: "POST",
    headers: authHeader(),
  });
  return jsonOrThrow<{ submission_id: number; exam_id: number }>(res);
}

export async function submitLine(
  submissionId: number,
  questionId: number,
  lineIndex: number,
  submittedLatex: string,
  opts: {
    timeSpentMs?: number;
    source?: "typed" | "handwriting";
    ocrConfidence?: number;
    locale?: string;
  } = {},
): Promise<SubmitLineResponse> {
  const res = await fetch(
    `${BASE}/api/submissions/${submissionId}/lines`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        question_id: questionId,
        line_index: lineIndex,
        submitted_latex: submittedLatex,
        time_spent_ms: opts.timeSpentMs ?? null,
        source: opts.source ?? "typed",
        ocr_confidence: opts.ocrConfidence ?? null,
        locale: opts.locale ?? "en",
      }),
    },
  );
  return jsonOrThrow<SubmitLineResponse>(res);
}

export async function requestHint(
  submissionId: number,
  questionId: number,
  lineIndex: number,
  locale: string = "en",
): Promise<{ hint: string }> {
  const res = await fetch(
    `${BASE}/api/submissions/${submissionId}/hint`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({
        question_id: questionId,
        line_index: lineIndex,
        locale,
      }),
    },
  );
  return jsonOrThrow<{ hint: string }>(res);
}

export async function getScratchpad(
  submissionId: number,
  questionId: number,
): Promise<string> {
  const res = await fetch(
    `${BASE}/api/submissions/${submissionId}/scratchpad/${questionId}`,
    { headers: authHeader(), cache: "no-store" },
  );
  const data = await jsonOrThrow<{ content: string }>(res);
  return data.content;
}

export async function saveScratchpad(
  submissionId: number,
  questionId: number,
  content: string,
): Promise<void> {
  const res = await fetch(
    `${BASE}/api/submissions/${submissionId}/scratchpad/${questionId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ content }),
    },
  );
  await jsonOrThrow<{ content: string }>(res);
}

export async function finalizeSubmission(
  submissionId: number,
): Promise<{ score: number; total: number }> {
  const res = await fetch(
    `${BASE}/api/submissions/${submissionId}/finalize`,
    {
      method: "POST",
      headers: authHeader(),
    },
  );
  return jsonOrThrow<{ score: number; total: number }>(res);
}

export async function fetchSubmissions(): Promise<SubmissionSummary[]> {
  const res = await fetch(`${BASE}/api/submissions`, {
    headers: authHeader(),
    cache: "no-store",
  });
  const data = await jsonOrThrow<{ submissions: SubmissionSummary[] }>(res);
  return data.submissions;
}

export async function fetchSubmission(id: number): Promise<SubmissionDetail> {
  const res = await fetch(`${BASE}/api/submissions/${id}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  return jsonOrThrow<SubmissionDetail>(res);
}

// ----- handwriting --------------------------------------------------------

export async function extractHandwriting(
  questionId: number,
  image: File,
): Promise<{ lines: ExtractedLine[] }> {
  const form = new FormData();
  form.append("question_id", String(questionId));
  form.append("image", image);
  const res = await fetch(`${BASE}/api/extract-handwriting`, {
    method: "POST",
    headers: authHeader(),
    body: form,
  });
  return jsonOrThrow<{ lines: ExtractedLine[] }>(res);
}

// ----- admin --------------------------------------------------------------

export async function fetchStudents(): Promise<StudentSummary[]> {
  const res = await fetch(`${BASE}/api/admin/students`, {
    headers: authHeader(),
    cache: "no-store",
  });
  const data = await jsonOrThrow<{ students: StudentSummary[] }>(res);
  return data.students;
}

export async function fetchStudentDetail(
  userId: number,
): Promise<{ student: User & { created_at: string }; submissions: SubmissionSummary[] }> {
  const res = await fetch(`${BASE}/api/admin/students/${userId}`, {
    headers: authHeader(),
    cache: "no-store",
  });
  return jsonOrThrow<{
    student: User & { created_at: string };
    submissions: SubmissionSummary[];
  }>(res);
}

export async function fetchExamSubmissions(
  examId: number,
): Promise<{ exam: { id: number; title: string }; submissions: SubmissionSummary[] }> {
  const res = await fetch(
    `${BASE}/api/admin/exams/${examId}/submissions`,
    { headers: authHeader(), cache: "no-store" },
  );
  return jsonOrThrow<{
    exam: { id: number; title: string };
    submissions: SubmissionSummary[];
  }>(res);
}

// ----- admin: AI generation, override, clone, metrics, topics ----------

export async function adminGenerateVariants(
  seed: { prompt_latex: string; solution_latex: string[] },
  n: number,
  difficultyDelta: number,
): Promise<{ prompt_latex: string; solution_latex: string[] }[]> {
  const res = await fetch(`${BASE}/api/admin/questions/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ seed, n, difficulty_delta: difficultyDelta }),
  });
  const data = await jsonOrThrow<{
    variants: { prompt_latex: string; solution_latex: string[] }[];
  }>(res);
  return data.variants;
}

export async function adminOverrideLine(
  lineId: number,
  correct: boolean,
  reason: string,
): Promise<{ score: number; total: number }> {
  const res = await fetch(`${BASE}/api/admin/submission-lines/${lineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ correct, reason }),
  });
  return jsonOrThrow<{ score: number; total: number }>(res);
}

export async function adminCloneExam(examId: number): Promise<{ id: number }> {
  const res = await fetch(`${BASE}/api/admin/exams/${examId}/clone`, {
    method: "POST",
    headers: authHeader(),
  });
  return jsonOrThrow<{ id: number }>(res);
}

export type QuestionMetric = {
  question_id: number;
  position: number;
  prompt_latex: string;
  attempts: number;
  pct_correct: number;
  avg_seconds: number | null;
};

export async function fetchExamMetrics(
  examId: number,
): Promise<QuestionMetric[]> {
  const res = await fetch(`${BASE}/api/admin/exams/${examId}/metrics`, {
    headers: authHeader(),
    cache: "no-store",
  });
  const data = await jsonOrThrow<{ metrics: QuestionMetric[] }>(res);
  return data.metrics;
}

export type TopicMasteryRow = {
  student_id: number;
  student_name: string;
  topic: string;
  attempts: number;
  accuracy: number;
};

export type StudentAnalytics = {
  student: { id: number; name: string; email: string; created_at: string };
  summary: {
    exams_attempted: number;
    exams_finalized: number;
    total_attempts: number;
    total_correct: number;
    accuracy: number;
    total_time_ms: number;
    hints_used: number;
  };
  exams: {
    submission_id: number;
    exam_id: number;
    exam_title: string;
    started_at: string;
    submitted_at: string | null;
    score: number;
    total: number;
    accuracy: number | null;
    line_count: number;
    total_time_ms: number;
    hints_used: number;
  }[];
  topics: {
    topic: string;
    attempts: number;
    correct: number;
    accuracy: number;
  }[];
  questions: {
    question_id: number;
    prompt_latex: string;
    exam_title: string;
    attempts: number;
    correct: number;
    accuracy: number;
    avg_seconds: number | null;
  }[];
};

export async function fetchStudentAnalytics(
  userId: number,
): Promise<StudentAnalytics> {
  const res = await fetch(
    `${BASE}/api/admin/students/${userId}/analytics`,
    { headers: authHeader(), cache: "no-store" },
  );
  return jsonOrThrow<StudentAnalytics>(res);
}

export async function fetchTopicMastery(): Promise<TopicMasteryRow[]> {
  const res = await fetch(`${BASE}/api/admin/analytics/topic-mastery`, {
    headers: authHeader(),
    cache: "no-store",
  });
  const data = await jsonOrThrow<{ rows: TopicMasteryRow[] }>(res);
  return data.rows;
}

export async function setQuestionTopics(
  questionId: number,
  topics: string[],
): Promise<string[]> {
  const res = await fetch(
    `${BASE}/api/admin/questions/${questionId}/topics`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ topics }),
    },
  );
  const data = await jsonOrThrow<{ topics: string[] }>(res);
  return data.topics;
}
