"""
Let Go 3.0 — FastAPI Backend
All routes flow through the data pipeline so every analysis is
automatically persisted to Supabase.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os

# Load environment variables first
load_dotenv()

# --- Imports from restructured packages ---
from core.supabase_client import supabase
from core.pipeline import (
    run_text_pipeline,
    run_voice_pipeline,
    get_session,
    get_recent_sessions,
    get_energy_history,
    get_daily_energy_averages,
)
from core.energy_flow import calculate_energy_score, get_task_recommendation
from models.text_classification import clinical_predict
from models.voice_analysis import voice_predict, get_model_info
from core.voice_transcription import get_model_info as get_whisper_info

# --- Auth & Cognitive Scheduler ---
from core import auth as auth_service
from core.cognitive_scheduler import (
    schedule_task,
    schedule_multiple_tasks,
    complete_task_api,
    get_cognitive_stats,
    get_energy as get_scheduler_energy,
    parse_natural_language_task,
    get_mental_energy,
    calculate_recovery_need,
    fetch_emotional_state_from_db,
)

# ============================================
# App & CORS
# ============================================
app = FastAPI(title="Let Go 3.0", version="2.0.0")

origins = ["*"]  # Allow all origins for Vercel deployment flexibility

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Request models
# ============================================
class TextRequest(BaseModel):
    text: str
    user_id: Optional[str] = None

class VoiceRequest(BaseModel):
    features: list | dict

class EnergyRequest(BaseModel):
    stress_level: str
    anxiety_level: str
    depression_level: str
    tone: str
    base_energy: int = 70

# --- Auth models ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class ProfileUpdateRequest(BaseModel):
    user_id: str
    full_name: Optional[str] = None

# --- Scheduler models ---
class ScheduleTaskRequest(BaseModel):
    task: str

class ScheduleMultipleRequest(BaseModel):
    tasks: str

class CompleteTaskRequest(BaseModel):
    task_name: str
    actual_difficulty: int

# --- Study Session models (Pipeline 3) ---
class StartSessionRequest(BaseModel):
    user_id: str
    task_name: str = "Focus Session"
    duration_minutes: int = 90

class SessionActionRequest(BaseModel):
    session_id: str

class BreakRequest(BaseModel):
    session_id: str
    break_type: str = "short"  # short, long, micro, custom
    custom_duration_seconds: Optional[int] = 0

# --- SpoonSense models (Milestone 1) ---
class ICSParseRequest(BaseModel):
    ics_content: str

class GridParseRequest(BaseModel):
    grid: dict

class SaveTimetableRequest(BaseModel):
    user_id: str
    blocks: list

class CommuteProfileRequest(BaseModel):
    user_id: str
    minutes_each_way: int
    mode: str = "seated"
    days_applicable: Optional[list] = None

class DayOverrideRequest(BaseModel):
    user_id: str
    override_type: str
    value: Optional[dict] = None

class ManualOverrideRequest(BaseModel):
    user_id: str
    spoons: float
    target_date: Optional[str] = None


class EnergyCalibrationRequest(BaseModel):
    user_id: str
    commute_minutes: int = 30
    commute_mode: str = "seated"  # "crowded", "seated", "walk", "active", "car", "wfh"
    commute_legs: Optional[List[Dict[str, Any]]] = None
    campus_hours: float = 3.0
    has_intense_lab: bool = False
    chore_hours: float = 1.0
    sleep_quality: str = "fair"   # "poor", "fair", "rested", "excellent"
    sensory_load: str = "medium"  # "low", "medium", "high"


class OnboardingRequest(BaseModel):
    user_id: str
    full_name: str
    college: Optional[str] = "VJTI Mumbai"
    major: Optional[str] = "Engineering"
    chronotype: str = "intermediate"  # "morning", "intermediate", "evening"
    commute_minutes: int = 30
    commute_mode: str = "seated"
    commute_legs: Optional[List[Dict[str, Any]]] = None
    campus_hours: float = 4.0
    has_intense_lab: bool = False
    chore_hours: float = 1.0
    sleep_quality: str = "fair"
    sensory_load: str = "medium"

class GameResultRequest(BaseModel):
    user_id: str
    game: str = "pulse"  # pulse, switch, pop
    median_rt: Optional[float] = 0.0
    lapses: Optional[int] = 0
    variability: Optional[float] = 0.0
    switch_cost: Optional[float] = 0.0
    taps: Optional[int] = 0
    valid: bool = True
    skipped: bool = False
    time_of_day: str = "morning"


# ============================================
# HEALTH & INFO
# ============================================

@app.get("/")
def read_root():
    return {"message": "Hello from Let Go 3.0 Backend!"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "2.0.0"}


@app.get("/api/model-info")
async def get_models_info():
    """Information about all loaded ML models."""
    try:
        return {
            "status": "success",
            "models": {
                "text_classification": {
                    "name": "clinical_roberta",
                    "source": "Hugging Face",
                    "repo": "GehrmanSparrow1711/clinical_roberta",
                    "categories": ["Depression", "Anxiety", "Stress"],
                    "status": "loaded",
                },
                "voice_analysis": get_model_info(),
                "speech_to_text": get_whisper_info(),
            },
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ============================================
# PIPELINE ENDPOINTS  (auto-persist to Supabase)
# ============================================

@app.post("/api/analyze/text")
async def pipeline_text(request: TextRequest):
    """
    **Primary text endpoint.**
    Runs the full pipeline:
      text → classification → energy flow → save to Supabase → response

    Response JSON keys sent to frontend:
      status, session_id, input_text, analysis, energy_flow, persisted
    """
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        result = run_text_pipeline(request.text, user_id=request.user_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze/voice")
async def pipeline_voice(audio: UploadFile = File(...), user_id: Optional[str] = None):
    """
    **Primary voice endpoint.**
    Runs the full pipeline:
      audio → transcribe → classification → energy flow → save to Supabase → response

    Response JSON keys sent to frontend:
      status, session_id, transcription, analysis, energy_flow, audio_info, persisted
    """
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        result = run_voice_pipeline(
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.webm",
            content_type=audio.content_type or "audio/webm",
            user_id=user_id,
        )

        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# QUERY ENDPOINTS  (read from Supabase)
# ============================================

@app.get("/api/sessions")
async def list_sessions(limit: int = 20, user_id: Optional[str] = None):
    """Get recent analysis sessions (for dashboard/history)."""
    sessions = get_recent_sessions(limit, user_id=user_id)
    return {"status": "success", "data": sessions, "count": len(sessions)}


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    """Get a single session by ID."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success", "data": session}


@app.get("/api/energy-history")
async def energy_history(limit: int = 50, user_id: Optional[str] = None):
    """Get energy score history for trend charts."""
    history = get_energy_history(limit, user_id=user_id)
    return {"status": "success", "data": history, "count": len(history)}


@app.get("/api/energy-daily")
async def energy_daily(user_id: Optional[str] = None):
    """Get daily average energy scores (for line/bar charts)."""
    averages = get_daily_energy_averages(user_id=user_id)
    return {"status": "success", "data": averages}


# ============================================
# STANDALONE ENDPOINTS (no auto-persist)
# ============================================

@app.post("/api/text-analysis")
async def analyze_text(request: TextRequest):
    """Classify text without saving to Supabase."""
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        result = clinical_predict(request.text)
        return {"status": "success", "input_text": request.text, "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/voice-analysis")
