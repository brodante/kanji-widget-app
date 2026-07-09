class KanjiData {
    static cache = new Map();
    static baseUrl = 'https://jisho.org/api/v1/search/words';
    static wanikaniUrl = 'https://api.wanikani.com/v2/subjects';
    static kanjiApiUrl = 'https://kanjiapi.dev/v1/kanji';
    static tatoebaUrl = 'https://tatoeba.org/en/api_v0/search';
    
    // Comprehensive JLPT kanji data based on official study lists
    static fallbackData = {
        'N5': [
            // Top 80 N5 Kanji (frequency-ordered)
            {
                character: '日',
                meanings: ['day', 'sun', 'Japan'],
                onyomi: ['ニチ', 'ジツ'],
                kunyomi: ['ひ', 'び', 'か'],
                jlpt: 'N5',
                examples: [
                    { word: '今日', reading: 'きょう', meaning: 'today' },
                    { word: '日本', reading: 'にほん', meaning: 'Japan' },
                    { word: '毎日', reading: 'まいにち', meaning: 'every day' }
                ]
            },
            {
                character: '一',
                meanings: ['one'],
                onyomi: ['イチ'],
                kunyomi: ['ひと.'],
                jlpt: 'N5',
                examples: [
                    { word: '一つ', reading: 'ひとつ', meaning: 'one (thing)' },
                    { word: '一番', reading: 'いちばん', meaning: 'first, most' },
                    { word: '一人', reading: 'ひとり', meaning: 'one person' }
                ]
            },
            {
                character: '国',
                meanings: ['country'],
                onyomi: ['コク'],
                kunyomi: ['くに'],
                jlpt: 'N5',
                examples: [
                    { word: '国', reading: 'くに', meaning: 'country' },
                    { word: '外国', reading: 'がいこく', meaning: 'foreign country' },
                    { word: '中国', reading: 'ちゅうごく', meaning: 'China' }
                ]
            },
            {
                character: '人',
                meanings: ['person', 'human'],
                onyomi: ['ジン', 'ニン'],
                kunyomi: ['ひと'],
                jlpt: 'N5',
                examples: [
                    { word: '人間', reading: 'にんげん', meaning: 'human being' },
                    { word: '日本人', reading: 'にほんじん', meaning: 'Japanese person' },
                    { word: '一人', reading: 'ひとり', meaning: 'one person' }
                ]
            },
            {
                character: '年',
                meanings: ['year'],
                onyomi: ['ネン'],
                kunyomi: ['とし'],
                jlpt: 'N5',
                examples: [
                    { word: '来年', reading: 'らいねん', meaning: 'next year' },
                    { word: '今年', reading: 'ことし', meaning: 'this year' },
                    { word: '去年', reading: 'きょねん', meaning: 'last year' }
                ]
            },
            {
                character: '大',
                meanings: ['large', 'big'],
                onyomi: ['ダイ', 'タイ'],
                kunyomi: ['おお.', 'おおきい'],
                jlpt: 'N5',
                examples: [
                    { word: '大きい', reading: 'おおきい', meaning: 'big' },
                    { word: '大学', reading: 'だいがく', meaning: 'university' },
                    { word: '大丈夫', reading: 'だいじょうぶ', meaning: 'okay, all right' }
                ]
            },
            {
                character: '十',
                meanings: ['ten'],
                onyomi: ['ジュウ'],
                kunyomi: ['とお', 'と'],
                jlpt: 'N5',
                examples: [
                    { word: '十', reading: 'じゅう', meaning: 'ten' },
                    { word: '十分', reading: 'じゅうぶん', meaning: 'enough' },
                    { word: '二十', reading: 'にじゅう', meaning: 'twenty' }
                ]
            },
            {
                character: '二',
                meanings: ['two'],
                onyomi: ['ニ', 'ジ'],
                kunyomi: ['ふた.'],
                jlpt: 'N5',
                examples: [
                    { word: '二つ', reading: 'ふたつ', meaning: 'two (things)' },
                    { word: '二人', reading: 'ふたり', meaning: 'two people' },
                    { word: '二十', reading: 'にじゅう', meaning: 'twenty' }
                ]
            },
            {
                character: '本',
                meanings: ['book', 'origin', 'main'],
                onyomi: ['ホン'],
                kunyomi: ['もと'],
                jlpt: 'N5',
                examples: [
                    { word: '本', reading: 'ほん', meaning: 'book' },
                    { word: '日本', reading: 'にほん', meaning: 'Japan' },
                    { word: '本当', reading: 'ほんとう', meaning: 'really, truly' }
                ]
            },
            {
                character: '中',
                meanings: ['inside', 'middle', 'center'],
                onyomi: ['チュウ'],
                kunyomi: ['なか', 'うち'],
                jlpt: 'N5',
                examples: [
                    { word: '中', reading: 'なか', meaning: 'inside' },
                    { word: '中国', reading: 'ちゅうごく', meaning: 'China' },
                    { word: '中学校', reading: 'ちゅうがっこう', meaning: 'middle school' }
                ]
            },
            {
                character: '長',
                meanings: ['long', 'leader', 'senior'],
                onyomi: ['チョウ'],
                kunyomi: ['なが.い', 'おさ'],
                jlpt: 'N5',
                examples: [
                    { word: '長い', reading: 'ながい', meaning: 'long' },
                    { word: '校長', reading: 'こうちょう', meaning: 'principal' },
                    { word: '社長', reading: 'しゃちょう', meaning: 'company president' }
                ]
            },
            {
                character: '出',
                meanings: ['exit', 'leave', 'go out'],
                onyomi: ['シュツ', 'スイ'],
                kunyomi: ['で.る', 'だ.す', 'い.でる'],
                jlpt: 'N5',
                examples: [
                    { word: '出る', reading: 'でる', meaning: 'to go out' },
                    { word: '出口', reading: 'でぐち', meaning: 'exit' },
                    { word: '出す', reading: 'だす', meaning: 'to take out' }
                ]
            },
            {
                character: '三',
                meanings: ['three'],
                onyomi: ['サン'],
                kunyomi: ['み', 'み.つ'],
                jlpt: 'N5',
                examples: [
                    { word: '三つ', reading: 'みっつ', meaning: 'three (things)' },
                    { word: '三人', reading: 'さんにん', meaning: 'three people' },
                    { word: '三時', reading: 'さんじ', meaning: 'three o\'clock' }
                ]
            },
            {
                character: '時',
                meanings: ['time', 'hour'],
                onyomi: ['ジ'],
                kunyomi: ['とき', '-どき'],
                jlpt: 'N5',
                examples: [
                    { word: '時間', reading: 'じかん', meaning: 'time' },
                    { word: '何時', reading: 'なんじ', meaning: 'what time' },
                    { word: '時々', reading: 'ときどき', meaning: 'sometimes' }
                ]
            },
            {
                character: '行',
                meanings: ['go', 'conduct', 'line'],
                onyomi: ['コウ', 'ギョウ'],
                kunyomi: ['い.く', 'ゆ.く', 'おこな.う'],
                jlpt: 'N5',
                examples: [
                    { word: '行く', reading: 'いく', meaning: 'to go' },
                    { word: '銀行', reading: 'ぎんこう', meaning: 'bank' },
                    { word: '旅行', reading: 'りょこう', meaning: 'travel' }
                ]
            },
            {
                character: '見',
                meanings: ['see', 'look', 'watch'],
                onyomi: ['ケン'],
                kunyomi: ['み.る', 'み.せる', 'み.える'],
                jlpt: 'N5',
                examples: [
                    { word: '見る', reading: 'みる', meaning: 'to see' },
                    { word: '意見', reading: 'いけん', meaning: 'opinion' },
                    { word: '見せる', reading: 'みせる', meaning: 'to show' }
                ]
            },
            {
                character: '月',
                meanings: ['month', 'moon'],
                onyomi: ['ゲツ', 'ガツ'],
                kunyomi: ['つき'],
                jlpt: 'N5',
                examples: [
                    { word: '月', reading: 'つき', meaning: 'moon' },
                    { word: '今月', reading: 'こんげつ', meaning: 'this month' },
                    { word: '来月', reading: 'らいげつ', meaning: 'next month' }
                ]
            },
            {
                character: '分',
                meanings: ['minute', 'part', 'understand'],
                onyomi: ['ブン', 'フン', 'ブ'],
                kunyomi: ['わ.かる', 'わ.ける', 'わ.かれる'],
                jlpt: 'N5',
                examples: [
                    { word: '分かる', reading: 'わかる', meaning: 'to understand' },
                    { word: '十分', reading: 'じゅっぷん', meaning: 'ten minutes' },
                    { word: '自分', reading: 'じぶん', meaning: 'oneself' }
                ]
            },
            {
                character: '後',
                meanings: ['behind', 'after', 'later'],
                onyomi: ['ゴ', 'コウ'],
                kunyomi: ['のち', 'うし.ろ', 'あと', 'おく.れる'],
                jlpt: 'N5',
                examples: [
                    { word: '後で', reading: 'あとで', meaning: 'later' },
                    { word: '午後', reading: 'ごご', meaning: 'afternoon' },
                    { word: '最後', reading: 'さいご', meaning: 'last' }
                ]
            },
            {
                character: '前',
                meanings: ['front', 'before'],
                onyomi: ['ゼン'],
                kunyomi: ['まえ'],
                jlpt: 'N5',
                examples: [
                    { word: '前', reading: 'まえ', meaning: 'front, before' },
                    { word: '午前', reading: 'ごぜん', meaning: 'morning' },
                    { word: '名前', reading: 'なまえ', meaning: 'name' }
                ]
            },
            {
                character: '生',
                meanings: ['life', 'birth', 'genuine'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['い.きる', 'う.む', 'なま', 'は.やす'],
                jlpt: 'N5',
                examples: [
                    { word: '学生', reading: 'がくせい', meaning: 'student' },
                    { word: '先生', reading: 'せんせい', meaning: 'teacher' },
                    { word: '生きる', reading: 'いきる', meaning: 'to live' }
                ]
            },
            {
                character: '五',
                meanings: ['five'],
                onyomi: ['ゴ'],
                kunyomi: ['いつ', 'いつ.つ'],
                jlpt: 'N5',
                examples: [
                    { word: '五つ', reading: 'いつつ', meaning: 'five (things)' },
                    { word: '五人', reading: 'ごにん', meaning: 'five people' },
                    { word: '五時', reading: 'ごじ', meaning: 'five o\'clock' }
                ]
            },
            {
                character: '間',
                meanings: ['interval', 'space', 'between'],
                onyomi: ['カン', 'ケン'],
                kunyomi: ['あいだ', 'ま', 'あい'],
                jlpt: 'N5',
                examples: [
                    { word: '時間', reading: 'じかん', meaning: 'time' },
                    { word: '人間', reading: 'にんげん', meaning: 'human' },
                    { word: '間に合う', reading: 'まニアう', meaning: 'to be in time' }
                ]
            },
            {
                character: '上',
                meanings: ['above', 'up', 'on'],
                onyomi: ['ジョウ', 'ショウ'],
                kunyomi: ['うえ', 'うわ', 'かみ', 'あ.がる', 'のぼ.る'],
                jlpt: 'N5',
                examples: [
                    { word: '上', reading: 'うえ', meaning: 'above, up' },
                    { word: '上手', reading: 'じょうず', meaning: 'skillful' },
                    { word: '上がる', reading: 'あがる', meaning: 'to go up' }
                ]
            },
            {
                character: '東',
                meanings: ['east'],
                onyomi: ['トウ'],
                kunyomi: ['ひがし'],
                jlpt: 'N5',
                examples: [
                    { word: '東', reading: 'ひがし', meaning: 'east' },
                    { word: '東京', reading: 'とうきょう', meaning: 'Tokyo' },
                    { word: '東口', reading: 'ひがしぐち', meaning: 'east exit' }
                ]
            },
            {
                character: '四',
                meanings: ['four'],
                onyomi: ['シ'],
                kunyomi: ['よ', 'よ.つ', 'よん'],
                jlpt: 'N5',
                examples: [
                    { word: '四つ', reading: 'よっつ', meaning: 'four (things)' },
                    { word: '四人', reading: 'よにん', meaning: 'four people' },
                    { word: '四時', reading: 'よじ', meaning: 'four o\'clock' }
                ]
            },
            {
                character: '今',
                meanings: ['now', 'present'],
                onyomi: ['コン', 'キン'],
                kunyomi: ['いま'],
                jlpt: 'N5',
                examples: [
                    { word: '今', reading: 'いま', meaning: 'now' },
                    { word: '今日', reading: 'きょう', meaning: 'today' },
                    { word: '今年', reading: 'ことし', meaning: 'this year' }
                ]
            },
            {
                character: '金',
                meanings: ['gold', 'money', 'metal'],
                onyomi: ['キン', 'コン'],
                kunyomi: ['かね', 'かな-'],
                jlpt: 'N5',
                examples: [
                    { word: '金', reading: 'かね', meaning: 'money' },
                    { word: '金曜日', reading: 'きんようび', meaning: 'Friday' },
                    { word: '料金', reading: 'りょうきん', meaning: 'fee, charge' }
                ]
            },
            {
                character: '九',
                meanings: ['nine'],
                onyomi: ['キュウ', 'ク'],
                kunyomi: ['ここの', 'ここの.つ'],
                jlpt: 'N5',
                examples: [
                    { word: '九つ', reading: 'ここのつ', meaning: 'nine (things)' },
                    { word: '九人', reading: 'きゅうにん', meaning: 'nine people' },
                    { word: '九時', reading: 'くじ', meaning: 'nine o\'clock' }
                ]
            },
            {
                character: '入',
                meanings: ['enter', 'put in'],
                onyomi: ['ニュウ'],
                kunyomi: ['はい.る', 'い.れる'],
                jlpt: 'N5',
                examples: [
                    { word: '入る', reading: 'はいる', meaning: 'to enter' },
                    { word: '入口', reading: 'いりぐち', meaning: 'entrance' },
                    { word: '入学', reading: 'にゅうがく', meaning: 'entering school' }
                ]
            },
            {
                character: '八',
                meanings: ['eight'],
                onyomi: ['ハチ'],
                kunyomi: ['や', 'や.つ', 'よっ.つ'],
                jlpt: 'N5',
                examples: [
                    { word: '八つ', reading: 'яっつ', meaning: 'eight (things)' },
                    { word: '八人', reading: 'はちにん', meaning: 'eight people' },
                    { word: '八時', reading: 'はちじ', meaning: 'eight o\'clock' }
                ]
            },
            {
                character: '六',
                meanings: ['six'],
                onyomi: ['ロク'],
                kunyomi: ['む', 'む.つ', 'むい'],
                jlpt: 'N5',
                examples: [
                    { word: '六つ', reading: 'むっつ', meaning: 'six (things)' },
                    { word: '六人', reading: 'ろくにん', meaning: 'six people' },
                    { word: '六時', reading: 'ろくじ', meaning: 'six o\'clock' }
                ]
            },
            {
                character: '下',
                meanings: ['under', 'below', 'down'],
                onyomi: ['カ', 'ゲ'],
                kunyomi: ['した', 'しも', 'もと', 'さ.がる', 'くだ.る', 'お.りる'],
                jlpt: 'N5',
                examples: [
                    { word: '下', reading: 'した', meaning: 'under, below' },
                    { word: '地下', reading: 'ちか', meaning: 'underground' },
                    { word: '下さい', reading: 'ください', meaning: 'please give me' }
                ]
            },
            {
                character: '来',
                meanings: ['come', 'next'],
                onyomi: ['ライ'],
                kunyomi: ['く.る', 'き.たる', 'き.たす'],
                jlpt: 'N5',
                examples: [
                    { word: '来る', reading: 'くる', meaning: 'to come' },
                    { word: '来年', reading: 'らいねん', meaning: 'next year' },
                    { word: '来月', reading: 'らいげつ', meaning: 'next month' }
                ]
            },
            {
                character: '気',
                meanings: ['spirit', 'mind', 'air'],
                onyomi: ['キ', 'ケ'],
                kunyomi: [],
                jlpt: 'N5',
                examples: [
                    { word: '元気', reading: 'げんき', meaning: 'healthy, energetic' },
                    { word: '天気', reading: 'てんき', meaning: 'weather' },
                    { word: '気分', reading: 'きぶん', meaning: 'feeling, mood' }
                ]
            },
            {
                character: '小',
                meanings: ['small', 'little'],
                onyomi: ['ショウ'],
                kunyomi: ['ちい.さい', 'こ-', 'お-'],
                jlpt: 'N5',
                examples: [
                    { word: '小さい', reading: 'ちいさい', meaning: 'small' },
                    { word: '小学校', reading: 'しょうがっこう', meaning: 'elementary school' },
                    { word: '小さな', reading: 'ちいさな', meaning: 'small, little' }
                ]
            },
            {
                character: '七',
                meanings: ['seven'],
                onyomi: ['シチ'],
                kunyomi: ['なな', 'なな.つ', 'なの'],
                jlpt: 'N5',
                examples: [
                    { word: '七つ', reading: 'ななつ', meaning: 'seven (things)' },
                    { word: '七人', reading: 'しちにん', meaning: 'seven people' },
                    { word: '七時', reading: 'しちじ', meaning: 'seven o\'clock' }
                ]
            },
            {
                character: '山',
                meanings: ['mountain'],
                onyomi: ['サン'],
                kunyomi: ['やま'],
                jlpt: 'N5',
                examples: [
                    { word: '山', reading: 'やま', meaning: 'mountain' },
                    { word: '富士山', reading: 'ふじさん', meaning: 'Mount Fuji' },
                    { word: '火山', reading: 'かざん', meaning: 'volcano' }
                ]
            },
            {
                character: '話',
                meanings: ['talk', 'speak', 'story'],
                onyomi: ['ワ'],
                kunyomi: ['はな.す', 'はなし'],
                jlpt: 'N5',
                examples: [
                    { word: '話す', reading: 'はなす', meaning: 'to speak' },
                    { word: '話', reading: 'はなし', meaning: 'story, talk' },
                    { word: '電話', reading: 'でんわ', meaning: 'telephone' }
                ]
            },
            {
                character: '少',
                meanings: ['few', 'little'],
                onyomi: ['ショウ'],
                kunyomi: ['すく.ない', 'すこ.し'],
                jlpt: 'N5',
                examples: [
                    { word: '少し', reading: 'すこし', meaning: 'a little' },
                    { word: '少ない', reading: 'すくない', meaning: 'few, little' },
                    { word: '少年', reading: 'しょうねん', meaning: 'boy, youth' }
                ]
            },
            {
                character: '右',
                meanings: ['right'],
                onyomi: ['ウ', 'ユウ'],
                kunyomi: ['みぎ'],
                jlpt: 'N5',
                examples: [
                    { word: '右', reading: 'みぎ', meaning: 'right' },
                    { word: '右手', reading: 'みぎて', meaning: 'right hand' },
                    { word: '左右', reading: 'さゆう', meaning: 'left and right' }
                ]
            },
            {
                character: '学',
                meanings: ['study', 'learning', 'science'],
                onyomi: ['ガク'],
                kunyomi: ['まな.ぶ'],
                jlpt: 'N5',
                examples: [
                    { word: '学校', reading: 'がっこう', meaning: 'school' },
                    { word: '学生', reading: 'がくせい', meaning: 'student' },
                    { word: '大学', reading: 'だいがく', meaning: 'university' }
                ]
            },
            {
                character: '外',
                meanings: ['outside', 'other', 'foreign'],
                onyomi: ['ガイ', 'ゲ'],
                kunyomi: ['そと', 'ほか', 'はず.す', 'はず.れる'],
                jlpt: 'N5',
                examples: [
                    { word: '外', reading: 'そと', meaning: 'outside' },
                    { word: '外国', reading: 'がいこく', meaning: 'foreign country' },
                    { word: '海外', reading: 'かいがい', meaning: 'overseas' }
                ]
            },
            {
                character: '車',
                meanings: ['car', 'vehicle', 'wheel'],
                onyomi: ['シャ'],
                kunyomi: ['くるま'],
                jlpt: 'N5',
                examples: [
                    { word: '車', reading: 'くるま', meaning: 'car' },
                    { word: '電車', reading: 'でんしゃ', meaning: 'train' },
                    { word: '自転車', reading: 'じてんしゃ', meaning: 'bicycle' }
                ]
            },
            {
                character: '高',
                meanings: ['high', 'tall', 'expensive'],
                onyomi: ['コウ'],
                kunyomi: ['たか.い', 'たか.まる', 'たか.める'],
                jlpt: 'N5',
                examples: [
                    { word: '高い', reading: 'たかい', meaning: 'high, expensive' },
                    { word: '高校', reading: 'こうこう', meaning: 'high school' },
                    { word: '最高', reading: 'さいこう', meaning: 'highest, best' }
                ]
            },
            {
                character: '校',
                meanings: ['school'],
                onyomi: ['コウ'],
                kunyomi: [],
                jlpt: 'N5',
                examples: [
                    { word: '学校', reading: 'がっこう', meaning: 'school' },
                    { word: '高校', reading: 'こうこう', meaning: 'high school' },
                    { word: '校長', reading: 'こうちょう', meaning: 'principal' }
                ]
            },
            {
                character: '毎',
                meanings: ['every'],
                onyomi: ['マイ'],
                kunyomi: [],
                jlpt: 'N5',
                examples: [
                    { word: '毎日', reading: 'まいにち', meaning: 'every day' },
                    { word: '毎年', reading: 'まいとし', meaning: 'every year' },
                    { word: '毎朝', reading: 'まいあさ', meaning: 'every morning' }
                ]
            },
            {
                character: '語',
                meanings: ['language', 'word'],
                onyomi: ['ゴ'],
                kunyomi: ['かた.る', 'かた.らう'],
                jlpt: 'N5',
                examples: [
                    { word: '日本語', reading: 'にほんご', meaning: 'Japanese language' },
                    { word: '英語', reading: 'えいご', meaning: 'English language' },
                    { word: '語学', reading: 'ごがく', meaning: 'language study' }
                ]
            },
            {
                character: '文',
                meanings: ['sentence', 'writing', 'culture'],
                onyomi: ['ブン', 'モン'],
                kunyomi: ['ふみ', 'あや'],
                jlpt: 'N5',
                examples: [
                    { word: '文章', reading: 'ぶんしょう', meaning: 'sentence, text' },
                    { word: '作文', reading: 'さくぶん', meaning: 'composition' },
                    { word: '文化', reading: 'ぶんか', meaning: 'culture' }
                ]
            },
            {
                character: '帰',
                meanings: ['return', 'go back'],
                onyomi: ['キ'],
                kunyomi: ['かえ.る', 'かえ.す'],
                jlpt: 'N5',
                examples: [
                    { word: '帰る', reading: 'かえる', meaning: 'to return' },
                    { word: '帰国', reading: 'きこく', meaning: 'return to one\'s country' },
                    { word: '帰り', reading: 'かえり', meaning: 'return trip' }
                ]
            }
        ],
        'N4': [
            // Top 170 N4 Kanji (additional to N5)
            {
                character: '会',
                meanings: ['meeting', 'meet', 'association'],
                onyomi: ['カイ', 'エ'],
                kunyomi: ['あ.う'],
                jlpt: 'N4',
                examples: [
                    { word: '会う', reading: 'あう', meaning: 'to meet' },
                    { word: '会社', reading: 'かいしゃ', meaning: 'company' },
                    { word: '会議', reading: 'かいぎ', meaning: 'meeting, conference' }
                ]
            },
            {
                character: '同',
                meanings: ['same', 'agree', 'equal'],
                onyomi: ['ドウ'],
                kunyomi: ['おな.じ'],
                jlpt: 'N4',
                examples: [
                    { word: '同じ', reading: 'おなじ', meaning: 'same' },
                    { word: '同時', reading: 'どうじ', meaning: 'at the same time' },
                    { word: '共同', reading: 'きょうどう', meaning: 'cooperation' }
                ]
            },
            {
                character: '事',
                meanings: ['matter', 'thing', 'fact'],
                onyomi: ['ジ', 'ズ'],
                kunyomi: ['こと'],
                jlpt: 'N4',
                examples: [
                    { word: '事', reading: 'こと', meaning: 'thing, matter' },
                    { word: '仕事', reading: 'しごと', meaning: 'work, job' },
                    { word: '大事', reading: 'だいじ', meaning: 'important' }
                ]
            },
            {
                character: '自',
                meanings: ['oneself', 'self'],
                onyomi: ['ジ', 'シ'],
                kunyomi: ['みずか.ら'],
                jlpt: 'N4',
                examples: [
                    { word: '自分', reading: 'じぶん', meaning: 'oneself' },
                    { word: '自動車', reading: 'じどうしゃ', meaning: 'automobile' },
                    { word: '自然', reading: 'しぜん', meaning: 'nature' }
                ]
            },
            {
                character: '社',
                meanings: ['company', 'firm', 'shrine'],
                onyomi: ['シャ'],
                kunyomi: ['やしろ'],
                jlpt: 'N4',
                examples: [
                    { word: '会社', reading: 'かいしゃ', meaning: 'company' },
                    { word: '社会', reading: 'しゃかい', meaning: 'society' },
                    { word: '神社', reading: 'じんじゃ', meaning: 'shrine' }
                ]
            },
            {
                character: '発',
                meanings: ['departure', 'emit', 'start'],
                onyomi: ['ハツ', 'ホツ'],
                kunyomi: [],
                jlpt: 'N4',
                examples: [
                    { word: '出発', reading: 'しゅっぱつ', meaning: 'departure' },
                    { word: '発見', reading: 'はっけん', meaning: 'discovery' },
                    { word: '発表', reading: 'はっぴょう', meaning: 'announcement' }
                ]
            },
            {
                character: '者',
                meanings: ['person', 'someone'],
                onyomi: ['シャ'],
                kunyomi: ['もの'],
                jlpt: 'N4',
                examples: [
                    { word: '記者', reading: 'きしゃ', meaning: 'reporter' },
                    { word: '医者', reading: 'いしゃ', meaning: 'doctor' },
                    { word: '若者', reading: 'わかもの', meaning: 'young person' }
                ]
            },
            {
                character: '地',
                meanings: ['ground', 'earth', 'land'],
                onyomi: ['チ', 'ジ'],
                kunyomi: [],
                jlpt: 'N4',
                examples: [
                    { word: '地下', reading: 'ちか', meaning: 'underground' },
                    { word: '土地', reading: 'とち', meaning: 'land' },
                    { word: '地図', reading: 'ちず', meaning: 'map' }
                ]
            },
            {
                character: '業',
                meanings: ['business', 'industry', 'karma'],
                onyomi: ['ギョウ', 'ゴウ'],
                kunyomi: ['わざ'],
                jlpt: 'N4',
                examples: [
                    { word: '仕事', reading: 'しごと', meaning: 'work, job' },
                    { word: '工業', reading: 'こうぎょう', meaning: 'industry' },
                    { word: '商業', reading: 'しょうぎょう', meaning: 'commerce' }
                ]
            },
            {
                character: '方',
                meanings: ['direction', 'person', 'way'],
                onyomi: ['ホウ'],
                kunyomi: ['かた', '-がた'],
                jlpt: 'N4',
                examples: [
                    { word: '方法', reading: 'ほうほう', meaning: 'method' },
                    { word: 'あの方', reading: 'あのかた', meaning: 'that person (polite)' },
                    { word: '北方', reading: 'ほっぽう', meaning: 'north, northern' }
                ]
            },
            {
                character: '新',
                meanings: ['new', 'fresh'],
                onyomi: ['シン'],
                kunyomi: ['あたら.しい', 'あら.た', 'にい-'],
                jlpt: 'N4',
                examples: [
                    { word: '新しい', reading: 'あたらしい', meaning: 'new' },
                    { word: '新聞', reading: 'しんぶん', meaning: 'newspaper' },
                    { word: '最新', reading: 'さいしん', meaning: 'latest' }
                ]
            },
            {
                character: '場',
                meanings: ['place', 'location', 'scene'],
                onyomi: ['ジョウ', 'チョウ'],
                kunyomi: ['ば'],
                jlpt: 'N4',
                examples: [
                    { word: '場所', reading: 'ばしょ', meaning: 'place, location' },
                    { word: '工場', reading: 'こうじょう', meaning: 'factory' },
                    { word: '駐車場', reading: 'ちゅうしゃじょう', meaning: 'parking lot' }
                ]
            },
            {
                character: '员',
                meanings: ['member', 'staff', 'employee'],
                onyomi: ['イン'],
                kunyomi: [],
                jlpt: 'N4',
                examples: [
                    { word: '店員', reading: 'てんいん', meaning: 'store clerk' },
                    { word: '会社員', reading: 'かいしゃいん', meaning: 'company employee' },
                    { word: '全員', reading: 'ぜんいん', meaning: 'all members' }
                ]
            },
            {
                character: '立',
                meanings: ['stand', 'rise'],
                onyomi: ['リツ', 'リュウ'],
                kunyomi: ['た.つ', 'た.てる'],
                jlpt: 'N4',
                examples: [
                    { word: '立つ', reading: 'たつ', meaning: 'to stand' },
                    { word: '独立', reading: 'どくりつ', meaning: 'independence' },
                    { word: '建立', reading: 'こんりゅう', meaning: 'construction, erection' }
                ]
            },
            {
                character: '開',
                meanings: ['open', 'unfold'],
                onyomi: ['カイ'],
                kunyomi: ['ひら.く', 'ひら.く', 'あ.く', 'あ.ける'],
                jlpt: 'N4',
                examples: [
                    { word: '開く', reading: 'ひらく', meaning: 'to open' },
                    { word: '開始', reading: 'かいし', meaning: 'start, beginning' },
                    { word: '公開', reading: 'こうかい', meaning: 'public opening' }
                ]
            },
            {
                character: '手',
                meanings: ['hand'],
                onyomi: ['シュ'],
                kunyomi: ['て', 'た-'],
                jlpt: 'N4',
                examples: [
                    { word: '手', reading: 'て', meaning: 'hand' },
                    { word: '手紙', reading: 'てがみ', meaning: 'letter' },
                    { word: '上手', reading: 'じょうず', meaning: 'skillful' }
                ]
            },
            {
                character: '力',
                meanings: ['power', 'strength'],
                onyomi: ['リョク', 'リキ'],
                kunyomi: ['ちから'],
                jlpt: 'N4',
                examples: [
                    { word: '力', reading: 'ちから', meaning: 'power, strength' },
                    { word: '電力', reading: 'でんりょく', meaning: 'electric power' },
                    { word: '協力', reading: 'きょうりょく', meaning: 'cooperation' }
                ]
            },
            {
                character: '問',
                meanings: ['question', 'ask', 'problem'],
                onyomi: ['モン'],
                kunyomi: ['と.う', 'と.い'],
                jlpt: 'N4',
                examples: [
                    { word: '質問', reading: 'しつもん', meaning: 'question' },
                    { word: '問題', reading: 'もんだい', meaning: 'problem' },
                    { word: '問う', reading: 'とう', meaning: 'to ask' }
                ]
            },
            {
                character: '代',
                meanings: ['substitute', 'generation', 'age'],
                onyomi: ['ダイ', 'タイ'],
                kunyomi: ['か.える', 'か.わる', 'よ', 'しろ'],
                jlpt: 'N4',
                examples: [
                    { word: '時代', reading: 'じだい', meaning: 'era, period' },
                    { word: '代表', reading: 'だいひょう', meaning: 'representative' },
                    { word: '現代', reading: 'げんだい', meaning: 'modern times' }
                ]
            },
            {
                character: '明',
                meanings: ['bright', 'clear', 'light'],
                onyomi: ['メイ', 'ミョウ'],
                kunyomi: ['あか.るい', 'あき.らかな', 'あ.ける'],
                jlpt: 'N4',
                examples: [
                    { word: '明るい', reading: 'あかるい', meaning: 'bright' },
                    { word: '明日', reading: 'あした', meaning: 'tomorrow' },
                    { word: '説明', reading: 'せつめい', meaning: 'explanation' }
                ]
            },
            {
                character: '動',
                meanings: ['move', 'motion'],
                onyomi: ['ドウ'],
                kunyomi: ['うご.く', 'うご.かす'],
                jlpt: 'N4',
                examples: [
                    { word: '動く', reading: 'うごく', meaning: 'to move' },
                    { word: '自動車', reading: 'じどうしゃ', meaning: 'automobile' },
                    { word: '運動', reading: 'うんどう', meaning: 'exercise, movement' }
                ]
            },
            {
                character: '京',
                meanings: ['capital'],
                onyomi: ['キョウ', 'ケイ'],
                kunyomi: ['みやこ'],
                jlpt: 'N4',
                examples: [
                    { word: '東京', reading: 'とうきょう', meaning: 'Tokyo' },
                    { word: '京都', reading: 'きょうと', meaning: 'Kyoto' },
                    { word: '上京', reading: 'じょうきょう', meaning: 'going to the capital' }
                ]
            },
            {
                character: '目',
                meanings: ['eye', 'look'],
                onyomi: ['モク', 'ボク'],
                kunyomi: ['め', 'ま-'],
                jlpt: 'N4',
                examples: [
                    { word: '目', reading: 'め', meaning: 'eye' },
                    { word: '目的', reading: 'もくてき', meaning: 'purpose, goal' },
                    { word: '注目', reading: 'ちゅうもく', meaning: 'attention' }
                ]
            },
            {
                character: '通',
                meanings: ['pass through', 'traffic', 'communicate'],
                onyomi: ['ツウ', 'ツ'],
                kunyomi: ['とお.る', 'とお.す', 'かよ.う'],
                jlpt: 'N4',
                examples: [
                    { word: '通る', reading: 'とおる', meaning: 'to pass through' },
                    { word: '交通', reading: 'こうつう', meaning: 'traffic' },
                    { word: '普通', reading: 'ふつう', meaning: 'ordinary, normal' }
                ]
            },
            {
                character: '言',
                meanings: ['say', 'word', 'speech'],
                onyomi: ['ゲン', 'ゴン'],
                kunyomi: ['い.う', 'こと'],
                jlpt: 'N4',
                examples: [
                    { word: '言う', reading: 'いう', meaning: 'to say' },
                    { word: '言葉', reading: 'ことば', meaning: 'word, language' },
                    { word: '発言', reading: 'はつげん', meaning: 'statement, remark' }
                ]
            },
            {
                character: '理',
                meanings: ['logic', 'reason', 'truth'],
                onyomi: ['リ'],
                kunyomi: [],
                jlpt: 'N4',
                examples: [
                    { word: '理由', reading: 'りゆう', meaning: 'reason' },
                    { word: '料理', reading: 'りょうり', meaning: 'cooking' },
                    { word: '管理', reading: 'かんり', meaning: 'management' }
                ]
            },
            {
                character: '体',
                meanings: ['body', 'substance'],
                onyomi: ['タイ', 'テイ'],
                kunyomi: ['からだ'],
                jlpt: 'N4',
                examples: [
                    { word: '体', reading: 'からだ', meaning: 'body' },
                    { word: '全体', reading: 'ぜんたい', meaning: 'whole, entire' },
                    { word: '団体', reading: 'だんたい', meaning: 'organization, group' }
                ]
            },
            {
                character: '田',
                meanings: ['rice field'],
                onyomi: ['デン'],
                kunyomi: ['た', 'だ-'],
                jlpt: 'N4',
                examples: [
                    { word: '田', reading: 'た', meaning: 'rice field' },
                    { word: '田中', reading: 'たなか', meaning: 'Tanaka (surname)' },
                    { word: '水田', reading: 'すいでん', meaning: 'rice paddy' }
                ]
            },
            {
                character: '主',
                meanings: ['master', 'main', 'lord'],
                onyomi: ['シュ', 'ス'],
                kunyomi: ['ぬし', 'おも.な'],
                jlpt: 'N4',
                examples: [
                    { word: '主人', reading: 'しゅじん', meaning: 'husband, master' },
                    { word: '民主', reading: 'みんしゅ', meaning: 'democracy' },
                    { word: '主に', reading: 'おもに', meaning: 'mainly' }
                ]
            },
            {
                character: '思',
                meanings: ['think', 'thought'],
                onyomi: ['シ'],
                kunyomi: ['おも.う'],
                jlpt: 'N4',
                examples: [
                    { word: '思う', reading: 'お思う', meaning: 'to think' },
                    { word: '思想', reading: 'しそう', meaning: 'thought, idea' },
                    { word: '意思', reading: 'いし', meaning: 'intention, will' }
                ]
            },
            {
                character: '考',
                meanings: ['think', 'consider'],
                onyomi: ['コウ'],
                kunyomi: ['かんが.える'],
                jlpt: 'N4',
                examples: [
                    { word: '考える', reading: 'かんがえる', meaning: 'to think' },
                    { word: '考え', reading: 'かんがえ', meaning: 'thought, idea' },
                    { word: '参考', reading: 'さんこう', meaning: 'reference' }
                ]
            },
            {
                character: '知',
                meanings: ['know', 'wisdom'],
                onyomi: ['チ'],
                kunyomi: ['し.る'],
                jlpt: 'N4',
                examples: [
                    { word: '知る', reading: 'しる', meaning: 'to know' },
                    { word: '知識', reading: 'ちしき', meaning: 'knowledge' },
                    { word: '通知', reading: 'つうち', meaning: 'notification' }
                ]
            },
            {
                character: '世',
                meanings: ['world', 'generation'],
                onyomi: ['セイ', 'セ'],
                kunyomi: ['よ'],
                jlpt: 'N4',
                examples: [
                    { word: '世界', reading: 'せかい', meaning: 'world' },
                    { word: '世話', reading: 'せわ', meaning: 'care, help' },
                    { word: '世の中', reading: 'よのなか', meaning: 'society, world' }
                ]
            },
            {
                character: '多',
                meanings: ['many', 'much'],
                onyomi: ['タ'],
                kunyomi: ['おおい'],
                jlpt: 'N4',
                examples: [
                    { word: '多い', reading: 'おおい', meaning: 'many, much' },
                    { word: '多分', reading: 'たぶん', meaning: 'probably' },
                    { word: '多く', reading: 'おおく', meaning: 'many, much' }
                ]
            },
            {
                character: '正',
                meanings: ['correct', 'justice', 'right'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['ただ.しい', 'ただ.す', 'まさ'],
                jlpt: 'N4',
                examples: [
                    { word: '正しい', reading: 'ただしい', meaning: 'correct' },
                    { word: '正月', reading: 'しょうがつ', meaning: 'New Year' },
                    { word: '修正', reading: 'しゅうせい', meaning: 'correction' }
                ]
            },
            {
                character: '安',
                meanings: ['cheap', 'safe', 'peaceful'],
                onyomi: ['アン'],
                kunyomi: ['やす.い'],
                jlpt: 'N4',
                examples: [
                    { word: '安い', reading: 'やすい', meaning: 'cheap' },
                    { word: '安全', reading: 'あんぜん', meaning: 'safety' },
                    { word: '不安', reading: 'ふ안', meaning: 'anxiety' }
                ]
            },
            {
                character: '院',
                meanings: ['institution', 'temple'],
                onyomi: ['イン'],
                kunyomi: [],
                jlpt: 'N4',
                examples: [
                    { word: '病院', reading: 'びょういん', meaning: 'hospital' },
                    { word: '大学院', reading: 'だいがくいん', meaning: 'graduate school' },
                    { word: '美容院', reading: 'びよういん', meaning: 'beauty salon' }
                ]
            },
            {
                character: '心',
                meanings: ['heart', 'mind', 'spirit'],
                onyomi: ['シン'],
                kunyomi: ['こころ'],
                jlpt: 'N4',
                examples: [
                    { word: '心', reading: 'こころ', meaning: 'heart, mind' },
                    { word: '安心', reading: 'あんしん', meaning: 'relief, peace of mind' },
                    { word: '中心', reading: 'ちゅうしん', meaning: 'center' }
                ]
            },
            {
                character: '切',
                meanings: ['cut', 'urgent'],
                onyomi: ['セツ', 'サイ'],
                kunyomi: ['き.る', 'き.れる'],
                jlpt: 'N4',
                examples: [
                    { word: '切る', reading: 'きる', meaning: 'to cut' },
                    { word: '大切', reading: 'たいせつ', meaning: 'important' },
                    { word: '切手', reading: 'きって', meaning: 'stamp' }
                ]
            },
            {
                character: '近',
                meanings: ['near', 'close'],
                onyomi: ['キン'],
                kunyomi: ['ちか.い'],
                jlpt: 'N4',
                examples: [
                    { word: '近い', reading: 'ちかい', meaning: 'near, close' },
                    { word: '最近', reading: 'さいきん', meaning: 'recently' },
                    { word: '近所', reading: 'きんじょ', meaning: 'neighborhood' }
                ]
            },
            {
                character: '元',
                meanings: ['origin', 'former', 'basis'],
                onyomi: ['ゲン', 'ガン'],
                kunyomi: ['もと'],
                jlpt: 'N4',
                examples: [
                    { word: '元気', reading: 'げんき', meaning: 'healthy, energetic' },
                    { word: '元', reading: 'もと', meaning: 'origin, basis' },
                    { word: '元々', reading: 'もともと', meaning: 'originally' }
                ]
            },
            {
                character: '室',
                meanings: ['room'],
                onyomi: ['シツ'],
                kunyomi: ['むろ'],
                jlpt: 'N4',
                examples: [
                    { word: '教室', reading: 'きょうしつ', meaning: 'classroom' },
                    { word: '寝室', reading: 'しんしつ', meaning: 'bedroom' },
                    { word: '事務室', reading: 'じむしつ', meaning: 'office' }
                ]
            },
            {
                character: '急',
                meanings: ['urgent', 'sudden', 'steep'],
                onyomi: ['キュウ'],
                kunyomi: ['いそ.ぐ'],
                jlpt: 'N4',
                examples: [
                    { word: '急ぐ', reading: 'いそぐ', meaning: 'to hurry' },
                    { word: '急に', reading: 'きゅうに', meaning: 'suddenly' },
                    { word: '救急車', reading: 'きゅうきゅうしゃ', meaning: 'ambulance' }
                ]
            },
            {
                character: '使',
                meanings: ['use', 'employ'],
                onyomi: ['シ'],
                kunyomi: ['つか.う'],
                jlpt: 'N4',
                examples: [
                    { word: '使う', reading: 'つかう', meaning: 'to use' },
                    { word: '使用', reading: 'しよう', meaning: 'use, usage' },
                    { word: '大使', reading: 'たいし', meaning: 'ambassador' }
                ]
            },
            {
                character: '始',
                meanings: ['begin', 'start'],
                onyomi: ['シ'],
                kunyomi: ['はじ.める', 'はじ.まる'],
                jlpt: 'N4',
                examples: [
                    { word: '始める', reading: 'はじめる', meaning: 'to begin' },
                    { word: '開始', reading: 'かいし', meaning: 'start' },
                    { word: '始まり', reading: 'はじまり', meaning: 'beginning' }
                ]
            },
            {
                character: '実',
                meanings: ['real', 'truth', 'fruit'],
                onyomi: ['ジツ'],
                kunyomi: ['み', 'みの.る'],
                jlpt: 'N4',
                examples: [
                    { word: '実は', reading: 'じつは', meaning: 'actually' },
                    { word: '現実', reading: 'げんじつ', meaning: 'reality' },
                    { word: '果実', reading: 'かじつ', meaning: 'fruit' }
                ]
            },
            {
                character: '頭',
                meanings: ['head'],
                onyomi: ['トウ', 'ズ'],
                kunyomi: ['あたま', 'かしら'],
                jlpt: 'N4',
                examples: [
                    { word: '頭', reading: 'あたま', meaning: 'head' },
                    { word: '頭痛', reading: 'ずつう', meaning: 'headache' },
                    { word: '先頭', reading: 'せんとう', meaning: 'front, head' }
                ]
            },
            {
                character: '声',
                meanings: ['voice'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['こえ', 'こわ-'],
                jlpt: 'N4',
                examples: [
                    { word: '声', reading: 'こえ', meaning: 'voice' },
                    { word: '大声', reading: 'おおごえ', meaning: 'loud voice' },
                    { word: '音声', reading: 'おんせい', meaning: 'voice, sound' }
                ]
            },
            {
                character: '風',
                meanings: ['wind', 'style'],
                onyomi: ['フウ', 'フ'],
                kunyomi: ['かぜ', 'かざ-'],
                jlpt: 'N4',
                examples: [
                    { word: '風', reading: 'かぜ', meaning: 'wind' },
                    { word: '台風', reading: 'たいふう', meaning: 'typhoon' },
                    { word: '和風', reading: 'わふう', meaning: 'Japanese style' }
                ]
            },
            {
                character: '飯',
                meanings: ['rice', 'meal'],
                onyomi: ['ハン'],
                kunyomi: ['めし'],
                jlpt: 'N4',
                examples: [
                    { word: 'ご飯', reading: 'ごはん', meaning: 'rice, meal' },
                    { word: '朝飯', reading: 'あさめし', meaning: 'breakfast' },
                    { word: '炊飯器', reading: 'すいはんき', meaning: 'rice cooker' }
                ]
            },
            {
                character: '写',
                meanings: ['copy', 'photograph'],
                onyomi: ['シャ'],
                kunyomi: ['うつ.す', 'うつ.る'],
                jlpt: 'N4',
                examples: [
                    { word: '写真', reading: 'しゃしん', meaning: 'photograph' },
                    { word: '写す', reading: 'うつす', meaning: 'to copy, to photograph' },
                    { word: '複写', reading: 'ふくしゃ', meaning: 'copy, duplicate' }
                ]
            },
            {
                character: '字',
                meanings: ['character', 'letter'],
                onyomi: ['ジ'],
                kunyomi: ['あざ'],
                jlpt: 'N4',
                examples: [
                    { word: '文字', reading: 'もじ', meaning: 'letter, character' },
                    { word: '漢字', reading: 'かんじ', meaning: 'Chinese characters' },
                    { word: '数字', reading: 'すうじ', meaning: 'number, figure' }
                ]
            },
            {
                character: '活',
                meanings: ['life', 'activity'],
                onyomi: ['カツ'],
                kunyomi: ['い.きる', 'い.かす', 'い.ける'],
                jlpt: 'N4',
                examples: [
                    { word: '活動', reading: 'かつどう', meaning: 'activity' },
                    { word: '生活', reading: 'せいかつ', meaning: 'life, living' },
                    { word: '活用', reading: 'かつよう', meaning: 'practical use' }
                ]
            },
            {
                character: '家',
                meanings: ['house', 'family', 'expert'],
                onyomi: ['カ', 'ケ'],
                kunyomi: ['いえ', 'や', 'うち'],
                jlpt: 'N4',
                examples: [
                    { word: '家', reading: 'いえ', meaning: 'house' },
                    { word: '家族', reading: 'かぞく', meaning: 'family' },
                    { word: '作家', reading: 'さっか', meaning: 'author, writer' }
                ]
            },
            {
                character: '真',
                meanings: ['true', 'reality', 'genuine'],
                onyomi: ['シン'],
                kunyomi: ['ま-', 'まこと'],
                jlpt: 'N4',
                examples: [
                    { word: '真っ白', reading: 'まっしろ', meaning: 'pure white' },
                    { word: '写真', reading: 'しゃしん', meaning: 'photograph' },
                    { word: '真実', reading: 'しんじつ', meaning: 'truth' }
                ]
            },
            {
                character: '有',
                meanings: ['exist', 'have', 'possess'],
                onyomi: ['ユウ', 'ウ'],
                kunyomi: ['あ.る'],
                jlpt: 'N4',
                examples: [
                    { word: '有名', reading: 'ゆうめい', meaning: 'famous' },
                    { word: '所有', reading: 'しょゆう', meaning: 'possession' },
                    { word: '有る', reading: 'ある', meaning: 'to exist (inanimate)' }
                ]
            },
            {
                character: '無',
                meanings: ['nothing', 'none', 'without'],
                onyomi: ['ム', 'ブ'],
                kunyomi: ['な.い'],
                jlpt: 'N4',
                examples: [
                    { word: '無料', reading: 'むりょう', meaning: 'free of charge' },
                    { word: '無い', reading: 'ない', meaning: 'not exist' },
                    { word: '無理', reading: 'むり', meaning: 'impossible' }
                ]
            }
        ],
        'N3': [
            // Selection of important N3 Kanji (370 total in full level)
            {
                character: '政',
                meanings: ['politics', 'government'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['まつりごと'],
                jlpt: 'N3',
                examples: [
                    { word: '政治', reading: 'せいじ', meaning: 'politics' },
                    { word: '政府', reading: 'せいふ', meaning: 'government' },
                    { word: '政策', reading: 'せいさく', meaning: 'policy' }
                ]
            },
            {
                character: '経',
                meanings: ['sutra', 'longitude', 'pass through'],
                onyomi: ['ケイ', 'キョウ'],
                kunyomi: ['へ.る'],
                jlpt: 'N3',
                examples: [
                    { word: '経済', reading: 'けいざい', meaning: 'economy' },
                    { word: '経験', reading: 'けいけん', meaning: 'experience' },
                    { word: '神経', reading: 'しんけい', meaning: 'nerve' }
                ]
            },
            {
                character: '済',
                meanings: ['settle', 'finish', 'feel at ease'],
                onyomi: ['サイ'],
                kunyomi: ['す.む', 'す.ます'],
                jlpt: 'N3',
                examples: [
                    { word: '経済', reading: 'けいざい', meaning: 'economy' },
                    { word: '返済', reading: 'へんさい', meaning: 'repayment' },
                    { word: '済む', reading: 'すむ', meaning: 'to end, to be finished' }
                ]
            },
            {
                character: '治',
                meanings: ['reign', 'be at peace', 'cure'],
                onyomi: ['ジ', 'チ'],
                kunyomi: ['おさ.める', 'おさ.まる', 'なお.る', 'なお.す'],
                jlpt: 'N3',
                examples: [
                    { word: '政治', reading: 'せいじ', meaning: 'politics' },
                    { word: '治療', reading: 'ちりょう', meaning: 'medical treatment' },
                    { word: '治す', reading: 'なおす', meaning: 'to cure' }
                ]
            },
            {
                character: '法',
                meanings: ['method', 'law', 'rule'],
                onyomi: ['ホウ', 'ハッ'],
                kunyomi: ['のり'],
                jlpt: 'N3',
                examples: [
                    { word: '方法', reading: 'ほうほう', meaning: 'method' },
                    { word: '法律', reading: 'ほうりつ', meaning: 'law' },
                    { word: '文法', reading: 'ぶんぽう', meaning: 'grammar' }
                ]
            },
            {
                character: '民',
                meanings: ['people', 'nation', 'subjects'],
                onyomi: ['ミン'],
                kunyomi: ['たみ'],
                jlpt: 'N3',
                examples: [
                    { word: '国民', reading: 'こくみん', meaning: 'citizen, people' },
                    { word: '民族', reading: 'みんぞく', meaning: 'people, race' },
                    { word: '住民', reading: 'じゅうみん', meaning: 'residents' }
                ]
            },
            {
                character: '性',
                meanings: ['sex', 'gender', 'nature'],
                onyomi: ['セイ', 'ショウ'],
                kunyomi: ['さが'],
                jlpt: 'N3',
                examples: [
                    { word: '性格', reading: 'せいかく', meaning: 'personality' },
                    { word: '女性', reading: 'じょせい', meaning: 'woman, female' },
                    { word: '男性', reading: 'だんせい', meaning: 'man, male' }
                ]
            },
            {
                character: '的',
                meanings: ['target', 'mark', 'adjectival suffix'],
                onyomi: ['テキ'],
                kunyomi: ['まと'],
                jlpt: 'N3',
                examples: [
                    { word: '目的', reading: 'もくてき', meaning: 'purpose, goal' },
                    { word: '具体的', reading: 'ぐたいてき', meaning: 'concrete, specific' },
                    { word: '基本的', reading: 'きほんてき', meaning: 'basic, fundamental' }
                ]
            },
            {
                character: '制',
                meanings: ['system', 'law', 'rule'],
                onyomi: ['セイ'],
                kunyomi: [],
                jlpt: 'N3',
                examples: [
                    { word: '制度', reading: 'せいど', meaning: 'system, institution' },
                    { word: '統制', reading: 'とうせい', meaning: 'control, regulation' },
                    { word: '制限', reading: 'せいげん', meaning: 'restriction, limit' }
                ]
            },
            {
                character: '技',
                meanings: ['skill', 'art', 'craft'],
                onyomi: ['ギ'],
                kunyomi: ['わざ'],
                jlpt: 'N3',
                examples: [
                    { word: '技術', reading: 'ぎじゅつ', meaning: 'technology, technique' },
                    { word: '技能', reading: 'ぎのう', meaning: 'technical skill' },
                    { word: '演技', reading: 'えんぎ', meaning: 'acting, performance' }
                ]
            }
        ],
        'N2': [
            // Selection of important N2 Kanji (380 total in full level)
            {
                character: '議',
                meanings: ['deliberation', 'consultation', 'debate'],
                onyomi: ['ギ'],
                kunyomi: [],
                jlpt: 'N2',
                examples: [
                    { word: '会議', reading: 'かいぎ', meaning: 'meeting, conference' },
                    { word: '議論', reading: 'ぎろん', meaning: 'discussion, argument' },
                    { word: '議会', reading: 'ぎかい', meaning: 'parliament, congress' }
                ]
            },
            {
                character: '象',
                meanings: ['elephant', 'phenomenon', 'image'],
                onyomi: ['ショウ', 'ゾウ'],
                kunyomi: ['かたど.る'],
                jlpt: 'N2',
                examples: [
                    { word: '現象', reading: 'げんしょう', meaning: 'phenomenon' },
                    { word: '印象', reading: 'いんしょう', meaning: 'impression' },
                    { word: '象徴', reading: 'しょうちょう', meaning: 'symbol' }
                ]
            },
            {
                character: '増',
                meanings: ['increase', 'add', 'augment'],
                onyomi: ['ゾウ'],
                kunyomi: ['ま.す', 'ま.える', 'ふ.える', 'ふ.やす'],
                jlpt: 'N2',
                examples: [
                    { word: '増加', reading: 'ぞうか', meaning: 'increase' },
                    { word: '増える', reading: 'ふえる', meaning: 'to increase' },
                    { word: '急増', reading: 'きゅうぞう', meaning: 'rapid increase' }
                ]
            },
            {
                character: '減',
                meanings: ['dwindle', 'decrease', 'reduce'],
                onyomi: ['ゲン'],
                kunyomi: ['へ.る', 'へ.らす'],
                jlpt: 'N2',
                examples: [
                    { word: '減る', reading: 'へる', meaning: 'to decrease' },
                    { word: '削減', reading: 'さくげん', meaning: 'reduction, cut' },
                    { word: '軽減', reading: 'けいげん', meaning: 'reduction, alleviation' }
                ]
            },
            {
                character: '状',
                meanings: ['status quo', 'conditions', 'circumstances'],
                onyomi: ['ジョウ'],
                kunyomi: [],
                jlpt: 'N2',
                examples: [
                    { word: '状況', reading: 'じょうきょう', meaning: 'situation, circumstances' },
                    { word: '現状', reading: 'げんじょう', meaning: 'present condition' },
                    { word: '症状', reading: 'しょうじょう', meaning: 'symptoms' }
                ]
            },
            {
                character: '況',
                meanings: ['condition', 'situation'],
                onyomi: ['キョウ'],
                kunyomi: ['いわ.んや'],
                jlpt: 'N2',
                examples: [
                    { word: '状況', reading: 'じょうきょう', meaning: 'situation, circumstances' },
                    { word: '景況', reading: 'けいきょう', meaning: 'business conditions' },
                    { word: '況して', reading: 'ましてや', meaning: 'much more, let alone' }
                ]
            },
            {
                character: '態',
                meanings: ['attitude', 'condition', 'figure'],
                onyomi: ['タイ'],
                kunyomi: ['わざ.と'],
                jlpt: 'N2',
                examples: [
                    { word: '態度', reading: 'たいど', meaning: 'attitude' },
                    { word: '状態', reading: 'じょうたい', meaning: 'state, condition' },
                    { word: '実態', reading: 'じったい', meaning: 'actual situation' }
                ]
            },
            {
                character: '層',
                meanings: ['stratum', 'social class', 'layer'],
                onyomi: ['ソウ'],
                kunyomi: [],
                jlpt: 'N2',
                examples: [
                    { word: '階層', reading: 'かいそう', meaning: 'class, level, stratum' },
                    { word: '大気層', reading: 'たいきそう', meaning: 'atmosphere' },
                    { word: '若い層', reading: 'わかい層', meaning: 'young demographic' }
                ]
            },
            {
                character: '版',
                meanings: ['printing block', 'edition', 'version'],
                onyomi: ['ハン'],
                kunyomi: [],
                jlpt: 'N2',
                examples: [
                    { word: '出版', reading: 'しゅっぱん', meaning: 'publication' },
                    { word: '改訂版', reading: 'かいていばん', meaning: 'revised edition' },
                    { word: '初版', reading: 'しょはん', meaning: 'first edition' }
                ]
            },
            {
                character: '設',
                meanings: ['establishment', 'provision', 'prepare'],
                onyomi: ['セツ'],
                kunyomi: ['もう.ける'],
                jlpt: 'N2',
                examples: [
                    { word: '設立', reading: 'せつりつ', meaning: 'establishment, founding' },
                    { word: '建設', reading: 'けんせつ', meaning: 'construction' },
                    { word: '設備', reading: 'せつび', meaning: 'equipment, device' }
                ]
            }
        ],
        'N1': [
            // Selection of important N1 Kanji (2000+ total in full level)
            {
                character: '憲',
                meanings: ['constitution', 'law'],
                onyomi: ['ケン'],
                kunyomi: [],
                jlpt: 'N1',
                examples: [
                    { word: '憲法', reading: 'けんぽう', meaning: 'constitution' },
                    { word: '立憲', reading: 'りっけん', meaning: 'constitutional' },
                    { word: '改憲', reading: 'かいけん', meaning: 'constitutional revision' }
                ]
            },
            {
                character: '慣',
                meanings: ['accustomed', 'get used to', 'become experienced'],
                onyomi: ['カン'],
                kunyomi: ['な.れる', 'な.らす'],
                jlpt: 'N1',
                examples: [
                    { word: '習慣', reading: 'しゅうかん', meaning: 'habit, custom' },
                    { word: '慣れる', reading: 'なれる', meaning: 'to get used to' },
                    { word: '慣習', reading: 'かんしゅう', meaning: 'custom, convention' }
                ]
            },
            {
                character: '債',
                meanings: ['debt', 'loan', 'liabilities'],
                onyomi: ['サイ'],
                kunyomi: [],
                jlpt: 'N1',
                examples: [
                    { word: '債務', reading: 'さいむ', meaning: 'debt, liabilities' },
                    { word: '国債', reading: 'こくさい', meaning: 'government bond' },
                    { word: '債権', reading: 'さいけん', meaning: 'bond, debenture' }
                ]
            },
            {
                character: '施',
                meanings: ['give', 'bestow', 'perform'],
                onyomi: ['シ', 'セ'],
                kunyomi: ['ほどこ.す'],
                jlpt: 'N1',
                examples: [
                    { word: '実施', reading: 'じっし', meaning: 'enforcement, implementation' },
                    { word: '施設', reading: 'しせつ', meaning: 'institution, establishment' },
                    { word: '措置', reading: 'そち', meaning: 'measure, step' }
                ]
            },
            {
                character: '奪',
                meanings: ['rob', 'take by force', 'snatch away'],
                onyomi: ['ダツ'],
                kunyomi: ['うば.う'],
                jlpt: 'N1',
                examples: [
                    { word: '奪う', reading: 'うばう', meaning: 'to snatch away' },
                    { word: '強奪', reading: 'ごうだつ', meaning: 'robbery, plunder' },
                    { word: '奪取', reading: 'だっしゅ', meaning: 'usurpation, taking' }
                ]
            },
            {
                character: '探',
                meanings: ['grope', 'search', 'look for'],
                onyomi: ['タン'],
                kunyomi: ['さが.す', 'さぐ.る'],
                jlpt: 'N1',
                examples: [
                    { word: '探す', reading: 'さがす', meaning: 'to search for' },
                    { word: '探検', reading: 'たんけん', meaning: 'exploration' },
                    { word: '探偵', reading: 'たんてい', meaning: 'detective' }
                ]
            },
            {
                character: '維',
                meanings: ['fiber', 'tie', 'rope'],
                onyomi: ['イ'],
                kunyomi: [],
                jlpt: 'N1',
                examples: [
                    { word: '維持', reading: 'いじ', meaning: 'maintenance, preservation' },
                    { word: '繊維', reading: 'せんい', meaning: 'fiber, textile' },
                    { word: '維新', reading: 'いしん', meaning: 'restoration, revolution' }
                ]
            },
            {
                character: '献',
                meanings: ['offering', 'present', 'dedicate'],
                onyomi: ['ケン', 'コン'],
                kunyomi: ['たてまつ.る'],
                jlpt: 'N1',
                examples: [
                    { word: '献身', reading: 'けんしん', meaning: 'devotion, dedication' },
                    { word: '貢献', reading: 'こうけん', meaning: 'contribution' },
                    { word: '献立', reading: 'こんだて', meaning: 'menu, program' }
                ]
            },
            {
                character: '優',
                meanings: ['tenderness', 'excel', 'surpass'],
                onyomi: ['ユウ', 'ウ'],
                kunyomi: ['やさ.しい', 'すぐ.れる'],
                jlpt: 'N1',
                examples: [
                    { word: '優しい', reading: 'やさしい', meaning: 'kind, gentle' },
                    { word: '優秀', reading: 'ゆうしゅう', meaning: 'excellent, outstanding' },
                    { word: '優勝', reading: 'ゆうしょう', meaning: 'overall victory' }
                ]
            },
            {
                character: '握',
                meanings: ['grip', 'hold', 'mould sushi'],
                onyomi: ['アク'],
                kunyomi: ['にぎ.る'],
                jlpt: 'N1',
                examples: [
                    { word: '握る', reading: 'にぎる', meaning: 'to grasp, to grip' },
                    { word: '把握', reading: 'はあく', meaning: 'grasp, catch' },
                    { word: '握手', reading: 'あくしゅ', meaning: 'handshake' }
                ]
            }
        ]
    };

    static async getKanjiByLevel(level = 'N5') {
        // NEW: Bypass the browser cache completely for hardcoded basic alphabets
        if (level === 'Hiragana' || level === 'Katakana') {
            // THE FIX: Use getAdditionalKanjiForLevel so N5 kanji don't get mixed in
            return this.getAdditionalKanjiForLevel(level);
        }
        const cacheKey = `level_${level}`;

        // Return cached data if available
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // 1. INSTANT LOAD: Grab local fallback data immediately so the UI doesn't freeze
        let kanjiList = this.getEnhancedFallbackData(level);

        // Ensure no duplicates exist in the initial load
        const uniqueKanji = Array.from(new Map(kanjiList.map(k => [k.character, k])).values());
        this.cache.set(cacheKey, uniqueKanji);

        // 2. BACKGROUND SYNC: Fetch from external APIs without blocking the user
        this.fetchKanjiFromMultipleSources(level).then(freshData => {
            if (freshData && freshData.length > 0) {
                const updatedUnique = Array.from(new Map(freshData.map(k => [k.character, k])).values());
                this.cache.set(cacheKey, updatedUnique);
                console.log(`Background sync finished: Loaded ${updatedUnique.length} kanji for ${level}`);

                // CRITICAL FIX: Inform the app to auto-refresh the UI if viewing this level
                if (window.app && window.app.settings.jlptLevel === level) {
                    window.app.refreshActivePool(updatedUnique);
                }
            }
        }).catch(error => console.log('Background sync skipped:', error));

        return uniqueKanji;
    }

    static async fetchKanjiFromJisho(character) {
        try {
            const response = await fetch(`${this.baseUrl}?keyword=${encodeURIComponent(character)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Find the entry that contains our kanji character
            const entry = data.data.find(item => 
                item.japanese.some(jp => jp.word && jp.word.includes(character))
            );

            if (!entry) {
                return null;
            }

            // Extract kanji information
            const japanese = entry.japanese[0];
            const senses = entry.senses[0];
            
            return {
                character: character,
                meanings: senses.english_definitions || [],
                onyomi: this.extractReadings(entry.japanese, 'on') || [],
                kunyomi: this.extractReadings(entry.japanese, 'kun') || [],
                examples: this.extractExamples(data.data.slice(0, 3), character),
                jlpt: this.extractJLPTLevel(entry.tags) || 'N5'
            };

        } catch (error) {
            console.error(`Error fetching kanji ${character} from Jisho:`, error);
            return null;
        }
    }

    static extractReadings(japaneseEntries, type) {
        const readings = [];
        
        japaneseEntries.forEach(entry => {
            if (entry.reading) {
                if (type === 'on') {
                    if (entry.reading.length <= 3 || /[ァ-ヴ]/.test(entry.reading)) {
                        readings.push(entry.reading);
                    }
                } else {
                    if (entry.reading.length > 3 && !/[ァ-ヴ]/.test(entry.reading)) {
                        readings.push(entry.reading);
                    }
                }
            }
        });

        return [...new Set(readings)]; // Remove duplicates
    }

    static extractExamples(entries, character) {
        const examples = [];
        
        entries.forEach(entry => {
            entry.japanese.forEach(jp => {
                if (jp.word && jp.word.includes(character) && jp.reading) {
                    const meanings = entry.senses[0]?.english_definitions || [];
                    examples.push({
                        word: jp.word,
                        reading: jp.reading,
                        meaning: meanings.slice(0, 2).join(', ')
                    });
                }
            });
        });

        return examples.slice(0, 3); // Limit to 3 examples
    }

    static extractJLPTLevel(tags) {
        if (!tags) return null;
        
        const jlptTag = tags.find(tag => tag.startsWith('jlpt-'));
        if (jlptTag) {
            return jlptTag.replace('jlpt-', '').toUpperCase();
        }
        
        return null;
    }

    static async searchKanji(query) {
        try {
            // Try API search first
            const response = await fetch(`${this.baseUrl}?keyword=${encodeURIComponent(query)}`);
            
            if (response.ok) {
                const data = await response.json();
                return data.data || [];
            }
        } catch (error) {
            console.error('Error searching kanji via API:', error);
        }

        // Fallback to local search
        const results = [];
        Object.values(this.fallbackData).forEach(levelKanji => {
            levelKanji.forEach(kanji => {
                if (kanji.character.includes(query) || 
                    kanji.meanings.some(meaning => meaning.toLowerCase().includes(query.toLowerCase())) ||
                    kanji.examples.some(example => example.word.includes(query) || example.meaning.toLowerCase().includes(query.toLowerCase()))) {
                    results.push(kanji);
                }
            });
        });
        
        return results;
    }

    static async fetchKanjiFromMultipleSources(level) {
        try {
            console.log(`Fetching kanji data for ${level} from multiple sources...`);
            
            let kanjiList = this.getEnhancedFallbackData(level);
            console.log(`Base fallback data: ${kanjiList.length} kanji for ${level}`);

            try {
                const kanjiApiData = await this.fetchFromKanjiApi(level);
                if (kanjiApiData && kanjiApiData.length > 0) {
                    console.log(`KanjiAPI.dev provided ${kanjiApiData.length} additional kanji`);
                    kanjiList = this.mergeKanjiData(kanjiList, kanjiApiData);
                }
            } catch (error) {
                console.log('KanjiAPI.dev not available, using fallback data');
            }

            try {
                const wanikaniData = await this.fetchFromWaniKani(level);
                if (wanikaniData && wanikaniData.length > 0) {
                    console.log(`WaniKani provided ${wanikaniData.length} kanji`);
                    kanjiList = this.mergeKanjiData(kanjiList, wanikaniData);
                }
            } catch (error) {
                console.log('WaniKani API not available');
            }

            console.log(`Final kanji count for ${level}: ${kanjiList.length}`);
            return kanjiList;
        } catch (error) {
            console.error('Error fetching from multiple sources:', error);
            return this.getEnhancedFallbackData(level);
        }
    }

    static async fetchFromWaniKani(level) {
        try {
            const jlptMapping = {
                'N5': '1,2,3',
                'N4': '4,5,6',
                'N3': '7,8,9',
                'N2': '10,11,12',
                'N1': '13,14,15'
            };

            const levelParam = jlptMapping[level] || '1,2,3';
            const response = await fetch(`${this.wanikaniUrl}?types=kanji&levels=${levelParam}`, {
                headers: {
                    'Authorization': 'Bearer YOUR_WANIKANI_TOKEN'
                }
            });

            if (!response.ok) {
                throw new Error('WaniKani API not available');
            }

            const data = await response.json();
            return this.parseWaniKaniData(data.data);
        } catch (error) {
            console.error('WaniKani API error:', error);
            return null;
        }
    }

    static parseWaniKaniData(data) {
        return data.map(item => ({
            character: item.data.characters,
            meanings: item.data.meanings.map(m => m.meaning),
            onyomi: item.data.readings.filter(r => r.type === 'onyomi').map(r => r.reading),
            kunyomi: item.data.readings.filter(r => r.type === 'kunyomi').map(r => r.reading),
            jlpt: `N${Math.ceil(item.data.level / 10)}`,
            examples: []
        }));
    }

    static getEnhancedFallbackData(level) {
        const baseData = this.fallbackData[level] || this.fallbackData['N5'];
        console.log(`Base data for ${level}: ${baseData.length} kanji`);
        
        const enhancedData = [...baseData];
        const additionalKanji = this.getAdditionalKanjiForLevel(level);
        console.log(`Additional kanji for ${level}: ${additionalKanji.length} kanji`);
        enhancedData.push(...additionalKanji);
        
        console.log(`Enhanced data for ${level}: ${enhancedData.length} total kanji`);
        return enhancedData;
    }

    static getAdditionalKanjiForLevel(level) {
        const additionalKanji = {
            'Hiragana': [
                // A Row
                { character: 'あ', meanings: ['a'], kunyomi: ['あ'], examples: [{ word: 'ありがとう', reading: 'ありがとう', meaning: 'Thank you' }, { word: '雨', reading: 'あめ', meaning: 'Rain' }] },
                { character: 'い', meanings: ['i'], kunyomi: ['い'], examples: [{ word: '犬', reading: 'いぬ', meaning: 'Dog' }, { word: '今', reading: 'いま', meaning: 'Now' }] },
                { character: 'う', meanings: ['u'], kunyomi: ['う'], examples: [{ word: '海', reading: 'うみ', meaning: 'Sea' }, { word: '歌', reading: 'うた', meaning: 'Song' }] },
                { character: 'え', meanings: ['e'], kunyomi: ['え'], examples: [{ word: '駅', reading: 'えき', meaning: 'Station' }, { word: '鉛筆', reading: 'えんぴつ', meaning: 'Pencil' }] },
                { character: 'お', meanings: ['o'], kunyomi: ['お'], examples: [{ word: 'おはよう', reading: 'おはよう', meaning: 'Good morning' }, { word: 'お茶', reading: 'おちゃ', meaning: 'Tea' }] },

                // K Row
                { character: 'か', meanings: ['ka'], kunyomi: ['か'], examples: [{ word: '傘', reading: 'かさ', meaning: 'Umbrella' }, { word: '家族', reading: 'かぞく', meaning: 'Family' }] },
                { character: 'き', meanings: ['ki'], kunyomi: ['き'], examples: [{ word: '木', reading: 'き', meaning: 'Tree' }, { word: '今日', reading: 'きょう', meaning: 'Today' }] },
                { character: 'く', meanings: ['ku'], kunyomi: ['く'], examples: [{ word: '靴', reading: 'くつ', meaning: 'Shoes' }, { word: '車', reading: 'くるま', meaning: 'Car' }] },
                { character: 'け', meanings: ['ke'], kunyomi: ['け'], examples: [{ word: '今朝', reading: 'けさ', meaning: 'This morning' }, { word: '結婚', reading: 'けっこん', meaning: 'Marriage' }] },
                { character: 'こ', meanings: ['ko'], kunyomi: ['こ'], examples: [{ word: '子供', reading: 'こども', meaning: 'Child' }, { word: '心', reading: 'こころ', meaning: 'Heart' }] },

                // S Row
                { character: 'さ', meanings: ['sa'], kunyomi: ['さ'], examples: [{ word: '桜', reading: 'さくら', meaning: 'Cherry blossom' }, { word: '魚', reading: 'さかな', meaning: 'Fish' }] },
                { character: 'し', meanings: ['shi'], kunyomi: ['し'], examples: [{ word: '写真', reading: 'しゃしん', meaning: 'Photo' }, { word: '仕事', reading: 'しごと', meaning: 'Work' }] },
                { character: 'す', meanings: ['su'], kunyomi: ['す'], examples: [{ word: '寿司', reading: 'すし', meaning: 'Sushi' }, { word: '水泳', reading: 'すいえい', meaning: 'Swimming' }] },
                { character: 'せ', meanings: ['se'], kunyomi: ['せ'], examples: [{ word: '先生', reading: 'せんせい', meaning: 'Teacher' }, { word: '世界', reading: 'せかい', meaning: 'World' }] },
                { character: 'そ', meanings: ['so'], kunyomi: ['そ'], examples: [{ word: '空', reading: 'そら', meaning: 'Sky' }, { word: '外', reading: 'そと', meaning: 'Outside' }] },

                // T Row
                { character: 'た', meanings: ['ta'], kunyomi: ['た'], examples: [{ word: '食べ物', reading: 'たべもの', meaning: 'Food' }, { word: '卵', reading: 'たまご', meaning: 'Egg' }] },
                { character: 'ち', meanings: ['chi'], kunyomi: ['ち'], examples: [{ word: '地下鉄', reading: 'ちかてつ', meaning: 'Subway' }, { word: '近い', reading: 'ちかい', meaning: 'Near' }] },
                { character: 'つ', meanings: ['tsu'], kunyomi: ['つ'], examples: [{ word: '月', reading: 'つき', meaning: 'Moon' }, { word: '机', reading: 'つくえ', meaning: 'Desk' }] },
                { character: 'て', meanings: ['te'], kunyomi: ['て'], examples: [{ word: '手', reading: 'て', meaning: 'Hand' }, { word: '手紙', reading: 'てがみ', meaning: 'Letter' }] },
                { character: 'と', meanings: ['to'], kunyomi: ['と'], examples: [{ word: '友達', reading: 'ともだち', meaning: 'Friend' }, { word: '時計', reading: 'とけい', meaning: 'Clock' }] },

                // N Row
                { character: 'な', meanings: ['na'], kunyomi: ['な'], examples: [{ word: '名前', reading: 'なまえ', meaning: 'Name' }, { word: '夏', reading: 'なつ', meaning: 'Summer' }] },
                { character: 'に', meanings: ['ni'], kunyomi: ['に'], examples: [{ word: '肉', reading: 'にく', meaning: 'Meat' }, { word: '日本', reading: 'にほん', meaning: 'Japan' }] },
                { character: 'ぬ', meanings: ['nu'], kunyomi: ['ぬ'], examples: [{ word: 'ぬいぐるみ', reading: 'ぬいぐるみ', meaning: 'Stuffed toy' }, { word: '塗る', reading: 'ぬる', meaning: 'To paint' }] },
                { character: 'ね', meanings: ['ne'], kunyomi: ['ね'], examples: [{ word: '猫', reading: 'ねこ', meaning: 'Cat' }, { word: '眠い', reading: 'ねむい', meaning: 'Sleepy' }] },
                { character: 'の', meanings: ['no'], kunyomi: ['の'], examples: [{ word: '飲み物', reading: 'のみもの', meaning: 'Drink' }, { word: '乗り物', reading: 'のりもの', meaning: 'Vehicle' }] },

                // H Row
                { character: 'は', meanings: ['ha'], kunyomi: ['は'], examples: [{ word: '花', reading: 'はな', meaning: 'Flower' }, { word: '春', reading: 'はる', meaning: 'Spring' }] },
                { character: 'ひ', meanings: ['hi'], kunyomi: ['ひ'], examples: [{ word: '人', reading: 'ひと', meaning: 'Person' }, { word: '飛行機', reading: 'ひこうき', meaning: 'Airplane' }] },
                { character: 'ふ', meanings: ['fu'], kunyomi: ['ふ'], examples: [{ word: '冬', reading: 'ふゆ', meaning: 'Winter' }, { word: '船', reading: 'ふね', meaning: 'Ship' }] },
                { character: 'へ', meanings: ['he'], kunyomi: ['へ'], examples: [{ word: '部屋', reading: 'へや', meaning: 'Room' }, { word: '平和', reading: 'へいわ', meaning: 'Peace' }] },
                { character: 'ほ', meanings: ['ho'], kunyomi: ['ほ'], examples: [{ word: '星', reading: 'ほし', meaning: 'Star' }, { word: '本', reading: 'ほん', meaning: 'Book' }] },

                // M Row
                { character: 'ま', meanings: ['ma'], kunyomi: ['ま'], examples: [{ word: '窓', reading: 'まど', meaning: 'Window' }, { word: '毎日', reading: 'まいにち', meaning: 'Every day' }] },
                { character: 'み', meanings: ['mi'], kunyomi: ['み'], examples: [{ word: '水', reading: 'みず', meaning: 'Water' }, { word: '道', reading: 'みち', meaning: 'Road/Street' }] },
                { character: 'む', meanings: ['mu'], kunyomi: ['む'], examples: [{ word: '虫', reading: 'むし', meaning: 'Insect' }, { word: '昔', reading: 'むかし', meaning: 'Old times' }] },
                { character: 'め', meanings: ['me'], kunyomi: ['め'], examples: [{ word: '目', reading: 'め', meaning: 'Eye' }, { word: '眼鏡', reading: 'めがね', meaning: 'Glasses' }] },
                { character: 'も', meanings: ['mo'], kunyomi: ['も'], examples: [{ word: '森', reading: 'もり', meaning: 'Forest' }, { word: '桃', reading: 'もも', meaning: 'Peach' }] },

                // Y Row
                { character: 'や', meanings: ['ya'], kunyomi: ['や'], examples: [{ word: '山', reading: 'やま', meaning: 'Mountain' }, { word: '野菜', reading: 'やさい', meaning: 'Vegetable' }] },
                { character: 'ゆ', meanings: ['yu'], kunyomi: ['ゆ'], examples: [{ word: '雪', reading: 'ゆき', meaning: 'Snow' }, { word: '夢', reading: 'ゆめ', meaning: 'Dream' }] },
                { character: 'よ', meanings: ['yo'], kunyomi: ['よ'], examples: [{ word: '夜', reading: 'よる', meaning: 'Night' }, { word: '呼ぶ', reading: 'よぶ', meaning: 'To call' }] },

                // R Row
                { character: 'ら', meanings: ['ra'], kunyomi: ['ら'], examples: [{ word: '来週', reading: 'らいしゅう', meaning: 'Next week' }, { word: '楽', reading: 'らく', meaning: 'Comfortable' }] },
                { character: 'り', meanings: ['ri'], kunyomi: ['り'], examples: [{ word: '林檎', reading: 'りんご', meaning: 'Apple' }, { word: '料理', reading: 'りょうり', meaning: 'Cooking' }] },
                { character: 'る', meanings: ['ru'], kunyomi: ['る'], examples: [{ word: '留守', reading: 'るす', meaning: 'Absence' }, { word: '走る', reading: 'はしる', meaning: 'To run' }] },
                { character: 'れ', meanings: ['re'], kunyomi: ['れ'], examples: [{ word: '冷蔵庫', reading: 'れいぞうこ', meaning: 'Refrigerator' }, { word: '練習', reading: 'れんしゅう', meaning: 'Practice' }] },
                { character: 'ろ', meanings: ['ro'], kunyomi: ['ろ'], examples: [{ word: '六', reading: 'ろく', meaning: 'Six' }, { word: '廊下', reading: 'ろうか', meaning: 'Corridor' }] },

                // W & N Row
                { character: 'わ', meanings: ['wa'], kunyomi: ['わ'], examples: [{ word: '私', reading: 'わたし', meaning: 'I/Me' }, { word: '笑う', reading: 'わらう', meaning: 'To laugh' }] },
                { character: 'を', meanings: ['wo'], kunyomi: ['を'], examples: [{ word: '本を読む', reading: 'ほんをよむ', meaning: 'Read a book' }] },
                { character: 'ん', meanings: ['n'], kunyomi: ['ん'], examples: [{ word: 'パン', reading: 'ぱん', meaning: 'Bread' }, { word: '三', reading: 'さん', meaning: 'Three' }] }
            ].map(kana => ({ onyomi: [], jlpt: 'Hiragana', ...kana })),

            'Katakana': [
                // A Row
                { character: 'ア', meanings: ['a'], kunyomi: ['ア'], examples: [{ word: 'アイス', reading: 'アイス', meaning: 'Ice cream' }, { word: 'アニメ', reading: 'アニメ', meaning: 'Anime' }] },
                { character: 'イ', meanings: ['i'], kunyomi: ['イ'], examples: [{ word: 'インターネット', reading: 'インターネット', meaning: 'Internet' }, { word: 'イギリス', reading: 'イギリス', meaning: 'UK' }] },
                { character: 'ウ', meanings: ['u'], kunyomi: ['ウ'], examples: [{ word: 'ウイルス', reading: 'ウイルス', meaning: 'Virus' }, { word: 'ウィンドウ', reading: 'ウィンドウ', meaning: 'Window' }] },
                { character: 'エ', meanings: ['e'], kunyomi: ['エ'], examples: [{ word: 'エレベーター', reading: 'エレベーター', meaning: 'Elevator' }, { word: 'エンジン', reading: 'エンジン', meaning: 'Engine' }] },
                { character: 'オ', meanings: ['o'], kunyomi: ['オ'], examples: [{ word: 'オレンジ', reading: 'オレンジ', meaning: 'Orange' }, { word: 'オリンピック', reading: 'オリンピック', meaning: 'Olympics' }] },

                // K Row
                { character: 'カ', meanings: ['ka'], kunyomi: ['カ'], examples: [{ word: 'カメラ', reading: 'カメラ', meaning: 'Camera' }, { word: 'カレンダー', reading: 'カレンダー', meaning: 'Calendar' }] },
                { character: 'キ', meanings: ['ki'], kunyomi: ['キ'], examples: [{ word: 'キーボード', reading: 'キーボード', meaning: 'Keyboard' }, { word: 'ギター', reading: 'ギター', meaning: 'Guitar' }] },
                { character: 'ク', meanings: ['ku'], kunyomi: ['ク'], examples: [{ word: 'クラス', reading: 'クラス', meaning: 'Class' }, { word: 'クレジットカード', reading: 'クレジットカード', meaning: 'Credit card' }] },
                { character: 'ケ', meanings: ['ke'], kunyomi: ['ケ'], examples: [{ word: 'ケーキ', reading: 'ケーキ', meaning: 'Cake' }, { word: 'ケース', reading: 'ケース', meaning: 'Case' }] },
                { character: 'コ', meanings: ['ko'], kunyomi: ['コ'], examples: [{ word: 'コーヒー', reading: 'コーヒー', meaning: 'Coffee' }, { word: 'コンピューター', reading: 'コンピューター', meaning: 'Computer' }] },

                // S Row
                { character: 'サ', meanings: ['sa'], kunyomi: ['サ'], examples: [{ word: 'サッカー', reading: 'サッカー', meaning: 'Soccer' }, { word: 'サラダ', reading: 'サラダ', meaning: 'Salad' }] },
                { character: 'シ', meanings: ['shi'], kunyomi: ['シ'], examples: [{ word: 'シャツ', reading: 'シャツ', meaning: 'Shirt' }, { word: 'シャワー', reading: 'シャワー', meaning: 'Shower' }] },
                { character: 'ス', meanings: ['su'], kunyomi: ['ス'], examples: [{ word: 'スポーツ', reading: 'スポーツ', meaning: 'Sports' }, { word: 'スマートフォン', reading: 'スマートフォン', meaning: 'Smartphone' }] },
                { character: 'セ', meanings: ['se'], kunyomi: ['セ'], examples: [{ word: 'セーター', reading: 'セーター', meaning: 'Sweater' }, { word: 'センター', reading: 'センター', meaning: 'Center' }] },
                { character: 'ソ', meanings: ['so'], kunyomi: ['ソ'], examples: [{ word: 'ソファ', reading: 'ソファ', meaning: 'Sofa' }, { word: 'ソース', reading: 'ソース', meaning: 'Sauce' }] },

                // T Row
                { character: 'タ', meanings: ['ta'], kunyomi: ['タ'], examples: [{ word: 'タクシー', reading: 'タクシー', meaning: 'Taxi' }, { word: 'タオル', reading: 'タオル', meaning: 'Towel' }] },
                { character: 'チ', meanings: ['chi'], kunyomi: ['チ'], examples: [{ word: 'チーズ', reading: 'チーズ', meaning: 'Cheese' }, { word: 'チケット', reading: 'チケット', meaning: 'Ticket' }] },
                { character: 'ツ', meanings: ['tsu'], kunyomi: ['ツ'], examples: [{ word: 'ツアー', reading: 'ツアー', meaning: 'Tour' }, { word: 'スーツ', reading: 'スーツ', meaning: 'Suit' }] },
                { character: 'テ', meanings: ['te'], kunyomi: ['テ'], examples: [{ word: 'テレビ', reading: 'テレビ', meaning: 'TV' }, { word: 'テーブル', reading: 'テーブル', meaning: 'Table' }] },
                { character: 'ト', meanings: ['to'], kunyomi: ['ト'], examples: [{ word: 'トイレ', reading: 'トイレ', meaning: 'Toilet' }, { word: 'トマト', reading: 'トマト', meaning: 'Tomato' }] },

                // N Row
                { character: 'ナ', meanings: ['na'], kunyomi: ['ナ'], examples: [{ word: 'ナイフ', reading: 'ナイフ', meaning: 'Knife' }, { word: 'バナナ', reading: 'バナナ', meaning: 'Banana' }] },
                { character: 'ニ', meanings: ['ni'], kunyomi: ['ニ'], examples: [{ word: 'ニュース', reading: 'ニュース', meaning: 'News' }, { word: 'テニス', reading: 'テニス', meaning: 'Tennis' }] },
                { character: 'ヌ', meanings: ['nu'], kunyomi: ['ヌ'], examples: [{ word: 'ヌードル', reading: 'ヌードル', meaning: 'Noodle' }, { word: 'カヌー', reading: 'カヌー', meaning: 'Canoe' }] },
                { character: 'ネ', meanings: ['ne'], kunyomi: ['ネ'], examples: [{ word: 'ネクタイ', reading: 'ネクタイ', meaning: 'Necktie' }, { word: 'ネット', reading: 'ネット', meaning: 'Net' }] },
                { character: 'ノ', meanings: ['no'], kunyomi: ['ノ'], examples: [{ word: 'ノート', reading: 'ノート', meaning: 'Notebook' }, { word: 'ノック', reading: 'ノック', meaning: 'Knock' }] },

                // H Row
                { character: 'ハ', meanings: ['ha'], kunyomi: ['ハ'], examples: [{ word: 'ハンバーガー', reading: 'ハンバーガー', meaning: 'Hamburger' }, { word: 'バス', reading: 'バス', meaning: 'Bus' }] },
                { character: 'ヒ', meanings: ['hi'], kunyomi: ['ヒ'], examples: [{ word: 'ヒーター', reading: 'ヒーター', meaning: 'Heater' }, { word: 'ヒーロー', reading: 'ヒーロー', meaning: 'Hero' }] },
                { character: 'フ', meanings: ['fu'], kunyomi: ['フ'], examples: [{ word: 'フィルム', reading: 'フィルム', meaning: 'Film' }, { word: 'フォーク', reading: 'フォーク', meaning: 'Fork' }] },
                { character: 'ヘ', meanings: ['he'], kunyomi: ['ヘ'], examples: [{ word: 'ヘリコプター', reading: 'ヘリコプター', meaning: 'Helicopter' }, { word: 'ヘルメット', reading: 'ヘルメット', meaning: 'Helmet' }] },
                { character: 'ホ', meanings: ['ho'], kunyomi: ['ホ'], examples: [{ word: 'ホテル', reading: 'ホテル', meaning: 'Hotel' }, { word: 'ホット', reading: 'ホット', meaning: 'Hot' }] },

                // M Row
                { character: 'マ', meanings: ['ma'], kunyomi: ['マ'], examples: [{ word: 'マウス', reading: 'マウス', meaning: 'Mouse' }, { word: 'マスク', reading: 'マスク', meaning: 'Mask' }] },
                { character: 'ミ', meanings: ['mi'], kunyomi: ['ミ'], examples: [{ word: 'ミルク', reading: 'ミルク', meaning: 'Milk' }, { word: 'ミラー', reading: 'ミラー', meaning: 'Mirror' }] },
                { character: 'ム', meanings: ['mu'], kunyomi: ['ム'], examples: [{ word: 'ムービー', reading: 'ムービー', meaning: 'Movie' }, { word: 'チーム', reading: 'チーム', meaning: 'Team' }] },
                { character: 'メ', meanings: ['me'], kunyomi: ['メ'], examples: [{ word: 'メール', reading: 'メール', meaning: 'Email' }, { word: 'メモ', reading: 'メモ', meaning: 'Memo' }] },
                { character: 'モ', meanings: ['mo'], kunyomi: ['モ'], examples: [{ word: 'モニター', reading: 'モニター', meaning: 'Monitor' }, { word: 'モーター', reading: 'モーター', meaning: 'Motor' }] },

                // Y Row
                { character: 'ヤ', meanings: ['ya'], kunyomi: ['ヤ'], examples: [{ word: 'タイヤ', reading: 'タイヤ', meaning: 'Tire' }, { word: 'ダイヤ', reading: 'ダイヤ', meaning: 'Diamond' }] },
                { character: 'ユ', meanings: ['yu'], kunyomi: ['ユ'], examples: [{ word: 'ユニフォーム', reading: 'ユニフォーム', meaning: 'Uniform' }, { word: 'ユーモア', reading: 'ユーモア', meaning: 'Humor' }] },
                { character: 'ヨ', meanings: ['yo'], kunyomi: ['ヨ'], examples: [{ word: 'ヨーロッパ', reading: 'ヨーロッパ', meaning: 'Europe' }, { word: 'ヨガ', reading: 'ヨガ', meaning: 'Yoga' }] },

                // R Row
                { character: 'ラ', meanings: ['ra'], kunyomi: ['ラ'], examples: [{ word: 'ラジオ', reading: 'ラジオ', meaning: 'Radio' }, { word: 'ラーメン', reading: 'ラーメン', meaning: 'Ramen' }] },
                { character: 'リ', meanings: ['ri'], kunyomi: ['リ'], examples: [{ word: 'リモコン', reading: 'リモコン', meaning: 'Remote control' }, { word: 'リスト', reading: 'リスト', meaning: 'List' }] },
                { character: 'ル', meanings: ['ru'], kunyomi: ['ル'], examples: [{ word: 'ルール', reading: 'ルール', meaning: 'Rule' }, { word: 'ルーター', reading: 'ルーター', meaning: 'Router' }] },
                { character: 'レ', meanings: ['re'], kunyomi: ['レ'], examples: [{ word: 'レストラン', reading: 'レストラン', meaning: 'Restaurant' }, { word: 'レシート', reading: 'レシート', meaning: 'Receipt' }] },
                { character: 'ロ', meanings: ['ro'], kunyomi: ['ロ'], examples: [{ word: 'ロボット', reading: 'ロボット', meaning: 'Robot' }, { word: 'ロッカー', reading: 'ロッカー', meaning: 'Locker' }] },

                // W & N Row
                { character: 'ワ', meanings: ['wa'], kunyomi: ['ワ'], examples: [{ word: 'ワイン', reading: 'ワイン', meaning: 'Wine' }, { word: 'ワイシャツ', reading: 'ワイシャツ', meaning: 'Dress shirt' }] },
                { character: 'ヲ', meanings: ['wo'], kunyomi: ['ヲ'], examples: [{ word: 'ヲタク', reading: 'ヲタク', meaning: 'Otaku' }] },
                { character: 'ン', meanings: ['n'], kunyomi: ['ン'], examples: [{ word: 'ペン', reading: 'ペン', meaning: 'Pen' }, { word: 'ボタン', reading: 'ボタン', meaning: 'Button' }] }
            ].map(kana => ({ onyomi: [], jlpt: 'Katakana', ...kana })),
            
            'N5': [
                // Cleaned standard additions (duplicates from base fallbackData removed)
                { character: '水', meanings: ['water'], onyomi: ['スイ'], kunyomi: ['みず'], jlpt: 'N5', examples: [{ word: '水', reading: 'みず', meaning: 'water' }] },
                { character: '火', meanings: ['fire'], onyomi: ['カ'], kunyomi: ['ひ', 'ほ-'], jlpt: 'N5', examples: [{ word: '火', reading: 'ひ', meaning: 'fire' }] },
                { character: '木', meanings: ['tree', 'wood'], onyomi: ['モク', 'ボク'], kunyomi: ['き'], jlpt: 'N5', examples: [{ word: '木', reading: 'き', meaning: 'tree' }] },
                { character: '土', meanings: ['earth', 'soil'], onyomi: ['ド', 'ト'], kunyomi: ['つち'], jlpt: 'N5', examples: [{ word: '土', reading: 'つち', meaning: 'soil' }] },
                { character: '先', meanings: ['before', 'ahead'], onyomi: ['セン'], kunyomi: ['さき'], jlpt: 'N5', examples: [{ word: '先生', reading: 'せんせい', meaning: 'teacher' }] },
                { character: '何', meanings: ['what', 'how many'], onyomi: ['カ'], kunyomi: ['なに', 'なん'], jlpt: 'N5', examples: [{ word: '何', reading: 'なに', meaning: 'what' }] },

                // Missing JLPT N5 Kanji to reach the official count
                { character: '万', meanings: ['ten thousand'], onyomi: ['マン', 'バン'], kunyomi: [], jlpt: 'N5', examples: [{ word: '一万', reading: 'いちまん', meaning: 'ten thousand' }] },
                { character: '父', meanings: ['father'], onyomi: ['フ'], kunyomi: ['ちち'], jlpt: 'N5', examples: [{ word: 'お父さん', reading: 'おとうさん', meaning: 'father' }] },
                { character: '母', meanings: ['mother'], onyomi: ['ボ'], kunyomi: ['はは'], jlpt: 'N5', examples: [{ word: 'お母さん', reading: 'おかあさん', meaning: 'mother' }] },
                { character: '友', meanings: ['friend'], onyomi: ['ユウ'], kunyomi: ['とも'], jlpt: 'N5', examples: [{ word: '友達', reading: 'ともだち', meaning: 'friend' }] },
                { character: '男', meanings: ['man', 'male'], onyomi: ['ダン', 'ナン'], kunyomi: ['おとこ'], jlpt: 'N5', examples: [{ word: '男の子', reading: 'おとこのこ', meaning: 'boy' }] },
                { character: '女', meanings: ['woman', 'female'], onyomi: ['ジョ'], kunyomi: ['おんな'], jlpt: 'N5', examples: [{ word: '女の子', reading: 'おんなのこ', meaning: 'girl' }] },
                { character: '子', meanings: ['child'], onyomi: ['シ', 'ス'], kunyomi: ['こ'], jlpt: 'N5', examples: [{ word: '子供', reading: 'こども', meaning: 'child' }] },
                { character: '食', meanings: ['eat', 'food'], onyomi: ['ショク'], kunyomi: ['た.べる'], jlpt: 'N5', examples: [{ word: '食べる', reading: 'たべる', meaning: 'to eat' }] },
                { character: '飲', meanings: ['drink'], onyomi: ['イン'], kunyomi: ['の.む'], jlpt: 'N5', examples: [{ word: '飲む', reading: 'のむ', meaning: 'to drink' }] },
                { character: '買', meanings: ['buy'], onyomi: ['バイ'], kunyomi: ['か.う'], jlpt: 'N5', examples: [{ word: '買う', reading: 'かう', meaning: 'to buy' }] },
                { character: '書', meanings: ['write', 'book'], onyomi: ['ショ'], kunyomi: ['か.く'], jlpt: 'N5', examples: [{ word: '書く', reading: 'かく', meaning: 'to write' }] },
                { character: '読', meanings: ['read'], onyomi: ['ドク'], kunyomi: ['よ.む'], jlpt: 'N5', examples: [{ word: '読む', reading: 'よむ', meaning: 'to read' }] },
                { character: '聞', meanings: ['hear', 'ask', 'listen'], onyomi: ['ブン', 'モン'], kunyomi: ['き.く'], jlpt: 'N5', examples: [{ word: '聞く', reading: 'きく', meaning: 'to listen/ask' }] },
                { character: '西', meanings: ['west'], onyomi: ['セイ', 'サイ'], kunyomi: ['にし'], jlpt: 'N5', examples: [{ word: '西', reading: 'にし', meaning: 'west' }] },
                { character: '南', meanings: ['south'], onyomi: ['ナン', 'ナ'], kunyomi: ['みなみ'], jlpt: 'N5', examples: [{ word: '南', reading: 'みなみ', meaning: 'south' }] },
                { character: '北', meanings: ['north'], onyomi: ['ホク'], kunyomi: ['きた'], jlpt: 'N5', examples: [{ word: '北', reading: 'きた', meaning: 'north' }] },
                { character: '半', meanings: ['half'], onyomi: ['ハン'], kunyomi: ['なか.ば'], jlpt: 'N5', examples: [{ word: '半分', reading: 'はんぶん', meaning: 'half' }] },
                { character: '電', meanings: ['electricity'], onyomi: ['デン'], kunyomi: [], jlpt: 'N5', examples: [{ word: '電車', reading: 'でんしゃ', meaning: 'train' }] },
                { character: '門', meanings: ['gates'], onyomi: ['モン'], kunyomi: ['かど'], jlpt: 'N5', examples: [{ word: '門', reading: 'もん', meaning: 'gate' }] },
                { character: '午', meanings: ['noon'], onyomi: ['ゴ'], kunyomi: [], jlpt: 'N5', examples: [{ word: '午前', reading: 'ごぜん', meaning: 'morning/AM' }] },
                { character: '駅', meanings: ['station'], onyomi: ['エキ'], kunyomi: [], jlpt: 'N5', examples: [{ word: '駅', reading: 'えき', meaning: 'station' }] },
                { character: '店', meanings: ['store', 'shop'], onyomi: ['テン'], kunyomi: ['みせ'], jlpt: 'N5', examples: [{ word: '店', reading: 'みせ', meaning: 'shop' }] },
                { character: '空', meanings: ['sky', 'empty'], onyomi: ['クウ'], kunyomi: ['そら', 'あ.く'], jlpt: 'N5', examples: [{ word: '空', reading: 'そら', meaning: 'sky' }] },
                { character: '白', meanings: ['white'], onyomi: ['ハク', 'ビャク'], kunyomi: ['しろ', 'しろ.い'], jlpt: 'N5', examples: [{ word: '白い', reading: 'しろい', meaning: 'white' }] },
                { character: '雨', meanings: ['rain'], onyomi: ['ウ'], kunyomi: ['あめ'], jlpt: 'N5', examples: [{ word: '雨', reading: 'あめ', meaning: 'rain' }] },
                { character: '足', meanings: ['foot', 'leg'], onyomi: ['ソク'], kunyomi: ['あし', 'た.りる'], jlpt: 'N5', examples: [{ word: '足', reading: 'あし', meaning: 'foot/leg' }] },
                { character: '耳', meanings: ['ear'], onyomi: ['ジ'], kunyomi: ['みみ'], jlpt: 'N5', examples: [{ word: '耳', reading: 'みみ', meaning: 'ear' }] },
                { character: '口', meanings: ['mouth'], onyomi: ['コウ'], kunyomi: ['くち'], jlpt: 'N5', examples: [{ word: '口', reading: 'くち', meaning: 'mouth' }] }
            ],
            
            'N4': [
                {
                    character: '経',
                    meanings: ['sutra', 'longitude', 'pass through'],
                    onyomi: ['ケイ', 'キョウ'],
                    kunyomi: ['へ.る'],
                    jlpt: 'N4',
                    examples: [
                        { word: '経済', reading: 'けいざい', meaning: 'economy' },
                        { word: '経験', reading: 'けいけん', meaning: 'experience' },
                        { word: '神経', reading: 'しんけい', meaning: 'nerve' }
                    ]
                },
                {
                    character: '済',
                    meanings: ['settle', 'finish', 'feel at ease'],
                    onyomi: ['サイ'],
                    kunyomi: ['す.む', 'す.ます'],
                    jlpt: 'N4',
                    examples: [
                        { word: '経済', reading: 'けいざい', meaning: 'economy' },
                        { word: '済む', reading: 'すむ', meaning: 'to finish' },
                        { word: '救済', reading: 'きゅうさい', meaning: 'relief' }
                    ]
                },
                {
                    character: '考',
                    meanings: ['think', 'consider'],
                    onyomi: ['コウ'],
                    kunyomi: ['かんが.える'],
                    jlpt: 'N4',
                    examples: [
                        { word: '考える', reading: 'かんがえる', meaning: 'to think' },
                        { word: '思考', reading: 'しこう', meaning: 'thought' },
                        { word: '考案', reading: 'こう案', meaning: 'idea, plan' }
                    ]
                },
                {
                    character: '思',
                    meanings: ['think', 'feel'],
                    onyomi: ['シ'],
                    kunyomi: ['おも.う'],
                    jlpt: 'N4',
                    examples: [
                        { word: '思う', reading: 'おもう', meaning: 'to think, feel' },
                        { word: '思考', reading: 'しこう', meaning: 'thought' },
                        { word: '意思', reading: 'いし', meaning: 'will, intention' }
                    ]
                },
                {
                    character: '意',
                    meanings: ['idea', 'mind', 'intention'],
                    onyomi: ['イ'],
                    kunyomi: [],
                    jlpt: 'N4',
                    examples: [
                        { word: '意味', reading: 'いみ', meaning: 'meaning' },
                        { word: '意見', reading: 'いけん', meaning: 'opinion' },
                        { word: '注意', reading: 'ちゅうい', meaning: 'attention, care' }
                    ]
                },
                {
                    character: '味',
                    meanings: ['taste', 'flavor'],
                    onyomi: ['ミ'],
                    kunyomi: ['あじ', 'あじ.わう'],
                    jlpt: 'N4',
                    examples: [
                        { word: '味', reading: 'あじ', meaning: 'taste' },
                        { word: '意味', reading: 'いみ', meaning: 'meaning' },
                        { word: '趣味', reading: 'しゅみ', meaning: 'hobby' }
                    ]
                },
                {
                    character: '心',
                    meanings: ['heart', 'mind', 'spirit'],
                    onyomi: ['シン'],
                    kunyomi: ['こころ'],
                    jlpt: 'N4',
                    examples: [
                        { word: '心', reading: 'こころ', meaning: 'heart, mind' },
                        { word: '安心', reading: 'あんしん', meaning: 'relief, peace of mind' },
                        { word: '中心', reading: 'ちゅうしん', meaning: 'center' }
                    ]
                },
                {
                    character: '体',
                    meanings: ['body'],
                    onyomi: ['タイ', 'テイ'],
                    kunyomi: ['からだ'],
                    jlpt: 'N4',
                    examples: [
                        { word: '体', reading: 'からだ', meaning: 'body' },
                        { word: '体験', reading: 'たいけん', meaning: 'experience' },
                        { word: '全体', reading: 'ぜんたい', meaning: 'whole, entire' }
                    ]
                }
            ],
            'N3': [
                {
                    character: '議',
                    meanings: ['deliberation', 'consultation', 'debate'],
                    onyomi: ['ギ'],
                    kunyomi: [],
                    jlpt: 'N3',
                    examples: [
                        { word: '議論', reading: 'ぎろん', meaning: 'argument, discussion' },
                        { word: '会議', reading: 'かいぎ', meaning: 'meeting' },
                        { word: '議員', reading: 'ぎいん', meaning: 'member of parliament' }
                    ]
                }
            ],
            'N2': [
                {
                    character: '療',
                    meanings: ['heal', 'cure'],
                    onyomi: ['リョウ'],
                    kunyomi: [],
                    jlpt: 'N2',
                    examples: [
                        { word: '治療', reading: 'ちりょう', meaning: 'medical treatment' },
                        { word: '療法', reading: 'りょうほう', meaning: 'therapy' },
                        { word: '医療', reading: 'いりょう', meaning: 'medical care' }
                    ]
                }
            ],
            'N1': [
                {
                    character: '騎',
                    meanings: ['equestrian', 'riding on horses'],
                    onyomi: ['キ'],
                    kunyomi: [],
                    jlpt: 'N1',
                    examples: [
                        { word: '騎士', reading: 'きし', meaning: 'knight' },
                        { word: '騎兵', reading: 'きへい', meaning: 'cavalry' },
                        { word: '騎手', reading: 'きしゅ', meaning: 'jockey' }
                    ]
                }
            ]
        };

        return additionalKanji[level] || [];
    }

    static async fetchFromKanjiApi(level) {
        // NEW: Intercept Kana selections and skip the external API sync completely
        if (level === 'Hiragana' || level === 'Katakana') {
            console.log(`Skipping KanjiAPI background sync for ${level}`);
            return [];
        }

        try {
            console.log(`Querying KanjiAPI for full canonical ${level} index list...`);

            // Extract the digit (e.g., 'N2' becomes '2') to map to the official endpoint layout
            const levelNumber = level.replace('N', '');
            const listResponse = await fetch(`https://kanjiapi.dev/v1/kanji/jlpt-${levelNumber}`);
            if (!listResponse.ok) throw new Error(`KanjiAPI level list fetch failed: ${listResponse.status}`);

            const charactersArray = await listResponse.json();
            console.log(`Discovered ${charactersArray.length} characters on the web for ${level}`);

            // Map the characters into your application format
            const apiResults = charactersArray.map(char => {
                const localFallback = this.getEnhancedFallbackData(level).find(k => k.character === char);
                if (localFallback) return localFallback;

                return {
                    character: char,
                    meanings: [`JLPT ${level} character`],
                    onyomi: [],
                    kunyomi: [],
                    jlpt: level,
                    examples: []
                };
            });

            // Kick off deep metadata scraping for the top batch asynchronously
            this.enrichKanjiBatchInBackground(apiResults.slice(0, 15));

            return apiResults;
        } catch (error) {
            console.error('KanjiAPI network fallback layer failure:', error);
            return [];
        }
    }

    // Helper to smoothly grab meanings & examples without stalling your application page load
    static async enrichKanjiBatchInBackground(batch) {
        for (const item of batch) {
            try {
                const res = await fetch(`${this.kanjiApiUrl}/${encodeURIComponent(item.character)}`);
                if (res.ok) {
                    const detailedData = await res.json();
                    item.meanings = detailedData.meanings || item.meanings;
                    item.onyomi = detailedData.on_readings || [];
                    item.kunyomi = detailedData.kun_readings || [];
                    item.examples = await this.fetchExamplesFromTatoeba(item.character);
                }
            } catch (e) {
                console.warn(`Background card enrichment skipped for ${item.character}`);
            }
        }
    }

    static async fetchExamplesFromTatoeba(kanji) {
        try {
            const response = await fetch(`${this.tatoebaUrl}?query=${encodeURIComponent(kanji)}&from=jpn&to=eng&limit=3`);
            
            if (response.ok) {
                const data = await response.json();
                return data.results.map(result => ({
                    word: result.text,
                    reading: result.transcriptions?.[0]?.text || '',
                    meaning: result.translations?.[0]?.text || ''
                })).filter(ex => ex.word && ex.meaning);
            }
        } catch (error) {
            console.log('Tatoeba API not available');
        }
        return [];
    }

    static mergeKanjiData(baseData, newData) {
        const merged = [...baseData];
        const existingChars = new Set(baseData.map(k => k.character));
        
        newData.forEach(kanji => {
            if (!existingChars.has(kanji.character)) {
                merged.push(kanji);
                existingChars.add(kanji.character);
            }
        });
        
        return merged;
    }

    static getRandomKanji(level = 'N5') {
        const kanjiList = this.fallbackData[level] || this.fallbackData['N5'];
        return kanjiList[Math.floor(Math.random() * kanjiList.length)];
    }

    static getAllLevels() {
        return Object.keys(this.fallbackData);
    }

    static getKanjiCount(level = 'N5') {
        return (this.fallbackData[level] || []).length;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KanjiData;
}