# Job Applicant Agent

A desktop app that finds jobs matching your resumes and prepares personalized Gmail drafts.

**Nothing is sent automatically. You review and send every application yourself.**

## Install

**Current version: 1.0.4**

For an Apple Silicon Mac (M1 or newer), open the local installer:

[release/Job Applicant Agent-1.0.4-arm64.dmg](release/Job%20Applicant%20Agent-1.0.4-arm64.dmg)

1. Open the DMG and drag **Job Applicant Agent** into **Applications**.
2. Launch the app from Applications.
3. If macOS blocks this unsigned build, open **System Settings > Privacy & Security > Open Anyway** after attempting to launch it.

You do not need Python, Git, or Node.js to use the installed app. When upgrading, quit the old app and replace it. Your saved resumes and preferences stay on your device.

Windows and Intel Mac packaging are configured, but those installers are not included in this local release. See [docs/RELEASE.md](docs/RELEASE.md) for build instructions and remaining release checks.

## Use The App

1. **My resumes:** upload one or more PDF or DOCX resumes.
2. **Preferences:** enter your name, preferred locations, skills, and minimum match percentage. Choose **Any (OR)** or **All (AND)** for preferred skills.
3. **Email template:** customize your introduction.
4. **Import jobs:** upload job descriptions, paste text, or retrieve Gmail emails using dates and a search query.
5. **Matching:** review the job details, score, selected resume, and recruiter email. Correct anything inaccurate.
6. **Create drafts:** preview your emails and confirm the batch. Each draft includes the selected resume.
7. Open **Gmail Drafts**, review everything, and send manually. The app notifies you when drafting finishes.

Multi-job documents are split by job headings, not simply by page. If an earlier import appeared as one job, choose **Overview > Re-analyze**. Existing Gmail drafts are preserved.

To remove uploaded job files, open **Job documents**, click the trash icon beside a PDF/DOCX file, and confirm. This removes its extracted jobs from the workspace, not your original file, resumes, or Gmail drafts. Uploads with the same filename are grouped together.

With `Selenium, Playwright`, **Any (OR)** accepts Selenium-only, Playwright-only, or both. **All (AND)** requires both. Jobs still need your minimum score to appear in Matching; All jobs retains unrelated imports. Matching is local and rule-based, not an AI hiring prediction.

Resume selection prioritizes evidence for the job's relevant focus tools, with extra weight for tools in the job title, then overall fit. A filename such as Playwright.pdf is not evidence by itself. Review the selected resume and missing skills before drafting. Jobs that already have a Gmail draft show the resume used for that draft; existing drafts are not silently changed.

### Search Gmail Again

1. Choose **Sync Gmail** and change **From date** / **Through date** as needed.
2. Enter comma-separated **Search terms**, such as `Selenium, Playwright`, and choose **Any (OR)** or **All (AND)**. Optional **Advanced Gmail search** accepts operators such as `from:recruiter@example.com`.
3. Choose **Search Gmail**. The list switches to **Latest Gmail search only**; older jobs and drafts remain saved.
4. **Reset search** clears the date range, terms, and advanced query. **Reset filters** on Overview clears the text/status/source selection and latest-search scope without deleting jobs or changing saved preferences.

Gmail AND/OR applies to the email search; Preferred skills independently filters each extracted job. An email containing both terms can contain separate jobs. Date limits remain in effect alongside the grouped terms.

Each opportunity shows its file source or email subject, sender, and original email date. Additional email origins are available in the source tooltip. For older jobs without that metadata, sync the relevant emails again; normal duplicate imports update the origins rather than deleting existing draft records.

## Connect Gmail

If the app already offers **Sign in with Google**, use it. Otherwise, complete this one-time setup. No Gmail password or payment is required.

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/library/gmail.googleapis.com), create or select a project, and enable **Gmail API**. Use this same project for every step below.
2. In **Google Auth Platform**, complete Branding. For a personal Gmail account, set Audience to **External / Testing**. Under **Audience > Test users > Add users**, add the exact Gmail address you will use, click **Save**, and confirm it appears in the list.
3. In **Data Access**, add both scopes shown below.
4. Open [Google Auth Platform > Clients](https://console.cloud.google.com/auth/clients). Choose **Create client > Desktop app**, create it, and download its JSON file. Do not choose Web application or Service account.
5. In the app, choose **Connect Gmail > Choose downloaded JSON & sign in**. Select that file and approve Google's consent request. Future sign-ins do not need another JSON import.

Required scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
```

Google does not offer a create-drafts-only permission: its compose scope also permits sending. This app blocks send operations and only creates drafts. Keep your downloaded credentials file private.

### Access Blocked Or Sign-In Timed Out?

1. Select the Google Cloud project that created your imported JSON. Compare its client ID with the ID shown in the app's Gmail troubleshooting section. The app also shows the project ID/number when available and targets its setup links to that project.
2. Open [Audience > Test users](https://console.cloud.google.com/auth/audience), add the exact account shown on Google's blocked page, and **Save**.
3. Cancel the pending attempt using **X**, **Escape**, or **Cancel sign-in**. Close the blocked browser tab and sign in again with that approved account.

You do not need to publish the app or download a new JSON just to update test users. A blocked Google page may never return to the app, causing the three-minute timeout. Work or school accounts may also need administrator approval.

If the same error persists after saving the account, share a screenshot of the **saved Test users list and selected project**, not another screenshot of the error. Never share the credentials JSON or client secret. An app update cannot override Google's account-approval settings.

## Privacy And Limits

- Resumes, job descriptions, and credentials are stored locally with OS-backed encryption. Creating a Gmail draft uploads its email content and selected resume to Google.
- Logs record operation metadata, not email bodies or tokens.
- Supported inputs: text-based PDF, DOCX, and email. Scanned PDFs need OCR before import.
- Limits: 10 MB per document, 30 files per selection, 200 emails per import, and 100 jobs per draft batch.
- Desktop notifications depend on your OS notification settings.
- Draft status tracks creation, not later edits or sending in Gmail. After an uncertain network failure, check Gmail Drafts before retrying to avoid duplicates.

## For Developers

Requires Node.js 24 LTS and npm:

```sh
npm ci
npm run dev:desktop
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Run regression tests |
| `npm run typecheck` | Check TypeScript |
| `npm run test:desktop` | Build and smoke-test Electron |
| `npm run package:mac` | Build macOS installers |
| `npm run package:win` | Build the Windows installer on Windows |

For a browser preview, run `npm run dev` and open http://127.0.0.1:5173. It uses fictional data; native file and Gmail actions require the desktop app.

## More Details

- Architecture and folder structure: [docs/architecture.md](docs/architecture.md)
- Requirements: [docs/requirements.md](docs/requirements.md)
- Implementation plan: [docs/plan.md](docs/plan.md)
- Packaging, testing, signing, and release limits: [docs/RELEASE.md](docs/RELEASE.md)
- Publisher-provided Google sign-in: [resources/README.md](resources/README.md)