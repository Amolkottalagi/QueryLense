"""Build database-specific schema context for the selected user-owned target connection."""
import hashlib

from . import config
from .executor import ExecutionError
from .target_databases import TargetDatabaseError, get_target_database, inspect_schema
from .db import get_conn


def _short(value) -> str:
    s = str(value)
    return s if len(s) <= 40 else s[:37] + "..."


def _render(target, tables, foreign_keys, samples) -> str:
    out = [f"Database: {target.name} ({target.dialect} SQL dialect)",
           f"SQL dialect: {target.dialect}. Generate syntax compatible with this database."]
    for table_name, columns in tables.items():
        out.append(f"\nTable {table_name!r}:")
        for col in columns:
            flags = []
            if col["k"] == "PRI":
                flags.append("primary key")
            if col["nl"] == "NO" and col["k"] != "PRI":
                flags.append("not null")
            out.append(f"  - {col['c']!r} {col['ty']}" + (f" ({', '.join(flags)})" if flags else ""))
        for fk in (fk for fk in foreign_keys if fk["t"] == table_name):
            out.append(f"  FK: {fk['c']!r} -> {fk['rt']!r}.{fk['rc']!r}")
        rows = samples.get(table_name) or []
        if rows:
            out.append("  Sample rows:")
            for row in rows:
                out.append("    " + ", ".join(f"{key}={_short(value)}" for key, value in row.items()))
    return "\n".join(out)


def get_schema(user_id: int = 0, connection_id: int | None = None) -> str:
    try:
        target = get_target_database(user_id, connection_id)
        tables, foreign_keys, samples = inspect_schema(target, config.SCHEMA_SAMPLE_ROWS)
        if not tables:
            raise ExecutionError(f"No tables found in database '{target.name}'.")
        rendered = _render(target, tables, foreign_keys, samples)
        # Preserve the old schema_cache behavior for legacy evaluation/tests only. User-owned
        # connections are introspected independently so schemas can never cross tenants.
        if user_id == 0 and connection_id is None and target.is_legacy:
            parts = [f"{table}.{col['c']}:{col['ty']}:{col['nl']}:{col['k']}" for table, cols in tables.items() for col in cols]
            parts += [f"{fk['t']}.{fk['c']}->{fk['rt']}.{fk['rc']}" for fk in foreign_keys]
            fingerprint = hashlib.sha256("|".join(parts).encode()).hexdigest()
            with get_conn() as app_conn:
                app_conn.execute(
                    "INSERT INTO schema_cache (database_name,schema_text,schema_hash) VALUES (%s,%s,%s) "
                    "ON DUPLICATE KEY UPDATE schema_text=VALUES(schema_text),schema_hash=VALUES(schema_hash)",
                    (config.TARGET_DB_NAME, rendered, fingerprint),
                )
        return rendered
    except TargetDatabaseError as exc:
        raise ExecutionError(str(exc)) from exc


def refresh_schema(user_id: int = 0, connection_id: int | None = None) -> str:
    """Compatibility alias; schemas are inspected live so cache entries cannot cross tenants."""
    return get_schema(user_id, connection_id)
