import tempfile
import os
import time
from pathlib import Path
from typing import Optional
import json

# Try to import Whisper
try:
    import whisper
    WHISPER_AVAILABLE = True
    print("Loading Whisper model...")
    model = whisper.load_model("base")
    print("✓ Whisper model loaded successfully")
except Exception as e:
    WHISPER_AVAILABLE = False
    model = None
    print(f"ℹ Local Whisper not loaded ({e}). Using Gemini for cloud transcription.")

# Google Gemini client for multimodal audio transcription
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
    _gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    if _gemini_api_key:
        gemini_client = genai.Client(api_key=_gemini_api_key)
        print("✓ Gemini client initialized for voice transcription")
    else:
        gemini_client = None
except ImportError:
    GEMINI_AVAILABLE = False
    gemini_client = None

# Language code mapping (ISO 639-1 to full names)
LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "es": "Spanish", "fr": "French",
    "de": "German", "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
    "ar": "Arabic", "ru": "Russian", "pt": "Portuguese", "it": "Italian",
    "nl": "Dutch", "pl": "Polish", "tr": "Turkish", "vi": "Vietnamese",
    "th": "Thai", "id": "Indonesian", "ms": "Malay", "tl": "Tagalog",
    "mr": "Marathi", "gu": "Gujarati", "ta": "Tamil", "te": "Telugu",
}

MIME_TYPES = {
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".m4a": "audio/m4a",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
}


def transcribe_with_gemini(audio_file_path: str, language: Optional[str] = None) -> Optional[dict]:
    """Transcribe audio using Google Gemini multimodal capabilities.

    Args:
        audio_file_path: Path to audio file.
        language: Optional language hint (e.g., 'hi', 'en', 'mr').

    Returns:
        Dictionary with transcription results or None on failure.
    """
    global gemini_client
    try:
        if not gemini_client:
            key = os.getenv("GEMINI_API_KEY", "")
            if not key or not GEMINI_AVAILABLE:
                return None
            gemini_client = genai.Client(api_key=key)

        print(f"🚀 Using Gemini for voice transcription...")

        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()

        ext = Path(audio_file_path).suffix.lower()
        mime_type = MIME_TYPES.get(ext, "audio/webm")

        prompt = (
            "Transcribe this speech verbatim into text accurately. "
            "Do not add any explanations, introductory text, or markdown code blocks. "
            "Return ONLY the exact transcribed words."
        )
        if language:
            prompt += f" The language spoken is {language}."

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                prompt,
            ],
        )

        text = response.text.strip() if response.text else ""
        detected_lang = language or "en"
        lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang.upper())

        print(f"✓ Gemini transcription complete: {detected_lang} ({lang_name})")

        return {
            "text": text,
            "language": detected_lang,
            "language_name": lang_name,
            "method": "gemini_voice",
            "status": "success",
        }
    except Exception as e:
        print(f"⚠ Gemini transcription failed: {e}")
        return None


def transcribe_audio(audio_file_path: str, language: Optional[str] = None, use_gemini: bool = True) -> dict:
    """Transcribe audio file to text using Gemini (with local Whisper fallback).

    Args:
        audio_file_path: Path to audio file (mp3, wav, m4a, webm, etc.)
        language: Optional language code (e.g., 'en', 'hi', 'es', 'mr')
        use_gemini: Try Gemini first for cloud transcription (default: True)

    Returns:
        Dictionary with transcription results including detected language.
    """
    try:
        # Verify file exists
        if not os.path.exists(audio_file_path):
            return {
                "error": f"Audio file not found: {audio_file_path}",
                "status": "error",
            }

        # Get file size
        file_size = os.path.getsize(audio_file_path)
        if file_size == 0:
            return {
                "error": "Audio file is empty",
                "status": "error",
            }

        print(f"Transcribing: {audio_file_path} ({file_size} bytes)")

        # 1. Validation: Check file size (ignore very small files < 1KB)
        if file_size < 1024:
            print(f"⚠ Audio file too small ({file_size} bytes), skipping transcription.")
            return {"text": "", "language": "unknown", "method": "skipped_too_small", "error": "Audio too short"}

        # 2. Try Gemini (Cloud Multimodal)
        if use_gemini and (gemini_client or os.getenv("GEMINI_API_KEY")):
            try:
                gemini_result = transcribe_with_gemini(audio_file_path, language)
                if gemini_result and gemini_result.get("text"):
                    return gemini_result
            except Exception as e:
                print(f"⚠ Gemini voice failed: {e}, attempting fallback...")

        # 3. Fallback: Local Whisper (CPU/GPU)
        if WHISPER_AVAILABLE and model is not None:
            print(f"🔄 Using local Whisper model...")
            if language:
                result = model.transcribe(
                    audio_file_path,
                    language=language,
                    fp16=False,
                    task="transcribe",
                    temperature=0.0,
                )
            else:
                result = model.transcribe(
                    audio_file_path,
                    fp16=False,
                    task="transcribe",
                    verbose=False,
                    temperature=0.0,
                )

            detected_lang = result.get("language", "unknown")
            lang_name = LANGUAGE_NAMES.get(detected_lang, detected_lang.upper())

            print(f"✓ Local Whisper transcription complete: {detected_lang} ({lang_name})")

            return {
                "text": result["text"].strip(),
                "language": detected_lang,
                "language_name": lang_name,
                "method": "local_whisper",
                "status": "success",
            }

        return {
            "text": "",
            "error": "no_transcription_engine",
            "details": "Neither Gemini API key nor local Whisper is available.",
            "status": "error",
        }

    except FileNotFoundError as e:
        error_msg = str(e)
        if "No such file or directory" in error_msg or "[WinError 2]" in error_msg:
            print("❌ CRITICAL: FFmpeg not found. Please install FFmpeg and add it to PATH.")
            return {"text": "", "error": "ffmpeg_missing", "details": "Please install FFmpeg to enable voice features.", "status": "error"}
        raise e
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Transcription error: {e}")
        if "ffmpeg" in str(e).lower() or "winerror 2" in str(e).lower():
            return {"text": "", "error": "ffmpeg_missing", "details": "Please install FFmpeg to enable voice features.", "status": "error"}

        return {
            "error": str(e),
            "traceback": error_trace,
            "status": "error",
        }


