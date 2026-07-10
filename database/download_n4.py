import os
import json
import time
import sys
from gtts import gTTS

# Configure level and file targets
LEVEL = "N4"
VOCAB_FILE = f"{LEVEL}.json"
# Points exactly 3 folders up to reach the master index in the 'tts' folder
INDEX_FILE = "../../../audio_index.json" 

def print_progress(iteration, total, prefix='', suffix='', decimals=1, length=40, fill='█'):
    """Displays a clean progress bar in the terminal."""
    percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {suffix}')
    sys.stdout.flush()
    if iteration == total:
        sys.stdout.write('\n')

def clean_text(text):
    """Removes okurigana dots and hyphens."""
    return text.replace('.', '').replace('-', '')

def download_tts(text, filename):
    """Downloads the audio file into the current directory."""
    if os.path.exists(filename):
        return True
    
    try:
        tts = gTTS(text=text, lang='ja')
        tts.save(filename)
        time.sleep(1) # Wait to prevent Google from rate-limiting the IP
        return True
    except Exception as e:
        # Erase the progress bar line temporarily to print the error cleanly
        sys.stdout.write('\r' + ' ' * 80 + '\r')
        print(f"Failed to download '{text}': {e}")
        return False

def main():
    if not os.path.exists(VOCAB_FILE):
        print(f"Error: {VOCAB_FILE} not found in the current directory.")
        return

    with open(VOCAB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    items = data.get(LEVEL, [])
    if not items:
        print(f"No items found for {LEVEL} in the JSON file.")
        return

    audio_index = {}
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            audio_index = json.load(f)

    # Resume ID counting from the master index
    existing_ids = [int(entry['base_id']) for entry in audio_index.values() if 'base_id' in entry]
    next_id = max(existing_ids) + 1 if existing_ids else 1

    total_items = len(items)
    print(f"Starting audio download for {total_items} {LEVEL} kanji.")
    print_progress(0, total_items, prefix='Progress:', suffix='Complete')

    for index, item in enumerate(items, 1):
        char = item['character']
        
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
        
        # This is the string path that will be written into the JSON index
        index_folder_path = f"Kanji/{LEVEL}"

        # 1. Onyomi Readings
        for i, onyomi in enumerate(item.get('onyomi', []), 1):
            clean_on = clean_text(onyomi)
            filename = f"{base_id}_o{i}.mp3"
            if download_tts(clean_on, filename):
                audio_index[char]["onyomi"][onyomi] = f"{index_folder_path}/{filename}"

        # 2. Kunyomi Readings
        for i, kunyomi in enumerate(item.get('kunyomi', []), 1):
            clean_kun = clean_text(kunyomi)
            filename = f"{base_id}_k{i}.mp3"
            if download_tts(clean_kun, filename):
                audio_index[char]["kunyomi"][kunyomi] = f"{index_folder_path}/{filename}"

        # 3. Example Words
        for i, example in enumerate(item.get('examples', []), 1):
            word = example['word']
            reading = clean_text(example['reading'])
            filename = f"{base_id}_{i}.mp3"
            if download_tts(reading, filename):
                audio_index[char]["examples"][word] = f"{index_folder_path}/{filename}"

        # Continuously save the master index to prevent data loss
        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            json.dump(audio_index, f, ensure_ascii=False, indent=4)
            
        print_progress(index, total_items, prefix='Progress:', suffix='Complete')

    print(f"Finished downloading audio for {LEVEL}. The master index has been updated.")

if __name__ == "__main__":
    main()