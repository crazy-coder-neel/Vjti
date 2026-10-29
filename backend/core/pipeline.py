"""
Data Pipeline Module

Orchestrates the full analysis flow:
  Input (text or audio) 
    -> Transcription (if audio) 
    -> Text Classification (Depression/Anxiety/Stress) 
    -> Energy Flow Calculation 
    -> Save to Supabase 
    -> Return structured response to frontend

Every API call flows through this pipeline so data is always persisted.
"""

import os
import uuid
import json
import traceback
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from core.supabase_client import supabase
from core.energy_flow import calculate_energy_from_analysis
from core.voice_transcription import transcribe_audio_bytes
from models.text_classification import clinical_predict


# ---------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------

def _upload_audio_to_storage(audio_bytes: bytes, filename: str) -> Optional[str]:
    """Upload audio bytes to Supabase Storage and return the public URL."""
    try:
        ext = os.path.splitext(filename)[1] or ".webm"
        storage_path = f"uploads/{uuid.uuid4().hex}{ext}"

        supabase.storage.from_("audio-files").upload(
            path=storage_path,
            file=audio_bytes,
            file_options={"content-type": f"audio/{ext.lstrip('.')}"},
        )

        public_url = supabase.storage.from_("audio-files").get_public_url(storage_path)
        return public_url
    except Exception as e:
        print(f"[pipeline] Audio upload failed: {e}")
        return None


def _save_session(data: Dict[str, Any]) -> Optional[Dict]:
    """Insert an analysis_sessions row and a matching energy_history row."""
    try:
        # Insert session
        resp = supabase.table("analysis_sessions").insert(data).execute()
        session = resp.data[0] if resp.data else None

        # Also insert into energy_history for trend tracking
        if session and data.get("energy_score") is not None:
            energy_row = {
                "session_id": session["id"],
                "energy_score": data["energy_score"],
                "energy_category": data.get("energy_category"),
                "stress_level": data.get("stress_level"),
                "anxiety_level": data.get("anxiety_level"),
                "depression_level": data.get("depression_level"),
                "tone": data.get("tone"),
            }
            # Include user_id if present
            if data.get("user_id"):
                energy_row["user_id"] = data["user_id"]
            supabase.table("energy_history").insert(energy_row).execute()

        return session
    except Exception as e:
        error_str = str(e)
        # If user_id column doesn't exist yet, retry without it
        if "user_id" in error_str and ("column" in error_str or "schema" in error_str):
            print("[pipeline] user_id column not found — saving without it. Run the migration SQL.")
            data_no_uid = {k: v for k, v in data.items() if k != "user_id"}
            try:
                resp = supabase.table("analysis_sessions").insert(data_no_uid).execute()
                session = resp.data[0] if resp.data else None
                if session and data_no_uid.get("energy_score") is not None:
                    supabase.table("energy_history").insert({
                        "session_id": session["id"],
                        "energy_score": data_no_uid["energy_score"],
                        "energy_category": data_no_uid.get("energy_category"),
                        "stress_level": data_no_uid.get("stress_level"),
                        "anxiety_level": data_no_uid.get("anxiety_level"),
                        "depression_level": data_no_uid.get("depression_level"),
                        "tone": data_no_uid.get("tone"),
                    }).execute()
                return session
            except Exception as e2:
                print(f"[pipeline] Supabase save failed (retry): {e2}")
                traceback.print_exc()
                return None
        print(f"[pipeline] Supabase save failed: {e}")
        traceback.print_exc()
        return None


# ---------------------------------------------------------------
# Public pipeline functions
# ---------------------------------------------------------------

