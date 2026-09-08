import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * The privacy notice, rendered from the same content as PRIVACY.md.
 *
 * Kept as a static route rather than fetched, so it is readable when a user is
 * signed out, offline, or deciding whether to sign up at all.
 */
export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <h1 className="mt-8 text-3xl font-medium text-text-primary">Privacy notice</h1>
        <p className="mt-2 text-sm text-text-muted">
          Version 2026-09-01. This is the version you accept before creating a profile. If it
          changes, you will be asked again.
        </p>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">What this is</h2>
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
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">What we store</h2>
          <p>
            Your account details, the profiles you create, and your activity — scans, chats, daily
            logs, pantry and saved recipes.
          </p>
          <p>
            Allergies, medical conditions, medications and dosages are{' '}
            <strong className="font-medium">encrypted individually with AES-256-GCM</strong> using a
            key held only on the server, so a leaked database backup does not expose them. Photos
            you scan have their EXIF data, including GPS coordinates, stripped before upload.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">Who else processes it</h2>
          <p>VitalAI cannot work without sending some of your information to these companies.</p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Third parties that process VitalAI data</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-4 font-medium">Processor</th>
                  <th scope="col" className="py-2 pr-4 font-medium">What reaches them</th>
                </tr>
              </thead>
              <tbody className="text-text-muted">
                <tr className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 text-left font-normal text-text-primary">
                    Google (Gemini)
                  </th>
                  <td className="py-3 pr-4">
                    Your questions, scanned text and images, and the profile context needed to
                    answer — which includes allergies, conditions and medications
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 text-left font-normal text-text-primary">
                    Pinecone
                  </th>
                  <td className="py-3 pr-4">
                    An embedding of your question. Not your profile, and not your identity
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 text-left font-normal text-text-primary">
                    Cloudinary
                  </th>
                  <td className="py-3 pr-4">Photos you scan</td>
                </tr>
                <tr>
                  <th scope="row" className="py-3 pr-4 text-left font-normal text-text-primary">
                    MongoDB Atlas
                  </th>
                  <td className="py-3 pr-4">Everything above</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Health information is sent to Google as part of answering your questions. If that is not
            acceptable to you, VitalAI is not the right product, and you should not create a
            profile.
          </p>
          <p>We do not sell your data, use it to train models, or run advertising.</p>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">How long we keep it</h2>
          <p>
            Scan history and chat transcripts are deleted automatically after 400 days. Profiles,
            pantry items, saved recipes and daily logs are kept until you delete them or your
            account. Sign-in tokens expire after 7 days.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">What you can do</h2>
          <p>
            From <Link to="/settings" className="underline underline-offset-4">account settings</Link>{' '}
            you can download everything we hold, sign out of every device, or delete your account.
            Deletion removes every record and every stored image immediately and permanently — there
            is no grace period and no backup we can restore from.
          </p>
          <p>
            Withdrawing consent means deleting your account. Health processing is what the product
            does; there is no version of it that continues without consent.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">Children</h2>
          <p>
            VitalAI is not intended for people under 16. You may create profiles for children in
            your household; those profiles belong to your account and are deleted with it.
          </p>
        </section>

        <section className="mt-10 space-y-4 text-[15px] leading-7 text-text-primary">
          <h2 className="text-xl font-medium">Contact</h2>
          <p>
            Questions, corrections, or a request this page does not cover:{' '}
            <a
              href="mailto:privacy@vitalai.example"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
            >
              privacy@vitalai.example
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
