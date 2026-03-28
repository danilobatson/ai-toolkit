# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email security reports to: djbatson19@gmail.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any potential impact assessment

You should receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Features

The toolkit includes built-in security capabilities:

### PII Detection (`security` module)
- Regex-based detection of emails, phone numbers, SSNs, credit cards, names, and dates of birth
- Designed to over-detect rather than miss — false positives are preferred over false negatives
- No external API calls — runs entirely locally

### Guardrails (`security` module)
- Content filtering for AI inputs and outputs
- Configurable blocked patterns and topics

### Audit Logging (`security` module)
- Structured audit trail for security-relevant events
- JSON format compatible with CloudWatch, Datadog, and other log aggregators

### Rate Limiting (`security` module)
- In-memory and Redis-backed rate limiting
- Configurable windows and limits per key

### Auth (`auth` module)
- Timing-safe API key comparison (prevents timing attacks)
- RBAC with role-based access control
- API key guard middleware

### Dependencies
- All dependencies pinned to exact versions (no `^` ranges)
- Renovate monitors for updates weekly
- License audit in CI (MIT, Apache-2.0, BSD, ISC only)
- CodeQL analysis on every PR to `main`

## Security Best Practices for Users

1. **Never commit API keys** — use environment variables via the `config` module
2. **Enable PII detection** before sending user content to AI providers
3. **Use guardrails** to filter AI outputs before displaying to users
4. **Enable audit logging** in production for compliance
5. **Use rate limiting** on all public-facing AI endpoints