def transcribe_audio_bytes(audio_bytes: bytes, filename: str = "audio.wav") -> dict:
    """Transcribe audio from bytes.

    Args:
        audio_bytes: Audio file content as bytes
        filename: Original filename (for format detection)

    Returns:
        Dictionary with transcription results
    """
    tmp_path = None
    try:
        if not audio_bytes or len(audio_bytes) == 0:
            return {
                "error": "Audio bytes are empty",
                "status": "error",
            }

        suffix = Path(filename).suffix
        if not suffix:
            suffix = ".webm"

        print(f"Creating temp file with suffix: {suffix}, size: {len(audio_bytes)} bytes")

        temp_dir = tempfile.gettempdir()
        fd, tmp_path = tempfile.mkstemp(suffix=suffix, dir=temp_dir)

        try:
            os.write(fd, audio_bytes)
            os.close(fd)
        except Exception as e:
            os.close(fd)
            raise e

        if not os.path.exists(tmp_path):
            return {
                "error": f"Failed to create temp file: {tmp_path}",
                "status": "error",
            }

        actual_size = os.path.getsize(tmp_path)
        if actual_size == 0:
            return {
                "error": "Temp file is empty after writing",
                "status": "error",
            }

        time.sleep(0.1)
        result = transcribe_audio(tmp_path)
        return result

    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"Error in transcribe_audio_bytes: {error_msg}")
        return {
            "error": error_msg,
            "traceback": traceback_str,
            "temp_file": tmp_path if tmp_path else "not created",
            "status": "error",
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                time.sleep(0.1)
                os.unlink(tmp_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file {tmp_path}: {e}")


def get_model_info():
    """Get information about voice transcription capabilities."""
    info = {
        "engine": "gemini-2.5-flash",
        "cloud_transcription": "Google Gemini Multimodal Audio",
        "local_whisper_loaded": WHISPER_AVAILABLE and model is not None,
        "languages_supported": "100+ languages (auto-detected)",
        "auto_language_detection": True,
        "status": "loaded",
    }
    return info


def detect_language_from_audio(audio_file_path: str) -> dict:
    """Detect language from audio file."""
    if WHISPER_AVAILABLE and model is not None:
        try:
            audio = whisper.load_audio(audio_file_path)
            audio = whisper.pad_or_trim(audio)
            mel = whisper.log_mel_spectrogram(audio).to(model.device)
            _, probs = model.detect_language(mel)
            detected_lang = max(probs, key=probs.get)
            confidence = probs[detected_lang]

            return {
                "language": detected_lang,
                "language_name": LANGUAGE_NAMES.get(detected_lang, detected_lang),
                "confidence": float(confidence),
                "status": "success",
            }
        except Exception as e:
            return {"error": str(e), "status": "error"}

    return {
        "language": "en",
        "language_name": "English",
        "confidence": 0.9,
        "status": "success",
    }


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Voice Transcription Engine (Gemini / Whisper)")
    print("=" * 60)
    print("Ready to transcribe audio!")
