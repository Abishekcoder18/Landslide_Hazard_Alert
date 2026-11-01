"""PRD v1.0 section 8 Roles and Permissions (FR-33). Port of src/domain/permissions.ts."""

ROLES = ("officer", "second_approver", "road_engineer", "patrol", "public_reporter", "admin")

MATRIX = {
    "view_corridor": {"officer", "second_approver", "road_engineer", "patrol", "admin"},
    "submit_report": {"officer", "second_approver", "road_engineer", "patrol", "public_reporter"},
    "review_report": {"officer", "second_approver"},
    "approve_closure": {"officer", "second_approver"},
    "approve_alert": {"officer", "second_approver"},
    "update_clearance": {"officer", "second_approver", "road_engineer"},
    "clear_passage": {"officer"},
    "configure": {"admin"},
    "view_records": {"officer", "second_approver", "road_engineer", "admin"},
}

ROLE_LABEL = {
    "officer": "Control-room officer",
    "second_approver": "Second approver",
    "road_engineer": "Road engineer",
    "patrol": "Highway patrol",
    "public_reporter": "Public reporter",
    "admin": "Administrator",
}


class PermissionError_(Exception):
    def __init__(self, role: str, action: str):
        super().__init__(f"Not permitted: {ROLE_LABEL.get(role, role)} cannot {action.replace('_', ' ')}")


def can(role: str, action: str) -> bool:
    return role in MATRIX[action]


def assert_can(role: str, action: str) -> None:
    if not can(role, action):
        raise PermissionError_(role, action)


def can_decide_approval(role: str, status: str) -> bool:
    if status not in ("pending", "escalated"):
        return False
    if role == "officer":
        return True
    if role == "second_approver":
        return status == "escalated"
    return False
