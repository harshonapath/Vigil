from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class RepositoryPayload(BaseModel):
    id: int
    name: str
    full_name: str
    owner_login: str
    private: bool = False
    html_url: str
    default_branch: Optional[str] = None


class SenderPayload(BaseModel):
    id: int
    login: str
    avatar_url: Optional[str] = None


class CommitPayload(BaseModel):
    id: str  # SHA
    message: str
    timestamp: Optional[str] = None
    author_name: Optional[str] = None
    author_email: Optional[str] = None


class PullRequestPayload(BaseModel):
    id: int  # github_pr_id
    number: int  # pr_number
    title: str
    body: Optional[str] = None
    state: str
    merged: Optional[bool] = False
    head_sha: str
    base_sha: str
    head_branch: str
    base_branch: str
    author_login: str


class GitHubPushEvent(BaseModel):
    delivery_id: str
    event_type: str = "push"
    installation_id: Optional[int] = None
    repository: RepositoryPayload
    ref: str
    before: str
    after: str
    commits: List[CommitPayload] = Field(default_factory=list)
    sender: SenderPayload


class GitHubPullRequestEvent(BaseModel):
    delivery_id: str
    event_type: str = "pull_request"
    action: str  # opened, synchronize, reopened, closed, etc.
    installation_id: Optional[int] = None
    repository: RepositoryPayload
    pull_request: PullRequestPayload
    sender: SenderPayload


GitHubNormalizedEvent = Union[GitHubPushEvent, GitHubPullRequestEvent]


def normalize_webhook_payload(
    event_type: str,
    delivery_id: str,
    payload: Dict[str, Any],
) -> Optional[GitHubNormalizedEvent]:
    """
    Parse raw GitHub webhook payload dict into a normalized internal event structure.
    Returns None if event_type is unsupported.
    """
    installation_id = payload.get("installation", {}).get("id")

    repo_raw = payload.get("repository", {})
    if not repo_raw:
        return None

    # Robust extraction of owner login
    owner_val = ""
    owner_raw = repo_raw.get("owner")
    if isinstance(owner_raw, dict):
        owner_val = owner_raw.get("login") or ""
    elif isinstance(owner_raw, str):
        owner_val = owner_raw.strip()
    if not owner_val:
        owner_val = repo_raw.get("owner_login") or ""
    if not owner_val and repo_raw.get("full_name") and "/" in repo_raw["full_name"]:
        parts = repo_raw["full_name"].split("/", 1)
        if parts[0].strip() and parts[0].strip().lower() != "unknown":
            owner_val = parts[0].strip()

    repository = RepositoryPayload(
        id=repo_raw.get("id", 0),
        name=repo_raw.get("name", ""),
        full_name=repo_raw.get("full_name", ""),
        owner_login=owner_val,
        private=repo_raw.get("private", False),
        html_url=repo_raw.get("html_url", ""),
        default_branch=repo_raw.get("default_branch"),
    )

    sender_raw = payload.get("sender", {})
    sender = SenderPayload(
        id=sender_raw.get("id", 0),
        login=sender_raw.get("login", "unknown"),
        avatar_url=sender_raw.get("avatar_url"),
    )

    if event_type == "push":
        commits_raw = payload.get("commits", [])
        commits = [
            CommitPayload(
                id=c.get("id", ""),
                message=c.get("message", ""),
                timestamp=c.get("timestamp"),
                author_name=c.get("author", {}).get("name") if isinstance(c.get("author"), dict) else None,
                author_email=c.get("author", {}).get("email") if isinstance(c.get("author"), dict) else None,
            )
            for c in commits_raw
            if isinstance(c, dict)
        ]

        return GitHubPushEvent(
            delivery_id=delivery_id,
            installation_id=installation_id,
            repository=repository,
            ref=payload.get("ref", ""),
            before=payload.get("before", ""),
            after=payload.get("after", ""),
            commits=commits,
            sender=sender,
        )

    elif event_type == "pull_request":
        pr_raw = payload.get("pull_request", {})
        if not pr_raw:
            return None

        pr_user_raw = pr_raw.get("user")
        author_val = ""
        if isinstance(pr_user_raw, dict):
            author_val = pr_user_raw.get("login") or ""
        elif isinstance(pr_user_raw, str):
            author_val = pr_user_raw.strip()
        if not author_val:
            author_val = pr_raw.get("author_login") or ""

        pull_request = PullRequestPayload(
            id=pr_raw.get("id", 0),
            number=pr_raw.get("number", payload.get("number", 0)),
            title=pr_raw.get("title", ""),
            body=pr_raw.get("body"),
            state=pr_raw.get("state", "open"),
            merged=pr_raw.get("merged", False),
            head_sha=(pr_raw.get("head", {}).get("sha", "") if isinstance(pr_raw.get("head"), dict) else "") or pr_raw.get("head_sha", ""),
            base_sha=(pr_raw.get("base", {}).get("sha", "") if isinstance(pr_raw.get("base"), dict) else "") or pr_raw.get("base_sha", ""),
            head_branch=(pr_raw.get("head", {}).get("ref", "") if isinstance(pr_raw.get("head"), dict) else "") or pr_raw.get("head_branch", ""),
            base_branch=(pr_raw.get("base", {}).get("ref", "") if isinstance(pr_raw.get("base"), dict) else "") or pr_raw.get("base_branch", ""),
            author_login=author_val,
        )

        return GitHubPullRequestEvent(
            delivery_id=delivery_id,
            action=payload.get("action", ""),
            installation_id=installation_id,
            repository=repository,
            pull_request=pull_request,
            sender=sender,
        )

    return None
