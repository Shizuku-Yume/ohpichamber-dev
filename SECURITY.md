# Security policy

## Reporting a vulnerability

If you find a security vulnerability, report it privately rather than opening a public issue. Use GitHub Private Vulnerability Reporting on this repository if enabled, or contact the maintainer directly.

Include:
- A description of the vulnerability
- Steps to reproduce
- Affected versions or commits
- Potential impact

Do not open public issues for unpatched vulnerabilities.

## Scope

OhPiChamber handles sensitive context including:
- UI authentication (password-protected sessions, JWT tokens)
- Cloudflare tunnel access (remote connectivity)
- Terminal access (PTY sessions)
- Git credentials and SSH keys
- File system operations

Reports covering these areas are especially relevant.

## Supported versions

Security fixes apply to the default branch and latest release. There is no LTS or backport release channel.
