"""
Test & Seed Script for the Analysis Pipeline + Supabase

Usage:
  cd backend
  python -m tests.test_pipeline            # run all tests
  python -m tests.test_pipeline --seed     # insert seed data only
  python -m tests.test_pipeline --query    # query existing data only

This script can be used to:
  1. Test the pipeline end-to-end (text → analysis → energy → Supabase)
  2. Seed Supabase with sample analysis rows
  3. Query Supabase to verify stored data
"""

import sys
import json
import argparse
from datetime import datetime

# Ensure project root is on path
sys.path.insert(0, ".")

from dotenv import load_dotenv
load_dotenv()

from core.supabase_client import supabase
from core.pipeline import (
    run_text_pipeline,
    get_recent_sessions,
    get_energy_history,
    get_daily_energy_averages,
)


# ---------------------------------------------------------------
# 1. PIPELINE TEST — runs text through the full pipeline
# ---------------------------------------------------------------

def test_text_pipeline():
    """Send sample texts through the pipeline and verify Supabase insertion."""
    sample_texts = [
        "I feel very tired and anxious today. Nothing seems to go right.",
        "Everything is going great! I'm feeling wonderful and energetic.",
        "I'm a bit stressed about the deadline but managing okay.",
        "I can't sleep and my thoughts keep racing. I feel hopeless.",
    ]

    print("=" * 60)
    print("  PIPELINE TEST — text → classify → energy → Supabase")
    print("=" * 60)

    for i, text in enumerate(sample_texts, 1):
        print(f"\n--- Sample {i} ---")
        print(f"  Input: {text[:60]}...")

        result = run_text_pipeline(text)

        print(f"  Status:      {result['status']}")
        print(f"  Session ID:  {result.get('session_id', 'N/A')}")
        print(f"  Depression:  {result['analysis']['depression']:.3f}")
        print(f"  Anxiety:     {result['analysis']['anxiety']:.3f}")
        print(f"  Stress:      {result['analysis']['stress']:.3f}")
        print(f"  Energy:      {result['energy_flow']['energy_score']}")
        print(f"  Category:    {result['energy_flow']['energy_category']}")
        print(f"  Task Type:   {result['energy_flow']['recommended_task_type']}")
        print(f"  Persisted:   {result['persisted']}")

    print("\n✓ Pipeline test complete")


# ---------------------------------------------------------------
# 2. SEED DATA — insert test rows directly into Supabase
# ---------------------------------------------------------------

