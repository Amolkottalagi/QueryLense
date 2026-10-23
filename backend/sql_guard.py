"""Cross-dialect conservative SQL checks before target database execution.

These checks are defense in depth, not a substitute for read-only DB credentials.
"""
import re
from . import config

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|rename|grant|revoke|call|lock|unlock|handler|"
    r"load|outfile|dumpfile|into|prepare|execute|deallocate|sleep|pg_sleep|benchmark|get_lock|release_lock|"
    r"load_file|shutdown|kill|copy|vacuum|attach|detach|pragma|xp_cmdshell|sp_configure|dbms_lock)\b|"
    r"\breplace\s+into\b|\bfor\s+(update|share)\b", re.IGNORECASE)
SYSTEM_SCHEMAS = re.compile(
    r"\b(information_schema|performance_schema|mysql|sys|pg_catalog|pg_toast|master|msdb|tempdb|app_db)\s*\.",
    re.IGNORECASE)

class UnsafeSQL(Exception):
    pass


def strip_code_fences(text: str) -> str:
    text = (text or "").strip()
    match = re.match(r"^```(?:sql)?\s*(.*?)\s*```$", text, re.DOTALL | re.IGNORECASE)
    return (match.group(1) if match else text).strip()


def _mask_literals(sql: str) -> str:
    # Mask string literals and quoted identifiers before scanning dangerous keywords.
    sql = re.sub(r"'(?:[^'\\]|\\.|'')*'", "''", sql)
    sql = re.sub(r"\$(\w*)\$.*?\$\1\$", "''", sql, flags=re.DOTALL)  # PostgreSQL dollar strings
    sql = re.sub(r'"(?:[^"\\]|\\.|"")*"', '"identifier"', sql)
    sql = re.sub(r"`[^`]*`", "`identifier`", sql)
    sql = re.sub(r"\[[^\]]*\]", "[identifier]", sql)
    return sql


def validate(sql: str) -> str:
    sql = strip_code_fences(sql)
    if not sql:
        raise UnsafeSQL("The model returned no SQL.")
    if "/*!" in sql or "/*+" in sql:
        raise UnsafeSQL("Executable or optimizer-hint comments are not allowed.")
    body = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    body = re.sub(r"(--[^\n]*|#[^\n]*)", " ", body)
    body = _mask_literals(body).strip().rstrip(";").strip()
    if ";" in body:
        raise UnsafeSQL("Only a single statement is allowed.")
    if not re.match(r"^\(*\s*(select|with)\b", body, re.IGNORECASE):
        raise UnsafeSQL("Only SELECT queries are allowed.")
    hit = FORBIDDEN.search(body)
    if hit:
        raise UnsafeSQL(f"Forbidden keyword: {hit.group(0).strip().upper()}.")
    if SYSTEM_SCHEMAS.search(body) or re.search(rf"\b{re.escape(config.DB_NAME)}\s*\.", body, re.IGNORECASE):
        raise UnsafeSQL("Access to system or application schemas is not allowed.")
    return sql.rstrip(";").strip()