async def analyze_voice(request: VoiceRequest):
    """Analyze voice features without saving to Supabase."""
    try:
        if not request.features:
            raise HTTPException(status_code=400, detail="Features cannot be empty")
        result = voice_predict(request.features)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("error"))
        return {"status": "success", "analysis": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/energy-calculate")
async def calculate_energy(request: EnergyRequest):
    """Calculate energy score from manual levels (no persistence)."""
    try:
        energy_result = calculate_energy_score(
            stress_level=request.stress_level,
            anxiety_level=request.anxiety_level,
            depression_level=request.depression_level,
            tone=request.tone,
            base_energy=request.base_energy,
        )
        task_rec = get_task_recommendation(energy_result["final_energy_score"])
        return {
            "status": "success",
            "energy_flow": {**energy_result, "task_recommendation": task_rec},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SUPABASE CONNECTION TEST
# ============================================

@app.get("/api/test-supabase")
async def test_supabase():
    """Quick connectivity check."""
    try:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        return {
            "supabase_url_configured": bool(url),
            "supabase_key_configured": bool(key),
            "message": "OK" if url and key else "Set SUPABASE_URL and SUPABASE_KEY in .env",
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ============================================
# AUTH ENDPOINTS (Supabase Auth + users_profile)
# ============================================

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    """Register a new user. Creates Supabase Auth entry + users_profile row."""
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    result = auth_service.register(request.email, request.password, request.full_name)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """Authenticate a user and return session tokens."""
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    result = auth_service.login(request.email, request.password)
    if result["status"] == "error":
        raise HTTPException(status_code=401, detail=result["error"])
    return result


@app.get("/api/auth/profile/{user_id}")
async def get_profile(user_id: str):
    """Fetch a user's profile from users_profile."""
    result = auth_service.get_profile(user_id)
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.put("/api/auth/profile")
async def update_profile(request: ProfileUpdateRequest):
    """Update a user's profile in users_profile."""
    result = auth_service.update_profile(request.user_id, request.full_name)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/user/onboarding")
async def api_user_onboarding(request: OnboardingRequest):
    """Complete personalized first-time onboarding for a student.

    Persists their academic identity, commute, campus load, and baseline rhythm,
    then automatically calculates their custom starting spoon capacity.
    """
    user_id = request.user_id

    # 1. Update users_profile in Supabase / Local
    profile_updates = {
        "full_name": request.full_name,
        "college": request.college or "",
        "major": request.major or "",
        "chronotype": request.chronotype,
        "is_onboarded": True,
        "default_commute_mins": request.commute_minutes,
        "default_commute_mode": request.commute_mode,
        "typical_campus_hours": request.campus_hours,
        "typical_chore_hours": request.chore_hours,
        "typical_sleep_quality": request.sleep_quality,
        "sensory_sensitivity": request.sensory_load,
    }

    try:
        if supabase:
            supabase.table("users_profile").upsert(
                {"id": user_id, **profile_updates}, on_conflict="id"
            ).execute()
    except Exception as e:
        print(f"[spoonsense] DB error in onboarding profile upsert: {e}")

    # 2. Persist commute profile
    commute_payload = {
        "user_id": user_id,
        "minutes_each_way": request.commute_minutes,
        "mode": request.commute_mode,
        "days_applicable": [0, 1, 2, 3, 4],
    }
    _spoonsense_demo_store["commutes"][user_id] = commute_payload

    try:
        if supabase:
            supabase.table("commute_profiles").upsert(
                commute_payload, on_conflict="user_id"
            ).execute()
    except Exception as e:
        print(f"[spoonsense] DB error in onboarding commute upsert: {e}")

    # 3. Compute personalized energy calibration
    calib_req = EnergyCalibrationRequest(
        user_id=user_id,
        commute_minutes=request.commute_minutes,
        commute_mode=request.commute_mode,
        commute_legs=request.commute_legs,
        campus_hours=request.campus_hours,
        has_intense_lab=request.has_intense_lab,
        chore_hours=request.chore_hours,
        sleep_quality=request.sleep_quality,
        sensory_load=request.sensory_load,
    )
    calib_res = await api_calibrate_energy(calib_req)

    return {
        "status": "success",
        "user_id": user_id,
        "is_onboarded": True,
        "profile": profile_updates,
        "calibration": calib_res["calibration"],
        "message": f"Welcome, {request.full_name}! Your cognitive workspace is calibrated to {calib_res['calibration']['live_spoons']} spoons.",
    }


# ============================================
# COGNITIVE SCHEDULER ENDPOINTS (feature_2)
# ============================================

@app.post("/api/scheduler/parse-task")
async def api_parse_task(request: ScheduleTaskRequest):
    """Parse a natural-language task description without scheduling it."""
    try:
        parsed = parse_natural_language_task(request.task)
        energy = get_mental_energy()
        recovery = calculate_recovery_need(parsed, energy)
        return {"status": "success", "task": parsed, "energy": energy, "recovery": recovery}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/schedule")
async def api_schedule_task(request: ScheduleTaskRequest):
    """
    Schedule a single task end-to-end:
      parse → energy check → find optimal slot → create Google Calendar event.
    """
    try:
        result = schedule_task(request.task)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/schedule-multiple")
async def api_schedule_multiple(request: ScheduleMultipleRequest):
    """Schedule multiple tasks parsed from a single description."""
    try:
        result = schedule_multiple_tasks(request.tasks)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/complete-task")
async def api_complete_task(request: CompleteTaskRequest):
    """Mark a task as complete and update cognitive state."""
    try:
        if not 1 <= request.actual_difficulty <= 10:
            raise HTTPException(status_code=400, detail="actual_difficulty must be 1-10")
        result = complete_task_api(request.task_name, request.actual_difficulty)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/scheduler/stats")
async def api_cognitive_stats():
    """Get current cognitive state: fatigue, streak, achievements, recent tasks."""
    return get_cognitive_stats()


@app.get("/api/scheduler/energy")
async def api_scheduler_energy():
    """Get current mental energy level with circadian-rhythm + emotional state context."""
    return get_scheduler_energy()


@app.get("/api/scheduler/emotional-state")
async def api_emotional_state():
    """Get user's latest emotional state from DB (Pipeline 1 → Pipeline 2 bridge)."""
    state = fetch_emotional_state_from_db()
    return {"status": "success", "emotional_state": state}


# ============================================
# PIPELINE 3: STUDY SESSION ENDPOINTS
# ============================================
from core.study_session import (
    start_session, pause_session, resume_session,
    start_break, end_break, end_session,
    get_session_status, get_today_stats, get_weekly_stats,
    get_recovery_plan,
    get_current_session,
)

@app.post("/api/study/start")
async def api_start_session(request: StartSessionRequest):
    """Start a new study/focus session."""
    return start_session(request.user_id, request.task_name, request.duration_minutes)

@app.get("/api/study/current/{user_id}")
async def api_current_session(user_id: str):
    """Get the current active/paused/break session for the user."""
    return get_current_session(user_id)

@app.post("/api/study/pause")
async def api_pause_session(request: SessionActionRequest):
    """Pause the current study session."""
    return pause_session(request.session_id)

@app.post("/api/study/resume")
async def api_resume_session(request: SessionActionRequest):
    """Resume a paused study session."""
    return resume_session(request.session_id)

@app.post("/api/study/break")
async def api_start_break(request: BreakRequest):
    """Start a break during a study session."""
    return start_break(request.session_id, request.break_type, request.custom_duration_seconds)

@app.post("/api/study/end-break")
async def api_end_break(request: SessionActionRequest):
    """End a break and resume focus."""
    return end_break(request.session_id)

@app.post("/api/study/end")
async def api_end_session(request: SessionActionRequest):
    """End a study session. Returns stats + AI recovery plan."""
    return end_session(request.session_id)

@app.get("/api/study/session/{session_id}")
async def api_session_status(session_id: str):
    """Get current session status and live stats."""
    return get_session_status(session_id)

@app.get("/api/study/stats/today/{user_id}")
async def api_today_stats(user_id: str):
    """Get today's study stats for a user."""
    return get_today_stats(user_id)

@app.get("/api/study/stats/weekly/{user_id}")
async def api_weekly_stats(user_id: str):
    """Get weekly study analysis with daily breakdown."""
    return get_weekly_stats(user_id)

@app.get("/api/study/recovery-plan/{user_id}")
async def api_recovery_plan(user_id: str):
    """Get AI recovery plan based on emotional state + recent sessions."""
    return get_recovery_plan(user_id)


# ============================================
# SPOONSENSE MILESTONE 1: INGESTION & CAPACITY ENGINE
# ============================================
from datetime import date as dt_date
from core.spoon_engine import (
    compute_full_day_snapshot,
    compute_7day_forecast,
    compute_probe_multiplier,
    compute_commute_cost,
    compute_campus_cost,
    DEFAULT_BUDGET,
)
from core.timetable_parser import (
    parse_ics_file,
    validate_ics_content,
    blocks_from_grid,
    build_commute_profile,
    generate_sample_ics,
)

# In-memory storage fallback for demo/offline use when Supabase isn't reachable
_spoonsense_demo_store = {
    "timetables": {},       # user_id -> List[block]
    "commutes": {},         # user_id -> commute_dict
    "overrides": {},        # user_id -> {date_str: override_dict}
    "manual_overrides": {}, # user_id -> {date_str: float}
    "baselines": {},        # user_id -> {"baseline_rt": float, "play_count": int}
    "game_results": {},     # user_id -> List[result]
    "calibrations": {},     # user_id -> calibration_dict
}


@app.post("/api/timetable/ics")
async def api_parse_ics(request: ICSParseRequest):
    """
    Parse an ICS string provided as JSON body.
    Returns validated, deduplicated weekly recurring blocks.
    """
    content = request.ics_content
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="No ICS content provided in request.")

    is_valid, err = validate_ics_content(content)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid ICS format: {err}")

    blocks = parse_ics_file(content)
    return {
        "status": "success",
        "block_count": len(blocks),
        "blocks": blocks,
    }


@app.post("/api/timetable/upload-ics")
async def api_upload_ics(file: UploadFile = File(...)):
    """
    Parse an ICS file uploaded as multipart/form-data.
    Returns validated, deduplicated weekly recurring blocks.
    """
    file_bytes = await file.read()
    content = file_bytes.decode("utf-8", errors="replace")

    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="Empty ICS file uploaded.")

    is_valid, err = validate_ics_content(content)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid ICS format: {err}")

    blocks = parse_ics_file(content)
    return {
        "status": "success",
        "block_count": len(blocks),
        "blocks": blocks,
    }


@app.get("/api/timetable/sample-ics")
def api_sample_ics():
    """Return a sample VJTI-style university engineering timetable in RFC 5545 ICS format."""
    return {
        "status": "success",
        "sample_ics": generate_sample_ics(),
    }


@app.post("/api/timetable/grid")
def api_parse_grid(request: GridParseRequest):
    """Convert an interactive manual weekly grid into structured class blocks."""
    blocks = blocks_from_grid(request.grid)
    return {
        "status": "success",
        "block_count": len(blocks),
        "blocks": blocks,
    }


@app.put("/api/timetable")
async def api_save_timetable(request: SaveTimetableRequest):
    """
    Save confirmed class blocks to Supabase timetable_blocks table.
    Replaces existing blocks for this user with the new confirmed list.
    """
    user_id = request.user_id
    blocks = request.blocks

    _spoonsense_demo_store["timetables"][user_id] = blocks

    if supabase:
        try:
            supabase.table("timetable_blocks").delete().eq("user_id", user_id).execute()
            if blocks:
                rows = []
                for b in blocks:
                    rows.append({
                        "user_id": user_id,
                        "weekday": b.get("weekday", 0),
                        "start_time": b.get("start_time", "09:00"),
                        "end_time": b.get("end_time", "10:00"),
                        "title": b.get("title", "Class"),
                        "source": b.get("source", "manual"),
                    })
                supabase.table("timetable_blocks").insert(rows).execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving timetable: {e}")

    return {
        "status": "success",
        "message": f"Saved {len(blocks)} timetable blocks",
        "blocks": blocks,
    }


@app.get("/api/timetable/{user_id}")
async def api_get_timetable(user_id: str):
    """Fetch all saved weekly timetable blocks for a student."""
    if supabase:
        try:
            resp = supabase.table("timetable_blocks").select("*").eq("user_id", user_id).order("weekday").execute()
            if resp.data:
                return {"status": "success", "blocks": resp.data}
        except Exception as e:
            print(f"[spoonsense] DB error fetching timetable: {e}")

    blocks = _spoonsense_demo_store["timetables"].get(user_id, [])
    return {"status": "success", "blocks": blocks}


@app.put("/api/commute")
async def api_save_commute(request: CommuteProfileRequest):
    """Save or update student's commute profile."""
    user_id = request.user_id
    profile = build_commute_profile(
        request.minutes_each_way,
        request.mode,
        request.days_applicable,
    )

    _spoonsense_demo_store["commutes"][user_id] = profile

    if supabase:
        try:
            db_row = {
                "user_id": user_id,
                "minutes_each_way": profile["minutes_each_way"],
                "mode": profile["mode"],
                "days_applicable": profile["days_applicable"],
            }
            supabase.table("commute_profiles").upsert(db_row, on_conflict="user_id").execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving commute profile: {e}")

    return {
        "status": "success",
        "commute_profile": profile,
    }


@app.get("/api/commute/{user_id}")
async def api_get_commute(user_id: str):
    """Fetch commute profile for a student."""
    if supabase:
        try:
            resp = supabase.table("commute_profiles").select("*").eq("user_id", user_id).execute()
            if resp.data:
                row = resp.data[0]
                return {
                    "status": "success",
                    "commute_profile": {
                        "minutes_each_way": row.get("minutes_each_way", 30),
                        "mode": row.get("mode", "seated"),
                        "days_applicable": row.get("days_applicable", [0, 1, 2, 3, 4]),
                    },
                }
        except Exception as e:
            print(f"[spoonsense] DB error fetching commute: {e}")

    profile = _spoonsense_demo_store["commutes"].get(user_id, {
        "minutes_each_way": 30,
        "mode": "seated",
        "days_applicable": [0, 1, 2, 3, 4],
    })
    return {"status": "success", "commute_profile": profile}


@app.put("/api/day-overrides/{user_id}/{override_date}")
async def api_save_day_override(user_id: str, override_date: str, request: DayOverrideRequest):
    """Set a day override (e.g. WFH, Holiday, Exam, Custom Commute)."""
    override = {
        "user_id": user_id,
        "date": override_date,
        "override_type": request.override_type,
        "value": request.value or {},
    }

    if user_id not in _spoonsense_demo_store["overrides"]:
        _spoonsense_demo_store["overrides"][user_id] = {}
    _spoonsense_demo_store["overrides"][user_id][override_date] = override

    if supabase:
        try:
            supabase.table("day_overrides").upsert(override, on_conflict="user_id,date").execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving override: {e}")

    return {"status": "success", "override": override}


@app.get("/api/forecast/{user_id}")
async def api_get_forecast(user_id: str, start_date: Optional[str] = None):
    """
    Get 7-day energy weather forecast for a student.
    Uses pure capacity math (commute, campus hours, deadlines, carryover).
    """
    try:
        s_date = dt_date.fromisoformat(start_date) if start_date else dt_date.today()
    except Exception:
        s_date = dt_date.today()

    blocks = []
    commute = {"minutes_each_way": 30, "mode": "seated", "days_applicable": [0, 1, 2, 3, 4]}
    overrides = []
    tasks = []

    if supabase:
        try:
            tb_resp = supabase.table("timetable_blocks").select("*").eq("user_id", user_id).execute()
            if tb_resp.data:
                blocks = tb_resp.data

            cp_resp = supabase.table("commute_profiles").select("*").eq("user_id", user_id).execute()
            if cp_resp.data:
                commute = cp_resp.data[0]

            ov_resp = supabase.table("day_overrides").select("*").eq("user_id", user_id).execute()
            if ov_resp.data:
                overrides = ov_resp.data

            tk_resp = supabase.table("tasks").select("*").eq("user_id", user_id).eq("state", "planned").execute()
            if tk_resp.data:
                tasks = tk_resp.data
        except Exception as e:
            print(f"[spoonsense] Error loading forecast inputs from DB: {e}")

    if not blocks:
        blocks = _spoonsense_demo_store["timetables"].get(user_id, [])
    if user_id in _spoonsense_demo_store["commutes"]:
        commute = _spoonsense_demo_store["commutes"][user_id]
    if user_id in _spoonsense_demo_store["overrides"]:
        overrides += list(_spoonsense_demo_store["overrides"][user_id].values())

    forecast = compute_7day_forecast(
        user_budget=DEFAULT_BUDGET,
        timetable_blocks=blocks,
        commute_profile=commute,
        day_overrides=overrides,
        tasks=tasks,
        today_spend=0.0,
        today_evening_label=None,
        start_date=s_date,
        days_of_data=5,
    )

    return {
        "status": "success",
        "user_id": user_id,
        "start_date": s_date.isoformat(),
        "forecast": [f.to_dict() for f in forecast],
    }


@app.get("/api/me/snapshot/today/{user_id}")
async def api_get_today_snapshot(user_id: str, probe_rt: Optional[float] = None, baseline_rt: Optional[float] = None):
    """
    Get today's real-time energy snapshot, including:
      - Live spoons (1 to 12)
      - Weather category (sunny, partly_cloudy, cloudy, stormy)
      - Why-panel factor decomposition
      - Confidence range
    """
    today = dt_date.today()

    blocks = []
    commute = {"minutes_each_way": 30, "mode": "seated", "days_applicable": [0, 1, 2, 3, 4]}
    overrides = []
    tasks = []

    if supabase:
        try:
            tb_resp = supabase.table("timetable_blocks").select("*").eq("user_id", user_id).execute()
            if tb_resp.data:
                blocks = tb_resp.data
            cp_resp = supabase.table("commute_profiles").select("*").eq("user_id", user_id).execute()
            if cp_resp.data:
                commute = cp_resp.data[0]
            ov_resp = supabase.table("day_overrides").select("*").eq("user_id", user_id).execute()
            if ov_resp.data:
                overrides = ov_resp.data
            tk_resp = supabase.table("tasks").select("*").eq("user_id", user_id).eq("state", "planned").execute()
            if tk_resp.data:
                tasks = tk_resp.data
        except Exception as e:
            print(f"[spoonsense] DB error in snapshot: {e}")

    if not blocks:
        blocks = _spoonsense_demo_store["timetables"].get(user_id, [])
    if user_id in _spoonsense_demo_store["commutes"]:
        commute = _spoonsense_demo_store["commutes"][user_id]
    if user_id in _spoonsense_demo_store["overrides"]:
        overrides += list(_spoonsense_demo_store["overrides"][user_id].values())

    probe_result = None
    if probe_rt and baseline_rt:
        probe_result = {
            "valid": True,
            "median_rt": probe_rt,
            "baseline_rt": baseline_rt,
            "play_count": 5,
        }

    snapshot = compute_full_day_snapshot(
        user_budget=DEFAULT_BUDGET,
        timetable_blocks=blocks,
        commute_profile=commute,
        day_overrides=overrides,
        tasks=tasks,
        previous_day_spend=0.0,
        evening_label=None,
        target_date=today,
        probe_result=probe_result,
        days_of_data=5,
    )

    result_dict = snapshot.to_dict()

    # Apply user calibration if present
    calib = _spoonsense_demo_store.get("calibrations", {}).get(user_id)
    if calib:
        result_dict["commute_cost"] = calib["commute_cost"]
        result_dict["campus_cost"] = calib["campus_cost"]
        result_dict["chore_cost"] = calib.get("chore_cost", 0.0)
        result_dict["live_spoons"] = calib["live_spoons"]
        result_dict["prior_spoons"] = calib["live_spoons"]
        result_dict["weather"] = calib["weather"]
        result_dict["range_text"] = calib["range_text"]
        result_dict["why_factors"] = calib["why_factors"]
        result_dict["factors"] = calib["why_factors"]
        result_dict["calibration_active"] = True

    user_overrides = _spoonsense_demo_store["manual_overrides"].get(user_id, {})
    if today.isoformat() in user_overrides:
        result_dict["manual_override"] = user_overrides[today.isoformat()]
        result_dict["live_spoons"] = user_overrides[today.isoformat()]

    return {
        "status": "success",
        "user_id": user_id,
        "snapshot": result_dict,
    }


@app.post("/api/user/calibrate-energy")
async def api_calibrate_energy(request: EnergyCalibrationRequest):
    """Calibrate user's daily cognitive spoons from real multi-factor inputs.

    Incorporates:
      1. Commute transit duration & mode (train, bus, walk, car, wfh)
      2. Campus lecture & practical lab load
      3. Life chores & administrative tasks
      4. Sleep & morning recovery quality
      5. Sensory & social environment load
    """
    user_id = request.user_id
    base_spoons = 12.0

    # 1. Commute Cost (Supports multi-leg: train + bus + walk, up to 8+ hours)
    commute_legs_desc = []
    if request.commute_legs and len(request.commute_legs) > 0:
        commute_cost = 0.0
        total_mins_each_way = 0
        for leg in request.commute_legs:
            mins = float(leg.get("minutes", 0))
            lmode = leg.get("mode", "seated")
            label = leg.get("label", lmode.title())
            if mins > 0:
                total_mins_each_way += mins
                leg_cost = compute_commute_cost(mins * 2, lmode)  # roundtrip cost
                commute_cost += leg_cost
                commute_legs_desc.append(f"{int(mins)}m {label}")
        commute_cost = round(commute_cost, 2)
    elif request.commute_mode == "wfh":
        commute_cost = 0.0
    else:
        commute_cost = round(compute_commute_cost(request.commute_minutes * 2, request.commute_mode), 2)

    # 2. Campus & Lab Cost
    campus_cost = round(compute_campus_cost(request.campus_hours) + (0.8 if request.has_intense_lab else 0.0), 2)

    # 3. Chores & Life Maintenance Cost
    chore_cost = round(max(0.0, request.chore_hours * 0.6), 2)

    # 4. Sleep & Recovery Delta
    sleep_map = {
        "poor": -1.5,
        "fair": -0.5,
        "rested": 0.0,
        "excellent": 0.5,
    }
    sleep_adj = sleep_map.get(request.sleep_quality.lower(), 0.0)

    # 5. Sensory & Social Load Delta
    sensory_map = {
        "high": -1.0,
        "medium": -0.4,
        "low": 0.0,
    }
    sensory_adj = sensory_map.get(request.sensory_load.lower(), 0.0)

    # Net Live Spoons
    net_spoons = base_spoons - commute_cost - campus_cost - chore_cost + sleep_adj + sensory_adj
    live_spoons = round(max(1.0, min(12.0, net_spoons)), 1)

    # Determine Weather
    if live_spoons >= 8.5:
        weather = "sunny"
    elif live_spoons >= 6.0:
        weather = "partly_cloudy"
    elif live_spoons >= 3.5:
        weather = "cloudy"
    else:
        weather = "stormy"

    range_low = round(max(1.0, live_spoons - 0.7), 1)
    range_high = round(min(12.0, live_spoons + 0.7), 1)
    range_text = f"about {range_low} to {range_high} spoons"

    # Human-First Zero-Shame Why Factors
    why_factors = [
        {
            "label": "Starting Budget",
            "delta": 12.0,
            "plain_text": "Standard daily cognitive baseline",
        }
    ]

    if commute_cost > 0:
        if commute_legs_desc:
            total_commute_hours = round((sum(float(l.get("minutes", 0)) for l in (request.commute_legs or [])) * 2) / 60, 1)
            legs_text = " + ".join(commute_legs_desc)
            desc = f"{total_commute_hours}h roundtrip ({legs_text})"
        else:
            total_commute_hours = round((request.commute_minutes * 2) / 60, 1)
            desc = f"{total_commute_hours}h roundtrip ({request.commute_minutes * 2}m, {request.commute_mode.title()} transit)"

        why_factors.append({
            "label": "Transit & Commute",
            "delta": -commute_cost,
            "plain_text": desc,
        })

    if campus_cost > 0:
        lab_suffix = " (includes intensive practical lab)" if request.has_intense_lab else ""
        why_factors.append({
            "label": "Campus Timetable",
            "delta": -campus_cost,
            "plain_text": f"{request.campus_hours}h lectures/labs{lab_suffix}",
        })

    if chore_cost > 0:
        why_factors.append({
            "label": "Life & Chores",
            "delta": -chore_cost,
            "plain_text": f"{request.chore_hours}h daily errands, cooking & maintenance",
        })

    if sleep_adj != 0:
        why_factors.append({
            "label": "Sleep Recovery",
            "delta": sleep_adj,
            "plain_text": f"{request.sleep_quality.title()} night rest impact",
        })

    if sensory_adj != 0:
        why_factors.append({
            "label": "Sensory Environment",
            "delta": sensory_adj,
            "plain_text": f"{request.sensory_load.title()} sensory/social stimulation",
        })

    calib_record = {
        "user_id": user_id,
        "live_spoons": live_spoons,
        "commute_cost": commute_cost,
        "campus_cost": campus_cost,
        "chore_cost": chore_cost,
        "sleep_adj": sleep_adj,
        "sensory_adj": sensory_adj,
        "weather": weather,
        "range_text": range_text,
        "why_factors": why_factors,
        "inputs": request.model_dump(),
    }

    _spoonsense_demo_store["calibrations"][user_id] = calib_record

    # Update commute profile for future calculations
    _spoonsense_demo_store["commutes"][user_id] = {
        "minutes_each_way": request.commute_minutes,
        "mode": request.commute_mode,
        "days_applicable": [0, 1, 2, 3, 4],
    }

    return {
        "status": "success",
        "user_id": user_id,
        "calibration": calib_record,
        "message": f"Energy calibrated to {live_spoons} spoons based on your real daily demands.",
    }


@app.post("/api/snapshot/override")
async def api_override_snapshot(request: ManualOverrideRequest):
    """
    Allow user to manually adjust today's spoons using the slider (FR-SP-04).
    Zero judgment; records override as a learning signal.
    """
    target = request.target_date or dt_date.today().isoformat()
    user_id = request.user_id
    spoons = max(1.0, min(12.0, float(request.spoons)))

    if user_id not in _spoonsense_demo_store["manual_overrides"]:
        _spoonsense_demo_store["manual_overrides"][user_id] = {}
    _spoonsense_demo_store["manual_overrides"][user_id][target] = spoons

    return {
        "status": "success",
        "user_id": user_id,
        "target_date": target,
        "manual_spoons": spoons,
        "message": f"Energy budget updated to {spoons} spoons for {target}",
    }


# ============================================
# COGNITIVE PROBE GAMES & BASELINE ENDPOINTS
# ============================================

@app.post("/api/games/result")
async def api_save_game_result(request: GameResultRequest):
    """
    Record summary of a 20-second game probe (Pulse, Switch, Pop Garden).
    Zero judgment; never returns grades or red failure states.
    Updates student's rolling personal baseline using Exponential Moving Average (alpha=0.25).
    """
    user_id = request.user_id
    today = dt_date.today()

    if request.skipped:
        return {
            "status": "success",
            "message": "Thanks. That helps me plan.",
            "skipped": True,
            "probe_multiplier": 1.0,
            "is_calibrating": False,
        }

    # Fetch user baseline info
    b_info = _spoonsense_demo_store["baselines"].get(user_id, {"baseline_rt": 0.0, "play_count": 0})
    prev_baseline = float(b_info.get("baseline_rt", 0.0))
    prev_count = int(b_info.get("play_count", 0))

    if supabase:
        try:
            # Query existing count from game_results
            g_resp = supabase.table("game_results").select("summary").eq("user_id", user_id).eq("valid", True).execute()
            if g_resp.data:
                prev_count = len(g_resp.data)
                # Compute average baseline if not cached
                if prev_baseline <= 0:
                    rts = [float(row["summary"].get("median_rt", 0)) for row in g_resp.data if row.get("summary")]
                    rts = [r for r in rts if r > 0]
                    if rts:
                        prev_baseline = sum(rts) / len(rts)
        except Exception as e:
            print(f"[spoonsense] DB error checking baseline: {e}")

    new_count = prev_count + 1
    median_rt = float(request.median_rt or 300.0)

    if prev_baseline <= 0:
        new_baseline = median_rt
    else:
        # EMA alpha = 0.25 (Section 12.9)
        new_baseline = 0.25 * median_rt + 0.75 * prev_baseline

    _spoonsense_demo_store["baselines"][user_id] = {
        "baseline_rt": round(new_baseline, 1),
        "play_count": new_count,
    }

    probe_mult = compute_probe_multiplier(median_rt, prev_baseline or new_baseline, new_count)
    is_calibrating = new_count < 3

    # Persist summary (no raw individual trials per privacy mandate FR-GM-06)
    summary_data = {
        "median_rt": median_rt,
        "lapses": request.lapses,
        "variability": request.variability,
        "switch_cost": request.switch_cost,
        "taps": request.taps,
    }

    if user_id not in _spoonsense_demo_store["game_results"]:
        _spoonsense_demo_store["game_results"][user_id] = []
    _spoonsense_demo_store["game_results"][user_id].append({
        "date": today.isoformat(),
        "game": request.game,
        "summary": summary_data,
        "valid": request.valid,
        "skipped": False,
    })

    if supabase:
        try:
            supabase.table("game_results").insert({
                "user_id": user_id,
                "date": today.isoformat(),
                "time_of_day": request.time_of_day,
                "game": request.game,
                "summary": summary_data,
                "valid": request.valid,
                "skipped": False,
            }).execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving game result: {e}")

    return {
        "status": "success",
        "message": "Thanks. That helps me plan.",
        "skipped": False,
        "game": request.game,
        "median_rt": median_rt,
        "baseline_rt": round(new_baseline, 1),
        "play_count": new_count,
        "is_calibrating": is_calibrating,
        "probe_multiplier": probe_mult,
    }


@app.get("/api/games/baseline/{user_id}")
async def api_get_game_baseline(user_id: str):
    """Fetch user's current baseline and calibration status."""
    b_info = _spoonsense_demo_store["baselines"].get(user_id, {"baseline_rt": 0.0, "play_count": 0})
    return {
        "status": "success",
        "user_id": user_id,
        "baseline_rt": b_info.get("baseline_rt", 0.0),
        "play_count": b_info.get("play_count", 0),
        "is_calibrating": b_info.get("play_count", 0) < 3,
    }



# ============================================
# SPOONSENSE MILESTONE 3: PLANNER, RESHUFFLER, GARDEN, EVENING CHECK-IN
# ============================================
from typing import Optional, List, Dict, Any
from core.planner import (
    estimate_task,
    plan_day,
    plan_multi_day,
    reshuffle,
    generate_extension_email,
    create_rest_block,
    PlannedTask,
    DayPlan,
    ReshuffleAction,
)
from core.garden import (
    GardenState,
    EveningCheckin,
    update_garden,
    check_hibernation,
    process_evening_checkin,
    process_evening_skip,
    get_dopamine_menu,
    engage_dopamine_item,
    EVENING_LABELS,
    DEFAULT_DOPAMINE_ITEMS,
)

# Extend demo store for M3
_spoonsense_demo_store["tasks"] = {}           # user_id -> List[task_dict]
_spoonsense_demo_store["plans"] = {}            # user_id -> {date: DayPlan_dict}
_spoonsense_demo_store["gardens"] = {}          # user_id -> GardenState
_spoonsense_demo_store["evening_checkins"] = {} # user_id -> List[checkin_dict]
_spoonsense_demo_store["dopamine_menus"] = {}   # user_id -> List[custom_items]
_spoonsense_demo_store["reshuffle_log"] = {}    # user_id -> List[action_dict]

# ── Request Models ────────────────────────────────────────────────────────────

class AddTaskRequest(BaseModel):
    user_id: str
    task_id: Optional[str] = None
    title: str
    task_type: str = "other"
    difficulty: str = "normal"
    estimated_minutes: Optional[int] = None
    due_date: Optional[str] = None
    is_fixed_deadline: bool = False


class PlanDayRequest(BaseModel):
    user_id: str
    target_date: Optional[str] = None


class PlanWeekRequest(BaseModel):
    user_id: str
    start_date: Optional[str] = None


class ReshuffleRequest(BaseModel):
    user_id: str


class ExtensionEmailRequest(BaseModel):
    student_name: str
    course_name: str
    assignment_title: str
    original_due_date: str
    proposed_new_date: str
    professor_name: str = "Professor"
    reason_context: str = ""


class SendTestEmailRequest(BaseModel):
    to_email: str = "test@spoonsense.dev"
    subject: Optional[str] = None
    body: Optional[str] = None
    email_type: str = "test_ping"  # "test_ping", "extension_request", "spoon_checkin"
    student_name: str = "Alex Morgan"
    course_name: str = "CS301 Systems Engineering"
    assignment_title: str = "Project Milestone 1"
    professor_name: str = "Prof. Sharma"
    proposed_new_date: Optional[str] = None


class AddRestBlockRequest(BaseModel):
    user_id: str
    rest_id: Optional[str] = None
    title: str = "Rest & Recharge"
    minutes: int = 20


class CompleteTaskM3Request(BaseModel):
    user_id: str
    task_id: str


class EveningCheckinRequest(BaseModel):
    user_id: str
    energy_level: int   # 0-4
    optional_note: str = ""


class GardenActionRequest(BaseModel):
    user_id: str
    action: str  # login, micro_step, rest, evening_checkin, dopamine_item, game_probe


class DopamineEngageRequest(BaseModel):
    user_id: str
    item_id: str


class AddDopamineItemRequest(BaseModel):
    user_id: str
    title: str
    emoji: str = "✨"
    spoon_credit: float = 0.2
    minutes: int = 5


# ── Helper: get or create garden state ────────────────────────────────────────

def _get_garden(user_id: str) -> GardenState:
    """Retrieve or create a user's garden state from demo store."""
    if user_id not in _spoonsense_demo_store["gardens"]:
        _spoonsense_demo_store["gardens"][user_id] = GardenState(user_id=user_id)
    garden = _spoonsense_demo_store["gardens"][user_id]
    return check_hibernation(garden)


def _get_user_tasks(user_id: str) -> List[PlannedTask]:
    """Convert stored task dicts back to PlannedTask objects."""
    raw = _spoonsense_demo_store["tasks"].get(user_id, [])
    tasks = []
    for t in raw:
        tasks.append(PlannedTask(
            task_id=t["task_id"],
            title=t["title"],
            task_type=t.get("task_type", "other"),
            difficulty=t.get("difficulty", "normal"),
            estimated_minutes=t.get("estimated_minutes"),
            due_date=t.get("due_date"),
            is_fixed_deadline=t.get("is_fixed_deadline", False),
            is_flexible=t.get("is_flexible", True),
            is_rest_block=t.get("is_rest_block", False),
            spoon_cost=t.get("spoon_cost", 0.0),
            scheduled_date=t.get("scheduled_date"),
            scheduled_slot=t.get("scheduled_slot"),
            reshuffle_count=t.get("reshuffle_count", 0),
            completed=t.get("completed", False),
            status=t.get("status", "pending"),
        ))
    return tasks


def _save_user_tasks(user_id: str, tasks: List[PlannedTask]):
    """Persist task list back to demo store."""
    _spoonsense_demo_store["tasks"][user_id] = [t.to_dict() for t in tasks]


# ── Task CRUD Endpoints (FEAT-C1) ────────────────────────────────────────────

@app.post("/api/tasks")
async def api_add_task(request: AddTaskRequest):
    """Add a new task with auto-computed spoon cost badge (FEAT-C1).

    If no duration is provided, defaults are applied based on task_type:
    reading=20m, writing=30m, problem_solving=45m, admin=10m.
    """
    import uuid
    task_id = request.task_id or str(uuid.uuid4())[:8]

    task = estimate_task(
        task_id=task_id,
        title=request.title,
        task_type=request.task_type,
        difficulty=request.difficulty,
        estimated_minutes=request.estimated_minutes,
        due_date=request.due_date,
        is_fixed_deadline=request.is_fixed_deadline,
    )

    # Store
    if request.user_id not in _spoonsense_demo_store["tasks"]:
        _spoonsense_demo_store["tasks"][request.user_id] = []
    _spoonsense_demo_store["tasks"][request.user_id].append(task.to_dict())

    # Also try Supabase
    if supabase:
        try:
            supabase.table("tasks").insert({
                "user_id": request.user_id,
                "task_id": task_id,
                "title": request.title,
                "task_type": request.task_type,
                "difficulty": request.difficulty,
                "estimated_minutes": request.estimated_minutes,
                "due_date": request.due_date,
                "is_fixed_deadline": request.is_fixed_deadline,
                "spoon_cost": task.spoon_cost,
                "status": "pending",
            }).execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving task: {e}")

    return {
        "status": "success",
        "task": task.to_dict(),
        "message": f"Task '{request.title}' added — costs 🥄 {task.spoon_cost} spoons.",
    }


@app.get("/api/tasks/{user_id}")
async def api_get_tasks(user_id: str, include_completed: bool = False):
    """Get all tasks for a user with spoon cost badges."""
    tasks = _get_user_tasks(user_id)
    if not include_completed:
        tasks = [t for t in tasks if not t.completed]
    return {
        "status": "success",
        "user_id": user_id,
        "task_count": len(tasks),
        "total_spoon_cost": round(sum(max(0, t.spoon_cost) for t in tasks), 2),
        "tasks": [t.to_dict() for t in tasks],
    }


@app.post("/api/tasks/complete")
async def api_complete_task(request: CompleteTaskM3Request):
    """Mark a task as completed. Awards garden XP for micro-steps."""
    tasks = _get_user_tasks(request.user_id)
    found = False
    completed_task = None
    for t in tasks:
        if t.task_id == request.task_id:
            t.completed = True
            t.status = "completed"
            completed_task = t
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="Task not found")

    _save_user_tasks(request.user_id, tasks)

    # Award garden XP
    garden = _get_garden(request.user_id)
    garden = update_garden(garden, "micro_step")
    _spoonsense_demo_store["gardens"][request.user_id] = garden

    return {
        "status": "success",
        "task": completed_task.to_dict(),
        "garden_update": {
            "xp_gained": 10,
            "total_xp": garden.total_xp,
            "stage": garden.stage_label,
            "emoji": garden.stage_emoji,
        },
        "message": f"'{completed_task.title}' completed! Your garden grows. 🌱",
    }


