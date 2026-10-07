import ast
import re
from typing import Any, Dict, List, Optional, Set

from app.services.ai.review.schemas import FindingConfidence
from app.services.ai.security_assumptions.schemas import (
    AssumptionScope,
    SecurityAssumption,
)


class SecurityAssumptionRegistry:
    """Discovers and catalogs structured security and behavioral assumptions from code."""

    def extract_assumptions(self, code: str, file_path: str) -> List[SecurityAssumption]:
        """Extracts all discoverable assumptions from a Python source code string."""
        assumptions: List[SecurityAssumption] = []
        if not code or not code.strip():
            return assumptions

        try:
            tree = ast.parse(code)
            assumptions.extend(self._extract_ast_assumptions(tree, code, file_path))
        except Exception:
            # Fallback to regex-based extraction if syntax is incomplete/diff snippet
            assumptions.extend(self._extract_regex_assumptions(code, file_path))

        return assumptions

    def _extract_ast_assumptions(
        self, tree: ast.AST, code: str, file_path: str
    ) -> List[SecurityAssumption]:
        assumptions: List[SecurityAssumption] = []
        code_lines = code.splitlines()

        for node in ast.walk(tree):
            # 1. Inspect function/endpoint definitions
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_name = node.name
                func_line = getattr(node, "lineno", 1)

                # Check decorators for FastAPI router/app endpoints
                is_route = False
                route_path = func_name
                for dec in node.decorator_list:
                    dec_repr = ast.unparse(dec) if hasattr(ast, "unparse") else ""
                    if any(kw in dec_repr for kw in ("router.", "app.", "route")):
                        is_route = True
                        # Try to extract path
                        if isinstance(dec, ast.Call) and dec.args:
                            if isinstance(dec.args[0], ast.Constant) and isinstance(dec.args[0].value, str):
                                route_path = dec.args[0].value

                # A. Authentication Dependencies in Arguments
                has_auth_dep = False
                auth_dep_name = ""
                auth_line = func_line

                # Check args & defaults
                # In Python AST, defaults align with the last len(defaults) positional args
                args = node.args.args
                defaults = node.args.defaults
                num_defaults = len(defaults)
                offset = len(args) - num_defaults

                for i, arg in enumerate(args):
                    param_name = arg.arg
                    # Type annotations
                    if arg.annotation:
                        ann_str = ast.unparse(arg.annotation) if hasattr(ast, "unparse") else ""
                        if ann_str:
                            line_no = getattr(arg, "lineno", func_line)
                            ev_snippet = f"{param_name}: {ann_str}"
                            target_key = f"{func_name}.{param_name}" if not is_route else f"{route_path}:{param_name}"
                            assumptions.append(
                                SecurityAssumption(
                                    name=f"input_type_{param_name}",
                                    scope=AssumptionScope.INPUT,
                                    target=target_key,
                                    expected_value=ann_str,
                                    source_file=file_path,
                                    source_line=line_no,
                                    confidence=FindingConfidence.HIGH,
                                    evidence=ev_snippet,
                                    description=f"Parameter '{param_name}' is assumed to have type '{ann_str}'",
                                )
                            )

                    # Check default value for Depends(...)
                    if i >= offset:
                        default_val = defaults[i - offset]
                        default_repr = ast.unparse(default_val) if hasattr(ast, "unparse") else ""
                        if "Depends(" in default_repr or "Security(" in default_repr:
                            if any(
                                auth_kw in default_repr.lower()
                                for auth_kw in ("user", "auth", "token", "login", "admin", "permission", "api_key", "principal")
                            ):
                                has_auth_dep = True
                                auth_dep_name = default_repr
                                auth_line = getattr(default_val, "lineno", func_line)

                # Check kw_defaults
                for i, kwarg in enumerate(node.args.kwonlyargs):
                    if i < len(node.args.kw_defaults) and node.args.kw_defaults[i]:
                        def_val = node.args.kw_defaults[i]
                        def_repr = ast.unparse(def_val) if hasattr(ast, "unparse") else ""
                        if "Depends(" in def_repr and any(
                            auth_kw in def_repr.lower()
                            for auth_kw in ("user", "auth", "token", "login", "admin", "permission", "api_key")
                        ):
                            has_auth_dep = True
                            auth_dep_name = def_repr
                            auth_line = getattr(def_val, "lineno", func_line)

                if has_auth_dep:
                    assumptions.append(
                        SecurityAssumption(
                            name="authentication_required",
                            scope=AssumptionScope.AUTHENTICATION,
                            target=route_path if is_route else func_name,
                            expected_value="Authenticated User / Token",
                            source_file=file_path,
                            source_line=auth_line,
                            confidence=FindingConfidence.HIGH,
                            evidence=auth_dep_name,
                            description=f"Endpoint or function '{func_name}' requires active authentication ({auth_dep_name})",
                        )
                    )

                # B. Authorization / Ownership Checks in Function Body
                for stmt in node.body:
                    if isinstance(stmt, ast.If):
                        cond_repr = ast.unparse(stmt.test) if hasattr(ast, "unparse") else ""
                        stmt_line = getattr(stmt, "lineno", func_line)

                        # Look for ownership / permission / role patterns
                        # e.g., document.owner_id != current_user.id, user.role != Role.ADMIN, not user.is_admin
                        is_authz = False
                        authz_desc = ""

                        if any(
                            pat in cond_repr
                            for pat in (
                                "owner_id",
                                "user_id",
                                "created_by",
                                "author_id",
                                "tenant_id",
                                "org_id",
                                "organization_id",
                            )
                        ) and any(
                            u_pat in cond_repr
                            for u_pat in ("user", "current_user", "principal", "auth", "caller")
                        ):
                            is_authz = True
                            authz_desc = f"Resource ownership check: {cond_repr}"

                        elif any(
                            role_kw in cond_repr.lower()
                            for role_kw in ("is_admin", "role", "permission", "is_superuser", "has_permission", "is_staff")
                        ):
                            is_authz = True
                            authz_desc = f"Role / permission check: {cond_repr}"

                        # Check for state transition checks
                        elif any(state_kw in cond_repr.lower() for state_kw in ("status", "state", "stage", "phase")) and any(
                            cmp in cond_repr for cmp in ("!=", "==", "not in", "in", "is not")
                        ):
                            assumptions.append(
                                SecurityAssumption(
                                    name="state_precondition",
                                    scope=AssumptionScope.STATE,
                                    target=func_name,
                                    expected_value=cond_repr,
                                    source_file=file_path,
                                    source_line=stmt_line,
                                    confidence=FindingConfidence.MEDIUM,
                                    evidence=cond_repr,
                                    description=f"Function '{func_name}' enforces state assumption: {cond_repr}",
                                )
                            )

                        if is_authz:
                            assumptions.append(
                                SecurityAssumption(
                                    name="authorization_check",
                                    scope=AssumptionScope.AUTHORIZATION,
                                    target=func_name,
                                    expected_value=authz_desc,
                                    source_file=file_path,
                                    source_line=stmt_line,
                                    confidence=FindingConfidence.HIGH,
                                    evidence=cond_repr,
                                    description=f"Function '{func_name}' enforces authorization requirement: {cond_repr}",
                                )
                            )

            # 2. Inspect Class Definitions (e.g. Pydantic Models)
            if isinstance(node, ast.ClassDef):
                class_name = node.name
                class_line = getattr(node, "lineno", 1)

                for stmt in node.body:
                    # Look for typed attributes with Field constraints or direct validations
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        field_name = stmt.target.id
                        line_no = getattr(stmt, "lineno", class_line)
                        ann_str = ast.unparse(stmt.annotation) if hasattr(ast, "unparse") else ""
                        val_str = ast.unparse(stmt.value) if stmt.value and hasattr(ast, "unparse") else ""

                        # Check Field(...) constraints (e.g. gt=0, min_length=1, ge=0)
                        if "Field(" in val_str:
                            constraints = []
                            for c_kw in ("gt", "ge", "lt", "le", "min_length", "max_length", "regex", "pattern", "min_items"):
                                if f"{c_kw}=" in val_str:
                                    constraints.append(c_kw)

                            if constraints:
                                assumptions.append(
                                    SecurityAssumption(
                                        name=f"validation_constraint_{field_name}",
                                        scope=AssumptionScope.VALIDATION,
                                        target=f"{class_name}.{field_name}",
                                        expected_value=val_str,
                                        source_file=file_path,
                                        source_line=line_no,
                                        confidence=FindingConfidence.HIGH,
                                        evidence=f"{field_name}: {ann_str} = {val_str}",
                                        description=f"Field '{class_name}.{field_name}' enforces validation constraint ({', '.join(constraints)})",
                                    )
                                )

                        # Record model field type assumption
                        if ann_str:
                            assumptions.append(
                                SecurityAssumption(
                                    name=f"model_field_type_{field_name}",
                                    scope=AssumptionScope.INPUT,
                                    target=f"{class_name}.{field_name}",
                                    expected_value=ann_str,
                                    source_file=file_path,
                                    source_line=line_no,
                                    confidence=FindingConfidence.HIGH,
                                    evidence=f"{field_name}: {ann_str}",
                                    description=f"Field '{class_name}.{field_name}' is assumed to be '{ann_str}'",
                                )
                            )

        return assumptions

    def _extract_regex_assumptions(self, code: str, file_path: str) -> List[SecurityAssumption]:
        assumptions: List[SecurityAssumption] = []
        lines = code.splitlines()

        for idx, line in enumerate(lines, start=1):
            # Regex for Depends(get_current_user)
            if "Depends(" in line and any(
                kw in line.lower() for kw in ("user", "auth", "token", "login", "admin", "permission")
            ):
                assumptions.append(
                    SecurityAssumption(
                        name="authentication_required",
                        scope=AssumptionScope.AUTHENTICATION,
                        target=file_path,
                        expected_value="Authenticated User / Token",
                        source_file=file_path,
                        source_line=idx,
                        confidence=FindingConfidence.HIGH,
                        evidence=line.strip(),
                        description=f"Authentication dependency assumed: {line.strip()}",
                    )
                )

            # Regex for ownership check: if resource.owner_id != user.id
            if re.search(r"if\s+.*(?:owner_id|user_id|created_by|author_id)\s*!=\s*.*(?:user|current_user)", line):
                assumptions.append(
                    SecurityAssumption(
                        name="authorization_check",
                        scope=AssumptionScope.AUTHORIZATION,
                        target=file_path,
                        expected_value="Resource ownership check",
                        source_file=file_path,
                        source_line=idx,
                        confidence=FindingConfidence.HIGH,
                        evidence=line.strip(),
                        description=f"Resource ownership check assumed: {line.strip()}",
                    )
                )

            # Regex for validation Field(gt=0...)
            field_match = re.search(r"(\w+)\s*:\s*([^=\s]+)\s*=\s*Field\((.*?)\)", line)
            if field_match:
                f_name, f_type, f_args = field_match.groups()
                if any(c_kw in f_args for c_kw in ("gt=", "ge=", "lt=", "le=", "min_length=", "max_length=", "pattern=")):
                    assumptions.append(
                        SecurityAssumption(
                            name=f"validation_constraint_{f_name}",
                            scope=AssumptionScope.VALIDATION,
                            target=f"{file_path}:{f_name}",
                            expected_value=f_args.strip(),
                            source_file=file_path,
                            source_line=idx,
                            confidence=FindingConfidence.HIGH,
                            evidence=line.strip(),
                            description=f"Validation constraint on {f_name}: {f_args.strip()}",
                        )
                    )

        return assumptions
