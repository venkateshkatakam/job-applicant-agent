# Release Checklist

## Developer Builds

Use Node.js 24 LTS and `npm ci`. End users do not need Node/Python/Git. Builds are native Electron bundles, not scripts requiring a user's interpreter.

| Platform | Command | Output |
| --- | --- | --- |
| macOS | `npm run package:mac` | `release/*.dmg`, `release/*.zip` |
| Windows | `npm run package:win` | `release/*.exe` (NSIS installer) |
| Host unpacked app | `npm run package:dir` | `release/mac*/Job Applicant Agent.app` or `release/win-unpacked/` |

Architecture flags can be passed directly: `npx electron-builder --mac --x64 --arm64` after `npm run build`, or `npx electron-builder --win --x64`. Build Windows on Windows and macOS on macOS. The CI workflow handles both and uploads artifacts for download.

## Signing

The included workflow deliberately produces unsigned development artifacts. Public distribution is a separate release gate:

- macOS: configure an Apple Developer application signing identity and notarization credentials in protected CI secrets, then enable electron-builder notarization for your Apple team. Verify with `codesign --verify --deep --strict` and `spctl --assess`.
- Windows: configure a trusted signing service or a supported code-signing certificate and timestamping. Verify the Authenticode signature and installer on a clean Windows machine.
- Do not embed private keys, certificate passwords, OAuth client secrets, or tokens in the repository. Do not ask users to disable OS security globally.
- The native ICNS/ICO/PNG icons are generated from the same `public/mark.svg` J mark used by the renderer. Run `npm run icons` on macOS after changing that artwork; ICNS generation uses Apple's `iconutil`. Commit the generated native assets for Windows builds as well.

## Automated Gates

```sh
npm ci
npm test
npm run typecheck
npm audit
npm run test:desktop
npm run package:dir
```

Run Electron smoke tests in a graphical session. They use the actual OS app data location but perform only reads/UI navigation, not imports or Gmail actions. Never point release tests at a workspace containing confidential sample content when collecting screenshots.

## Manual Acceptance On Both OSes

- Install the bundle on a clean machine without Python, Git, or Node installed.
- Launch and verify real workspace starts empty, not with browser sample data; brand asset and local fonts load.
- Import at least two resumes (one PDF, one DOCX). Import a PDF/DOCX job, paste an email description, and verify unsupported/scanned files fail clearly.
- Set name/skills/locations/threshold/template. Restart to verify encrypted persistence. Inspect raw storage/logs for accidental plaintext secrets or email bodies.
- Import your Desktop OAuth JSON, consent using a test Gmail account, reject/cancel once, then authorize successfully. Do not use a production inbox for initial acceptance.
- Retrieve known messages inside/outside an inclusive date range, including a supported attachment and HTML message. Verify no remote image requests.
- Correct extracted company/location/recipient, compare selected resumes, and inspect the personalized email preview.
- Create a small draft batch including a missing recipient. Verify correct success/failure counts; completed jobs persist; a repeated batch skips successful jobs.
- Verify Gmail Drafts contain the correct recipient, UTF-8 subject/body, selected resume attachment, and no mail in Sent. Manually send only after your own review if testing that separate Gmail workflow.
- Allow OS notifications and verify the completion count. Disable them and confirm in-app feedback still works.
- Test expired/revoked access, network failure, and disconnect. Check Google Account grants after disconnect; revoke manually if offline.
- Verify signing/notarization, OS compatibility, native notifications, and installer upgrade/uninstall behavior before public distribution.

## Evidence Status

Local verification on 2026-10-29:

| Check | Result |
| --- | --- |
| Vitest domain and service suite (1.0.4) | 40 tests passed, including Any/All matching, alternatives scoring, tool-specific resume choice, Gmail query grouping/date bounds, provenance merging, document removal, OAuth cancellation, and blocked send routes |
| Strict renderer/main TypeScript | Passed |
| Vite/Electron production build | Passed |
| Full resolved dependency `npm audit` | Zero reported vulnerabilities |
| Electron source-build startup | Passed: real workspace, preload API, no renderer Node, local assets, navigation |
| Standalone macOS arm64 app | Passed: startup, real PDF extraction with packaged worker/native dependencies, bridge isolation, navigation |
| Browser at 1440 × 1000 | Search, email preview, preference save, six sample rows, zero broken images, zero page overflow |
| Browser at 390 × 844 | Zero page overflow; import dialog fits; images load |
| macOS arm64 DMG/ZIP build | Produced unsigned development artifacts in `release/` |
| Editor diagnostics | No errors reported |

The storage tests mock the OS encryption adapter; they do not certify Keychain/DPAPI cryptography or account-specific OS permissions. The desktop smoke test performs no credential import or persistent workspace mutation. The browser uses fictional sample data, not live Gmail integration.

Version 1.0.1 browser validation also checks the guided Google setup at 1440px and 390px, including all three setup links and file/sign-in action. The 33-page regression fixture is generated test data, not the user's uploaded PDF. Exact extraction counts for arbitrary document layouts still require review. Existing 1.0.0 imports can be repaired through Overview → Re-analyze; draft records are not expanded or deleted.

Version 1.0.2 browser checks use a simulated native bridge with a pending sign-in promise: X, Escape, and Cancel sign-in each invoke cancellation and clear the busy state; repeated attempts work and show no cancellation error alert. The imported-client troubleshooting guide and Audience link fit at 390px without page overflow. These checks do not certify live Google login. The real service tests use a local callback listener and mocked browser/token responses to verify cancellation/retry and token cleanup without accessing a user's account.

Version 1.0.3 browser checks use a simulated native bridge to verify Job documents grouping, cancel versus confirm, local draft-record warnings, preservation of other sources/resumes, and the empty state at desktop/mobile sizes. The mobile document view has no horizontal page overflow. Native icons are generated from the existing J SVG and validated as a 1024px PNG, ICNS, and multi-resolution ICO. Live Google approval and Windows runtime acceptance remain external/manual gates.

Version 1.0.4 browser checks use a simulated Gmail bridge: Any mode shows single-tool and combined-tool roles; All shows only the combined role. Gmail searches forward the chosen dates, terms, advanced query, and mode, then scope the visible list to the returned IDs without deleting old jobs. Search Reset clears form criteria; dashboard Reset restores all three fixture jobs. Email subject/sender/date and selected Playwright resume are visible. The search form has no page overflow at 390px. These checks do not replace live Gmail acceptance against the user's mailbox.

Live Gmail acceptance needs user-supplied OAuth credentials; Windows runtime/installer acceptance needs a Windows machine or the native CI job. Native notification delivery needs an enabled OS permission. A macOS build on the current host does not certify Windows behavior. Google OAuth verification and production signing/notarization are not completed by generating source code.