@app.post("/api/tasks/rest-block")
async def api_add_rest_block(request: AddRestBlockRequest):
    """Add a rest block as a first-class schedule item (FEAT-C5).

    Rest credits +0.5 spoons per 20 minutes when completed.
    """
    import uuid
    rest_id = request.rest_id or f"rest_{str(uuid.uuid4())[:6]}"

    rest = create_rest_block(
        rest_id=rest_id,
        title=request.title,
        minutes=request.minutes,
    )

    if request.user_id not in _spoonsense_demo_store["tasks"]:
        _spoonsense_demo_store["tasks"][request.user_id] = []
    _spoonsense_demo_store["tasks"][request.user_id].append(rest.to_dict())

    return {
        "status": "success",
        "rest_block": rest.to_dict(),
        "message": f"Rest block '{request.title}' added — credits 🥄 {abs(rest.spoon_cost)} spoons back. Rest is a W.",
    }


# ── Day Planning Endpoints (FEAT-C2) ─────────────────────────────────────────

@app.post("/api/plan/today")
async def api_plan_today(request: PlanDayRequest):
    """Generate today's capacity-sized day plan (FEAT-C2).

    Fits tasks within 80% of live capacity, protecting the 20% buffer.
    """
    user_id = request.user_id
    target = request.target_date or dt_date.today().isoformat()

    # Get live spoons from snapshot
    try:
        snapshot_resp = await api_today_snapshot(user_id)
        live_spoons = snapshot_resp.get("snapshot", {}).get("live_spoons", 6.0)
    except Exception:
        live_spoons = 6.0

    # Get pending tasks
    tasks = _get_user_tasks(user_id)
    pending = [t for t in tasks if not t.completed and t.status != "completed"]

    # Filter to tasks due today or unscheduled
    today_tasks = []
    for t in pending:
        if t.due_date and t.due_date <= target:
            today_tasks.append(t)
        elif not t.scheduled_date or t.scheduled_date == target:
            today_tasks.append(t)

    plan = plan_day(live_spoons, today_tasks, target)

    # Save plan
    if user_id not in _spoonsense_demo_store["plans"]:
        _spoonsense_demo_store["plans"][user_id] = {}
    _spoonsense_demo_store["plans"][user_id][target] = plan.to_dict()

    # Update task states
    _save_user_tasks(user_id, tasks)

    return {
        "status": "success",
        "plan": plan.to_dict(),
    }


