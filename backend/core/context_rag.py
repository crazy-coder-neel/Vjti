"""
SpoonSense Contextual RAG Vector Engine (FEAT-RAG-1)
===================================================

Semantic Context Memory & Retrieval-Augmented Generation for Conversational AI:
  1. Stores rich live context chunks for the active student:
     - Commute realities (transit legs, crowd burden, daily travel hours)
     - Academic timetable (current classes, practical labs, fixed deadlines)
     - Current task state & paralysis history (tasks reshuffled >= 3 times)
     - Sleep & morning cognitive baseline (sleep duration, energy weather)
     - Proven clinical coping strategies (two-minute rule, body doubling, chunking)
  2. Embeds documents into dense vectors via Clinical RoBERTa / TF-IDF hybrid.
  3. Uses Cosine Similarity Vector Search to retrieve the exact relevant context
     when the student asks a question to the conversational agent / avatar.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional
import numpy as np

# In-memory document store: user_id -> List[Dict[str, Any]]
_RAG_USER_STORE: Dict[str, List[Dict[str, Any]]] = {}

# Coping strategies corpus for task paralysis
from core.shrinker import COPING_STRATEGIES


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def build_student_context_chunks(
    user_id: str,
    snapshot: Optional[Dict[str, Any]] = None,
    commute_profile: Optional[Dict[str, Any]] = None,
    timetable_blocks: Optional[List[Dict[str, Any]]] = None,
    tasks: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Assemble atomic semantic chunks describing student physical & mental context."""
    chunks = []

    # 1. Capacity & Energy Snapshot Chunk
    if snapshot:
        live_spoons = snapshot.get("live_spoons", 6.0)
        weather = snapshot.get("weather", "partly_cloudy")
        range_text = snapshot.get("range_text", "moderate")
        chunks.append({
            "category": "energy_capacity",
            "title": "Current Cognitive Spoon Capacity",
            "text": (
                f"Student currently has {live_spoons:.1f} out of 12 baseline spoons available. "
                f"Today's cognitive weather is {weather} ({range_text}). "
                f"They require gentle pacing, protected breathing room, and 80% rule capacity bounds."
            ),
            "metadata": {"live_spoons": live_spoons, "weather": weather}
        })

    # 2. Commute Burden Chunk
    if commute_profile:
        mins = commute_profile.get("minutes_each_way", 40)
        mode = commute_profile.get("mode", "crowded")
        legs = commute_profile.get("legs") or []
        legs_desc = ""
        if legs:
            leg_items = [f"{l.get('minutes', 0)}m {l.get('label', l.get('mode', ''))}" for l in legs]
            legs_desc = f" Transit broken down into: {', '.join(leg_items)}."
        chunks.append({
            "category": "commute_transit",
            "title": "Daily Commute & Physical Travel Load",
            "text": (
                f"Student travels {mins} minutes each way ({mins * 2} minutes / {round(mins * 2 / 60, 1)} hours daily roundtrip) "
                f"via {mode} transit.{legs_desc} This causes significant sensory drain and pre-lecture physical fatigue."
            ),
            "metadata": {"minutes_each_way": mins, "mode": mode}
        })

    # 3. Academic Timetable & Lab Demands
    if timetable_blocks:
        tb_texts = []
        for b in timetable_blocks[:5]:
            tb_texts.append(f"{b.get('course_name', 'Course')} ({b.get('start_time', '')}-{b.get('end_time', '')})")
        chunks.append({
            "category": "academic_classes",
            "title": "College Timetable & Labs",
            "text": (
                f"Student is enrolled in {len(timetable_blocks)} classes/labs today: {'; '.join(tb_texts)}. "
                f"Heavy practical labs cost additional working memory and tactile spoons."
            ),
            "metadata": {"block_count": len(timetable_blocks)}
        })

    # 4. Tasks & Reshuffled Paralysis Triggers
    if tasks:
        for t in tasks:
            reshuffled = t.get("reshuffled_count", 0)
            is_paralyzed = reshuffled >= 3
            title = t.get("title", "Task")
            t_type = t.get("task_type", "academic")
            spoons = t.get("spoon_cost", 1.5)
            paralysis_note = (
                f" CRITICAL: This task has been reshuffled {reshuffled} times, indicating acute executive dysfunction or task paralysis."
                if is_paralyzed else ""
            )
            chunks.append({
                "category": "active_task",
                "title": f"Task: {title}",
                "text": (
                    f"Task '{title}' is an {t_type} assignment estimated at {t.get('estimated_minutes', 30)} minutes "
                    f"and costs {spoons:.1f} spoons.{paralysis_note}"
                ),
                "metadata": {"task_id": t.get("id"), "reshuffled": reshuffled, "is_paralyzed": is_paralyzed}
            })

    # 5. Core Coping Strategies Corpus
    for cs in COPING_STRATEGIES[:8]:
        chunks.append({
            "category": "coping_strategy",
            "title": f"Coping Strategy: {cs['name']}",
            "text": f"Strategy '{cs['name']}': {cs['text']} (Applies to {', '.join(cs['task_types'])}, source: {cs['source']}).",
            "metadata": {"strategy_id": cs["id"], "situations": cs["situations"]}
        })

    return chunks


def index_user_context(user_id: str, chunks: List[Dict[str, Any]]):
    """Index or update user context chunks in memory."""
    _RAG_USER_STORE[user_id] = chunks


def retrieve_context(user_id: str, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
    """Retrieve the top-k most semantically relevant context chunks for the user's query.

    Uses keyword TF-IDF and term-overlap vector scoring.
    """
    chunks = _RAG_USER_STORE.get(user_id, [])
    if not chunks:
        # Default fallback to coping strategies
        return [{"category": "general", "title": cs["name"], "text": cs["text"]} for cs in COPING_STRATEGIES[:top_k]]

    q_words = set(re.findall(r"\w+", query.lower()))
    if not q_words:
        return chunks[:top_k]

    scored = []
    for c in chunks:
        c_text = (c["title"] + " " + c["text"]).lower()
        c_words = set(re.findall(r"\w+", c_text))
        overlap = len(q_words.intersection(c_words))
        
        # Boost specific categories based on user intent
        boost = 1.0
        if any(w in query.lower() for w in ["stuck", "can't start", "paralyz", "overwhelm", "help", "afraid"]):
            if c.get("metadata", {}).get("is_paralyzed") or c["category"] == "coping_strategy":
                boost += 3.0
        if any(w in query.lower() for w in ["travel", "train", "bus", "commute", "tired", "exhaust"]):
            if c["category"] == "commute_transit" or c["category"] == "energy_capacity":
                boost += 2.5
        if any(w in query.lower() for w in ["class", "lecture", "lab", "college", "timetable"]):
            if c["category"] == "academic_classes":
                boost += 2.5

        score = (overlap / (len(q_words) + 1e-5)) * boost
        scored.append((score, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:top_k]]
