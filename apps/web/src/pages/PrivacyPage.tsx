import { PageHeader } from "../components/ui";

export function PrivacyPage() {
  return (
    <div>
      <PageHeader title="Privacy" subtitle="How PintuKaca handles identity and anonymity." back />
      <div className="space-y-4 text-sm leading-relaxed">
        <section className="card space-y-2">
          <h2 className="font-semibold">What we store</h2>
          <ul className="list-disc space-y-1 pl-5 text-[var(--tg-hint)]">
            <li>Your numeric Telegram user ID, so the bot can recognise your account.</li>
            <li>An opaque Google account identifier from your SiswaMail sign-in.</li>
            <li>An HMAC of your SiswaMail address for duplicate-account checks. The address itself is not stored.</li>
            <li>Reviews, ratings, aliases, and moderation records.</li>
          </ul>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">What we never store</h2>
          <ul className="list-disc space-y-1 pl-5 text-[var(--tg-hint)]">
            <li>Your SiswaMail password.</li>
            <li>Your name, phone number, student ID, or Telegram username in the review database.</li>
            <li>Your email address in plain text.</li>
          </ul>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">What other students see</h2>
          <p className="text-[var(--tg-hint)]">
            A random animal alias, your ratings, your review text, and the semester you selected. Your Telegram account,
            Google identifier, and email are never shown in the app or API.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Limits of anonymity</h2>
          <p className="text-[var(--tg-hint)]">
            Telegram knows which account is using the bot, and the app operator can technically link a review to an
            account in the database. Identity data is kept in separate tables, admin access is restricted, and public
            APIs never expose it. Anonymity is strong against other students, but not absolute against the platform
            operator.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Feedback form</h2>
          <p className="text-[var(--tg-hint)]">
            Complaints and suggestions are sent through an external form linked from Support & feedback. That form is
            hosted by Google, which records your IP address and submission time, so it sits outside the anonymity
            described above. Leave out your name and email, and add a Telegram username only if you want a reply.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Retention and deletion</h2>
          <p className="text-[var(--tg-hint)]">
            Unverified accounts are removed after 30 days. Expired verification states are removed automatically. You can
            delete your account and all of your reviews from Settings at any time.
          </p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Not affiliated with Universiti Malaya</h2>
          <p className="text-[var(--tg-hint)]">
            This is an independent student project. It is not operated or endorsed by Universiti Malaya. Reviews are
            student opinions and may be inaccurate.
          </p>
        </section>
      </div>
    </div>
  );
}
