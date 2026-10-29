import { ArrowUpRight, Check, FolderOpen, Mail, ShieldCheck } from 'lucide-react';

interface Props {
  configured: boolean;
  clientId?: string;
  project?: string;
  busy: boolean;
  signingIn?: boolean;
  onCancel(): void;
  onOpen(step: 'api' | 'consent' | 'credentials' | 'audience'): void;
  onImport(): void;
  onSignIn(): void;
}

export function GmailSetup({ configured, clientId, project, busy, signingIn, onCancel, onOpen, onImport, onSignIn }: Props) {
  return <>
    {configured ? <div className="google-signin-ready">
      <p className="success-text"><Check size={16} />Desktop OAuth client imported. Google account access still needs approval.</p>
      <button className="button primary full" disabled={busy} onClick={onSignIn}><Mail size={17} />Sign in with Google</button>
      <details className="oauth-advanced"><summary>Use a different Google OAuth client</summary><button className="button subtle" disabled={busy} onClick={onImport}><FolderOpen size={15} />Choose Desktop OAuth JSON & sign in</button></details>
    </div> : <div className="google-setup">
      <h3>One-time Google setup</h3>
      <p>This build does not include a publisher-registered Google client. Google requires one before sign-in. Create it once below; afterward you can sign in normally. No Gmail password or payment is needed.</p>
      <ol className="google-setup-steps">
        <li><div><h4>Create a project and enable Gmail</h4><p>Choose or create a Google Cloud project, then enable Gmail API.</p></div><button className="button subtle" disabled={busy} onClick={() => onOpen('api')}>Open Gmail API<ArrowUpRight size={14} /></button></li>
        <li><div><h4>Configure consent and approve your Gmail account</h4><p>Set Branding in Google Auth Platform. Under Audience, use External / Testing for a personal Gmail account. Scroll to Test users → Add users, enter the exact Gmail address you will sign in with, and Save. Being the project owner does not automatically add that account as a test user. In Data Access, add these scopes:</p><code>https://www.googleapis.com/auth/gmail.readonly</code><code>https://www.googleapis.com/auth/gmail.compose</code></div><button className="button subtle" disabled={busy} onClick={() => onOpen('audience')}>Open Audience / Test users<ArrowUpRight size={14} /></button></li>
        <li><div><h4>Download Desktop app credentials</h4><p>Open Clients → Create client → Desktop app → Create. Open that client and download its JSON file. Do not select Web application or Service account.</p></div><button className="button subtle" disabled={busy} onClick={() => onOpen('credentials')}>Open OAuth clients<ArrowUpRight size={14} /></button></li>
      </ol>
      <button className="button primary full" disabled={busy} onClick={onImport}><FolderOpen size={16} />Choose downloaded JSON & sign in</button>
    </div>}
    {signingIn && <div className="inline-note"><div><p>Waiting for Google in your browser. If access is blocked, cancel this attempt before updating your project's test users.</p><button className="button subtle" onClick={onCancel}>Cancel sign-in</button></div></div>}
    {configured && <div className="inline-note"><div><p><strong>Still seeing Google's 403 block?</strong> Updating or reinstalling this app cannot approve your Google account. Open the saved Test users list in the client project and confirm your exact sign-in address is listed. If it is, share a screenshot of that list and the project selector so the configuration can be checked. Never share the credentials JSON or client secret.</p>{project && <><p>OAuth project ID / number:</p><code>{project}</code></>}</div></div>}
    <details className="google-setup oauth-troubleshooting" open={configured}>
      <summary>Access blocked / Error 403: access_denied?</summary>
      <ol className="google-setup-steps">
        <li><div><h4>Check the Google Cloud project</h4><p>Select the same project that created your downloaded Desktop OAuth JSON. Under Clients, confirm the client ID matches the imported client below. The app name alone is not enough.</p>{clientId && <code>{clientId}</code>}</div><button className="button subtle" disabled={busy} onClick={() => onOpen('credentials')}>Check OAuth client<ArrowUpRight size={14} /></button></li>
        <li><div><h4>Approve the exact Gmail account</h4><p>Open Google Auth Platform → Audience → Test users → Add users. Add the exact Gmail address shown on Google's blocked sign-in page, click Save, and confirm the address appears in the list. Keep the app in Testing; publishing is not required for approved test users.</p></div><button className="button subtle" disabled={busy} onClick={() => onOpen('audience')}>Open Audience / Test users<ArrowUpRight size={14} /></button></li>
        <li><div><h4>Retry after saving</h4><p>Cancel any pending sign-in with the X or Cancel sign-in button. Close Google's blocked tab, then choose Sign in with Google again and select the approved Gmail account. Changing test users does not require downloading another JSON file.</p><p>If it still fails, recheck the project, saved address, and Google error. Workspace administrator policies may require separate approval. Do not disable account security or publish merely to bypass this error.</p></div></li>
      </ol>
    </details>
    <div className="inline-note"><ShieldCheck size={20} /><p>Google's compose permission also permits sending. This app blocks send operations and only saves drafts. Your Google sign-in tokens are stored encrypted on this device.</p></div>
  </>;
}