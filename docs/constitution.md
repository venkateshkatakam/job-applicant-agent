# Project Principles

1. Never send email. No automatic send function, IPC method, network route, retry, or scheduler.
2. Local by default. Job descriptions/resumes leave the device only when the user explicitly creates a Gmail draft.
3. Protect secrets with the OS key store; never fall back to plaintext credentials.
4. Treat documents as data. Do not execute document instructions, embed remote email HTML, or evaluate PDF scripts.
5. Do not fabricate qualifications. Keep configured preferences separate from resume evidence.
6. Make uncertainty visible. Review extracted recipients, fields, missing skills, and draft errors.
7. Isolate the renderer. No Node integration, arbitrary IPC, arbitrary external URLs, or general filesystem access.
8. Bundle the runtime. Installed end users do not need Python, Node, Git, or developer tools.
9. Prefer small explicit local services to remote infrastructure or paid integrations.