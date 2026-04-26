# Security Guidelines

## 🔐 Credential Management

### ⚠️ CRITICAL: Never Commit Real Credentials

Real API keys, tokens, and secrets **must never** be committed to git history. Once committed, they are permanently exposed and should be revoked immediately.

### Environment Variables (.env)

1. **Create your local .env file** from the template:
   ```bash
   cp .env.example .env
   ```

2. **Add your real credentials** to `.env` (not committed):
   ```bash
   GOOGLE_API_KEY=your-real-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-real-key-here
   ```

3. **.env is in .gitignore** - never commit it

### Secure Credential Storage (via Keytar)

For production environments, use OS-level credential managers:

- **Windows**: Windows Credential Manager
- **macOS**: Keychain
- **Linux**: Secret Service / pass

The application can be extended to use `keytar` to retrieve credentials from the OS:

```javascript
const keytar = require('keytar');

async function getCredential(service, account) {
  return await keytar.getPassword(service, account);
}

// Usage: const apiKey = await getCredential('cyan-app', 'google_api_key');
```

## Input Validation & IPC Security

### IPC Message Validation

All IPC messages from the renderer process are validated before processing:

- Type checking (boolean, string, object, buffer)
- Schema validation via `validation/ipc-schema.js`
- Rejected messages are logged and discarded

### Protected IPC Channels

- `audio-chunk`: Validates buffer/Uint8Array
- `translation:toggle`: Validates object with required fields
- `cyan:openExternal`: Validates http(s) URLs only
- `language:change`: Validates string length (2-15 chars)

## Session Stability & Long-Running Issues

### Stream Recreation (5-minute cycle)

Long-running WebSocket connections are recreated every 5 minutes to prevent memory leaks and connection staleness:

```javascript
scheduleStreamRecreation(); // Runs every 5 minutes
```

### Resource Cleanup

- WebSocket connections are properly closed on shutdown
- Timers are cleared to prevent memory leaks
- Buffer state is reset between sessions

## Dependency Security

### Regular CVE Scanning

Check for known vulnerabilities in dependencies:

```bash
npm audit
npm audit fix
```

### Locked Dependency Versions

- `package-lock.json` is committed to ensure reproducible builds
- Update dependencies regularly but test thoroughly

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue
2. **Do NOT** commit test credentials
3. Contact the maintainers directly with details

---

**Last Updated:** 2026-04-17
