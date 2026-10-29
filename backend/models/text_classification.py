import re
import logging

logger = logging.getLogger("text_classification")

# ------------------------
# Remote model (Hugging Face) with graceful fallback
# ------------------------
TRANSFORMERS_AVAILABLE = False
model = None
tokenizer = None

try:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    import torch
    remote_repo = "GehrmanSparrow1711/clinical_roberta"
    model = AutoModelForSequenceClassification.from_pretrained(remote_repo)
    tokenizer = AutoTokenizer.from_pretrained(remote_repo)
    TRANSFORMERS_AVAILABLE = True
    print("✓ Clinical RoBERTa model loaded successfully")
except Exception as e:
    TRANSFORMERS_AVAILABLE = False
    model = None
    tokenizer = None
    print(f"ℹ Transformers/Torch model not loaded: {e}. Using heuristic fallback.")


# ------------------------
# Prediction function
# ------------------------
def is_english(text):
    return bool(re.match(r'^[\x00-\x7F\s]+$', text))


def clinical_predict(text):
    """
    Predict depression, anxiety, and stress probabilities (0.0 to 1.0).
    Uses fine-tuned transformer if available, otherwise heuristic keyword model.
    """
    source = "multilingual_model" if not is_english(text) else "local_model"

    if TRANSFORMERS_AVAILABLE and model is not None and tokenizer is not None:
        try:
            import torch
            inputs = tokenizer(text, return_tensors="pt")
            with torch.no_grad():
                outputs = model(**inputs)
            probs = torch.sigmoid(outputs.logits).squeeze().tolist()
            categories = ["Depression", "Anxiety", "Stress"]
            result = {cat: float(prob) for cat, prob in zip(categories, probs)}
            result["source"] = source
            return result
        except Exception as e:
            logger.warning(f"Error in transformer inference: {e}; using fallback.")

    # Heuristic fallback for offline/development environments
    lower = text.lower()
    dep_score = 0.2
    anx_score = 0.2
    stress_score = 0.2

    if any(k in lower for k in ["hopeless", "sad", "empty", "tired", "worthless", "depressed"]):
        dep_score += 0.4
    if any(k in lower for k in ["worried", "panic", "anxious", "nervous", "fear", "scared"]):
        anx_score += 0.45
    if any(k in lower for k in ["overwhelmed", "exam", "deadline", "busy", "pressure", "stressed"]):
        stress_score += 0.5

    return {
        "Depression": min(1.0, dep_score),
        "Anxiety": min(1.0, anx_score),
        "Stress": min(1.0, stress_score),
        "source": "heuristic_fallback"
    }


if __name__ == "__main__":
    text_en = "I feel very tired and anxious today."
    text_hi = "मुझे बहुत थकान हो रही है"
    print(clinical_predict(text_en))
    print(clinical_predict(text_hi))