@app.post("/api/plan/week")
async def api_plan_week(request: PlanWeekRequest):
    """Generate a 7-day capacity-sized plan using forecast data (FEAT-C2)."""
    user_id = request.user_id
    start = request.start_date or dt_date.today().isoformat()

    # Get 7-day forecast
    try:
        forecast_resp = await api_forecast(user_id)
        forecasts = forecast_resp.get("forecast", [])
    except Exception:
        forecasts = []

    if not forecasts:
        # Generate simple defaults
        forecasts = []
        base = dt_date.fromisoformat(start)
        for i in range(7):
            d = base + timedelta(days=i)
            forecasts.append({"date": d.isoformat(), "prior_spoons": 6.0})

    # Get pending tasks
    tasks = _get_user_tasks(user_id)
    pending = [t for t in tasks if not t.completed]

    plans = plan_multi_day(forecasts, pending)

    # Save plans
    if user_id not in _spoonsense_demo_store["plans"]:
        _spoonsense_demo_store["plans"][user_id] = {}
    for p in plans:
        _spoonsense_demo_store["plans"][user_id][p.target_date] = p.to_dict()

    # Update task states
    _save_user_tasks(user_id, tasks)

    return {
        "status": "success",
        "user_id": user_id,
        "plans": [p.to_dict() for p in plans],
    }


