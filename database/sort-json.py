import json
import os
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: python sort_json.py <Level> (e.g., N4)")
        return

    level = sys.argv[1]
    file_path = f"../database/{level}.json"

    if not os.path.exists(file_path):
        print(f"Error: Could not find {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if level not in data:
        print(f"Error: Level '{level}' not found in the JSON data.")
        return

    kanji_list = data[level]

    # Sort the list of dictionaries by 'base_id' numerically
    try:
        kanji_list.sort(key=lambda x: int(x.get('base_id', 0)))
    except ValueError as e:
        print(f"Error parsing base_id: {e}")
        return

    data[level] = kanji_list

    # Save the perfectly sorted list back to the file
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    print(f"✅ Successfully sorted {len(kanji_list)} entries in {level}.json by base_id!")
    
    # Safely grab the highest ID from the bottom of the newly sorted list
    if kanji_list:
        highest_id = kanji_list[-1].get('base_id', 'Unknown')
        print(f"📈 The highest base_id in {level} is now: {highest_id}")
        
        try:
            next_start = int(highest_id) + 1
            print(f"🚀 When you run the downloader for your NEXT level, start at: {next_start}")
        except:
            pass

if __name__ == "__main__":
    main()