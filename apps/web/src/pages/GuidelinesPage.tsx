import { PageHeader } from "../components/ui";

export function GuidelinesPage() {
  return (
    <div>
      <PageHeader title="Community guidelines" subtitle="Keep reviews useful, fair, and safe." back />
      <div className="space-y-4 text-sm leading-relaxed">
        <section className="card space-y-2">
          <h2 className="font-semibold">Review the course, club, or service, not the person</h2>
          <p className="text-[var(--tg-hint)]">
            Do not name lecturers, tutors, club leaders, staff, students, or other individuals. Describe the course
            structure, workload, and assessment style; a club's activities, community, and organisation; or a service's
            process, wait times, and usefulness.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Be specific and honest</h2>
          <p className="text-[var(--tg-hint)]">
            Explain what was useful or difficult. Mention the semester when it matters. Ratings without context are less
            helpful, but they are allowed.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Do not post</h2>
          <ul className="list-disc space-y-1 pl-5 text-[var(--tg-hint)]">
            <li>Threats, harassment, hate speech, or personal attacks.</li>
            <li>Private information such as phone numbers, emails, student IDs, or addresses.</li>
            <li>Spam, advertising, referral links, or repeated content.</li>
            <li>Unverified allegations about named people or serious misconduct.</li>
          </ul>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Moderation</h2>
          <p className="text-[var(--tg-hint)]">
            Reviews are checked automatically for profanity, spam, personal information, named individuals, threats, and
            harsh language. Flagged reviews are held for manual review. Students can report reviews, and enough reports
            can hide a review until a moderator decides.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Appeals</h2>
          <p className="text-[var(--tg-hint)]">
            If a review was hidden or removed, you can edit it or contact the moderation team through the bot. Moderators
            aim to protect legitimate criticism as well as the safety of the community.
          </p>
        </section>
      </div>
    </div>
  );
}
