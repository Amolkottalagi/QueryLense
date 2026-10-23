"""Execute validated read-only SQL against the authenticated user's selected database."""
import datetime
import decimal
import time

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from . import config, sql_guard
from .target_databases import TargetDatabaseError, get_target_database


class ExecutionError(Exception):
    """Safe error wrapper used by the chat pipeline."""
    def __init__(self, message: str, code: int | str | None = None):
        super().__init__(message)
        self.code = code


def _clean(v):
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    return v


def _start_read_only(conn, dialect: str, start_time: float) -> None:
    """Apply dialect-specific session protection where available.

    The target credentials must still be read-only: not every SQLAlchemy dialect has a
    portable read-only-session command.
    """
    if dialect in {"mysql", "mariadb"}:
        conn.exec_driver_sql("SET SESSION TRANSACTION READ ONLY")
        try:
            conn.exec_driver_sql(f"SET SESSION MAX_EXECUTION_TIME={int(config.QUERY_TIMEOUT_SEC * 1000)}")
        except SQLAlchemyError:
            try:
                conn.exec_driver_sql(f"SET SESSION max_statement_time={int(config.QUERY_TIMEOUT_SEC)}")
            except SQLAlchemyError:
                pass
    elif dialect == "postgresql":
        conn.exec_driver_sql("SET TRANSACTION READ ONLY")
        conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(config.QUERY_TIMEOUT_SEC * 1000)}")
    elif dialect == "sqlite":
        conn.exec_driver_sql("PRAGMA query_only = ON")
        raw = conn.connection.driver_connection
        raw.set_progress_handler(lambda: 1 if time.monotonic() - start_time > config.QUERY_TIMEOUT_SEC else 0, 1000)
    elif dialect == "oracle":
        conn.exec_driver_sql("SET TRANSACTION READ ONLY")
        try:
            conn.connection.driver_connection.call_timeout = int(config.QUERY_TIMEOUT_SEC * 1000)
        except Exception:
            pass
    elif dialect == "mssql":
        # SQL Server has no portable session-level read-only switch. The DB login must be SELECT-only.
        conn.exec_driver_sql(f"SET LOCK_TIMEOUT {int(config.QUERY_TIMEOUT_SEC * 1000)}")
        try:
            conn.connection.driver_connection.timeout = int(config.QUERY_TIMEOUT_SEC)
        except Exception:
            pass


def run_select(sql: str, max_rows: int | None = None, user_id: int | None = None,
               connection_id: int | None = None) -> dict:
    """Execute one SELECT and return JSON-ready columns/rows and latency."""
    if user_id is None:
        # Backwards compatibility for internal evaluation/test calls; production API passes user_id.
        user_id = 0
    max_rows = max_rows or config.MAX_ROWS
    try:
        sql = sql_guard.validate(sql)
    except sql_guard.UnsafeSQL as exc:
        prefix = "Query interrupted or blocked by safety policy: " if "SLEEP" in str(exc).upper() or "PG_SLEEP" in str(exc).upper() else ""
        raise ExecutionError(prefix + str(exc)) from exc
    try:
        target = get_target_database(user_id, connection_id)
    except TargetDatabaseError as exc:
        raise ExecutionError(str(exc)) from exc
    start = time.monotonic()
    try:
        with target.engine.connect() as conn:
            try:
                _start_read_only(conn, target.dialect, start)
                result = conn.execute(text(sql))
                try:
                    columns = list(result.keys()) if result.returns_rows else []
                    fetched = result.fetchmany(max_rows + 1) if result.returns_rows else []
                    truncated = len(fetched) > max_rows
                    rows = [[_clean(v) for v in tuple(row)] for row in fetched[:max_rows]]
                    if result.returns_rows and not truncated:
                        result.fetchall()
                finally:
                    result.close()
            except SQLAlchemyError as exc:
                message = str(getattr(exc, "orig", exc)).splitlines()[0][:300]
                code = getattr(getattr(exc, "orig", None), "errno", None) or getattr(getattr(exc, "orig", None), "code", None)
                # Driver exception text can include a URL; avoid returning credentials.
                if "@" in message and "://" in message:
                    message = "The database rejected the query or the connection failed."
                raise ExecutionError(message, code) from exc
    except ExecutionError:
        raise
    except Exception as exc:
        raise ExecutionError("Could not execute the query against the selected database.") from exc
    return {"columns": columns, "rows": rows, "row_count": len(rows), "truncated": truncated,
            "latency_ms": int((time.monotonic() - start) * 1000)}