def seed_supabase():
    """Insert sample analysis sessions directly into Supabase (bypass ML)."""
    print("=" * 60)
    print("  SEED — inserting sample data into Supabase")
    print("=" * 60)

    samples = [
        {
            "input_type": "text",
            "input_text": "I feel very tired and anxious today.",
            "depression_score": 0.35,
            "anxiety_score": 0.72,
            "stress_score": 0.55,
            "analysis_source": "local_model",
            "stress_level": "medium",
            "anxiety_level": "high",
            "depression_level": "low",
            "tone": "negative",
            "base_energy": 70,
            "energy_score": 37,
            "energy_category": "low_energy",
            "recommended_task_type": "light",
            "task_description": "You have low energy. Focus on rest, light activities, and self-care.",
            "task_suggestions": json.dumps(["Take breaks", "Do light stretching", "Listen to music", "Practice mindfulness"]),
            "stress_impact": -10,
            "anxiety_impact": -15,
            "depression_impact": 0,
            "tone_impact": -5,
            "total_impact": -30,
        },
        {
            "input_type": "text",
            "input_text": "Everything is going great! I'm feeling wonderful.",
            "depression_score": 0.08,
            "anxiety_score": 0.05,
            "stress_score": 0.10,
            "analysis_source": "local_model",
            "stress_level": "low",
            "anxiety_level": "low",
            "depression_level": "low",
            "tone": "positive",
            "base_energy": 70,
            "energy_score": 80,
            "energy_category": "high_energy",
            "recommended_task_type": "heavy",
            "task_description": "You have high energy. Perfect for challenging tasks.",
            "task_suggestions": json.dumps(["Tackle complex projects", "Intense exercise", "Learn something new", "Leadership tasks"]),
            "stress_impact": 0,
            "anxiety_impact": 0,
            "depression_impact": 0,
            "tone_impact": 10,
            "total_impact": 10,
        },
        {
            "input_type": "voice",
            "input_text": "मुझे बहुत थकान हो रही है",
            "detected_language": "hi",
            "language_name": "Hindi",
            "transcription_method": "gemini_voice",
            "depression_score": 0.45,
            "anxiety_score": 0.30,
            "stress_score": 0.60,
            "analysis_source": "gemini_multilingual",
            "stress_level": "medium",
            "anxiety_level": "low",
            "depression_level": "medium",
            "tone": "neutral",
            "base_energy": 70,
            "energy_score": 48,
            "energy_category": "medium_energy",
            "recommended_task_type": "medium",
            "task_description": "You have moderate energy. Good for routine tasks.",
            "task_suggestions": json.dumps(["Routine work", "Moderate exercise", "Social interactions", "Planning"]),
            "stress_impact": -10,
            "anxiety_impact": 0,
            "depression_impact": -12,
            "tone_impact": 0,
            "total_impact": -22,
        },
    ]

    for i, row in enumerate(samples, 1):
        try:
            resp = supabase.table("analysis_sessions").insert(row).execute()
            session = resp.data[0]
            print(f"  [{i}] Inserted session {session['id']}")

            # Also add to energy_history
            supabase.table("energy_history").insert({
                "session_id": session["id"],
                "energy_score": row["energy_score"],
                "energy_category": row["energy_category"],
                "stress_level": row["stress_level"],
                "anxiety_level": row["anxiety_level"],
                "depression_level": row["depression_level"],
                "tone": row["tone"],
            }).execute()
        except Exception as e:
            print(f"  [{i}] FAILED: {e}")

    print("\n✓ Seed complete")


# ---------------------------------------------------------------
# 3. QUERY — read back from Supabase to verify
# ---------------------------------------------------------------

def query_supabase():
    """Read data from Supabase and print it."""
    print("=" * 60)
    print("  QUERY — reading from Supabase")
    print("=" * 60)

    # Recent sessions
    sessions = get_recent_sessions(10)
    print(f"\n--- Recent Sessions ({len(sessions)}) ---")
    for s in sessions:
        print(
            f"  {s['id'][:8]}… | {s['input_type']:5s} | "
            f"energy={s.get('energy_score', '?'):>3} | "
            f"{s.get('energy_category', '?'):13s} | "
            f"{(s.get('input_text') or '')[:40]}"
        )

    # Energy history
    history = get_energy_history(10)
    print(f"\n--- Energy History ({len(history)}) ---")
    for h in history:
        print(
            f"  {h.get('recorded_at', '?')[:19]} | "
            f"energy={h.get('energy_score', '?'):>3} | "
            f"{h.get('energy_category', '?')}"
        )

    # Daily averages
    daily = get_daily_energy_averages()
    print(f"\n--- Daily Averages ({len(daily)}) ---")
    for d in daily:
        print(
            f"  {d.get('date', '?')} | "
            f"avg_energy={d.get('avg_energy', '?')} | "
            f"sessions={d.get('session_count', '?')}"
        )

    print("\n✓ Query complete")


# ---------------------------------------------------------------
# CLI
# ---------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test & seed the analysis pipeline")
    parser.add_argument("--seed", action="store_true", help="Insert seed data into Supabase")
    parser.add_argument("--query", action="store_true", help="Query Supabase and print results")
    args = parser.parse_args()

    if args.seed:
        seed_supabase()
    elif args.query:
        query_supabase()
    else:
        test_text_pipeline()
        print()
        query_supabase()
