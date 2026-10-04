# invmagsys-api

## Audit logs

Successful authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests under `/api` are recorded in `audit_logs` with the acting user, action, API module, record ID when available, request values, IP address, and user agent. Passwords, tokens, and other secret fields are excluded from recorded request values. Failed requests and read-only requests are not recorded. Login and logout events continue to be recorded by the authentication handlers.

Administrators with audit-log view permission can query the records at `GET /api/audit-logs`, with optional `user_id`, `action`, `module`, `from_date`, and `to_date` filters.