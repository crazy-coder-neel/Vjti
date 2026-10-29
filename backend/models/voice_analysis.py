import pickle
import os
import numpy as np

# Get the directory where this file is located
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

# Load the saved model and tokenizer (artifacts subfolder)
MODEL_PATH = os.path.join(MODEL_DIR, "artifacts", "model.pkl")
TOKENIZER_PATH = os.path.join(MODEL_DIR, "artifacts", "tokenizer.pkl")

# Initialize model and tokenizer as None
voice_model = None
voice_tokenizer = None
is_transformers_model = False

def load_models():
    """Load the voice analysis model and tokenizer"""
    global voice_model, voice_tokenizer, is_transformers_model
    
    if not os.path.exists(MODEL_PATH) or not os.path.exists(TOKENIZER_PATH):
        return False

    try:
        with open(MODEL_PATH, 'rb') as f:
            voice_model = pickle.load(f)
        print("✓ Voice analysis model loaded successfully")
        
        # Check if it's a transformers model
        model_type = str(type(voice_model).__name__)
        if 'transformers' in str(type(voice_model).__module__).lower() or 'ForSequenceClassification' in model_type:
            is_transformers_model = True
            import torch
            print("  Model type: Hugging Face Transformers")
        else:
            is_transformers_model = False
            print(f"  Model type: {model_type}")
        
        with open(TOKENIZER_PATH, 'rb') as f:
            voice_tokenizer = pickle.load(f)
        print("✓ Voice tokenizer loaded successfully")
        
        return True
    except Exception as e:
        # print(f"❌ Error loading voice analysis models: {str(e)}")
        return False

def voice_predict(features):
    """
    Predict voice analysis results
    
    Args:
        features: Dictionary, list of numbers, or text string
                 For transformers: text string or dict with 'text' key
                 For sklearn: list/array of numeric features
    
    Returns:
        Dictionary with prediction results
    """
    global voice_model, voice_tokenizer, is_transformers_model
    
    # Load models if not already loaded
    if voice_model is None or voice_tokenizer is None:
        if not load_models():
            return {
                "error": "Failed to load voice analysis models",
                "status": "error"
            }
    
    try:
        # Handle transformers models
        if is_transformers_model:
            import torch
            
            # Extract text from features
            if isinstance(features, dict):
                text = features.get('text', '')
            elif isinstance(features, str):
                text = features
            else:
                # If numeric features provided, convert to dummy text for demonstration
                text = f"Sample feature vector with mean: {np.mean(features):.3f}"
            
            if not text:
                return {
                    "error": "Text is required for transformers model",
                    "status": "error"
                }
            
            # Tokenize and predict
            inputs = voice_tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
            
            with torch.no_grad():
                outputs = voice_model(**inputs)
            
            # Get probabilities
            probs = torch.sigmoid(outputs.logits).squeeze().tolist()
            
            # If single value, convert to list
            if not isinstance(probs, list):
                probs = [probs]
            
            categories = ["Depression", "Anxiety", "Stress"]
            
            result = {
                "prediction": {cat: float(prob) for cat, prob in zip(categories[:len(probs)], probs)},
                "status": "success",
                "model_type": "HuggingFace Transformers",
                "input_type": "text"
            }
            
            return result
        
        # Handle sklearn/traditional ML models
        else:
            # If features is a dictionary, extract values and flatten
            if isinstance(features, dict):
                feature_array = []
                for key in sorted(features.keys()):
                    value = features[key]
                    if isinstance(value, (list, np.ndarray)):
                        feature_array.extend(value)
                    else:
                        feature_array.append(value)
                features = feature_array
            
            # Convert to numpy array and reshape if needed
            features_array = np.array(features).reshape(1, -1)
            
            # Apply tokenizer/preprocessing if available
            if voice_tokenizer is not None and hasattr(voice_tokenizer, 'transform'):
                try:
                    features_array = voice_tokenizer.transform(features_array)
                except:
                    pass
            
            # Make prediction
            prediction = voice_model.predict(features_array)
            
            # Get probability if available
            probability = None
            if hasattr(voice_model, 'predict_proba'):
                proba = voice_model.predict_proba(features_array)
                probability = proba[0].tolist()
            
            result = {
                "prediction": prediction[0] if hasattr(prediction[0], 'item') else int(prediction[0]),
                "status": "success",
                "model_type": str(type(voice_model).__name__),
                "input_type": "numeric_features"
            }
            
            if probability is not None:
                result["probabilities"] = probability
                result["confidence"] = float(max(probability))
            
            return result
        
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "status": "error"
        }

def get_model_info():
    """Get information about the loaded model"""
    global voice_model, voice_tokenizer, is_transformers_model
    
    if voice_model is None:
        load_models()
    
    info = {
        "model_loaded": voice_model is not None,
        "tokenizer_loaded": voice_tokenizer is not None,
        "model_type": str(type(voice_model).__name__) if voice_model else None,
        "tokenizer_type": str(type(voice_tokenizer).__name__) if voice_tokenizer else None,
        "is_transformers": is_transformers_model
    }
    
    # Try to get additional model info
    if voice_model is not None:
        if hasattr(voice_model, 'n_features_in_'):
            info["n_features"] = voice_model.n_features_in_
        if hasattr(voice_model, 'classes_'):
            info["classes"] = voice_model.classes_.tolist()
        if hasattr(voice_model, 'config'):
            info["config"] = {
                "num_labels": getattr(voice_model.config, 'num_labels', None),
                "model_type": getattr(voice_model.config, 'model_type', None)
            }
    
    return info

# Try to load models on import
load_models()
