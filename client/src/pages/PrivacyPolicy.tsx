import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * The privacy notice, rendered from the same content as PRIVACY.md.
 *
 * Kept as a static route rather than fetched, so it is readable when a user is
 * signed out, offline, or deciding whether to sign up at all.
 *
 * This is the one screen in the product where dense prose is the right answer,
 * so it is set as a reading document: one measure, `text-body-lg`, and section
 * headings with enough air that someone can find the paragraph they came for.
 */
const linkClass =
  'rounded text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-ground px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-reading">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded text-label text-ink-muted transition-colors duration-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <h1 className="mt-4 text-balance font-display text-display text-ink">Privacy notice</h1>
        <p className="mt-3 text-body text-ink-muted">
          Version <span className="font-mono text-figure tabular-nums">2026-09-01</span>. This is the
          version you accept before creating a profile. If it changes, we&apos;ll ask you again.
        </p>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">What this is</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              VitalAI stores health information about you and the people in your household so it can
              give answers that account for their allergies, conditions and medications. That
              information is the whole point of the product, and it is also the most sensitive thing
              we hold. This page says plainly what we keep, where it goes, and how to get rid of it.
            </p>
            <p>
              VitalAI provides general nutrition information. It does not diagnose, prescribe, or
              replace a clinician.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">What we store</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              Your account details, the profiles you create, and your activity — scans, chats, daily
              logs, pantry and saved recipes.
            </p>
            <p>
              Allergies, medical conditions, medications and dosages are{' '}
              <strong className="font-semibold">encrypted individually with AES-256-GCM</strong>{' '}
              using a key held only on the server, so a leaked database backup does not expose them.
              Photos you scan have their EXIF data, including GPS coordinates, stripped before
              upload.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">Who else processes it</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>VitalAI cannot work without sending some of your information to these companies.</p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <caption className="sr-only">Third parties that process VitalAI data</caption>
              <thead>
                <tr className="border-b-2 border-line-strong/40">
                  <th scope="col" className="px-4 py-3 text-label text-ink">
                    Processor
                  </th>
                  <th scope="col" className="px-4 py-3 text-label text-ink">
                    What reaches them
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <th scope="row" className="px-4 py-3 align-top text-body font-semibold text-ink">
                    Google (Gemini)
                  </th>
                  <td className="px-4 py-3 align-top text-body text-ink-muted">
                    Your questions, scanned text and images, and the profile context needed to
                    answer — which includes allergies, conditions and medications
                  </td>
                </tr>
                <tr className="border-b border-line">
                  <th scope="row" className="px-4 py-3 align-top text-body font-semibold text-ink">
                    Pinecone
                  </th>
                  <td className="px-4 py-3 align-top text-body text-ink-muted">
                    An embedding of your question. Not your profile, and not your identity
                  </td>
                </tr>
                <tr className="border-b border-line">
                  <th scope="row" className="px-4 py-3 align-top text-body font-semibold text-ink">
                    Cloudinary
                  </th>
                  <td className="px-4 py-3 align-top text-body text-ink-muted">Photos you scan</td>
                </tr>
                <tr>
                  <th scope="row" className="px-4 py-3 align-top text-body font-semibold text-ink">
                    MongoDB Atlas
                  </th>
                  <td className="px-4 py-3 align-top text-body text-ink-muted">Everything above</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-4 text-body-lg text-ink">
            <p>
              Health information is sent to Google as part of answering your questions. If that is
              not acceptable to you, VitalAI is not the right product, and you should not create a
              profile.
            </p>
            <p>We do not sell your data, use it to train models, or run advertising.</p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">How long we keep it</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              Scan history and chat transcripts are deleted automatically after{' '}
              <span className="font-mono text-figure tabular-nums">400</span> days. Profiles, pantry
              items, saved recipes and daily logs are kept until you delete them or your account.
              Sign-in tokens expire after <span className="font-mono text-figure tabular-nums">7</span>{' '}
              days.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">What you can do</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              From{' '}
              <Link to="/settings" className={linkClass}>
                account settings
              </Link>{' '}
              you can download everything we hold, sign out of every device, or delete your account.
              Deletion removes every record and every stored image immediately and permanently —
              there is no grace period and no backup we can restore from.
            </p>
            <p>
              Withdrawing consent means deleting your account. Health processing is what the product
              does; there is no version of it that continues without consent.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">Children</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              VitalAI is not intended for people under{' '}
              <span className="font-mono text-figure tabular-nums">16</span>. You may create profiles
              for children in your household; those profiles belong to your account and are deleted
              with it.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="font-display text-title text-ink">Contact</h2>
          <div className="mt-4 space-y-4 text-body-lg text-ink">
            <p>
              Questions, corrections, or a request this page does not cover:{' '}
              <a href="mailto:privacy@vitalai.example" className={`${linkClass} break-words`}>
                privacy@vitalai.example
              </a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
