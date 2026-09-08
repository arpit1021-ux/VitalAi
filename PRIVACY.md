# VitalAI Privacy Notice

**Version 2026-09-01.** This is the version you are asked to accept before
creating a profile. If it changes, you will be asked again.

## What this is

VitalAI stores health information about you and the people in your household so
it can give answers that account for their allergies, conditions and
medications. That information is the whole point of the product, and it is also
the most sensitive thing we hold. This page says plainly what we keep, where it
goes, and how to get rid of it.

VitalAI provides general nutrition information. It does not diagnose, prescribe,
or replace a clinician.

## What we store

| Category | Examples | Encrypted at rest |
|---|---|---|
| Account | Email address, password hash, sign-in method | Password is hashed with bcrypt |
| Profiles | Name, age, dietary preference, activity level, goals | No |
| Health data | Allergies, medical conditions, medications and dosages | **Yes — AES-256-GCM, per field** |
| Activity | Scan history, chat transcripts, daily logs, pantry, saved recipes | No |
| Images | Photos you scan | Stored by Cloudinary; EXIF, including GPS, is stripped before upload |

Health fields are encrypted with a key held only on the server, so a leaked
database backup does not expose them.

## Who else processes it

VitalAI cannot work without sending some of your information to these
companies. Each acts as a processor on our behalf.

| Processor | What reaches them | Why |
|---|---|---|
| **Google (Gemini API)** | Your questions, scanned label text, scanned images, and the profile context needed to answer — which includes allergies, conditions and medications | Generates the answers and reads the photos |
| **Pinecone** | An embedding of your question. Not your profile, and not your identity | Finds relevant nutrition sources |
| **Cloudinary** | Photos you scan | Stores the images shown in your scan history |
| **MongoDB Atlas** | Everything listed in the table above | The database |

Health information is sent to Google as part of answering your questions. If
that is not acceptable to you, VitalAI is not the right product, and you should
not create a profile.

We do not sell your data. We do not use it to train models. We do not run
advertising.

## How long we keep it

- **Scan history and chat transcripts**: 400 days, then deleted automatically.
- **Profiles, pantry, saved recipes, daily logs**: until you delete them or your
  account.
- **Account**: until you delete it.
- **Sign-in tokens**: 7 days, then removed automatically.

## What you can do

| You want to | How |
|---|---|
| See everything we hold | Settings → Download my data. Returns a JSON file with health fields in plain text. |
| Correct something | Edit the profile directly. |
| Delete one profile | Profile settings → Delete profile. |
| Delete everything | Settings → Delete account. Removes every record and every stored image. Immediate and permanent — there is no grace period and no backup we can restore from. |
| Sign out everywhere | Settings → Sign out of all devices. |
| Withdraw consent | Delete your account. Health processing is what the product does; there is no version of it that continues without consent. |

## Security

- Sessions use HTTP-only cookies. Access tokens last 15 minutes; refresh tokens
  rotate on every use, and a reused token signs out every device.
- Passwords are hashed with bcrypt. We cannot read them.
- All traffic is HTTPS in production.
- Health fields are encrypted per field with AES-256-GCM.

## Children

VitalAI is not intended for people under 16. You may create profiles for
children in your household; those profiles belong to your account and are
deleted with it.

## Contact

Questions, corrections, or a data request that this page does not cover:
**privacy@vitalai.example** — replace with a real address before launch.

## What this notice is not

This is an honest description of how the software behaves, written by the people
who built it. It has not been reviewed by a lawyer. Depending on where you and
your users are, GDPR Article 9, the DPDP Act, HIPAA or state privacy law may
impose requirements this page does not meet. Get legal review before a public
launch.
