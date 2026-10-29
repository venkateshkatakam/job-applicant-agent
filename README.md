# Job Applicant Agent

A desktop app that finds jobs matching your resumes and prepares personalized Gmail drafts.

**Nothing is sent automatically. You review and send every application yourself.**

## Install

**Current version: 1.0.4**

You do not need Node.js, Python, or Git to use the installed app.

### Find An Installer

Check existing GitHub build artifacts first. Sign in to GitHub, then follow this path:

**Repository > Actions > Desktop Builds > select a completed run > Summary > Artifacts** (scroll to the bottom of the summary).

Choose a run for the version or branch you need, and check that its build for your platform succeeded. Download the matching artifact:

| Your computer | Artifact to download | Installer inside the ZIP |
| --- | --- | --- |
| Windows (64-bit Intel/AMD) | **Job-Applicant-Agent-Windows** | `.exe` |
| Mac with Apple Silicon (M1 or newer) | **Job-Applicant-Agent-macOS** | `arm64.dmg` |
| Intel Mac | **Job-Applicant-Agent-macOS** | `x64.dmg` |

Extract the downloaded ZIP, then follow the installation steps for your platform below. Already received an installer from a trusted maintainer? Go straight to those steps.

### If The Installer Is Missing

If there is no matching artifact, it has expired, or there are no completed builds, generate a new build:

1. Make sure the latest project code is pushed to the GitHub repository.
2. Open **Repository > Actions > Desktop Builds > Run workflow**.
3. Choose the branch with the code you need and confirm **Run workflow**. This requires permission to run workflows in the repository; you can do it from a Mac or Windows computer.
4. Open the new run and wait for the build for your platform to succeed.
5. Return to **Summary > Artifacts** and download the matching artifact from the table above.

If **Run workflow** is unavailable, ask a repository maintainer to run it and share the installer. If a build fails, check the failed step in the run's logs; that platform's new installer will not be available until the build succeeds.

For a local Apple Silicon Mac installation, you can also use the included [release/Job Applicant Agent-1.0.4-arm64.dmg](release/Job%20Applicant%20Agent-1.0.4-arm64.dmg).

### Install On Windows

1. On your Windows computer, open the `.exe` installer from the extracted ZIP.
2. Follow the installation prompts.
3. Launch **Job Applicant Agent** from the Start menu.

These are unsigned development builds. Windows may show a security warning. Only run an installer whose source you trust; do not disable Windows security. Windows installation and app behavior still require testing on a Windows machine.

### Install On macOS

1. Open the DMG and drag **Job Applicant Agent** into **Applications**.
2. Launch the app from Applications.
3. If macOS blocks this unsigned build, verify that you trust its source, then open **System Settings > Privacy & Security > Open Anyway** after attempting to launch it.

**Upgrading:** quit the app before running the new installer or replacing the Mac app. Your saved resumes and preferences stay on your device.

## Use The App

1. **My resumes:** upload one or more PDF or DOCX resumes.
2. **Preferences:** enter your name, preferred locations, skills, and minimum match percentage. Choose **Any (OR)** or **All (AND)** for preferred skills.
3. **Email template:** customize your introduction.
4. **Import jobs:** upload job descriptions, paste text, or retrieve Gmail emails using dates and a search query.
5. **Matching:** review the job details, score, selected resume, and recruiter email. Correct anything inaccurate.
6. **Create drafts:** preview your emails and confirm the batch. Each draft includes the selected resume.
7. Open **Gmail Drafts**, review everything, and send manually. The app notifies you when drafting finishes.

**Matching:** with skills such as `Selenium, Playwright`, **Any (OR)** accepts either skill; **All (AND)** requires both. Jobs must also meet your minimum match percentage. Matching is local and rule-based, so review the selected resume and job details before drafting.

**Remove job documents:** open **Job documents**, click the trash icon beside a file, and confirm. This removes its extracted jobs, not your original file, resumes, or Gmail drafts.

### Search Gmail Again

1. Choose **Sync Gmail** and change **From date** / **Through date** as needed.
2. Enter comma-separated **Search terms**, such as `Selenium, Playwright`, and choose **Any (OR)** or **All (AND)**. Optional **Advanced Gmail search** accepts operators such as `from:recruiter@example.com`.
3. Choose **Search Gmail**. The list switches to **Latest Gmail search only**; older jobs and drafts remain saved.
4. **Reset search** clears the date range, terms, and advanced query. **Reset filters** on Overview clears the text/status/source selection and latest-search scope without deleting jobs or changing saved preferences.

Gmail search terms filter emails; your **Preferred skills** separately filter the jobs found inside them.

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

1. Select the Google Cloud project that created your imported JSON. Compare its client ID with the ID shown in the app's Gmail troubleshooting section.
2. Open [Audience > Test users](https://console.cloud.google.com/auth/audience), add the exact account shown on Google's blocked page, and **Save**.
3. Cancel the pending attempt using **X**, **Escape**, or **Cancel sign-in**. Close the blocked browser tab and sign in again with that approved account.

You do not need to publish the app or download a new JSON just to update test users. Work or school accounts may also need administrator approval. Never share your credentials JSON or client secret.

## Privacy And Limits

- Resumes, job descriptions, and credentials are stored locally with OS-backed encryption. Creating a Gmail draft uploads its email content and selected resume to Google.
- Logs record operation metadata, not email bodies or tokens.
- Supported inputs: text-based PDF, DOCX, and email. Scanned PDFs need OCR before import.
- Limits: 10 MB per document, 30 files per selection, 200 emails per import, and 100 jobs per draft batch.
- Desktop notifications depend on your OS notification settings.
- Draft status tracks creation, not later edits or sending in Gmail. After an uncertain network failure, check Gmail Drafts before retrying to avoid duplicates.

## For Developers

To run from source, install Node.js 24 LTS, open a terminal in the project folder, and run:

```sh
npm ci
npm run dev:desktop
```

To build a Windows installer locally, run these commands **on Windows** instead:

```powershell
npm ci
npm run package:win
```

The `.exe` installer is written to the `release` folder. See [docs/RELEASE.md](docs/RELEASE.md) for other build commands, testing, and signing requirements.

## More Details

- Architecture and folder structure: [docs/architecture.md](docs/architecture.md)
- Packaging, testing, signing, and release limits: [docs/RELEASE.md](docs/RELEASE.md)
- Publisher-provided Google sign-in: [resources/README.md](resources/README.md)