def run_text_pipeline(text: str, user_id: str = None) -> Dict[str, Any]:
    """
    Full pipeline for text input.

    Steps:
      1. Run clinical text classification  (Depression / Anxiety / Stress)
      2. Calculate energy flow & task recommendation
      3. Persist to Supabase
      4. Return the unified response dict

    Returns dict with keys:
      status, input_text, analysis, energy_flow, session_id
    """
    # 1 — Text analysis
    analysis = clinical_predict(text)

    # 2 — Energy flow
    energy_flow = calculate_energy_from_analysis(analysis)

    energy_calc = energy_flow["energy_calculation"]
    task_rec = energy_flow["task_recommendation"]
    levels = energy_flow["classified_levels"]
    impacts = energy_calc["impact_breakdown"]

    # 3 — Persist
    db_row = {
        "input_type": "text",
        "input_text": text,

        # raw scores
        "depression_score": analysis.get("Depression"),
        "anxiety_score": analysis.get("Anxiety"),
        "stress_score": analysis.get("Stress"),
        "analysis_source": analysis.get("source", "local_model"),

        # classified levels
        "stress_level": levels["stress"],
        "anxiety_level": levels["anxiety"],
        "depression_level": levels["depression"],
        "tone": levels["tone"],

        # energy
        "base_energy": energy_calc["base_energy"],
        "energy_score": energy_calc["final_energy_score"],
        "energy_category": task_rec["energy_category"],
        "recommended_task_type": task_rec["recommended_task_type"],
        "task_description": task_rec["description"],
        "task_suggestions": json.dumps(task_rec["suggestions"]),

        # impacts
        "stress_impact": impacts["stress_impact"],
        "anxiety_impact": impacts["anxiety_impact"],
        "depression_impact": impacts["depression_impact"],
        "tone_impact": impacts["tone_impact"],
        "total_impact": impacts["total_impact"],
    }

    # Add user_id for per-user isolation
    if user_id:
        db_row["user_id"] = user_id

    saved = _save_session(db_row)

    # 4 — Unified response
    return {
        "status": "success",
        "session_id": saved["id"] if saved else None,
        "input_text": text,
        "analysis": {
            "depression": analysis.get("Depression"),
            "anxiety": analysis.get("Anxiety"),
            "stress": analysis.get("Stress"),
            "source": analysis.get("source"),
        },
        "energy_flow": {
            "energy_score": energy_calc["final_energy_score"],
            "energy_category": task_rec["energy_category"],
            "recommended_task_type": task_rec["recommended_task_type"],
            "task_description": task_rec["description"],
            "task_suggestions": task_rec["suggestions"],
            "classified_levels": levels,
            "impact_breakdown": impacts,
            "base_energy": energy_calc["base_energy"],
        },
        "persisted": saved is not None,
    }


