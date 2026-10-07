# Security assumption analysis

Vigil's assumption analysis is part of the existing pull request analysis flow. The AI proposes candidates; the backend validates cited source against content fetched at the analysis SHA; reviewers make an append-only decision. Candidate confidence is advisory and is not the evidence-strength level.

## Configuration

Set these values in the backend environment. Keep provider credentials on the backend and use a managed secret store such as Azure Key Vault in production.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `groq` | Provider used by the canonical gateway |
| `AI_MODEL` | `openai/gpt-oss-120b` | Primary model |
| `AI_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Infrastructure/model failure fallback |
| `AI_TEMPERATURE` | `0.1` | Initial extraction setting; not benchmark-proven optimal |
| `AI_MAX_OUTPUT_TOKENS` | `6144` | Completion output limit |
| `AI_TIMEOUT_SECONDS` | `90` | Provider request timeout |
| `AI_MAX_RETRIES` | `3` | Bounded retry limit |
| `GROQ_API_KEY` | unset | Backend-only Groq credential |

Do not place `GROQ_API_KEY` in frontend variables. Scanner evidence is not currently wired into this feature, so no scanner result is implied.

## Evidence and comparison limits

- Evidence paths, SHA, line range, and excerpt are checked against backend-fetched source at the exact commit. Rejected candidates are retained as insufficient-evidence change records, not verified assumptions.
- Each extraction run stores its analysis ID, provider/model, fallback use, latency, retry count, token usage (counts only), validation status, and bounded context counts. Logs avoid recording API credentials and repository excerpts.
- Evidence levels are conservative: E1 is one source file with validated code evidence; E2 is validated evidence spanning multiple files. E3 and E4 require executed tests/configuration/scanner or deterministic verification and are not assigned by the current pipeline.
- The baseline prefers observations at the PR base SHA. Otherwise, GitHub's compare API must prove a prior analyzed commit is an ancestor of the PR base. Comparison is bounded to 50 distinct previously analyzed commits; if the compatible baseline is not found, a prior observation is classified as insufficient evidence rather than new.
- The current context includes changed files and PR patches, not a complete call graph or scanner/test execution. Risk stays `UNASSESSED` and blast radius stays `INSUFFICIENT_EVIDENCE` until the backend has supporting deterministic inputs. No endpoint/function counts are inferred.
- `NOT_OBSERVED` means only that a complete extraction did not rediscover a baseline item. It does not mean safe, resolved, or accepted. Reviewer actions are separate audit records and do not rewrite the analysis classification.

## Reviewer identity

Assumption endpoints require `X-Reviewer-Login`, `X-Reviewer-Timestamp` (Unix seconds), and `X-Reviewer-Signature`; the backend verifies an HMAC-SHA256 signature using `REVIEWER_IDENTITY_HMAC_SECRET` (at least 32 bytes) before applying repository-owner authorization. The signature covers `casefold(trim(login)) + ':' + timestamp` and is accepted for at most five minutes. Configure the gateway to authenticate the user, strip caller-supplied identity headers, canonicalize, sign, and inject all three headers. The backend does not itself verify Microsoft Entra JWTs or map Entra subjects to GitHub identities, so direct deployment without this trusted gateway is not supported. A first-class Entra-to-user mapping is still required for broader team review.

## Benchmark plan

No benchmark result is claimed. Build a versioned 50-PR scenario set: 10 authentication, 10 authorization, 5 input-trust, 5 secrets, 5 security-boundary, 5 dependency/call-chain, 5 deployment, and 5 benign changes. Record gold assumption identities and evidence locations. Report extraction precision/recall, change-classification accuracy, false-positive rate, evidence validity, unsupported-claim rate, JSON validity, latency, token use, and reviewer actionability. Compare temperature 0.0, 0.1, and 0.2 on the same scenarios before changing the 0.1 default.
