import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openExternal } from "../lib/telegram";
import { IconChevronRight, IconFlag } from "../components/icons";
import { InlineNotice, PageHeader } from "../components/ui";

const CATEGORIES = [
  "Bug — something broken or not loading",
  "Suggestion — an idea for the app",
  "Complaint about a review",
  "Moderation appeal — your review was hidden or removed",
  "Other"
];

/**
 * Complaints and suggestions currently go to an external form. Keeping this as
 * its own page (rather than linking Settings straight out) lets us state the
 * anonymity caveat before the student leaves the Mini App.
 */
export function SupportPage() {
  const { config } = useAuth();
  const url = (config?.feedbackUrl || "").trim();

  return (
    <div>
      <PageHeader
        title="Support & feedback"
        subtitle="Report a problem, suggest an idea, or appeal a moderation decision."
        back
      />

      <div className="card mb-4 space-y-3">
        <p className="text-sm font-semibold">Send feedback</p>
        <p className="text-xs leading-relaxed text-[var(--tg-hint)]">
          The form opens in a new window. It is the right place for anything that is not a report on a specific review.
        </p>
        <ul className="space-y-1 text-xs text-[var(--tg-hint)]">
          {CATEGORIES.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[var(--brand)]">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {url ? (
          <button type="button" className="btn-primary w-full" onClick={() => openExternal(url)}>
            <IconFlag size={16} />
            Open feedback form
          </button>
        ) : (
          <InlineNotice tone="warning" title="Form not configured">
            No feedback form URL is set. An admin needs to set FEEDBACK_URL.
          </InlineNotice>
        )}
      </div>

      <InlineNotice tone="neutral" title="Before you send">
        The form is hosted by Google, so Google records your IP address and submission time. Do not include your name,
        email address, or anything else that identifies you. Only leave a Telegram username if you want a reply, and
        accept that this links the message to your account.
      </InlineNotice>

      <div className="card mt-4 divide-y divide-[var(--tg-border)] p-0">
        <Link to="/guidelines" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          Community guidelines
          <IconChevronRight size={16} />
        </Link>
        <Link to="/privacy" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          Privacy policy
          <IconChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}
