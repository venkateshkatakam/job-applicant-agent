# Optional Publisher Google OAuth Configuration

To provide normal Sign in with Google without requiring every user to create a Cloud project:

1. Register a Google Cloud project, enable Gmail API, and configure the consent screen/audience and Gmail readonly/compose scopes.
2. Create an OAuth client of type Desktop app.
3. Save its downloaded JSON as `resources/google-oauth.json` before packaging. The file is ignored by Git and copied to the app resources by electron-builder.
4. In the **same project's Google Auth Platform → Audience → Test users → Add users**, add and save every exact Gmail account that will test the app. Verify that each address appears in the saved list. Creating the project, setting its support email, or importing the client does not establish test-user approval. Keep the app in Testing for approved personal testing. Complete any Google verification/assessment required before public distribution.

The app detects this configuration, stores a local encrypted copy, and presents Sign in with Google. Each user consents separately; access/refresh tokens are never bundled. Imported per-user client configuration takes precedence.

A desktop application's client identifier and bundled client secret are extractable from its installer and are not confidential server credentials. Do not bundle service-account credentials, access tokens, refresh tokens, web-client secrets, or private keys. PKCE and consent protect the installed-app authorization flow. Users can alternatively import their own Desktop OAuth JSON once through the guided setup.

No Google OAuth project credentials are included in this repository. A build without this file shows the one-time setup guide; it cannot genuinely offer credential-free Google sign-in.