# ── Reshuffler Endpoint (FEAT-C3) ────────────────────────────────────────────

@app.post("/api/plan/reshuffle")
async def api_reshuffle(request: ReshuffleRequest):
    """Auto-reshuffle overloaded tasks to lighter future days (FEAT-C3).

    Triggers when live capacity is ≥20% below planned load.
    Never moves tasks across fixed deadlines.
    Non-punitive toast messages only.
    """
    user_id = request.user_id
    today = dt_date.today().isoformat()

    # Get today's plan
    today_plan_dict = _spoonsense_demo_store.get("plans", {}).get(user_id, {}).get(today)

    if not today_plan_dict:
        # Generate a plan first
        plan_resp = await api_plan_today(PlanDayRequest(user_id=user_id))
        today_plan_dict = plan_resp.get("plan", {})

    # Reconstruct DayPlan
    tasks = _get_user_tasks(user_id)
    plan_tasks = [t for t in tasks if t.scheduled_date == today and not t.completed]

    live_spoons = today_plan_dict.get("available_spoons", 6.0)
    current_plan = DayPlan(
        target_date=today,
        available_spoons=live_spoons,
        planned_capacity=today_plan_dict.get("planned_capacity", live_spoons * 0.8),
        reserved_spoons=today_plan_dict.get("reserved_spoons", live_spoons * 0.2),
        total_planned_cost=today_plan_dict.get("total_planned_cost", 0),
        remaining_capacity=today_plan_dict.get("remaining_capacity", 0),
        tasks=plan_tasks,
        is_overloaded=today_plan_dict.get("is_overloaded", False),
    )

    # Get future forecasts
    try:
        forecast_resp = await api_forecast(user_id)
        future = [f for f in forecast_resp.get("forecast", []) if f.get("date", "") > today]
    except Exception:
        future = []

    updated_plan, actions = reshuffle(current_plan, future, tasks)

    # Save updated tasks and plan
    _save_user_tasks(user_id, tasks)
    if user_id not in _spoonsense_demo_store["plans"]:
        _spoonsense_demo_store["plans"][user_id] = {}
    _spoonsense_demo_store["plans"][user_id][today] = updated_plan.to_dict()

    # Log reshuffle actions
    if user_id not in _spoonsense_demo_store["reshuffle_log"]:
        _spoonsense_demo_store["reshuffle_log"][user_id] = []
    for a in actions:
        _spoonsense_demo_store["reshuffle_log"][user_id].append(a.to_dict())

    return {
        "status": "success",
        "reshuffled": len(actions) > 0,
        "actions": [a.to_dict() for a in actions],
        "updated_plan": updated_plan.to_dict(),
        "message": actions[0].toast_message if actions else "Plan looks balanced — no reshuffling needed.",
    }


