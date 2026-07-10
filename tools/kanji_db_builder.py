import os
import json
import time
import requests
import sys

# We will build the DB starting from N5 and going up to N1
LEVELS = [5, 4, 3, 2, 1]  
OUTPUT_FILE = "complete_kanji_db.json"

def print_progress(iteration, total, prefix='', suffix='', decimals=1, length=50, fill='█'):
    """Displays a simple, clean progress bar."""
    percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {suffix}')
    sys.stdout.flush()
    if iteration == total:
        sys.stdout.write('\n')

def fetch_with_retry(url, retries=3):
    """Safely fetches data from the API and waits if we hit a rate limit."""
    for _ in range(retries):
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                time.sleep(5)
            else:
                return None
        except Exception:
            time.sleep(2)
    return None

def main():
    db = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            db = json.load(f)

    # First, flatten the workload to calculate total items for the progress bar
    tasks = []
    for level in LEVELS:
        level_key = f"N{level}"
        kanji_list = fetch_with_retry(f"https://kanjiapi.dev/v1/kanji/jlpt-{level}")
        if kanji_list:
            for char in kanji_list:
                tasks.append({'char': char, 'level': level_key})

    total_tasks = len(tasks)
    processed = 0
    start_time = time.time()

    print(f"Starting database build: {total_tasks} total Kanji to process.")

    for task in tasks:
        char = task['char']
        level_key = task['level']
        
        if level_key not in db:
            db[level_key] = []
        
        # Check if already processed
        if any(k['character'] == char for k in db[level_key]):
            processed += 1
            continue

        char_data = fetch_with_retry(f"https://kanjiapi.dev/v1/kanji/{char}")
        words_data = fetch_with_retry(f"https://kanjiapi.dev/v1/words/{char}")
        
        examples = []
        if words_data:
            valid_words = []
            for w in words_data:
                try:
                    written = w['variants'][0]['written']
                    if char in written and w['meanings'] and w['meanings'][0]['glosses']:
                        valid_words.append(w)
                except (IndexError, KeyError):
                    continue
            valid_words.sort(key=lambda x: len(x['variants'][0].get('priorities', [])), reverse=True)
            for w in valid_words[:3]:
                examples.append({
                    "word": w['variants'][0]['written'],
                    "reading": w['variants'][0].get('pronounced', ''),
                    "meaning": ", ".join(w['meanings'][0]['glosses'][:2])
                })

        kanji_entry = {
            "character": char,
            "meanings": char_data.get('meanings', ['JLPT Kanji']) if char_data else ['JLPT Kanji'],
            "onyomi": char_data.get('on_readings', []) if char_data else [],
            "kunyomi": char_data.get('kun_readings', []) if char_data else [],
            "jlpt": level_key,
            "examples": examples
        }
        
        db[level_key].append(kanji_entry)
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, indent=4)
        
        processed += 1
        elapsed = time.time() - start_time
        avg_time = elapsed / processed
        remaining = (total_tasks - processed) * avg_time
        
        m, s = divmod(int(remaining), 60)
        print_progress(processed, total_tasks, suffix=f"Complete. Est. remaining: {m}m {s}s")
        
        time.sleep(0.5)

    print("Master database build complete.")

if __name__ == "__main__":
    main()