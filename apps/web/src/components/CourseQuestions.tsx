import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CourseQuestionDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatMonth } from "../lib/format";

/**
 * Course Q&A. Every question is written by a student — nothing is prefilled,
 * suggested, or seeded. Answers earn points.
 */
export function CourseQuestions({ courseCode }: { courseCode: string }) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<CourseQuestionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const load = () => {
    setLoading(true);
    api
      .questions(courseCode)
      .then((result) => setQuestions(result.questions))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseCode]);

  const ask = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.askQuestion(courseCode, draft.trim());
      setDraft("");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post your question.");
    } finally {
      setBusy(false);
    }
  };

  const answer = async (questionId: string) => {
    if (!answerDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.answerQuestion(questionId, answerDraft.trim());
      setAnswerDraft("");
      setAnswerFor(null);
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post your answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Questions &amp; answers</h2>
        <span className="text-xs text-[var(--tg-hint)]">{questions.length}</span>
      </div>

      {user?.verified ? (
        <div className="card mb-3">
          <textarea
            className="input min-h-[72px] w-full resize-y"
            placeholder="Ask something you can't tell from the course page…"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--tg-hint)]">Answering earns points.</span>
            <button type="button" className="btn-primary btn-sm" onClick={ask} disabled={busy || draft.trim().length < 10}>
              Ask
            </button>
          </div>
        </div>
      ) : (
        <div className="card mb-3 text-xs text-[var(--tg-hint)]">
          <Link to="/verify" className="font-semibold text-[var(--brand-link)]">
            Verify
          </Link>{" "}
          to ask or answer questions.
        </div>
      )}

      {error ? <p className="mb-2 text-xs text-[var(--tg-danger)]">{error}</p> : null}

      {loading ? (
        <p className="text-xs text-[var(--tg-hint)]">Loading questions…</p>
      ) : questions.length === 0 ? (
        <p className="text-xs text-[var(--tg-hint)]">No questions yet. Be the first to ask.</p>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <article key={question.id} className="card space-y-2">
              <p className="text-sm font-semibold leading-snug">{question.body}</p>
              <p className="text-[11px] text-[var(--tg-hint)]">
                {question.alias} · {formatMonth(question.createdAt)}
              </p>

              {question.answers.length > 0 ? (
                <div className="space-y-2 border-l-2 border-[var(--tg-border)] pl-3">
                  {question.answers.map((answer) => (
                    <div key={answer.id}>
                      <p className="text-xs leading-relaxed text-[var(--tg-text)]">{answer.body}</p>
                      <p className="text-[10px] text-[var(--tg-hint)]">
                        {answer.alias} · {formatMonth(answer.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {user?.verified ? (
                answerFor === question.id ? (
                  <div>
                    <textarea
                      className="input min-h-[64px] w-full resize-y"
                      placeholder="Share what you know…"
                      value={answerDraft}
                      maxLength={1000}
                      onChange={(event) => setAnswerDraft(event.target.value)}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-xs text-[var(--tg-hint)] underline"
                        onClick={() => {
                          setAnswerFor(null);
                          setAnswerDraft("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => answer(question.id)}
                        disabled={busy || answerDraft.trim().length < 10}
                      >
                        Post answer
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--brand-link)]"
                    onClick={() => {
                      setAnswerFor(question.id);
                      setAnswerDraft("");
                    }}
                  >
                    {question.answerCount > 0 ? "Add another answer" : "Answer this"}
                  </button>
                )
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