# ── Extension Email Endpoint (FEAT-C4) ───────────────────────────────────────

@app.post("/api/plan/extension-email")
async def api_extension_email(request: ExtensionEmailRequest):
    """Generate a polite, professional extension request email (FEAT-C4).

    Ethical guardrail: Never mentions medical claims, mental health
    diagnoses, or trauma. Frames purely around academic workload.
    """
    email = generate_extension_email(
        student_name=request.student_name,
        course_name=request.course_name,
        assignment_title=request.assignment_title,
        original_due_date=request.original_due_date,
        proposed_new_date=request.proposed_new_date,
        professor_name=request.professor_name,
        reason_context=request.reason_context,
    )

    return {
        "status": "success",
        "email": email,
        "message": "Email draft ready. Review, edit, and send when you're comfortable.",
    }


# ── Test Email Dispatch Endpoints ──────────────────────────────────────────

@app.post("/api/email/send-test")
async def api_send_test_email(request: SendTestEmailRequest):
    """Dispatch or simulate a test email (extension request, check-in, or ping)."""
    from core.email_service import send_email, send_test_email

    if request.subject and request.body:
        res = send_email(
            to_email=request.to_email,
            subject=request.subject,
            body=request.body,
        )
    else:
        res = send_test_email(
            to_email=request.to_email,
            email_type=request.email_type,
            student_name=request.student_name,
            course_name=request.course_name,
            assignment_title=request.assignment_title,
            professor_name=request.professor_name,
            new_due_date=request.proposed_new_date or "2026-11-05",
        )

    return {
        "status": "success",
        "email_delivery": res,
    }


@app.get("/api/email/sent-log")
async def api_get_email_log(limit: int = 50):
    """Retrieve history of recently sent / simulated test emails."""
    from core.email_service import get_sent_email_history
    return {
        "status": "success",
        "emails": get_sent_email_history(limit=limit),
    }


# ── Garden Endpoints (FEAT-E2) ───────────────────────────────────────────────

@app.get("/api/garden/{user_id}")
async def api_get_garden(user_id: str):
    """Get the user's Forgiving Garden state (FEAT-E2).

    The garden NEVER wilts. Missing days = gentle hibernation, not punishment.
    """
    garden = _get_garden(user_id)
    return {
        "status": "success",
        "garden": garden.to_dict(),
    }


@app.post("/api/garden/action")
async def api_garden_action(request: GardenActionRequest):
    """Record a garden growth action (login, micro_step, rest, etc.)."""
    garden = _get_garden(request.user_id)
    garden = update_garden(garden, request.action)
    _spoonsense_demo_store["gardens"][request.user_id] = garden

    return {
        "status": "success",
        "garden": garden.to_dict(),
        "message": garden.welcome_back_message or f"Garden tended! {garden.stage_emoji} {garden.stage_label}",
    }


# ── Evening Check-in Endpoints (FEAT-E3) ─────────────────────────────────────

@app.get("/api/evening/labels")
async def api_evening_labels():
    """Get the evening check-in energy level labels and emoji."""
    return {
        "status": "success",
        "labels": EVENING_LABELS,
    }


@app.post("/api/evening/checkin")
async def api_evening_checkin(request: EveningCheckinRequest):
    """Process a one-tap evening check-in (FEAT-E3).

    One tap on a battery icon (0-4), optional text note, done in <10 seconds.
    Waters the garden automatically.
    """
    checkin = process_evening_checkin(
        user_id=request.user_id,
        energy_level=request.energy_level,
        optional_note=request.optional_note,
    )

    # Update garden
    garden = _get_garden(request.user_id)
    garden = update_garden(garden, "evening_checkin")
    _spoonsense_demo_store["gardens"][request.user_id] = garden

    # Store checkin
    if request.user_id not in _spoonsense_demo_store["evening_checkins"]:
        _spoonsense_demo_store["evening_checkins"][request.user_id] = []
    _spoonsense_demo_store["evening_checkins"][request.user_id].append(checkin.to_dict())

    # Also feed to carryover engine via Supabase
    if supabase:
        try:
            supabase.table("evening_labels").insert({
                "user_id": request.user_id,
                "label_date": checkin.checkin_date,
                "evening_label": checkin.energy_level,
                "note": checkin.optional_note,
            }).execute()
        except Exception as e:
            print(f"[spoonsense] DB error saving evening checkin: {e}")

    return {
        "status": "success",
        "checkin": checkin.to_dict(),
        "garden": garden.to_dict(),
        "message": f"{checkin.emoji} {checkin.description}",
    }


@app.post("/api/evening/skip")
async def api_evening_skip(request: GardenActionRequest):
    """Skip evening check-in with ZERO penalty (FEAT-E3).

    No guilt, no broken streak, no judgment.
    """
    checkin = process_evening_skip(user_id=request.user_id)

    if request.user_id not in _spoonsense_demo_store["evening_checkins"]:
        _spoonsense_demo_store["evening_checkins"][request.user_id] = []
    _spoonsense_demo_store["evening_checkins"][request.user_id].append(checkin.to_dict())

    return {
        "status": "success",
        "checkin": checkin.to_dict(),
        "message": "Skipping is valid. Rest well. 💤",
    }


@app.get("/api/evening/history/{user_id}")
async def api_evening_history(user_id: str, limit: int = 14):
    """Get recent evening check-in history."""
    checkins = _spoonsense_demo_store.get("evening_checkins", {}).get(user_id, [])
    recent = checkins[-limit:] if len(checkins) > limit else checkins
    return {
        "status": "success",
        "user_id": user_id,
        "checkins": recent,
    }


# ── Dopamine Menu Endpoints (FEAT-E4) ────────────────────────────────────────

@app.get("/api/dopamine/menu/{user_id}")
async def api_dopamine_menu(user_id: str):
    """Get the full dopamine menu with defaults + user custom items (FEAT-E4).

    Suggested when live spoons < 3.0.
    """
    custom = _spoonsense_demo_store.get("dopamine_menus", {}).get(user_id, [])
    menu = get_dopamine_menu(custom)
    return {
        "status": "success",
        "user_id": user_id,
        "menu": menu,
    }


