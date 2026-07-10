import json
import os

def merge_index():
    index_path = "../assets/audio_index.json"
    if not os.path.exists(index_path):
        print(f"Error: Could not find {index_path}")
        return

    with open(index_path, 'r', encoding='utf-8') as f:
        index_data = json.load(f)

    db_dir = "../database"
    if not os.path.exists(db_dir):
        print(f"Error: Could not find {db_dir}")
        return

    # Loop through every JSON file in the database folder
    for filename in os.listdir(db_dir):
        if not filename.endswith(".json") or filename == "complete_kanji_db.json":
            continue

        filepath = os.path.join(db_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            try:
                db = json.load(f)
            except json.JSONDecodeError:
                continue

        level = filename.replace('.json', '')
        items = db.get(level, [])
        if not items:
            continue

        updated = False
        for item in items:
            char = item['character']
            
            # If the character is in the old index, copy the audio paths over
            if char in index_data:
                audio_info = index_data[char]
                
                if "audio" not in item:
                    item["audio"] = {"onyomi": {}, "kunyomi": {}}
                    
                item["base_id"] = audio_info.get("base_id", "")

                # 1. Base Audio (For Kana)
                if "character_audio" in audio_info and audio_info["character_audio"]:
                    item["character_audio"] = audio_info["character_audio"]

                # 2. Onyomi
                for on in item.get('onyomi', []):
                    if on in audio_info.get('onyomi', {}):
                        item['audio']['onyomi'][on] = audio_info['onyomi'][on]

                # 3. Kunyomi
                for kun in item.get('kunyomi', []):
                    if kun in audio_info.get('kunyomi', {}):
                        item['audio']['kunyomi'][kun] = audio_info['kunyomi'][kun]

                # 4. Examples
                for ex in item.get('examples', []):
                    word = ex['word']
                    if word in audio_info.get('examples', {}):
                        ex['audio'] = audio_info['examples'][word]

                updated = True

        # Save the updated file
        if updated:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(db, f, ensure_ascii=False, indent=4)
            print(f"✅ Successfully injected audio paths into {filename}")

if __name__ == "__main__":
    merge_index()