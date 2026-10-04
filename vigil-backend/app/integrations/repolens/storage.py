import json
import os
import shutil
import tempfile
from typing import Optional
from app.integrations.repolens.schema import RepositoryContext

class ContextStorage:
    def __init__(self, base_dir: str = "/tmp/vigil_data/contexts"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_repo_dir(self, repository: str) -> str:
        # repository is owner/repo
        safe_repo = repository.replace("/", "_")
        repo_dir = os.path.join(self.base_dir, safe_repo, ".vigil")
        os.makedirs(repo_dir, exist_ok=True)
        return repo_dir

    def _get_context_file(self, repository: str) -> str:
        return os.path.join(self._get_repo_dir(repository), "context.json")

    def load_context(self, repository: str) -> Optional[RepositoryContext]:
        path = self._get_context_file(repository)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return RepositoryContext.model_validate(data)
        except Exception:
            return None

    def save_context(self, context: RepositoryContext) -> None:
        path = self._get_context_file(context.repository)
        
        # Atomic write
        fd, temp_path = tempfile.mkstemp(dir=self._get_repo_dir(context.repository))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(context.model_dump(), f, indent=2)
            shutil.move(temp_path, path)
        except Exception:
            os.unlink(temp_path)
            raise