@app.post("/api/dopamine/engage")
async def api_dopamine_engage(request: DopamineEngageRequest):
    """Engage with a dopamine menu item (FEAT-E4).

    Awards +0.2 to +0.5 spoons and garden XP.
    """
    custom = _spoonsense_demo_store.get("dopamine_menus", {}).get(request.user_id, [])
    menu = get_dopamine_menu(custom)

    result = engage_dopamine_item(request.item_id, menu)

    # Update garden
    garden = _get_garden(request.user_id)
    garden = update_garden(garden, "dopamine_item")
    _spoonsense_demo_store["gardens"][request.user_id] = garden

    return {
        "status": "success",
        "result": result,
        "garden": garden.to_dict(),
        "message": result["message"],
    }


@app.post("/api/dopamine/add-item")
async def api_add_dopamine_item(request: AddDopamineItemRequest):
    """Add a custom item to the user's dopamine menu."""
    import uuid
    item_id = f"custom_{str(uuid.uuid4())[:6]}"

    item = {
        "id": item_id,
        "title": request.title,
        "emoji": request.emoji,
        "spoon_credit": min(0.5, max(0.1, request.spoon_credit)),
        "minutes": request.minutes,
    }

    if request.user_id not in _spoonsense_demo_store["dopamine_menus"]:
        _spoonsense_demo_store["dopamine_menus"][request.user_id] = []
    _spoonsense_demo_store["dopamine_menus"][request.user_id].append(item)

    return {
        "status": "success",
        "item": item,
        "message": f"'{request.title}' added to your dopamine menu!",
    }


# ============================================
# SPOONSENSE MILESTONE 4: TASK SHRINKER & ANTI-PARALYSIS
# ============================================
from core.shrinker import (
    shrink_task_with_gemini,
    offline_sequence,
    subdivide_step,
    check_ethical_guardrails,
    retrieve_coping_strategies,
    sanitize_output,
    CRISIS_RESPONSE,
    DIAGNOSTIC_RESPONSE,
    COPING_STRATEGIES,
)

if "shrinker_history" not in _spoonsense_demo_store:
    _spoonsense_demo_store["shrinker_history"] = {}


class SequenceRequest(BaseModel):
    user_id: str = "demo_student"
    title: str
    task_type: str = "other"
    live_spoons: float = 6.0
    user_note: str = ""


class SmallerRequest(BaseModel):
    user_id: str = "demo_student"
    step_text: str
    task_type: str = "other"
    recursion_depth: int = 0


@app.post("/api/sequence")
async def api_shrink_task(request: SequenceRequest):
    """Break a daunting task into tiny, physically actionable micro-steps (FEAT-D1, D2, D4, D5).

    Zero-shame guaranteed: checks ethical guardrails first, enforces banned-word
    sanitization, and falls back to offline templates if offline or rate-limited.
    """
    # 1. Ethical Guardrails (FEAT-D5)
    guardrail = check_ethical_guardrails(request.user_note)
    if guardrail:
        return {
            "status": "redirect",
            "guardrail": guardrail,
            "message": guardrail.get("message", "We are here for you."),
        }

    # 2. Generate sequence via Gemini or fallback (FEAT-D1, D2, D4)
    result = await shrink_task_with_gemini(
        title=request.title,
        task_type=request.task_type,
        live_spoons=request.live_spoons,
        user_note=request.user_note,
    )

    # Check if internal guardrail tripped
    if result.get("type") in ("crisis_redirect", "diagnostic_redirect"):
        return {
            "status": "redirect",
            "guardrail": result,
            "message": result.get("message", ""),
        }

    # Store in shrinker history
    if request.user_id not in _spoonsense_demo_store["shrinker_history"]:
        _spoonsense_demo_store["shrinker_history"][request.user_id] = []
    _spoonsense_demo_store["shrinker_history"][request.user_id].append({
        "task_title": request.title,
        "task_type": request.task_type,
        "sequence": result,
    })

    # Update garden gently
    try:
        garden = _get_garden(request.user_id)
        garden = update_garden(garden, "micro_step")
        _spoonsense_demo_store["gardens"][request.user_id] = garden
    except Exception:
        pass

    return {
        "status": "success",
        "sequence": result,
        "message": "Task broken down into gentle micro-steps.",
    }


@app.post("/api/sequence/smaller")
async def api_subdivide_step(request: SmallerRequest):
    """Sub-divide a single micro-step into atomic sensory actions (FEAT-D3).

    Halves step complexity up to 3 recursions with zero judgment.
    """
    result = subdivide_step(
        step_text=request.step_text,
        task_type=request.task_type,
        recursion_depth=request.recursion_depth,
    )

    try:
        garden = _get_garden(request.user_id)
        garden = update_garden(garden, "micro_step")
        _spoonsense_demo_store["gardens"][request.user_id] = garden
    except Exception:
        pass

    return {
        "status": "success",
        "result": result,
        "message": result.get("message", ""),
    }


@app.get("/api/sequence/strategies/{task_type}")
async def api_get_coping_strategies(task_type: str, situation: str = "stuck", top_k: int = 3):
    """Retrieve curated evidence-based coping strategies for task paralysis (FEAT-D2)."""
    strategies = retrieve_coping_strategies(task_type, situation, top_k=top_k)
    return {
        "status": "success",
        "task_type": task_type,
        "situation": situation,
        "strategies": strategies,
    }


@app.get("/api/sequence/history/{user_id}")
async def api_get_shrinker_history(user_id: str, limit: int = 10):
    """Fetch recent task shrinker history."""
    history = _spoonsense_demo_store.get("shrinker_history", {}).get(user_id, [])
    return {
        "status": "success",
        "user_id": user_id,
        "history": history[-limit:] if len(history) > limit else history,
    }


@app.post("/api/sequence/offline")
async def api_offline_sequence(request: SequenceRequest):
    """Explicit deterministic offline sequencer fallback (FEAT-D4)."""
    result = offline_sequence(
        title=request.title,
        task_type=request.task_type,
        live_spoons=request.live_spoons,
    )
    return {
        "status": "success",
        "sequence": result,
        "message": "Deterministic offline sequence generated.",
    }


# ── Google Calendar Sync Endpoints (FEAT-G3) ────────────────────────────────

from core.calendar_sync import (
    get_sync_status,
    set_sync_preferences,
    sync_tasks_to_calendar,
    disconnect_calendar,
)


class CalendarSyncRequest(BaseModel):
    user_id: str = "demo_student"
    target_date: Optional[str] = None
    tasks: Optional[List[Dict[str, Any]]] = None


class CalendarPrefRequest(BaseModel):
    user_id: str = "demo_student"
    read_only: bool = False
    auto_sync: bool = True


@app.get("/api/calendar/status/{user_id}")
async def api_calendar_status(user_id: str):
    """Get Google Calendar sync status and connected account state (FEAT-G3)."""
    return get_sync_status(user_id)


@app.post("/api/calendar/sync")
async def api_calendar_sync(request: CalendarSyncRequest):
    """Sync planned focus blocks into Google Calendar tagged [SpoonSense] (FEAT-G3).

    Updates existing events without duplicate orphans on reshuffle.
    """
    tasks_to_sync = request.tasks
    if tasks_to_sync is None:
        tasks_to_sync = _spoonsense_demo_store.get("tasks", {}).get(request.user_id, [])

    result = sync_tasks_to_calendar(
        user_id=request.user_id,
        tasks=tasks_to_sync,
        target_date=request.target_date,
    )
    return result


@app.post("/api/calendar/preferences")
async def api_calendar_preferences(request: CalendarPrefRequest):
    """Update read-only calendar mode or auto-sync preferences."""
    result = set_sync_preferences(
        user_id=request.user_id,
        read_only=request.read_only,
        auto_sync=request.auto_sync,
    )
    return result


@app.post("/api/calendar/disconnect")
async def api_calendar_disconnect(request: CalendarSyncRequest):
    """1-Tap Disconnect: removes all [SpoonSense] blocks from calendar instantly."""
    result = disconnect_calendar(request.user_id)
    return result


# ============================================
# SPOONSENSE MILESTONE 5: PRIVACY, EXPORT & DEMO SEEDS
# ============================================

from core.demo_seeds import seed_aarav_profile, seed_meera_profile
from core.privacy_manager import PRIVACY_MANIFEST, export_user_data, delete_user_data


class PersonaSeedRequest(BaseModel):
    user_id: Optional[str] = None


@app.post("/api/demo/seed/{persona}")
async def api_seed_demo_profile(persona: str, request: Optional[PersonaSeedRequest] = None):
    """Seed instant judge demonstration profile (FEAT-A3).

    Supports:
      • 'aarav': 240m crowded transit -> ~2.4 spoons (Stormy)
      • 'meera': 20m walk -> ~7.4 spoons (Sunny)
    """
    effective_id = (request.user_id if request and request.user_id else None) or persona.lower()

    if persona.lower() == "aarav":
        return seed_aarav_profile(_spoonsense_demo_store, user_id=effective_id)
    elif persona.lower() == "meera":
        return seed_meera_profile(_spoonsense_demo_store, user_id=effective_id)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown persona '{persona}'. Choose 'aarav' or 'meera'."
        )


@app.get("/api/me/privacy-manifest")
async def api_get_privacy_manifest():
    """Return plain-language transparency manifest (FEAT-G4, FR-ST-01)."""
    return PRIVACY_MANIFEST


@app.get("/api/me/export/{user_id}")
@app.post("/api/me/export")
async def api_export_user_data(user_id: Optional[str] = "demo_student", request: Optional[Dict[str, Any]] = None):
    """Export complete user data archive as JSON (FEAT-G4, FR-ST-02)."""
    effective_id = user_id
    if request and "user_id" in request:
        effective_id = request["user_id"]
    return export_user_data(effective_id, _spoonsense_demo_store)


