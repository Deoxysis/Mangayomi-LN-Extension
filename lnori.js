const mangayomiSources = [{
    "name": "Lnori",
    "lang": "en",
    "baseUrl": "https://lnori.com",
    "apiUrl": "",
    "iconUrl": "https://lnori.com/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "1.0.0",
    "pkgPath": "lnori.js",
    "notes": ""
}];

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        if (page > 1) {
            return { 'list': [], 'hasNextPage': false };
        }
        
        var url = "https://lnori.com/library";
        var client = new Client();
        var res = await client.get(url, this.getHeaders(url));
        var doc = new Document(res.body);
        
        var list = [];
        var elements = doc.select(".catalog-grid > .card");
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            
            var titleEl = el.selectFirst(".card-title");
            if (!titleEl) continue;
            var title = titleEl.text;
            if (!title) continue;
            
            var imgEl = el.selectFirst("img");
            var cover = imgEl ? imgEl.attr("src") : "";
            if (cover.startsWith("/")) {
                cover = "https://lnori.com" + cover;
            }
            
            var aEl = el.selectFirst("a");
            var link = aEl ? aEl.attr("href") : "";
            
            list.push({
                'name': title,
                'imageUrl': cover,
                'link': link
            });
        }
        
        return { 'list': list, 'hasNextPage': false };
    }

    async getLatestUpdates(page) {
        return await this.getPopular(page);
    }

    async search(query, page, filters) {
        if (page > 1) {
            return { 'list': [], 'hasNextPage': false };
        }
        
        var url = "https://lnori.com/library";
        
        var selectedGenre = "";
        var selectedYear = "";
        var selectedSort = "relevance";
        
        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (filter.type_name === "SelectFilter") {
                    var value = filter.values[filter.state].value;
                    if (filter.name === "Genre") selectedGenre = value;
                    if (filter.name === "Year") selectedYear = value;
                    if (filter.name === "Sort") selectedSort = value || "relevance";
                }
            }
        }
        
        var client = new Client();
        var res = await client.get(url, this.getHeaders(url));
        var doc = new Document(res.body);
        
        var list = [];
        var q = query.toLowerCase();
        
        var elements = doc.select(".catalog-grid > .card");
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            
            var title = (el.attr("data-t") || "").toLowerCase();
            if (!title) {
                var titleEl = el.selectFirst(".card-title");
                if (titleEl) title = titleEl.text.toLowerCase();
            }
            if (!title) continue;
            
            var tagsStr = (el.attr("data-tags") || "").toLowerCase();
            var tags = tagsStr.split(",").map(function(s) { return s.trim(); });
            
            var dateStr = el.attr("data-d") || "0";
            var yearStr = dateStr.substring(0, 4);
            
            var volumes = parseInt(el.attr("data-v") || "0");
            var relevance = parseInt(el.attr("data-rel") || "0");
            var dateInt = parseInt(dateStr || "0");
            
            //  text query filter
            if (q && !title.includes(q)) continue;
            
            // genre filter
            if (selectedGenre && tags.indexOf(selectedGenre.toLowerCase()) === -1) continue;
            
            //year filter
            if (selectedYear && yearStr !== selectedYear) continue;
            
            var imgEl = el.selectFirst("img");
            var cover = imgEl ? imgEl.attr("src") : "";
            if (cover.startsWith("/")) cover = "https://lnori.com" + cover;
            
            var aEl = el.selectFirst("a");
            var link = aEl ? aEl.attr("href") : "";
            
            var displayTitle = el.attr("data-t") || "";
            if (!displayTitle) {
                var displayTitleEl = el.selectFirst(".card-title");
                if (displayTitleEl) displayTitle = displayTitleEl.text;
            }
            
            list.push({
                'name': displayTitle,
                'imageUrl': cover,
                'link': link,
                'relevance': relevance,
                'volumes': volumes,
                'date': dateInt,
                'titleStr': displayTitle.toLowerCase()
            });
        }
        
        // Sort
        if (selectedSort === "title") {
            list.sort(function(a, b) { return a.titleStr.localeCompare(b.titleStr); });
        } else if (selectedSort === "date") {
            list.sort(function(a, b) { return b.date - a.date; });
        } else if (selectedSort === "volumes") {
            list.sort(function(a, b) { return b.volumes - a.volumes; });
        } else {
            list.sort(function(a, b) { return b.relevance - a.relevance; });
        }
        
        var finalBookList = [];
        for (var j = 0; j < list.length; j++) {
            finalBookList.push({
                'name': list[j].name,
                'imageUrl': list[j].imageUrl,
                'link': list[j].link
            });
        }
        
        return { 'list': finalBookList, 'hasNextPage': false };
    }

    async getDetail(url) {
        var fullUrl = url;
        if (fullUrl.startsWith("/")) {
            fullUrl = "https://lnori.com" + fullUrl;
        }
        
        var client = new Client();
        var res = await client.get(fullUrl, this.getHeaders(fullUrl));
        var doc = new Document(res.body);
        
        var titleNode = doc.selectFirst("h1.s-title");
        var title = (titleNode && titleNode.text) ? titleNode.text.trim() : "";
        
        var coverNode = doc.selectFirst(".card-cover img");
        var cover = coverNode ? coverNode.attr("src") : "";
        if (cover.startsWith("/")) {
            cover = "https://lnori.com" + cover;
        }
        
        var authorNode = doc.selectFirst(".author");
        var author = (authorNode && authorNode.text) ? authorNode.text.trim() : "";
        
        var descNode = doc.selectFirst(".description");
        var description = (descNode && descNode.text) ? descNode.text.trim() : "";
        
        var status = 0;
        
        var hasYear = res.body.includes("-year-");
        var hasSeason = res.body.includes("-season-");
        
        var chapters = [];
        var bookElements = doc.select(".card");
        for (var i = 0; i < bookElements.length; i++) {
            var el = bookElements[i];
            
            var aEl = el.selectFirst("a");
            if (!aEl) continue;
            var chapUrl = aEl.attr("href");
            if (!chapUrl || !chapUrl.includes("/book/")) continue;
            
            var titleEl = el.selectFirst(".card-title");
            var chapName = (titleEl && titleEl.text) ? titleEl.text.trim() : "";
            
            var metaEl = el.selectFirst(".card-meta span");
            if (metaEl && metaEl.text) {
                var extra = metaEl.text.trim();
                if (extra.startsWith(".")) {
                    chapName += extra;
                }
            }
            chapName = chapName.replace(/Volume /i, "Vol. ");
            
            // decimal chapters like 10.5 were a problem so match those
            var chapterNumber = 0;
            var numMatch = chapName.match(/Vol\.\s*(\d+(?:\.\d+)?)/i);
            if (numMatch) {
                chapterNumber = parseFloat(numMatch[1]);
            }
            //lots of novels had year or seasons
            //matching and appending
            if (chapUrl.includes("-year-")) {
                var yearMatch = chapUrl.match(/-year-(\d+)/);
                if (yearMatch) {
                    chapName = "Year " + yearMatch[1] + " " + chapName;
                }
            } else if (chapUrl.includes("-season-")) {
                var seasonMatch = chapUrl.match(/-season-(\d+)/);
                if (seasonMatch) {
                    chapName = "Season " + seasonMatch[1] + " " + chapName;
                }
            } else {
                if (hasYear) {
                    chapName = "Year 1 " + chapName;
                } else if (hasSeason) {
                    chapName = "Season 1 " + chapName;
                }
            }
            
            chapters.push({
                'name': chapName,
                'url': chapUrl,
                'dateUpload': "",
                'chapterNumber': chapterNumber,
                'number': chapterNumber
            });
        }
        
        return {
            'name': title,
            'imageUrl': cover,
            'author': author,
            'description': description,
            'status': status,
            'chapters': chapters
        };
    }

    async getHtmlContent(name, url) {
        var fullUrl = url;
        if (fullUrl.startsWith("/")) {
            fullUrl = "https://lnori.com" + fullUrl;
        }
        
        var client = new Client();
        var res = await client.get(fullUrl, this.getHeaders(fullUrl));
        var doc = new Document(res.body);
        
        var paragraphs = doc.select(".chapter p");
        var content = "";
        
        for (var i = 0; i < paragraphs.length; i++) {
            content += paragraphs[i].outerHtml;
        }
        
        return content;
    }
    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "relevance", name: "Relevance" },
                    { type_name: "SelectOption", value: "title", name: "Title" },
                    { type_name: "SelectOption", value: "date", name: "Year Released" },
                    { type_name: "SelectOption", value: "volumes", name: "Volumes" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "Any" },
                    { type_name: "SelectOption", value: "academy", name: "Academy" },
                    { type_name: "SelectOption", value: "action", name: "Action" },
                    { type_name: "SelectOption", value: "adult protagonist", name: "Adult Protagonist" },
                    { type_name: "SelectOption", value: "adventure", name: "Adventure" },
                    { type_name: "SelectOption", value: "age gap", name: "Age Gap" },
                    { type_name: "SelectOption", value: "airhead", name: "Airhead" },
                    { type_name: "SelectOption", value: "alchemy", name: "Alchemy" },
                    { type_name: "SelectOption", value: "animals", name: "Animals" },
                    { type_name: "SelectOption", value: "anime tie-in", name: "Anime Tie-In" },
                    { type_name: "SelectOption", value: "aristocracy", name: "Aristocracy" },
                    { type_name: "SelectOption", value: "battle", name: "Battle" },
                    { type_name: "SelectOption", value: "books", name: "Books" },
                    { type_name: "SelectOption", value: "boys love", name: "Boys Love" },
                    { type_name: "SelectOption", value: "business", name: "Business" },
                    { type_name: "SelectOption", value: "camping", name: "Camping" },
                    { type_name: "SelectOption", value: "childhood friend", name: "Childhood Friend" },
                    { type_name: "SelectOption", value: "chinese ambience", name: "Chinese Ambience" },
                    { type_name: "SelectOption", value: "chuunibyou", name: "Chuunibyou" },
                    { type_name: "SelectOption", value: "combat", name: "Combat" },
                    { type_name: "SelectOption", value: "comedy", name: "Comedy" },
                    { type_name: "SelectOption", value: "contract marriage", name: "Contract Marriage" },
                    { type_name: "SelectOption", value: "cooking", name: "Cooking" },
                    { type_name: "SelectOption", value: "crime", name: "Crime" },
                    { type_name: "SelectOption", value: "cross-dressing", name: "Cross-Dressing" },
                    { type_name: "SelectOption", value: "dark", name: "Dark" },
                    { type_name: "SelectOption", value: "dark fantasy", name: "Dark Fantasy" },
                    { type_name: "SelectOption", value: "demon lord", name: "Demon Lord" },
                    { type_name: "SelectOption", value: "demons", name: "Demons" },
                    { type_name: "SelectOption", value: "dragons", name: "Dragons" },
                    { type_name: "SelectOption", value: "drama", name: "Drama" },
                    { type_name: "SelectOption", value: "dungeon", name: "Dungeon" },
                    { type_name: "SelectOption", value: "dungeon diving", name: "Dungeon Diving" },
                    { type_name: "SelectOption", value: "dystopian", name: "Dystopian" },
                    { type_name: "SelectOption", value: "ecchi", name: "Ecchi" },
                    { type_name: "SelectOption", value: "elf", name: "Elf" },
                    { type_name: "SelectOption", value: "enemies to lovers", name: "Enemies To Lovers" },
                    { type_name: "SelectOption", value: "fairies", name: "Fairies" },
                    { type_name: "SelectOption", value: "familiars", name: "Familiars" },
                    { type_name: "SelectOption", value: "family", name: "Family" },
                    { type_name: "SelectOption", value: "fanservice", name: "Fanservice" },
                    { type_name: "SelectOption", value: "fantasy", name: "Fantasy" },
                    { type_name: "SelectOption", value: "fantasy world", name: "Fantasy World" },
                    { type_name: "SelectOption", value: "female protagonist", name: "Female Protagonist" },
                    { type_name: "SelectOption", value: "first person", name: "First Person" },
                    { type_name: "SelectOption", value: "fish out of water", name: "Fish Out Of Water" },
                    { type_name: "SelectOption", value: "food", name: "Food" },
                    { type_name: "SelectOption", value: "friendship", name: "Friendship" },
                    { type_name: "SelectOption", value: "futuristic", name: "Futuristic" },
                    { type_name: "SelectOption", value: "game elements", name: "Game Elements" },
                    { type_name: "SelectOption", value: "gamer protagonist", name: "Gamer Protagonist" },
                    { type_name: "SelectOption", value: "gender bender", name: "Gender Bender" },
                    { type_name: "SelectOption", value: "genius", name: "Genius" },
                    { type_name: "SelectOption", value: "girls love", name: "Girls Love" },
                    { type_name: "SelectOption", value: "guns", name: "Guns" },
                    { type_name: "SelectOption", value: "harem", name: "Harem" },
                    { type_name: "SelectOption", value: "heartwarming", name: "Heartwarming" },
                    { type_name: "SelectOption", value: "high fantasy", name: "High Fantasy" },
                    { type_name: "SelectOption", value: "high school", name: "High School" },
                    { type_name: "SelectOption", value: "historical", name: "Historical" },
                    { type_name: "SelectOption", value: "historical fantasy", name: "Historical Fantasy" },
                    { type_name: "SelectOption", value: "horror", name: "Horror" },
                    { type_name: "SelectOption", value: "humor", name: "Humor" },
                    { type_name: "SelectOption", value: "invention", name: "Invention" },
                    { type_name: "SelectOption", value: "isekai", name: "Isekai" },
                    { type_name: "SelectOption", value: "josei", name: "Josei" },
                    { type_name: "SelectOption", value: "knights", name: "Knights" },
                    { type_name: "SelectOption", value: "lgbtq", name: "LGBTQ" },
                    { type_name: "SelectOption", value: "lighthearted", name: "Lighthearted" },
                    { type_name: "SelectOption", value: "literary", name: "Literary" },
                    { type_name: "SelectOption", value: "magic", name: "Magic" },
                    { type_name: "SelectOption", value: "magic academy", name: "Magic Academy" },
                    { type_name: "SelectOption", value: "magical weapons", name: "Magical Weapons" },
                    { type_name: "SelectOption", value: "maid", name: "Maid" },
                    { type_name: "SelectOption", value: "male protagonist", name: "Male Protagonist" },
                    { type_name: "SelectOption", value: "manga tie-in", name: "Manga Tie-In" },
                    { type_name: "SelectOption", value: "marriage", name: "Marriage" },
                    { type_name: "SelectOption", value: "martial arts", name: "Martial Arts" },
                    { type_name: "SelectOption", value: "master and servant", name: "Master And Servant" },
                    { type_name: "SelectOption", value: "mature", name: "Mature" },
                    { type_name: "SelectOption", value: "mecha", name: "Mecha" },
                    { type_name: "SelectOption", value: "medieval", name: "Medieval" },
                    { type_name: "SelectOption", value: "military", name: "Military" },
                    { type_name: "SelectOption", value: "modern day", name: "Modern Day" },
                    { type_name: "SelectOption", value: "moe", name: "Moe" },
                    { type_name: "SelectOption", value: "monster girls", name: "Monster Girls" },
                    { type_name: "SelectOption", value: "monster taming", name: "Monster Taming" },
                    { type_name: "SelectOption", value: "monsters", name: "Monsters" },
                    { type_name: "SelectOption", value: "multiple pov", name: "Multiple POV" },
                    { type_name: "SelectOption", value: "mystery", name: "Mystery" },
                    { type_name: "SelectOption", value: "nobility", name: "Nobility" },
                    { type_name: "SelectOption", value: "not the hero", name: "Not The Hero" },
                    { type_name: "SelectOption", value: "op power", name: "OP Power" },
                    { type_name: "SelectOption", value: "op protagonist", name: "OP Protagonist" },
                    { type_name: "SelectOption", value: "ordinary protagonist", name: "Ordinary Protagonist" },
                    { type_name: "SelectOption", value: "otaku", name: "Otaku" },
                    { type_name: "SelectOption", value: "otome", name: "Otome" },
                    { type_name: "SelectOption", value: "otome game", name: "Otome Game" },
                    { type_name: "SelectOption", value: "overpowered", name: "Overpowered" },
                    { type_name: "SelectOption", value: "paranormal", name: "Paranormal" },
                    { type_name: "SelectOption", value: "past life", name: "Past Life" },
                    { type_name: "SelectOption", value: "period piece", name: "Period Piece" },
                    { type_name: "SelectOption", value: "personal growth", name: "Personal Growth" },
                    { type_name: "SelectOption", value: "political marriage", name: "Political Marriage" },
                    { type_name: "SelectOption", value: "politics", name: "Politics" },
                    { type_name: "SelectOption", value: "princess", name: "Princess" },
                    { type_name: "SelectOption", value: "reincarnation", name: "Reincarnation" },
                    { type_name: "SelectOption", value: "revenge", name: "Revenge" },
                    { type_name: "SelectOption", value: "reverse harem", name: "Reverse Harem" },
                    { type_name: "SelectOption", value: "rewriting history", name: "Rewriting History" },
                    { type_name: "SelectOption", value: "romance", name: "Romance" },
                    { type_name: "SelectOption", value: "romantic fantasy", name: "Romantic Fantasy" },
                    { type_name: "SelectOption", value: "rpg", name: "RPG" },
                    { type_name: "SelectOption", value: "satire", name: "Satire" },
                    { type_name: "SelectOption", value: "school", name: "School" },
                    { type_name: "SelectOption", value: "school life", name: "School Life" },
                    { type_name: "SelectOption", value: "sci-fi", name: "Sci-Fi" },
                    { type_name: "SelectOption", value: "seinen", name: "Seinen" },
                    { type_name: "SelectOption", value: "shoujo", name: "Shoujo" },
                    { type_name: "SelectOption", value: "shounen", name: "Shounen" },
                    { type_name: "SelectOption", value: "slice of life", name: "Slice Of Life" },
                    { type_name: "SelectOption", value: "slow life", name: "Slow Life" },
                    { type_name: "SelectOption", value: "snarky protagonist", name: "Snarky Protagonist" },
                    { type_name: "SelectOption", value: "sorcery", name: "Sorcery" },
                    { type_name: "SelectOption", value: "strategy", name: "Strategy" },
                    { type_name: "SelectOption", value: "strong female lead", name: "Strong Female Lead" },
                    { type_name: "SelectOption", value: "supernatural", name: "Supernatural" },
                    { type_name: "SelectOption", value: "superpowers", name: "Superpowers" },
                    { type_name: "SelectOption", value: "survival", name: "Survival" },
                    { type_name: "SelectOption", value: "sword and sorcery", name: "Sword And Sorcery" },
                    { type_name: "SelectOption", value: "thriller", name: "Thriller" },
                    { type_name: "SelectOption", value: "time travel", name: "Time Travel" },
                    { type_name: "SelectOption", value: "tsundere", name: "Tsundere" },
                    { type_name: "SelectOption", value: "underdog", name: "Underdog" },
                    { type_name: "SelectOption", value: "unique ability", name: "Unique Ability" },
                    { type_name: "SelectOption", value: "vampire", name: "Vampire" },
                    { type_name: "SelectOption", value: "video game", name: "Video Game" },
                    { type_name: "SelectOption", value: "video game related", name: "Video Game Related" },
                    { type_name: "SelectOption", value: "video game tie-in", name: "Video Game Tie-In" },
                    { type_name: "SelectOption", value: "villainess", name: "Villainess" },
                    { type_name: "SelectOption", value: "violence", name: "Violence" },
                    { type_name: "SelectOption", value: "vrmmo", name: "VRMMO" },
                    { type_name: "SelectOption", value: "war", name: "War" },
                    { type_name: "SelectOption", value: "weak protagonist", name: "Weak Protagonist" },
                    { type_name: "SelectOption", value: "witch", name: "Witch" },
                    { type_name: "SelectOption", value: "zero to hero", name: "Zero To Hero" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Year",
                state: 0,
                values: [
                    { type_name: "SelectOption", value: "", name: "Any" },
                    { type_name: "SelectOption", value: "2026", name: "2026" },
                    { type_name: "SelectOption", value: "9999", name: "9999" },
                    { type_name: "SelectOption", value: "2025", name: "2025" },
                    { type_name: "SelectOption", value: "2024", name: "2024" },
                    { type_name: "SelectOption", value: "2023", name: "2023" },
                    { type_name: "SelectOption", value: "2022", name: "2022" },
                    { type_name: "SelectOption", value: "2021", name: "2021" },
                    { type_name: "SelectOption", value: "2020", name: "2020" },
                    { type_name: "SelectOption", value: "2019", name: "2019" },
                    { type_name: "SelectOption", value: "2018", name: "2018" },
                    { type_name: "SelectOption", value: "2017", name: "2017" },
                    { type_name: "SelectOption", value: "2016", name: "2016" },
                    { type_name: "SelectOption", value: "2015", name: "2015" },
                    { type_name: "SelectOption", value: "2014", name: "2014" },
                    { type_name: "SelectOption", value: "2013", name: "2013" },
                    { type_name: "SelectOption", value: "2012", name: "2012" },
                    { type_name: "SelectOption", value: "2011", name: "2011" },
                    { type_name: "SelectOption", value: "2010", name: "2010" },
                    { type_name: "SelectOption", value: "2009", name: "2009" },
                    { type_name: "SelectOption", value: "2008", name: "2008" },
                    { type_name: "SelectOption", value: "2007", name: "2007" },
                    { type_name: "SelectOption", value: "2006", name: "2006" },
                    { type_name: "SelectOption", value: "2004", name: "2004" },
                    { type_name: "SelectOption", value: "2003", name: "2003" },
                    { type_name: "SelectOption", value: "2002", name: "2002" },
                    { type_name: "SelectOption", value: "2001", name: "2001" },
                    { type_name: "SelectOption", value: "1999", name: "1999" },
                    { type_name: "SelectOption", value: "1998", name: "1998" },
                    { type_name: "SelectOption", value: "1997", name: "1997" },
                    { type_name: "SelectOption", value: "1996", name: "1996" },
                    { type_name: "SelectOption", value: "1994", name: "1994" },
                    { type_name: "SelectOption", value: "1988", name: "1988" },
                    { type_name: "SelectOption", value: "1987", name: "1987" },
                    { type_name: "SelectOption", value: "1983", name: "1983" },
                    { type_name: "SelectOption", value: "1982", name: "1982" },
                    { type_name: "SelectOption", value: "1980", name: "1980" },
                    { type_name: "SelectOption", value: "1979", name: "1979" },
                    { type_name: "SelectOption", value: "1973", name: "1973" },
                ]
            }
        ];
    }
}