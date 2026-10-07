from typing import Any, Dict, List, Optional, Union
import base64
import httpx
import re

from app.core.config import settings
from app.integrations.github.auth import GitHubAuthManager
from app.integrations.github.exceptions import (
    GitHubAPIException,
    GitHubAuthenticationException,
    GitHubInstallationNotFoundException,
    GitHubPermissionDeniedException,
    GitHubRateLimitException,
    GitHubResourceNotFoundException,
    GitHubValidationErrorException,
)


class GitHubClient:
    """Async client for communicating with GitHub's API on behalf of GitHub Apps and installations."""

    def __init__(
        self,
        auth_manager: Optional[GitHubAuthManager] = None,
        timeout: float = 30.0,
    ):
        self.auth_manager = auth_manager or GitHubAuthManager()
        self.timeout = timeout

    @property
    def api_base_url(self) -> str:
        return self.auth_manager.api_base_url

    async def _handle_response(self, response: httpx.Response) -> Union[Dict[str, Any], List[Any]]:
        """Parse response JSON or translate HTTP errors into domain exceptions."""
        if 200 <= response.status_code < 300:
            if response.status_code == 204:
                return {}
            return response.json()

        if response.status_code == 401:
            raise GitHubAuthenticationException("GitHub authentication failed or token expired")

        if response.status_code == 403:
            # Check rate limiting
            remaining = response.headers.get("x-ratelimit-remaining")
            if remaining == "0" or "rate limit" in response.text.lower():
                reset_time = response.headers.get("x-ratelimit-reset")
                retry_after = int(reset_time) if reset_time and reset_time.isdigit() else None
                raise GitHubRateLimitException(
                    "GitHub rate limit exceeded", retry_after=retry_after
                )
            raise GitHubPermissionDeniedException("Access forbidden to requested GitHub resource")

        if response.status_code == 404:
            raise GitHubResourceNotFoundException("Requested GitHub resource was not found")

        if response.status_code == 422:
            try:
                error_data = response.json()
                msg = error_data.get("message", "Validation failed")
            except Exception:
                msg = response.text or "Validation failed"
            raise GitHubValidationErrorException(f"GitHub validation error: {msg}")

        if response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            retry_seconds = int(retry_after) if retry_after and retry_after.isdigit() else None
            raise GitHubRateLimitException(
                "GitHub API rate limit exceeded", retry_after=retry_seconds
            )

        raise GitHubAPIException(
            f"GitHub API error ({response.status_code}): {response.reason_phrase}",
            status_code=502,
        )

    async def request(
        self,
        method: str,
        endpoint: str,
        installation_id: Optional[int] = None,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Union[Dict[str, Any], List[Any]]:
        """Execute an authenticated HTTP request to GitHub API."""
        url = endpoint if endpoint.startswith("http") else f"{self.api_base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        req_headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Vigil-App",
        }
        if headers:
            req_headers.update(headers)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if installation_id is not None:
                token = await self.auth_manager.get_installation_token(installation_id, client=client)
                req_headers["Authorization"] = f"Bearer {token}"

            try:
                response = await client.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=json_data,
                    headers=req_headers,
                )
            except httpx.TimeoutException as e:
                raise GitHubAPIException("Timeout connecting to GitHub API", status_code=504) from e
            except httpx.NetworkError as e:
                raise GitHubAPIException("Network error connecting to GitHub API", status_code=502) from e

            return await self._handle_response(response)

    async def get_installation_repositories(
        self,
        installation_id: int,
        page: int = 1,
        per_page: int = 30,
    ) -> Dict[str, Any]:
        """
        Retrieve repositories accessible to a GitHub App installation (single page).
        GitHub API: GET /installation/repositories
        """
        page = max(1, page)
        per_page = min(max(1, per_page), 100)

        result = await self.request(
            method="GET",
            endpoint="/installation/repositories",
            installation_id=installation_id,
            params={"page": page, "per_page": per_page},
        )
        if isinstance(result, dict):
            return result
        return {"total_count": len(result), "repositories": result}

    async def get_all_installation_repositories(
        self,
        installation_id: int,
        per_page: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve ALL repositories accessible to a GitHub App installation, handling pagination automatically.
        """
        per_page = min(max(1, per_page), 100)
        page = 1
        all_repositories: List[Dict[str, Any]] = []

        while True:
            response = await self.get_installation_repositories(
                installation_id=installation_id,
                page=page,
                per_page=per_page,
            )
            repos = response.get("repositories", [])
            total_count = response.get("total_count")

            if not repos:
                break

            all_repositories.extend(repos)

            if total_count is not None and len(all_repositories) >= total_count:
                break

            if len(repos) < per_page:
                break

            page += 1

        return all_repositories

    async def get_repository_pull_requests(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        state: str = "all",
        page: int = 1,
        per_page: int = 30,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve pull requests for a repository.
        GitHub API: GET /repos/{owner}/{repo}/pulls
        """
        page = max(1, page)
        per_page = min(max(1, per_page), 100)

        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/pulls",
            installation_id=installation_id,
            params={"state": state, "page": page, "per_page": per_page},
        )
        if isinstance(result, list):
            return result
        return []

    async def get_pull_request(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pr_number: int,
    ) -> Dict[str, Any]:
        """
        Retrieve details of a single pull request.
        GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}
        """
        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/pulls/{pr_number}",
            installation_id=installation_id,
        )
        if isinstance(result, dict):
            return result
        return {}

    async def compare_commits(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        base_sha: str,
        head_sha: str,
    ) -> Dict[str, Any]:
        """Return GitHub's ancestry comparison for two repository commit SHAs."""
        if not all(isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{7,64}", value) for value in (base_sha, head_sha)):
            raise ValueError("Commit comparison requires valid SHA strings")
        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/compare/{base_sha}...{head_sha}",
            installation_id=installation_id,
        )
        return result if isinstance(result, dict) else {}

    async def get_pull_request_commits(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pr_number: int,
        page: int = 1,
        per_page: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve commits belonging to a pull request.
        GitHub API: GET /repos/{owner}/{repo}/pulls/{pr_number}/commits
        """
        page = max(1, page)
        per_page = min(max(1, per_page), 100)

        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/pulls/{pr_number}/commits",
            installation_id=installation_id,
            params={"page": page, "per_page": per_page},
        )
        if isinstance(result, list):
            return result
        return []

    async def get_pull_request_files(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pr_number: int,
        page: int = 1,
        per_page: int = 100,
    ) -> List[Dict[str, Any]]:
        """Retrieve one bounded page of changed-file metadata for a PR diff."""
        page = max(1, page)
        per_page = min(max(1, per_page), 100)
        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/pulls/{pr_number}/files",
            installation_id=installation_id,
            params={"page": page, "per_page": per_page},
        )
        return result if isinstance(result, list) else []

    async def get_commit(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        sha: str,
    ) -> Dict[str, Any]:
        """
        Retrieve commit details and diff metadata.
        GitHub API: GET /repos/{owner}/{repo}/commits/{sha}
        """
        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/commits/{sha}",
            installation_id=installation_id,
        )
        if isinstance(result, dict):
            return result
        return {}

    async def get_file_content_at_sha(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        path: str,
        sha: str,
    ) -> Optional[str]:
        """Fetch one file at an immutable Git commit SHA; never resolve a branch name."""
        safe_path = path.replace("\\", "/")
        if safe_path.startswith("/") or any(part in ("", ".", "..") for part in safe_path.split("/")):
            return None
        result = await self.request(
            method="GET",
            endpoint=f"/repos/{owner}/{repo}/contents/{safe_path}",
            installation_id=installation_id,
            params={"ref": sha},
        )
        if not isinstance(result, dict) or result.get("type") != "file":
            return None
        encoded = result.get("content")
        if not isinstance(encoded, str):
            return None
        try:
            return base64.b64decode(encoded, validate=False).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return None

    async def create_pull_request_review(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pr_number: int,
        commit_id: str,
        body: str,
        event: str = "COMMENT",
        comments: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Create a review for a pull request.
        GitHub API: POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews
        """
        payload = {
            "commit_id": commit_id,
            "body": body,
            "event": event,
        }
        if comments:
            payload["comments"] = comments

        result = await self.request(
            method="POST",
            endpoint=f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews",
            installation_id=installation_id,
            json_data=payload,
        )
        if isinstance(result, dict):
            return result
        return {}


# Default singleton client instance for reuse across services
github_client = GitHubClient()
