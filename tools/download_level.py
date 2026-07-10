import os
import json
import time
import sys
from gtts import gTTS

def print_progress(iteration, total, prefix='', suffix='', decimals=1, length=40, fill='█'):
    """Displays a clean progress bar."""
    percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {suffix}')
    sys.stdout.flush()
    if iteration == total:
        sys.stdout.write('\n')

def clean_text(text):
    return text.replace('.', '').replace('-', '')

def download_tts(text, filepath):
    if os.path.exists(filepath):
        return True
    try:
        tts = gTTS(text=text, lang='ja')
        tts.save(filepath)
        time.sleep(1) # Prevent IP blocking
        return True
    except Exception as e:
        sys.stdout.write('\r' + ' ' * 80 + '\r')
        print(f"Failed to download '{text}': {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python download_level.py <Level> (e.g., N4)")
        return

    level = sys.argv[1]
    json_path = f"../database/{level}.json"
    audio_dir = f"../assets/audio/Kanji/{level}"
    relative_audio_path = f"Kanji/{level}"
    
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return

    os.makedirs(audio_dir, exist_ok=True)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    items = data.get(level, [])
    total_items = len(items)

    if total_items == 0:
        print(f"No items found for {level}.")
        return

    # Prompt the user for the starting ID
    while True:
        try:
            start_id_str = input(f"Enter the starting base_id number for {level} (e.g., 205): ")
            next_id = int(start_id_str.strip())
            if next_id > 0:
                break
            else:
                print("Please enter a positive number.")
        except ValueError:
            print("Invalid input. Please enter numbers only.")

    print(f"Starting at ID: {next_id:06d}")
    print(f"Starting audio download for {total_items} {level} kanji.")
    print_progress(0, total_items, prefix='Progress:', suffix='Complete')

    for index, item in enumerate(items, 1):
        # Assign base_id permanently to the JSON object if it doesn't have one
        if "base_id" not in item:
            item["base_id"] = f"{next_id:06d}"
            next_id += 1
            
        base_id = item["base_id"]

        if "audio" not in item:
            item["audio"] = {"onyomi": {}, "kunyomi": {}}

        # 1. Onyomi Readings
        for onyomi in item.get('onyomi', []):
            clean_on = clean_text(onyomi)
            idx = item['onyomi'].index(onyomi) + 1
            filename = f"{base_id}_o{idx}.mp3"
            
            if download_tts(clean_on, os.path.join(audio_dir, filename)):
                item['audio']['onyomi'][onyomi] = f"{relative_audio_path}/{filename}"

        # 2. Kunyomi Readings
        for kunyomi in item.get('kunyomi', []):
            clean_kun = clean_text(kunyomi)
            idx = item['kunyomi'].index(kunyomi) + 1
            filename = f"{base_id}_k{idx}.mp3"
            
            if download_tts(clean_kun, os.path.join(audio_dir, filename)):
                item['audio']['kunyomi'][kunyomi] = f"{relative_audio_path}/{filename}"

        # 3. Example Words
        for idx, example in enumerate(item.get('examples', []), 1):
            word = example['word']
            reading = clean_text(example['reading'])
            filename = f"{base_id}_{idx}.mp3"
            
            if download_tts(reading, os.path.join(audio_dir, filename)):
                example['audio'] = f"{relative_audio_path}/{filename}"

        # Save JSON on every loop so you never lose progress
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
            
        print_progress(index, total_items, prefix='Progress:', suffix='Complete')

    print(f"\nFinished {level}. Database updated directly.")

if __name__ == "__main__":
    main()