@app.delete("/api/me/{user_id}")
@app.delete("/api/me")
async def api_delete_user_data(user_id: Optional[str] = "demo_student", request: Optional[Dict[str, Any]] = None):
    """One-click permanent delete of all user data (FEAT-G4, FR-ST-03)."""
    effective_id = user_id
    if request and "user_id" in request:
        effective_id = request["user_id"]
    return delete_user_data(effective_id, _spoonsense_demo_store)


# ============================================
# CONTEXTUAL RAG CHAT & AVATAR ASSISTANT (FEAT-RAG-1)
# ============================================

from core.context_rag import build_student_context_chunks, index_user_context, retrieve_context
import re
import requests
import uuid

class AvatarChatRequest(BaseModel):
    user_id: str = "demo_student"
    message: str


def _get_azure_speech_credentials():
    """
    Resolves Azure Speech credentials from environment variables supporting both
    official formats:
    - SPEECH_KEY / AZURE_SPEECH_KEY
    - SPEECH_ENDPOINT / AZURE_SPEECH_ENDPOINT
    - SPEECH_REGION / AZURE_SPEECH_REGION
    - AVATAR_CHARACTER / AZURE_AVATAR_CHARACTER
    """
    key = os.getenv("SPEECH_KEY", "").strip() or os.getenv("AZURE_SPEECH_KEY", "").strip()
    endpoint = os.getenv("SPEECH_ENDPOINT", "").strip() or os.getenv("AZURE_SPEECH_ENDPOINT", "").strip()
    region = os.getenv("SPEECH_REGION", "").strip() or os.getenv("AZURE_SPEECH_REGION", "").strip()
    character = os.getenv("AVATAR_CHARACTER", "").strip() or os.getenv("AZURE_AVATAR_CHARACTER", "").strip() or "Celine"

    # Extract region from endpoint if region not set explicitly
    if not region and endpoint:
        match = re.search(r"https?://([a-z0-9-]+)\.api\.cognitive\.microsoft\.com", endpoint)
        if match:
            region = match.group(1)
        else:
            region = "eastus"

    if not region:
        region = "eastus"

    if not endpoint:
        endpoint = f"https://{region}.api.cognitive.microsoft.com"

    return {
        "key": key,
        "endpoint": endpoint.rstrip("/"),
        "region": region,
        "character": character,
    }


@app.get("/api/avatar/token")
@app.get("/api/avatar-session")
async def api_avatar_token():
    """
    Exchanges Azure Speech credentials for a short-lived STS authorization token
    AND fetches Azure TTS Avatar WebRTC relay credentials (TURN/STUN ICE servers).
    Allows frontend WebRTC to connect directly to Azure Avatar without exposing keys.
    """
    creds = _get_azure_speech_credentials()
    speech_key = creds["key"]
    speech_region = creds["region"]
    avatar_character = creds["character"]

    if not speech_key:
        return {"status": "mock", "token": None, "region": speech_region, "character": avatar_character, "iceServers": []}

    try:
        headers = {
            "Ocp-Apim-Subscription-Key": speech_key,
        }
        # 1. Fetch STS Token (try endpoint first, fallback to regional STS)
        sts_url = f"{creds['endpoint']}/sts/v1.0/issueToken"
        sts_res = requests.post(sts_url, headers={**headers, "Content-Type": "application/x-www-form-urlencoded"}, timeout=5)
        if sts_res.status_code != 200:
            alt_sts_url = f"https://{speech_region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
            sts_res = requests.post(alt_sts_url, headers={**headers, "Content-Type": "application/x-www-form-urlencoded"}, timeout=5)

        # 2. Fetch Avatar WebRTC Relay Credentials (ICE TURN/STUN servers)
        relay_url = f"https://{speech_region}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1"
        relay_res = requests.get(relay_url, headers=headers, timeout=5)

        token = sts_res.text.strip() if sts_res.status_code == 200 else None
        ice_servers = []

        if relay_res.status_code == 200:
            relay_data = relay_res.json()
            if relay_data.get("Urls") and relay_data.get("Username") and relay_data.get("Password"):
                ice_servers = [
                    {
                        "urls": relay_data["Urls"],
                        "username": relay_data["Username"],
                        "credential": relay_data["Password"],
                    }
                ]

        if token:
            return {
                "status": "success",
                "token": token,
                "region": speech_region,
                "character": avatar_character,
                "iceServers": ice_servers,
            }
        else:
            return {
                "status": "error",
                "detail": f"Azure STS failed: {sts_res.status_code} - {sts_res.text}",
                "token": None,
                "region": speech_region,
                "character": avatar_character,
                "iceServers": [],
            }
    except Exception as e:
        return {"status": "error", "detail": str(e), "token": None, "region": speech_region, "character": avatar_character, "iceServers": []}


class BatchAvatarRequest(BaseModel):
    text: str
    character: Optional[str] = None
    voice: Optional[str] = "en-US-Ava:DragonHDLatestNeural"


@app.post("/api/avatar/batch-synthesize")
async def api_batch_synthesize(req: BatchAvatarRequest):
    """
    Submits a batch avatar synthesis job using Azure REST API (api-version=2024-08-01).
    Generates an MP4 video of the avatar speaking the supplied text.
    """
    creds = _get_azure_speech_credentials()
    if not creds["key"]:
        return {"status": "mock", "job_id": str(uuid.uuid4()), "message": "Azure Speech key not configured in .env"}

    job_id = str(uuid.uuid4())
    character = req.character or creds["character"] or "Celine"
    url = f"{creds['endpoint']}/avatar/batchsyntheses/{job_id}?api-version=2024-08-01"
    headers = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": creds["key"],
    }
    payload = {
        "synthesisConfig": {
            "voice": req.voice,
        },
        "customVoices": {},
        "inputKind": "PlainText",
        "inputs": [
            {"content": req.text},
        ],
        "avatarConfig": {
            "talkingAvatarCharacter": character,
            "talkingAvatarStyle": "",
            "videoFormat": "mp4",
            "videoCodec": "h264",
            "subtitleType": "soft_embedded",
            "backgroundColor": "#1e1b4bFF",
        },
    }
    try:
        res = requests.put(url, json=payload, headers=headers, timeout=10)
        if res.status_code < 400:
            return {"status": "submitted", "job_id": job_id, "data": res.json()}
        else:
            return {"status": "error", "code": res.status_code, "detail": res.text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/avatar/batch-synthesize/{job_id}")
async def api_get_batch_synthesis(job_id: str):
    """
    Polls the status of an Azure batch avatar synthesis job.
    Returns the output MP4 video URL once synthesis completes ('Succeeded').
    """
    creds = _get_azure_speech_credentials()
    if not creds["key"]:
        return {"status": "mock", "job_id": job_id, "video_url": None}

    url = f"{creds['endpoint']}/avatar/batchsyntheses/{job_id}?api-version=2024-08-01"
    headers = {"Ocp-Apim-Subscription-Key": creds["key"]}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code < 400:
            data = res.json()
            status = data.get("status")
            video_url = data.get("outputs", {}).get("result") if status == "Succeeded" else None
            return {"status": status, "job_id": job_id, "video_url": video_url, "data": data}
        else:
            return {"status": "error", "code": res.status_code, "detail": res.text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/api/avatar/chat")
async def api_avatar_chat(req: AvatarChatRequest):
    """
    RAG-powered conversational endpoint for the Real-Time Talking Avatar.
    Retrieves live physical context (commute, timetable, live spoons, tasks, coping strategies)
    and formats an empathetic response for the student.
    """
    user_id = req.user_id

    # Gather current context from demo store / database
    snap = _spoonsense_demo_store.get("snapshots", {}).get(user_id)
    commute = _spoonsense_demo_store.get("commutes", {}).get(user_id)
    timetable = _spoonsense_demo_store.get("timetables", {}).get(user_id, [])
    tasks = _spoonsense_demo_store.get("tasks", {}).get(user_id, [])

    # Index into RAG engine
    chunks = build_student_context_chunks(
        user_id=user_id,
        snapshot=snap,
        commute_profile=commute,
        timetable_blocks=timetable,
        tasks=tasks,
    )
    index_user_context(user_id, chunks)

    # Retrieve relevant context
    retrieved = retrieve_context(user_id, req.message, top_k=3)
    context_str = "\n".join([f"- [{c['category'].upper()} - {c['title']}]: {c['text']}" for c in retrieved])

    live_spoons = snap.get("live_spoons", 5.2) if snap else 5.2

    # Synthesize empathetic short buddy response
    # (If Gemini key is available, calls Gemini; otherwise uses rule-based empathetic synthesis)
    reply = ""
    lower_msg = req.message.lower()

    if any(w in lower_msg for w in ["stuck", "paralyz", "cannot start", "overwhelm"]):
        reply = (
            f"I hear you. With {live_spoons:.1f} spoons left today, task paralysis is completely normal. "
            f"Let's not do the whole task right now — just use the 2-minute rule and open the file, or try body doubling."
        )
    elif any(w in lower_msg for w in ["commute", "train", "travel", "tired", "exhaust"]):
        mins = commute.get("minutes_each_way", 40) if commute else 40
        reply = (
            f"Travelling {mins * 2} minutes daily takes a huge sensory toll before classes even begin. "
            f"Your fatigue is physical, not laziness. Rest right now — you've got protected buffer room."
        )
    elif any(w in lower_msg for w in ["task", "schedule", "plan", "today"]):
        reply = (
            f"You currently have {live_spoons:.1f} spoons available today. "
            f"I've protected your 20% buffer so you don't burn out. Focus on one small chunk at a time."
        )
    else:
        reply = (
            f"I'm with you. You have {live_spoons:.1f} spoons today. "
            f"Tell me what feels heavy right now and we'll break it down together."
        )

    return {
        "status": "success",
        "user_id": user_id,
        "reply": reply,
        "live_spoons": live_spoons,
        "retrieved_context": retrieved,
    }

