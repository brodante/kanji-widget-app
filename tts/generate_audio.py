import os
import json
import time
from gtts import gTTS

BASE_AUDIO_DIR = "audio"
INDEX_FILE = "audio_index.json"
VOCAB_FILE = "vocab.json"

def clean_text(text):
    """Removes okurigana dots and hyphens (e.g. 'た.べる' -> 'たべる') for perfect TTS pronunciation"""
    return text.replace('.', '').replace('-', '')

def download_tts(text, subfolder, filename):
    """Downloads the audio file into the specific subfolder if it doesn't already exist"""
    target_dir = os.path.join(BASE_AUDIO_DIR, subfolder)
    os.makedirs(target_dir, exist_ok=True)
    
    filepath = os.path.join(target_dir, filename)
    if os.path.exists(filepath):
        return True
    
    print(f"⬇️ Downloading: {subfolder}/{filename} -> '{text}'")
    try:
        tts = gTTS(text=text, lang='ja')
        tts.save(filepath)
        time.sleep(1) # Rest for 1 second so Google doesn't block us
        return True
    except Exception as e:
        print(f"❌ Failed to download '{text}': {e}")
        return False

def main():
    os.makedirs(BASE_AUDIO_DIR, exist_ok=True)

    # Load the exported JSON data
    with open(VOCAB_FILE, 'r', encoding='utf-8') as f:
        vocab_data = json.load(f)

    # Load existing index to maintain permanent IDs
    audio_index = {}
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            audio_index = json.load(f)

    # Calculate the next available base ID
    existing_ids = [int(data['base_id']) for data in audio_index.values()]
    next_id = max(existing_ids) + 1 if existing_ids else 1

    # You can easily add 'N4', 'N3' to this list in the future!
    categories = ['Hiragana', 'Katakana', 'N5']
    
    for category in categories:
        items = vocab_data.get(category, [])
        print(f"\n--- Processing {category} ({len(items)} items) ---")
        
        # Determine the dynamic folder structure
        if category in ['Hiragana', 'Katakana']:
            subfolder = category  # "Hiragana" or "Katakana"
        else:
            subfolder = f"Kanji/{category}" # "Kanji/N5", "Kanji/N4", etc.
        
        for item in items:
            char = item['character']
            
            # Setup the index entry for this character if it's new
            if char not in audio_index:
                audio_index[char] = {
                    "base_id": f"{next_id:06d}",
                    "character_audio": "",
                    "onyomi": {},
                    "kunyomi": {},
                    "examples": {}
                }
                next_id += 1
            
            base_id = audio_index[char]["base_id"]

            # 1. Base Character Audio (Mainly for Kana)
            if category in ['Hiragana', 'Katakana']:
                filename = f"{base_id}_0.mp3"
                if download_tts(char, subfolder, filename):
                    # Save the FULL relative path into the index
                    audio_index[char]["character_audio"] = f"{subfolder}/{filename}"

            # 2. Onyomi Readings
            for i, onyomi in enumerate(item.get('onyomi', []), 1):
                clean_on = clean_text(onyomi)
                filename = f"{base_id}_o{i}.mp3"
                if download_tts(clean_on, subfolder, filename):
                    audio_index[char]["onyomi"][onyomi] = f"{subfolder}/{filename}"

            # 3. Kunyomi Readings
            for i, kunyomi in enumerate(item.get('kunyomi', []), 1):
                clean_kun = clean_text(kunyomi)
                filename = f"{base_id}_k{i}.mp3"
                if download_tts(clean_kun, subfolder, filename):
                    audio_index[char]["kunyomi"][kunyomi] = f"{subfolder}/{filename}"

            # 4. Example Words
            for i, example in enumerate(item.get('examples', []), 1):
                word = example['word']
                reading = clean_text(example['reading']) 
                filename = f"{base_id}_{i}.mp3"
                if download_tts(reading, subfolder, filename):
                    audio_index[char]["examples"][word] = f"{subfolder}/{filename}"

            # Save the index continuously so we don't lose progress if it crashes
            with open(INDEX_FILE, 'w', encoding='utf-8') as f:
                json.dump(audio_index, f, ensure_ascii=False, indent=4)

    print("\n🎉 Audio generation complete! Directory structure created.")

if __name__ == "__main__":
    main()