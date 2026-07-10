import os
import json
import time
import sys
import threading
import concurrent.futures
from gtts import gTTS

# Thread lock to prevent database file corruption from concurrent writes
json_lock = threading.Lock()

def print_progress(iteration, total, current_item='', start_time=None, prefix='', suffix='', decimals=1, length=30, fill='█'):
    """Displays a clean progress bar with ETA and the current item being processed."""
    percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    
    # Calculate ETA
    eta_str = "--:--"
    if start_time and iteration > 0:
        elapsed = time.time() - start_time
        time_per_item = elapsed / iteration
        eta_seconds = time_per_item * (total - iteration)
        mins, secs = divmod(int(eta_seconds), 60)
        eta_str = f"{mins:02d}:{secs:02d}"
        
    # Format the current item to keep the terminal line clean
    item_str = f" | Last: {current_item}" if current_item else ""
    item_str = item_str.ljust(25) # Pad with spaces to overwrite previous longer names
    
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {suffix} | ETA: {eta_str}{item_str}')
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
        time.sleep(0.2) # Staggered break to prevent Google IP blocking
        return True
    except Exception as e:
        sys.stdout.write('\r' + ' ' * 100 + '\r') # Clear line
        print(f"Failed to download '{text}': {e}")
        return False

def process_download_task(task, json_path, data):
    """Worker function for individual audio downloads."""
    # Unpack the task variables, including the kanji character
    task_type, target_obj, key, text, full_path, rel_path, kanji_char = task
    
    if download_tts(text, full_path):
        # Safely lock the thread before mutating the dictionary and saving to disk
        with json_lock:
            if task_type == 'onyomi':
                target_obj['audio']['onyomi'][key] = rel_path
            elif task_type == 'kunyomi':
                target_obj['audio']['kunyomi'][key] = rel_path
            elif task_type == 'example':
                target_obj['audio'] = rel_path
            
            # Save progress immediately so we never lose data if interrupted
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
        return True
    return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python download_level.py <Level> (e.g., N3)")
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

    while True:
        try:
            start_id_str = input(f"Enter the starting base_id number for {level} (e.g., 338): ")
            next_id = int(start_id_str.strip())
            if next_id > 0:
                break
            else:
                print("Please enter a positive number.")
        except ValueError:
            print("Invalid input. Please enter numbers only.")

    print(f"Assigning sequential base_ids starting at ID: {next_id:06d}...")
    
    # 1. Synchronously assign IDs first to preserve flawless order sequence
    for item in items:
        if "base_id" not in item:
            item["base_id"] = f"{next_id:06d}"
            next_id += 1

    # 2. Flatten all entries into individual download tasks
    tasks = []
    for item in items:
        base_id = item["base_id"]
        kanji_char = item.get("character", "Unknown")
        
        if "audio" not in item:
            item["audio"] = {"onyomi": {}, "kunyomi": {}}

        for idx, onyomi in enumerate(item.get('onyomi', []), 1):
            clean_on = clean_text(onyomi)
            filename = f"{base_id}_o{idx}.mp3"
            tasks.append(('onyomi', item, onyomi, clean_on, os.path.join(audio_dir, filename), f"{relative_audio_path}/{filename}", kanji_char))

        for idx, kunyomi in enumerate(item.get('kunyomi', []), 1):
            clean_kun = clean_text(kunyomi)
            filename = f"{base_id}_k{idx}.mp3"
            tasks.append(('kunyomi', item, kunyomi, clean_kun, os.path.join(audio_dir, filename), f"{relative_audio_path}/{filename}", kanji_char))

        for idx, example in enumerate(item.get('examples', []), 1):
            word = example['word']
            reading = clean_text(example['reading'])
            filename = f"{base_id}_{idx}.mp3"
            tasks.append(('example', example, word, reading, os.path.join(audio_dir, filename), f"{relative_audio_path}/{filename}", kanji_char))

    total_tasks = len(tasks)
    print(f"Compiled {total_tasks} audio files to verify/download.")
    
    # 3. Process the tasks using a Thread Pool
    completed_tasks = 0
    start_time = time.time()
    print_progress(0, total_tasks, start_time=start_time, prefix='Progress:', suffix='Complete')

    # Keep max_workers between 3 and 5. Higher will trigger Google rate limits!
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        # Map the future to the original task so we know exactly which one just finished
        future_to_task = {executor.submit(process_download_task, task, json_path, data): task for task in tasks}
        
        for future in concurrent.futures.as_completed(future_to_task):
            task = future_to_task[future]
            
            kanji_char = task[6]  # The Japanese Character
            reading_text = task[3] # The specific reading or word downloaded
            display_text = f"{kanji_char} ({reading_text})"
            
            completed_tasks += 1
            print_progress(completed_tasks, total_tasks, current_item=display_text, start_time=start_time, prefix='Progress:', suffix='Complete')

    print(f"\n✅ Finished processing {level}. Database updated directly and thread-safely.")

if __name__ == "__main__":
    main()