def run_voice_pipeline(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    content_type: str = "audio/webm",
    user_id: str = None,
) -> Dict[str, Any]:
    """
    Full pipeline for voice/audio input.

    Steps:
      1. Transcribe audio -> text  (Gemini or local Whisper)
      2. Upload audio file to Supabase Storage
      3. Run clinical text classification
      4. Calculate energy flow & task recommendation
      5. Persist to Supabase
      6. Return the unified response dict

    Returns dict with keys:
      status, session_id, transcription, analysis, energy_flow, audio_info, persisted
    """
    # 1 — Transcribe
    transcription = transcribe_audio_bytes(audio_bytes, filename)
    if transcription.get("status") == "error":
        return {
            "status": "error",
            "error": transcription.get("error", "Transcription failed"),
            "details": transcription.get("details"),
        }

    transcribed_text = transcription.get("text", "").strip()
    if not transcribed_text:
        return {"status": "error", "error": "No speech detected in audio"}

    # 2 — Upload audio
    audio_url = _upload_audio_to_storage(audio_bytes, filename)

    # 3 — Text analysis
    analysis = clinical_predict(transcribed_text)

    # 4 — Energy flow
    energy_flow = calculate_energy_from_analysis(analysis)
    energy_calc = energy_flow["energy_calculation"]
    task_rec = energy_flow["task_recommendation"]
    levels = energy_flow["classified_levels"]
    impacts = energy_calc["impact_breakdown"]

    # 5 — Persist
    db_row = {
        "input_type": "voice",
        "input_text": transcribed_text,

        # transcription
        "detected_language": transcription.get("language"),
        "language_name": transcription.get("language_name"),
        "transcription_method": transcription.get("method"),

        # audio file
        "audio_file_url": audio_url,
        "audio_file_name": filename,
        "audio_file_size": len(audio_bytes),
        "audio_content_type": content_type,

        # raw scores
        "depression_score": analysis.get("Depression"),
        "anxiety_score": analysis.get("Anxiety"),
        "stress_score": analysis.get("Stress"),
        "analysis_source": analysis.get("source", "local_model"),

        # classified levels
        "stress_level": levels["stress"],
        "anxiety_level": levels["anxiety"],
        "depression_level": levels["depression"],
        "tone": levels["tone"],

        # energy
        "base_energy": energy_calc["base_energy"],
        "energy_score": energy_calc["final_energy_score"],
        "energy_category": task_rec["energy_category"],
        "recommended_task_type": task_rec["recommended_task_type"],
        "task_description": task_rec["description"],
        "task_suggestions": json.dumps(task_rec["suggestions"]),

        # impacts
        "stress_impact": impacts["stress_impact"],
        "anxiety_impact": impacts["anxiety_impact"],
        "depression_impact": impacts["depression_impact"],
        "tone_impact": impacts["tone_impact"],
        "total_impact": impacts["total_impact"],
    }

    # Add user_id for per-user isolation
    if user_id:
        db_row["user_id"] = user_id

    saved = _save_session(db_row)

    # 6 — Unified response
    return {
        "status": "success",
        "session_id": saved["id"] if saved else None,
        "transcription": {
            "text": transcribed_text,
            "language": transcription.get("language"),
            "language_name": transcription.get("language_name"),
            "method": transcription.get("method"),
        },
        "analysis": {
            "depression": analysis.get("Depression"),
            "anxiety": analysis.get("Anxiety"),
            "stress": analysis.get("Stress"),
            "source": analysis.get("source"),
        },
        "energy_flow": {
            "energy_score": energy_calc["final_energy_score"],
            "energy_category": task_rec["energy_category"],
            "recommended_task_type": task_rec["recommended_task_type"],
            "task_description": task_rec["description"],
            "task_suggestions": task_rec["suggestions"],
            "classified_levels": levels,
            "impact_breakdown": impacts,
            "base_energy": energy_calc["base_energy"],
        },
        "audio_info": {
            "filename": filename,
            "content_type": content_type,
            "size_bytes": len(audio_bytes),
            "storage_url": audio_url,
        },
        "persisted": saved is not None,
    }


# ---------------------------------------------------------------
# Query helpers (used by API & frontend)
# ---------------------------------------------------------------

def get_session(session_id: str) -> Optional[Dict]:
    """Fetch a single analysis session by ID."""
    try:
        resp = (
            supabase.table("analysis_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        return resp.data
    except Exception:
        return None


def get_recent_sessions(limit: int = 20, user_id: str = None) -> list:
    """Fetch the most recent analysis sessions, filtered by user_id if provided."""
    try:
        query = supabase.table("analysis_sessions").select("*")
        if user_id:
            query = query.eq("user_id", user_id)
        resp = query.order("created_at", desc=True).limit(limit).execute()
        return resp.data
    except Exception:
        return []


def get_energy_history(limit: int = 50, user_id: str = None) -> list:
    """Fetch energy history for trend charts, filtered by user_id if provided."""
    try:
        query = supabase.table("energy_history").select("*")
        if user_id:
            query = query.eq("user_id", user_id)
        resp = query.order("recorded_at", desc=True).limit(limit).execute()
        return resp.data
    except Exception:
        return []


def get_daily_energy_averages(user_id: str = None) -> list:
    """Query the daily_energy_avg view for dashboard charts."""
    try:
        query = supabase.table("daily_energy_avg").select("*")
        if user_id:
            query = query.eq("user_id", user_id)
        resp = query.execute()
        return resp.data
    except Exception:
        return []
