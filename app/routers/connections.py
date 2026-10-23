"""Authenticated per-user database connection management."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import current_user
from backend.target_databases import (
    TargetDatabaseError, create_user_connection, delete_user_connection,
    list_user_connections, set_default_connection, test_database_url,
)

router = APIRouter(prefix="/api/connections", tags=["database-connections"])


class ConnectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    database_url: str = Field(min_length=1, max_length=4096)
    is_default: bool = False


class TestConnectionIn(BaseModel):
    database_url: str = Field(min_length=1, max_length=4096)


@router.get("")
def list_connections(user: dict = Depends(current_user)):
    return {"items": list_user_connections(user["id"])}


@router.post("/test")
def test_connection(body: TestConnectionIn, user: dict = Depends(current_user)):
    # Authentication required; never persist or echo the supplied URL.
    return test_database_url(body.database_url)


@router.post("", status_code=201)
def create_connection(body: ConnectionIn, user: dict = Depends(current_user)):
    return create_user_connection(user["id"], body.name, body.database_url, body.is_default)


@router.post("/{connection_id}/default")
def make_default(connection_id: int, user: dict = Depends(current_user)):
    set_default_connection(user["id"], connection_id)
    return {"ok": True, "default_connection_id": connection_id}


@router.delete("/{connection_id}")
def remove_connection(connection_id: int, user: dict = Depends(current_user)):
    delete_user_connection(user["id"], connection_id)
    return {"ok": True}
