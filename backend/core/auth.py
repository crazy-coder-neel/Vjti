"""
Auth Service — register / login backed by Supabase Auth + users_profile table.

Supabase Auth handles password hashing & session tokens internally.
We mirror basic profile data into public.users_profile for queries.
"""

from __future__ import annotations

import os
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_url: str = os.environ.get("SUPABASE_URL", "")
_key: str = os.environ.get("SUPABASE_KEY", "")
_supabase: Client = create_client(_url, _key)


# ─── helpers ──────────────────────────────────────────────

def _upsert_profile(user_id: str, email: str, full_name: Optional[str] = None):
    """Insert or update a row in users_profile so it stays in sync with auth.users."""
    row = {"id": user_id, "email": email}
    if full_name:
        row["full_name"] = full_name
    _supabase.table("users_profile").upsert(row, on_conflict="id").execute()


# ─── public API ───────────────────────────────────────────

def register(email: str, password: str, full_name: Optional[str] = None) -> dict:
    """
    Create a new user via Supabase Auth and persist profile data.
    Returns {status, user, session} on success.
    """
    try:
        result = _supabase.auth.sign_up(
            {"email": email, "password": password}
        )

        user = result.user
        if not user:
            return {"status": "error", "error": "Signup failed – no user returned."}

        # Persist profile row
        _upsert_profile(user.id, email, full_name)

        session = result.session
        return {
            "status": "success",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": full_name or "",
            },
            "session": {
                "access_token": session.access_token if session else None,
                "refresh_token": session.refresh_token if session else None,
            },
        }
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "duplicate" in error_msg.lower():
            return {"status": "error", "error": "A user with this email already exists."}
        return {"status": "error", "error": error_msg}


def login(email: str, password: str) -> dict:
    """
    Authenticate via Supabase Auth.
    Returns {status, user, session} on success.
    """
    try:
        result = _supabase.auth.sign_in_with_password(
            {"email": email, "password": password}
        )

        user = result.user
        session = result.session

        if not user:
            return {"status": "error", "error": "Invalid credentials."}

        # Fetch profile data
        profile_resp = (
            _supabase.table("users_profile")
            .select("*")
            .eq("id", user.id)
            .maybe_single()
            .execute()
        )
        profile = profile_resp.data

        # If profile doesn't exist yet, create it
        if not profile:
            _upsert_profile(user.id, email)
            full_name = ""
        else:
            full_name = profile.get("full_name", "")

        return {
            "status": "success",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": full_name,
            },
            "session": {
                "access_token": session.access_token if session else None,
                "refresh_token": session.refresh_token if session else None,
            },
        }
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "credentials" in error_msg.lower():
            return {"status": "error", "error": "Invalid email or password."}
        return {"status": "error", "error": error_msg}


def get_profile(user_id: str) -> dict:
    """Fetch a user's profile from users_profile."""
    try:
        resp = (
            _supabase.table("users_profile")
            .select("*")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not resp.data:
            return {"status": "error", "error": "Profile not found."}
        return {"status": "success", "profile": resp.data}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def update_profile(user_id: str, full_name: Optional[str] = None, **kwargs) -> dict:
    """Update profile fields in users_profile."""
    try:
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if full_name is not None:
            updates["full_name"] = full_name
        if not updates:
            return {"status": "error", "error": "Nothing to update."}

        resp = (
            _supabase.table("users_profile")
            .update(updates)
            .eq("id", user_id)
            .execute()
        )
        return {"status": "success", "profile": resp.data[0] if resp.data else updates}
    except Exception as e:
        return {"status": "error", "error": str(e)}
